<p align="center">
  <img src="docs/public/picture/logo-lockup-480.png" alt="BananaOnCall" width="220">
</p>

# BananaOnCall

On-call engine (*hệ thống trực sự cố*) on AWS Serverless. It takes alerts from
Alertmanager, groups and deduplicates them, finds whoever is on call from Google
Calendar, sends a Telegram message with an Ack button, and escalates
(*leo thang*) when nobody answers.

Documentation lives in [`docs/`](docs/) and is published to
<https://oncall.quachuoitrenmay.com> — start there. The original design doc is kept
verbatim at [`docs/public/design-doc-v0.1.html`](docs/public/design-doc-v0.1.html).

## Local development

Everything runs offline against [LocalStack](https://localstack.cloud) Community.
No AWS account, no paid LocalStack plan, no real Telegram bot.

```bash
make all       # from nothing to a browsable status board, ~35s
make open      # open it
```

`make all` is `up`, `bootstrap`, `deploy`, `seed`, `web-deploy`. Run them
separately when you only need one.

`make help` lists everything.

### What is running

| Service | Port | Stands in for |
|---|---|---|
| `localstack` | 4566 | AWS |
| `mock-telegram` | 8081 | api.telegram.org — open <http://localhost:8081> to press Ack |
| `ical` | 8082 | the secret Google Calendar iCal URL |
| `alertmanager` | 9093 | the real Alertmanager on RKE2 |

The status board itself is served by LocalStack's S3, not by a container:
<http://bananaoncall-status-local.s3-website.localhost.localstack.cloud:4566>

The REST API id is pinned to `bananalocal` through LocalStack's `_custom_id_`
tag, so URLs never change between deploys:

```
host      http://localhost:4566/_aws/execute-api/bananalocal/prod/...
container http://localstack:4566/_aws/execute-api/bananalocal/prod/...
```

LocalStack Community has **no state persistence** — every restart wipes the
account, so `make up && make deploy` is the normal way back to a working stack.

## Where the design doc and the code differ

Three decisions had to change to keep the whole loop testable locally. Each was
verified against LocalStack's own source at tag `v4.14.0`, not its docs.

| Doc | Reality | What we do |
|---|---|---|
| **D2** API Gateway HTTP API | `apigatewayv2` is not in Community | REST API v1. About +0.40 USD/month at our volume; keeps custom domain and throttling, adds usage plans. |
| **D6** Cognito | `cognito-idp` is not in Community | Integration key in the path now; a Lambda request authorizer for the CLI. Cognito returns as a prod-only Phase 2 swap. |
| EventBridge **Scheduler** | the provider is a moto shim that stores schedules and never fires them | EventBridge **Rules** with `rate()`, which LocalStack really does execute — and which cost 0 USD instead of 0.05. |
| **G8** Terraform | — | CDK TypeScript, already bootstrapped. Handlers stay Go per D10. |

CloudWatch EMF is also not auto-extracted into metrics locally; only explicit
metric filters run.

### One LocalStack bug to know about

**LocalStack applies CloudFormation *creates* to API Gateway reliably; *updates*
much less so.** Two failures were seen, both silent:

1. On an update, CDK creates a new deployment and deletes the superseded one —
   and LocalStack drops the stage with it. CloudFormation still reports the stage
   `UPDATE_COMPLETE`, but every route then 404s with "does not correspond to a
   deployed API". `make deploy` re-creates the stage when it goes missing.
2. A changed CORS integration response was not applied at all; the old value kept
   being served until the stack was recreated.

If an API Gateway change does not seem to take effect, `make down && make all`
rather than debugging your own code.

## The status board

`web/` is a Vite + React + TypeScript app deployed to S3 static website hosting.
It implements FR-8.3 — public uptime, error budget and incident history, no
login. `make web-dev` runs it with hot reload against the deployed local API.

Three decisions worth knowing:

- **Multi-page, not a SPA.** S3 website hosting answers an unknown path with the
  error document *and a 404 status*; rewriting that to a 200 needs CloudFront,
  which is not in LocalStack Community. Two real documents (`/` and `/console/`)
  avoid the problem instead of working around it.
- **Plain S3, no CloudFront.** Same reason, plus the board is public data, so
  there is nothing an origin-access identity would protect. Before this fronts a
  real domain it wants CloudFront for TLS — S3 website endpoints are HTTP-only.
- **CORS is open on `/v1/status`.** Deliberate. Unauthenticated public data with
  no cookies: restricting the origin would block legitimate embedding and the
  dev server while protecting nothing.

The console at `/console/` is a shell. It needs the alert-group write path (S2),
the ack and resolve endpoints (S4), and an authenticated session — and Cognito
is not in LocalStack Community, so that last one needs a decision first.

### Chart colours

The uptime strip and the budget meters use a status palette validated with the
`dataviz` skill's checker against both surfaces: worst adjacent pair is
critical vs warning at deutan ΔE 24.0, normal ΔE 29.5.

The warning step keeps the brand yellow `#F2C230` even though it measures 1.6:1
against the light surface. Its lightness is precisely what separates it from red
under deuteranopia — three darker ambers were tested and every one collapsed
that separation to ΔE 1.2–5.6, which is far worse than low contrast. The
contrast is relieved structurally instead: every cell carries a ring, the legend
is always present, each cell has a tooltip naming its state, and the same window
is available as a table.

## Layout

```
bin/, lib/          CDK app and constructs
cmd/<fn>/           Lambda handlers (Go)
internal/domain/    the core — never imports an AWS SDK (D10)
internal/adapter/   one adapter per port
web/                the status board (Vite + React + TS)
tools/mock-telegram Telegram Bot API test double
tools/seed/         plausible rollups and incidents, until S2 writes real ones
fixtures/           the roster the ical container serves
test/e2e/payloads/  Alertmanager bodies used by make smoke / make fire
```

## Tests

Four tiers, fastest first. The first two need nothing running.

```bash
go test ./...   # domain core — pure functions, no AWS, no containers
npm test        # CDK template assertions (builds the Go binaries first)
make e2e        # the real path, against the running stack
make smoke      # one alert by hand, when you want to watch it
```

`make e2e` is repeatable back to back. Every payload it sends carries a per-run
nonce, because two things would otherwise make a re-run look like a product bug:
SQS FIFO deduplication lasts five minutes from the *send* rather than the
consume, and Alertmanager sits on `repeat_interval` for an alert group it has
already notified about.

Two requirements are deliberately **not** in the suite, and it says so when it
runs: FR-3.7 (escalation surviving a restart) needs real Step Functions
persistence, and FR-8.1 (EMF metrics) needs EMF extraction LocalStack does not
emulate. Both are real-AWS checks.

### Poking at it by hand

```bash
make smoke      # POST one alert, print what ingest answered
make fire       # make the real Alertmanager fire at us
make queue      # read what is sitting on the queue
make logs       # tail the ingest Lambda
make messages   # what mock-telegram has received
```

| UI | URL |
|---|---|
| mock-telegram | <http://localhost:8081> |
| Alertmanager | <http://localhost:9093> |
| the roster | <http://localhost:8082/oncall.ics> |
| LocalStack health | <http://localhost:4566/_localstack/health> |
