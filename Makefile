# BananaOnCall — local development against LocalStack.
#
# The whole loop is offline: no AWS account, no paid LocalStack plan, no real
# Telegram bot. See docs/ for the documentation site, and
# docs/public/design-doc-v0.1.html for the design this implements.

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Lambda handlers, one directory each under cmd/ and dist/.
FUNCS := ingest status

# LocalStack Community runs Lambdas as arm64 containers on this Apple Silicon
# host; Graviton is also what we want in prod, so one target serves both.
GOOS   := linux
GOARCH := arm64

# Pinned by the `_custom_id_` tag in lib/constructs/api.ts.
API_ID  := bananalocal
STAGE   := prod
KEY     := 4f9c2d7ae1b845f0932c6de8a17b40c5e6f3819d2a4b7c05e8d9f1a3b6c47e20
EDGE    := http://localhost:4566
API     := $(EDGE)/_aws/execute-api/$(API_ID)/$(STAGE)
WEBHOOK := $(API)/v1/int/$(KEY)/alertmanager

# Static site. The bucket name is fixed in lib/config.ts so this needs no lookup.
SITE_BUCKET := bananaoncall-status-local
SITE_URL    := http://$(SITE_BUCKET).s3-website.localhost.localstack.cloud:4566
TABLE       := CdkStack-StateTable

LOCAL := AWS_PROFILE=localstack AWS_REGION=us-east-1

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}'

## ---------------------------------------------------------------- build

.PHONY: build
build: $(addprefix dist/,$(FUNCS)) tools/mock-telegram/bin/mock-telegram ## Cross-compile every Go binary

.PHONY: $(addprefix dist/,$(FUNCS))
$(addprefix dist/,$(FUNCS)): dist/%:
	@echo "  build  cmd/$* -> $@/bootstrap"
	@mkdir -p $@
	@CGO_ENABLED=0 GOOS=$(GOOS) GOARCH=$(GOARCH) \
	  go build -trimpath -ldflags='-s -w' -o $@/bootstrap ./cmd/$*

.PHONY: tools/mock-telegram/bin/mock-telegram
tools/mock-telegram/bin/mock-telegram:
	@echo "  build  tools/mock-telegram"
	@mkdir -p $(dir $@)
	@CGO_ENABLED=0 GOOS=$(GOOS) GOARCH=$(GOARCH) \
	  go build -trimpath -ldflags='-s -w' -o $@ ./tools/mock-telegram

## ---------------------------------------------------------------- frontend

.PHONY: web-install
web-install: web/node_modules ## Install frontend dependencies

web/node_modules: web/package.json
	cd web && npm install
	@touch $@

.PHONY: web-build
web-build: web-install ## Build the status board (VITE_API_BASE baked in)
	cd web && VITE_API_BASE=$(API) npm run build

.PHONY: web-deploy
web-deploy: web-build ## Sync the built site to the S3 bucket
	@$(LOCAL) aws s3 sync web/dist s3://$(SITE_BUCKET)/ --delete
	@echo
	@echo "  status board  $(SITE_URL)"
	@echo "  console       $(SITE_URL)/console/"

.PHONY: web-dev
web-dev: ## Run the frontend against the deployed local API, with hot reload
	cd web && VITE_API_BASE=$(API) npm run dev

## ---------------------------------------------------------------- stack

.PHONY: up
up: build ## Start LocalStack, mock-telegram, ical and Alertmanager
	docker compose up -d --build --wait

.PHONY: down
down: ## Stop everything and drop the volume
	docker compose down -v

.PHONY: bootstrap
bootstrap: ## CDK-bootstrap the LocalStack account (idempotent)
	$(LOCAL) npx cdklocal bootstrap

.PHONY: deploy
deploy: build ## Deploy the stack into LocalStack
	$(LOCAL) npx cdklocal deploy --require-approval never -c env=local
	@$(MAKE) --no-print-directory ensure-stage

# A LocalStack quirk, not something the design calls for.
#
# On a CloudFormation *update*, CDK creates a fresh API Gateway deployment and
# deletes the superseded one; LocalStack drops the stage along with it. Nothing
# fails loudly — CloudFormation still reports the stage UPDATE_COMPLETE — the API
# simply stops answering, and every route 404s with "does not correspond to a
# deployed API". Re-create the stage when it has gone missing.
.PHONY: ensure-stage
ensure-stage:
	@if [ -z "$$($(LOCAL) aws apigateway get-stages --rest-api-id $(API_ID) \
	     --query 'item[].stageName' --output text 2>/dev/null)" ]; then \
	  echo "  restoring the '$(STAGE)' stage that the CFN update dropped"; \
	  $(LOCAL) aws apigateway create-deployment --rest-api-id $(API_ID) \
	    --stage-name $(STAGE) >/dev/null; \
	fi

.PHONY: seed
seed: ## Fill the table with SLA rollups and incident history
	@$(LOCAL) TABLE_NAME=$$($(LOCAL) aws dynamodb list-tables \
	  --query 'TableNames[?starts_with(@, `$(TABLE)`)] | [0]' --output text) \
	  go run ./tools/seed

.PHONY: all
all: up bootstrap deploy seed web-deploy ## Everything, from nothing to a browsable board

.PHONY: destroy
destroy: ## Remove the stack from LocalStack
	$(LOCAL) npx cdklocal destroy --force -c env=local

.PHONY: synth
synth: ## Print the synthesized template
	npx cdk synth -c env=local

## ---------------------------------------------------------------- checks

.PHONY: test
test: ## Unit tests: Go domain core plus CDK template assertions
	go test ./...
	npm test

.PHONY: e2e
e2e: ## End-to-end checks against the running local stack
	@./test/e2e/run.sh

.PHONY: smoke
smoke: ## Post one alert through the real path and show what ingest returned
	@curl -sS -X POST '$(WEBHOOK)' \
	  -H 'content-type: application/json' \
	  --data-binary @test/e2e/payloads/firing.json | tee /dev/stderr | grep -q '"accepted"'
	@echo
	@echo "  queued. drain it with: make queue"

.PHONY: queue
queue: ## Peek at what is sitting on the alert queue
	@url=$$($(LOCAL) aws sqs list-queues --queue-name-prefix CdkStack \
	  --query 'QueueUrls[?contains(@, `AlertsQueue`)] | [0]' --output text); \
	 $(LOCAL) aws sqs receive-message --queue-url "$$url" \
	  --max-number-of-messages 10 --visibility-timeout 0 \
	  --query 'Messages[].Body' --output text

.PHONY: logs
logs: ## Tail the ingest Lambda log group
	$(LOCAL) aws logs tail /aws/lambda/$$($(LOCAL) aws lambda list-functions \
	  --query 'Functions[?contains(FunctionName, `Ingest`)].FunctionName | [0]' \
	  --output text) --follow

.PHONY: fire
fire: ## Make the real Alertmanager fire an alert at us
	@curl -sS -X POST http://localhost:9093/api/v2/alerts \
	  -H 'content-type: application/json' \
	  --data-binary @test/e2e/payloads/amtool-alert.json
	@echo "  posted to Alertmanager; it batches for group_wait (5s)"

.PHONY: status
status: ## Fetch the status board JSON
	@curl -sS '$(API)/v1/status' | python3 -m json.tool | head -40

.PHONY: open
open: ## Open the status board in a browser
	@open '$(SITE_URL)' 2>/dev/null || echo "$(SITE_URL)"

.PHONY: messages
messages: ## Show what mock-telegram has received
	@curl -sS http://localhost:8081/__messages

.PHONY: reset
reset: ## Clear mock-telegram's message log
	@curl -sS -X POST http://localhost:8081/__reset
