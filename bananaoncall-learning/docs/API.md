# API sketch

## Alerts

`POST /api/v1/alerts`

```json
{
  "source": "demo",
  "fingerprint": "payment-api-high-error-rate",
  "service": "payment-api",
  "severity": "critical",
  "summary": "HTTP 5xx > 10%",
  "labels": {"env":"prod","team":"payments"}
}
```

## Incidents

- `GET /api/v1/incidents`
- `GET /api/v1/incidents/{id}`
- `POST /api/v1/incidents/{id}/ack`
- `POST /api/v1/incidents/{id}/resolve`

## On-call

- `GET /api/v1/oncall/current?team=platform`

## Integrations

- `POST /api/v1/integrations/grafana`
- `POST /api/v1/integrations/alertmanager`
- `POST /api/v1/integrations/generic/{integration-key}` (future)
- `POST /api/v1/integrations/telegram/callback` (future)
