#!/usr/bin/env python3
"""Press a button on the newest mock-telegram message.

The mock's web page at http://localhost:8081 does the same thing; this exists so
the E2E suite and `make ack` can drive a responder without a browser.

    press.py ack|res|sil [message_index]
"""
import json
import sys
import urllib.request

MOCK = "http://localhost:8081"


def get(path):
    with urllib.request.urlopen(MOCK + path) as r:
        return json.load(r)


def post(path, body):
    req = urllib.request.Request(
        MOCK + path,
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        return r.status, r.read().decode()


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else "ack"
    index = int(sys.argv[2]) if len(sys.argv) > 2 else -1

    messages = get("/__messages")["messages"] or []
    if not messages:
        sys.exit("no messages yet — fire an alert first")

    msg = messages[index]
    button = next(
        (b for b in (msg.get("buttons") or []) if (b.get("callback_data") or "").startswith(action)),
        None,
    )
    if button is None:
        sys.exit(f"message #{msg['message_id']} has no {action} button")

    status, body = post("/__press", {"message_id": msg["message_id"], "callback_data": button["callback_data"]})
    print(f"pressed {button['text']} on #{msg['message_id']} -> {status} {body.strip()}")


if __name__ == "__main__":
    main()
