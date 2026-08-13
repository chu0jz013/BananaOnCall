# Prometheus Alertmanager

Goal: accept Alertmanager webhook payloads, normalize labels/annotations, preserve its fingerprint, and deduplicate into incidents.

Exercises:
- Configure an Alertmanager webhook receiver pointing to `/api/v1/integrations/alertmanager`.
- Map `severity`, `service`/`job`, `alertname`, and `summary`.
- Decide how `resolved` alerts should auto-resolve incidents.
- Add HMAC/reverse-proxy authentication for production.
