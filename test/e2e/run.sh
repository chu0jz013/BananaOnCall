#!/usr/bin/env bash
#
# End-to-end checks against the local stack.
#
# Only checks that are meaningful today are here; each session adds more, and
# every check names the design-doc requirement it maps to. Run with `make e2e`,
# which assumes `make up && make deploy` already ran.
#
# Every payload carries a per-run nonce. Without one the suite is not repeatable:
# SQS FIFO deduplication lasts five minutes from the *send* (not the consume), so
# a re-run inside that window would silently drop the alerts and the failures
# would look like product bugs.

set -uo pipefail

API_ID=bananalocal
STAGE=prod
KEY=4f9c2d7ae1b845f0932c6de8a17b40c5e6f3819d2a4b7c05e8d9f1a3b6c47e20
EDGE=http://localhost:4566
API="$EDGE/_aws/execute-api/$API_ID/$STAGE"
WEBHOOK="$API/v1/int/$KEY/alertmanager"
SITE_BUCKET=bananaoncall-status-local
SITE="http://$SITE_BUCKET.s3-website.localhost.localstack.cloud:4566"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_ID="$(date +%s)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

export AWS_PROFILE=localstack AWS_REGION=us-east-1

pass=0 fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n     %s\n' "$1" "${2:-}"; fail=$((fail+1)); }
note() { printf '  \033[33m!\033[0m %s\n' "$1"; }
part() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# Stamps a fixture with this run's id and echoes the path of the copy.
# $1 fixture file, $2 output name, $3 optional extra suffix for uniqueness.
nonced() {
  local out="$TMP/$2"
  python3 - "$HERE/payloads/$1" "$out" "${RUN_ID}${3:-}" <<'PY'
import json, pathlib, sys
src, dst, run = sys.argv[1], sys.argv[2], sys.argv[3]
doc = json.loads(pathlib.Path(src).read_text())
if isinstance(doc, list):
    # Alertmanager's v2 ingest API. A unique alertname makes this a genuinely
    # new alert group, so Alertmanager notifies instead of sitting on
    # repeat_interval for an alert it already sent.
    for a in doc:
        a["labels"]["alertname"] = f"E2E{run}"
else:
    doc.setdefault("commonLabels", {})["e2e_run"] = run
pathlib.Path(dst).write_text(json.dumps(doc))
PY
  echo "$out"
}

queue_url() {
  aws sqs list-queues --queue-name-prefix CdkStack \
    --query 'QueueUrls[?contains(@, `AlertsQueue`)] | [0]' --output text
}

depth() {
  aws sqs get-queue-attributes --queue-url "$1" \
    --attribute-names ApproximateNumberOfMessages \
    --query 'Attributes.ApproximateNumberOfMessages' --output text
}

# Purge is rate-limited to once a minute per queue, so drain by receiving.
drain() {
  for _ in 1 2 3 4 5; do
    local h
    h=$(aws sqs receive-message --queue-url "$1" --max-number-of-messages 10 \
        --query 'Messages[].ReceiptHandle' --output text 2>/dev/null)
    [[ -z "$h" || "$h" == "None" ]] && return 0
    for r in $h; do
      aws sqs delete-message --queue-url "$1" --receipt-handle "$r" >/dev/null 2>&1
    done
  done
}

# Waits up to $2 seconds for the queue to become non-empty; echoes the seconds
# it took, or "no".
await_message() {
  for i in $(seq 1 "$2"); do
    [[ "$(depth "$1")" != 0 ]] && { echo "$i"; return 0; }
    sleep 1
  done
  echo no
}

status_of() { curl -sS -o /dev/null -w '%{http_code}' "$@"; }

printf '\033[1mBananaOnCall E2E\033[0m  run %s\n' "$RUN_ID"

part 'Prerequisites'

for c in localstack mock-telegram ical alertmanager; do
  s=$(docker inspect -f '{{.State.Health.Status}}' "$c" 2>/dev/null)
  [[ "$s" == healthy ]] && ok "container $c is healthy" \
                        || bad "container $c is ${s:-missing}" 'run: make up'
done

if aws cloudformation describe-stacks --stack-name CdkStack \
     --query 'Stacks[0].StackStatus' --output text 2>/dev/null | grep -q COMPLETE; then
  ok 'CdkStack is deployed'
else
  bad 'CdkStack is not deployed' 'run: make deploy'
  printf '\nAborting: nothing else can pass without the stack.\n'
  exit 1
fi

Q=$(queue_url)
[[ -n "$Q" && "$Q" != None ]] && ok 'alert queue exists' || { bad 'no alert queue'; exit 1; }

part 'Ingest contract (FR-1)'

drain "$Q"
firing="$(nonced firing.json firing.json)"

body=$(curl -sS -X POST "$WEBHOOK" -H 'content-type: application/json' --data-binary @"$firing")
grep -q '"accepted":1' <<<"$body" \
  && ok 'FR-1.1  valid webhook returns 202 with the alert count' \
  || bad 'FR-1.1  valid webhook rejected' "$body"

code=$(status_of -X POST "${WEBHOOK/$KEY/deadbeefdeadbeef}" \
       -H 'content-type: application/json' --data-binary @"$firing")
[[ "$code" == 401 ]] && ok 'FR-1.4  unknown integration key is refused with 401' \
                     || bad 'FR-1.4  expected 401' "got $code"

code=$(status_of -X POST "$WEBHOOK" -H 'content-type: application/json' --data '{"alerts":[]}')
[[ "$code" == 400 ]] && ok '        empty batch is refused with 400' \
                     || bad '        expected 400 for an empty batch' "got $code"

code=$(status_of -X POST "$WEBHOOK" -H 'content-type: application/json' --data 'not json')
[[ "$code" == 400 ]] && ok '        malformed body is refused with 400' \
                     || bad '        expected 400 for a malformed body' "got $code"

part 'Queue handoff (D4, FR-1.5, FR-1.6)'

[[ "$(await_message "$Q" 10)" == no ]] && bad 'FR-1.5  nothing reached the queue'
env_json=$(aws sqs receive-message --queue-url "$Q" --visibility-timeout 0 \
           --query 'Messages[0].Body' --output text 2>/dev/null)

if [[ -n "$env_json" && "$env_json" != None ]]; then
  ok 'FR-1.5  the accepted alert is on the queue, not just in a log line'

  read -r ns src grp <<<"$(python3 - "$env_json" <<'PY'
import json, sys
e = json.loads(sys.argv[1])
print(e["alerts"][0]["labels"].get("namespace", "-"), e["source"], e["routingKey"][:12])
PY
)"
  [[ "$ns"  == payments     ]] && ok '        commonLabels are merged onto each alert' \
                               || bad '        commonLabels were dropped' "namespace=$ns"
  [[ "$src" == alertmanager ]] && ok '        envelope records its source' \
                               || bad '        wrong source' "$src"
  [[ -n "$grp" ]] && ok "        FIFO message group is set (${grp}…)" \
                  || bad '        no routing key — FIFO ordering would be undefined'
fi

# Two identical bodies, fresh dedup window: the queue must not grow past one.
drain "$Q"
dupe="$(nonced firing.json dupe.json -dupe)"
for _ in 1 2; do
  curl -sS -o /dev/null -X POST "$WEBHOOK" -H 'content-type: application/json' --data-binary @"$dupe"
  sleep 1
done
await_message "$Q" 5 >/dev/null
n=$(depth "$Q")
[[ "$n" == 1 ]] && ok 'FR-1.6  an identical redelivery collapses to one message' \
               || bad 'FR-1.6  expected 1 message after a duplicate post' "got $n"

part 'Real Alertmanager (Phase 1 criterion 1, ingest half)'

drain "$Q"
am="$(nonced amtool-alert.json am.json)"
curl -sS -o /dev/null -X POST http://localhost:9093/api/v2/alerts \
  -H 'content-type: application/json' --data-binary @"$am"

took="$(await_message "$Q" 15)"
[[ "$took" != no ]] \
  && ok "        a real Alertmanager reached ingest in ${took}s (budget 15s)" \
  || bad '        Alertmanager did not reach ingest within 15s' 'check: docker logs alertmanager'

drain "$Q"

part 'Status board API (FR-8.3)'

board=$(curl -sS "$API/v1/status")
if python3 -c "import json,sys; json.loads(sys.argv[1])['health']" "$board" 2>/dev/null; then
  ok 'FR-8.3  status endpoint answers with a board'

  read -r health slis active recent mtta <<<"$(python3 -c '
import json, sys
b = json.loads(sys.argv[1])
print(b["health"], len(b["slis"]), len(b["activeIncidents"]),
      len(b["recentIncidents"]), b["mtta"]["sampleSize"])
' "$board")"

  [[ "$slis" == 4 ]] && ok "        all four published indicators are present" \
                     || bad '        expected 4 indicators' "got $slis"
  [[ "$health" =~ ^(operational|degraded|down)$ ]] \
    && ok "        headline health is a known state ($health)" \
    || bad '        unknown health value' "$health"
  [[ "$recent" -gt 0 ]] && ok "        incident history is populated ($recent resolved)" \
                        || bad '        no incident history' 'run: make seed'
  [[ "$mtta" -gt 0 ]] && ok "        MTTA is computed over $mtta incidents" \
                      || bad '        MTTA has no samples'

  # A board reading "operational" while something is open is the exact blind
  # spot this project exists to remove.
  if [[ "$active" -gt 0 && "$health" == operational ]]; then
    bad '        health says operational with incidents open' "active=$active"
  else
    ok '        health and open incidents agree'
  fi
else
  bad 'FR-8.3  status endpoint did not return a board' "${board:0:120}"
fi

# Public data, no credentials: any origin must be able to read it, including the
# Vite dev server, which is a third origin again.
allow=$(curl -sS -i -X OPTIONS "$API/v1/status" \
        -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: GET' \
        2>/dev/null | grep -i 'access-control-allow-origin' | tr -d '\r' | awk '{print $2}')
[[ "$allow" == '*' ]] && ok '        CORS lets any origin read the board' \
                      || bad '        CORS preflight is not open' "got ${allow:-none}"

part 'Static site on S3'

for path in '/' '/console/'; do
  code=$(status_of "$SITE$path")
  [[ "$code" == 200 ]] && ok "        $path is served" \
                       || bad "        $path returned $code" 'run: make web-deploy'
done

# S3 website hosting answers an unknown key with the error document *and* a 404.
# That is exactly why the site is multi-page rather than a client-routed SPA.
code=$(status_of "$SITE/no-such-page")
[[ "$code" == 404 ]] && ok '        an unknown path gets the error document' \
                     || bad '        expected 404 for an unknown path' "got $code"

part 'Not verifiable locally'
note 'FR-3.7  escalation surviving a restart — LocalStack Step Functions has no'
printf '           persistence, so this is a real-AWS check only.\n'
note 'FR-8.1  EMF metric extraction — LocalStack runs metric filters but does'
printf '           not parse embedded metric format out of logs.\n'

printf '\n\033[1m%d passed, %d failed\033[0m\n' "$pass" "$fail"
[[ "$fail" == 0 ]]
