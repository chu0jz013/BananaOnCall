#!/usr/bin/env bash
#
# End-to-end checks against the local stack.
#
# Every check names the design-doc requirement it maps to. Run with `make e2e`,
# which assumes `make all` (or at least `up`, `deploy`, `seed`, `link`,
# `sync-schedule`) already ran.
#
# Every payload carries a per-run alertname. Without one the suite is not
# repeatable: a second run inside the same window would join the *previous*
# run's still-open incident, and the failures would look like product bugs.
#
# The escalation waits come from the seeded policy, which `tools/seed` writes at
# 20 seconds locally rather than the doc's five minutes — that is the only
# reason the whole ladder fits inside one run.

set -uo pipefail

API_ID=bananalocal
STAGE=prod
KEY=4f9c2d7ae1b845f0932c6de8a17b40c5e6f3819d2a4b7c05e8d9f1a3b6c47e20
SECRET=b0c8f3a15e7d429cab6f0e2d9137c845
EDGE=http://localhost:4566
API="$EDGE/_aws/execute-api/$API_ID/$STAGE"
WEBHOOK="$API/v1/int/$KEY/alertmanager"
MOCK=http://localhost:8081
SITE_BUCKET=bananaoncall-status-local
SITE="http://$SITE_BUCKET.s3-website.localhost.localstack.cloud:4566"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_ID="$(date +%s)"
WEB_ALERT="E2EWH$RUN_ID"   # the alert posted straight at our webhook
AM_ALERT="E2EAM$RUN_ID"    # the one a real Alertmanager sends
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

export AWS_PROFILE=localstack AWS_REGION=us-east-1

pass=0 fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n     %s\n' "$1" "${2:-}"; fail=$((fail+1)); }
note() { printf '  \033[33m!\033[0m %s\n' "$1"; }
part() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# Stamps a fixture with this run's alertname, and optionally salts the body so
# two posts about the same problem are still two distinct SQS messages.
# $1 fixture, $2 output name, $3 alertname, $4 optional body salt.
nonced() {
  local out="$TMP/$2"
  python3 - "$HERE/payloads/$1" "$out" "$3" "${4:-}" <<'PY'
import json, pathlib, sys
src, dst, name, salt = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
doc = json.loads(pathlib.Path(src).read_text())
if isinstance(doc, list):
    # Alertmanager's own v2 ingest API.
    for a in doc:
        a["labels"]["alertname"] = name
else:
    for a in doc.get("alerts", []):
        a["labels"]["alertname"] = name
    doc.setdefault("commonLabels", {})["alertname"] = name
    doc["groupKey"] = '{}:{alertname="%s"}' % name
    if salt:
        # Outside group_by, so the fingerprint is unchanged and this still joins
        # the same incident — but the body differs, so SQS does not dedupe it.
        doc["commonLabels"]["e2e_salt"] = salt
pathlib.Path(dst).write_text(json.dumps(doc))
PY
  echo "$out"
}

status_of() { curl -sS -o /dev/null -w '%{http_code}' "$@"; }
board()     { curl -sS "$API/v1/status"; }
messages()  { curl -sS "$MOCK/__messages"; }

# incident <title> -> "id state alertCount severity service", or nothing.
incident() {
  board | python3 -c '
import json, sys
title = sys.argv[1]
b = json.load(sys.stdin)
for i in b.get("activeIncidents", []) + b.get("recentIncidents", []):
    if i["title"] == title:
        print(i["id"], i["state"], i["alertCount"], i["severity"], i["service"])
        break
' "$1" 2>/dev/null
}

# await_incident <title> <state|any> <seconds> -> the incident line, or "no".
await_incident() {
  for _ in $(seq 1 "$3"); do
    local line
    line="$(incident "$1")"
    if [[ -n "$line" ]]; then
      [[ "$2" == any ]] && { echo "$line"; return 0; }
      [[ "$(awk '{print $2}' <<<"$line")" == "$2" ]] && { echo "$line"; return 0; }
    fi
    sleep 1
  done
  echo no
}

# msgs_for <incident-id> -> how many chat messages mention it.
msgs_for() {
  messages | python3 -c '
import json, sys
d = json.load(sys.stdin)
print(sum(1 for m in d["messages"] if sys.argv[1] in (m.get("text") or "")))
' "$1"
}

# msg_json <incident-id> <nth, 0-based> -> that message as JSON, or "null".
msg_json() {
  messages | python3 -c '
import json, sys
d = json.load(sys.stdin)
hits = [m for m in d["messages"] if sys.argv[1] in (m.get("text") or "")]
print(json.dumps(hits[int(sys.argv[2])]) if len(hits) > int(sys.argv[2]) else "null")
' "$1" "$2"
}

# await_msgs <incident-id> <count> <seconds> -> seconds taken, or "no".
await_msgs() {
  for i in $(seq 1 "$3"); do
    [[ "$(msgs_for "$1")" -ge "$2" ]] && { echo "$i"; return 0; }
    sleep 1
  done
  echo no
}

field() { python3 -c 'import json,sys; print(json.loads(sys.stdin.read()).get(sys.argv[1]) or "")' "$1"; }

execution_status() {
  local arn
  arn=$(aws stepfunctions list-state-machines \
        --query 'stateMachines[?contains(name, `Escalation`)].stateMachineArn | [0]' --output text)
  aws stepfunctions list-executions --state-machine-arn "$arn" \
    --query "executions[?name=='$1'].status | [0]" --output text 2>/dev/null
}

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

hook=$(messages | field webhook)
[[ -n "$hook" ]] && ok 'telegram webhook is registered' \
                 || bad 'no telegram webhook registered' 'run: make link'

part 'Ingest contract (FR-1)'

firing="$(nonced firing.json firing.json "$WEB_ALERT")"

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

part 'Accepted alert becomes an incident (FR-1.5, FR-2.4, D4)'

# The queue itself is no longer observable — the processor consumes it within a
# second — so this asserts the thing the queue exists for: nothing was lost
# between a 202 and a durable incident. The envelope's own shape is covered by
# the unit tests in internal/domain.
line="$(await_incident "$WEB_ALERT" firing 25)"
if [[ "$line" == no ]]; then
  bad 'FR-1.5  the accepted alert never became an incident' 'check: make logs F=Processor'
  printf '\nAborting: the rest of the loop hangs off this incident.\n'
  printf '\n\033[1m%d passed, %d failed\033[0m\n' "$pass" "$fail"
  exit 1
fi

read -r ID STATE COUNT SEVERITY SERVICE <<<"$line"
ok "FR-1.5  the alert is a durable incident ($ID)"
[[ "$SEVERITY" == critical ]] && ok '        severity survived the whole path' \
                             || bad '        wrong severity' "$SEVERITY"
[[ "$SERVICE" == checkout ]] && ok '        commonLabels reached the incident (service=checkout)' \
                             || bad '        service label was dropped' "$SERVICE"

part 'Notification (FR-5.1, FR-5.6, FR-3.3, FR-4.4)'

took="$(await_msgs "$ID" 1 20)"
if [[ "$took" == no ]]; then
  bad 'FR-5.1  nobody was paged' 'check: make logs F=Notify'
else
  ok "FR-5.1  a page went out in ${took}s"

  first="$(msg_json "$ID" 0)"
  chat=$(field chat_id <<<"$first")
  text=$(field text <<<"$first")

  # mai holds the current rotation in fixtures/oncall.ics, and tools/seed maps
  # her to chat 100001. Anyone else means the schedule was not consulted.
  [[ "$chat" == 100001 ]] \
    && ok 'FR-4.4  it went to whoever the calendar says is on call (mai)' \
    || bad 'FR-4.4  paged the wrong person' "chat $chat"

  missing=()
  for want in CRITICAL "$WEB_ALERT" '5xx rate above 2%' 'service   checkout'; do
    grep -qF "$want" <<<"$text" || missing+=("$want")
  done
  [[ ${#missing[@]} -eq 0 ]] \
    && ok 'FR-5.6  the message carries severity, summary, service and labels' \
    || bad 'FR-5.6  message is missing context' "${missing[*]}"

  buttons=$(python3 -c '
import json,sys
m = json.loads(sys.stdin.read())
print(",".join(b.get("callback_data","").split(":")[0] or "link" for b in (m.get("buttons") or [])))' <<<"$first")
  [[ "$buttons" == *ack* && "$buttons" == *res* && "$buttons" == *sil* && "$buttons" == *link* ]] \
    && ok '        Ack, Resolve, Silence and a runbook link are all offered' \
    || bad '        buttons are wrong' "$buttons"
fi

part 'Grouping (FR-2.3, FR-1.6)'

# Timing: the seeded first step waits 20s, and the page above landed a second or
# two ago, so these few seconds are safely inside the window — a second message
# here would be a grouping bug, not the escalation doing its job.
before=$(msgs_for "$ID")
joiner="$(nonced firing.json joiner.json "$WEB_ALERT" "join")"
curl -sS -o /dev/null -X POST "$WEBHOOK" -H 'content-type: application/json' --data-binary @"$joiner"
sleep 5

read -r _ _ COUNT2 _ _ <<<"$(incident "$WEB_ALERT")"
[[ "$COUNT2" -gt "$COUNT" ]] && ok "FR-2.3  a second alert joined the open incident (alertCount $COUNT -> $COUNT2)" \
                             || bad 'FR-2.3  the alert did not join the group' "alertCount stayed $COUNT2"
[[ "$(msgs_for "$ID")" == "$before" ]] \
  && ok '        and nobody was paged a second time for it' \
  || bad '        joining an open incident sent another page' "was $before, now $(msgs_for "$ID")"

# Identical body, inside the FIFO deduplication window: the queue must swallow it.
curl -sS -o /dev/null -X POST "$WEBHOOK" -H 'content-type: application/json' --data-binary @"$joiner"
sleep 5
read -r _ _ COUNT3 _ _ <<<"$(incident "$WEB_ALERT")"
[[ "$COUNT3" == "$COUNT2" ]] && ok 'FR-1.6  an identical redelivery was deduplicated, not counted twice' \
                             || bad 'FR-1.6  a redelivery was processed twice' "alertCount $COUNT2 -> $COUNT3"

part 'Escalation (FR-3.2, FR-3.4)'

took="$(await_msgs "$ID" 2 30)"
if [[ "$took" == no ]]; then
  bad 'FR-3.4  nobody was escalated to after the wait' 'check: make sfn'
else
  second="$(msg_json "$ID" 1)"

  # Measure the gap between the two pages rather than the polling loop, so this
  # checks the policy's wait_after and not how long the suite took to look.
  gap=$(python3 -c '
import json, sys
from datetime import datetime
a, b = (json.loads(x)["sent_at"] for x in (sys.argv[1], sys.argv[2]))
f = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00"))
print(round((f(b) - f(a)).total_seconds()))' "$(msg_json "$ID" 0)" "$second")

  # FR-3.4 quotes 5m ± 15s in prod; the seeded local policy waits 20s, and the
  # same tolerance applies — the point is that the ladder is on time, not fast.
  if [[ "$gap" -ge 18 && "$gap" -le 35 ]]; then
    ok "FR-3.4  an unacked incident escalated ${gap}s later (policy waits 20s)"
  else
    bad 'FR-3.4  the escalation was not on time' "gap was ${gap}s, want 20s ± tolerance"
  fi
  [[ "$(field chat_id <<<"$second")" == 100002 ]] \
    && ok 'FR-3.2  step two went to the next person in the chain (linh)' \
    || bad 'FR-3.2  step two went to the wrong target' "chat $(field chat_id <<<"$second")"
  grep -q 'escalation step 2' <<<"$(field text <<<"$second")" \
    && ok '        and it says plainly that nobody acked yet' \
    || bad '        the escalation reads like a first page'
fi

part 'Ack stops it (FR-3.5, FR-5.5, FR-6.3)'

python3 "$HERE/press.py" ack 0 >/dev/null 2>&1
sleep 3

line="$(await_incident "$WEB_ALERT" acked 10)"
[[ "$line" != no ]] && ok 'FR-5.1  the press moved the incident to acked' \
                    || bad 'FR-5.1  the incident is still firing after Ack' "$(incident "$WEB_ALERT")"

edited="$(msg_json "$ID" 0)"
grep -q 'Acked by' <<<"$(field text <<<"$edited")" \
  && ok 'FR-5.5  the original message now says who took it' \
  || bad 'FR-5.5  the message was not rewritten' "$(field text <<<"$edited" | head -1)"
[[ -n "$(field edited_at <<<"$edited")" ]] \
  && ok '        edited in place rather than sent again' \
  || bad '        the message was never edited'

# The button itself is gone now, which is the point of FR-5.5 — so the retry
# has to be replayed the way Telegram would replay it: the same callback_query,
# delivered again because it never saw our 200. Under at-least-once that is
# ordinary traffic, and it must not produce a second ack (FR-6.3).
retry=$(curl -sS -X POST "$API/v1/tg/$SECRET/webhook" -H 'content-type: application/json' \
        --data "$(python3 -c '
import json, sys
print(json.dumps({"callback_query": {
    "id": "retry", "from": {"username": "responder"},
    "message": {"message_id": 1, "text": "", "chat": {"id": 100001}},
    "data": "ack:" + sys.argv[1]}}))' "$ID")")
grep -q '"repeat":true' <<<"$retry" \
  && ok 'FR-6.3  a redelivered Ack is absorbed, not applied twice' \
  || bad 'FR-6.3  a redelivered Ack was not recognised as a repeat' "$retry"


st=$(execution_status "$ID")
[[ "$st" == ABORTED || "$st" == SUCCEEDED ]] \
  && ok "FR-3.5  the escalation execution stopped ($st)" \
  || bad 'FR-3.5  the escalation is still running after an ack' "status $st"

# The strongest form of "it stopped": wait out another whole step and see nothing.
count_at_ack=$(msgs_for "$ID")
sleep 25
[[ "$(msgs_for "$ID")" == "$count_at_ack" ]] \
  && ok '        no further page arrived during the next full step' \
  || bad '        the ladder kept climbing after the ack'

part 'Resolve closes the incident (FR-2.5)'

resolved="$(nonced resolved.json resolved.json "$WEB_ALERT")"
curl -sS -o /dev/null -X POST "$WEBHOOK" -H 'content-type: application/json' --data-binary @"$resolved"

line="$(await_incident "$WEB_ALERT" resolved 20)"
[[ "$line" != no ]] && ok 'FR-2.5  Alertmanager sending resolved closed the group' \
                    || bad 'FR-2.5  the incident is still open' "$(incident "$WEB_ALERT")"

still_active=$(board | python3 -c '
import json,sys
b=json.load(sys.stdin)
print(sum(1 for i in b["activeIncidents"] if i["title"] == sys.argv[1]))' "$WEB_ALERT")
[[ "$still_active" == 0 ]] && ok '        and it left the active list on the board' \
                           || bad '        a resolved incident is still shown as active'

part 'Real Alertmanager (Phase 1 criterion 1)'

am="$(nonced amtool-alert.json am.json "$AM_ALERT")"
curl -sS -o /dev/null -X POST http://localhost:9093/api/v2/alerts \
  -H 'content-type: application/json' --data-binary @"$am"

line="$(await_incident "$AM_ALERT" firing 30)"
if [[ "$line" == no ]]; then
  bad '        a real Alertmanager did not produce an incident within 30s' 'check: docker logs alertmanager'
else
  read -r AM_ID _ <<<"$line"
  ok "        a real Alertmanager drove the whole path to an incident ($AM_ID)"
  await_msgs "$AM_ID" 1 20 >/dev/null
  # Close it, so the next run does not start against a board full of history.
  idx=$(messages | python3 -c '
import json,sys
d=json.load(sys.stdin)
hits=[n for n,m in enumerate(d["messages"]) if sys.argv[1] in (m.get("text") or "")]
print(hits[0] if hits else -1)' "$AM_ID")
  [[ "$idx" -ge 0 ]] && python3 "$HERE/press.py" res "$idx" >/dev/null 2>&1
  [[ "$(await_incident "$AM_ALERT" resolved 10)" != no ]] \
    && ok '        and the Resolve button closed it' \
    || bad '        the Resolve button did not close it'
fi

part 'Status board API (FR-8.3)'

board_json=$(board)
if python3 -c "import json,sys; json.loads(sys.argv[1])['health']" "$board_json" 2>/dev/null; then
  ok 'FR-8.3  status endpoint answers with a board'

  read -r health slis active recent mtta <<<"$(python3 -c '
import json, sys
b = json.loads(sys.argv[1])
print(b["health"], len(b["slis"]), len(b["activeIncidents"]),
      len(b["recentIncidents"]), b["mtta"]["sampleSize"])
' "$board_json")"

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
  bad 'FR-8.3  status endpoint did not return a board' "${board_json:0:120}"
fi

# Public data, no credentials: any origin must be able to read it, including the
# Vite dev server, which is a third origin again.
allow=$(curl -sS -i -X OPTIONS "$API/v1/status" \
        -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: GET' \
        2>/dev/null | grep -i 'access-control-allow-origin' | tr -d '\r' | awk '{print $2}')
[[ "$allow" == '*' ]] && ok '        CORS lets any origin read the board' \
                      || bad '        CORS preflight is not open' "got ${allow:-none}"

part 'Telegram webhook is not open to the internet'

code=$(status_of -X POST "$API/v1/tg/deadbeef/webhook" \
       -H 'content-type: application/json' --data '{"callback_query":{"data":"ack:1"}}')
[[ "$code" == 401 ]] && ok '        a wrong webhook secret is refused with 401' \
                     || bad '        expected 401 for a wrong secret' "got $code"

code=$(status_of -X POST "$API/v1/tg/$SECRET/webhook" \
       -H 'content-type: application/json' --data '{"callback_query":{"data":"drop:1"}}')
[[ "$code" == 400 ]] && ok '        an unknown button action is refused with 400' \
                     || bad '        expected 400 for an unknown action' "got $code"

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
