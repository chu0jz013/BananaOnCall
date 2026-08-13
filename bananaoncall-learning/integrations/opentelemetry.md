# OpenTelemetry

Instrument inbound requests, incident commands, notification attempts, and Temporal activities.

Suggested signals:
- traces: alert ingestion → incident → notification
- metrics: ingestion count, open incidents, ACK latency, notification failures
- logs: structured slog correlated with trace/span IDs

Export through the OpenTelemetry Collector, then choose Prometheus/Tempo/Jaeger/Loki backends.
