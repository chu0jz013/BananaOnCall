# Integration ecosystem roadmap

Useful integrations to add after the core is solid:

## Alert sources
- Prometheus Alertmanager
- Grafana Alerting
- generic webhooks
- OpenTelemetry Collector webhook/event bridge
- Kubernetes event watcher
- Sentry-compatible webhook
- OpenSearch/Elasticsearch alert webhook

## Notification/chat
- Telegram
- Slack-compatible webhook
- Discord webhook
- Matrix
- SMTP email

## Workflow / queue / data
- Temporal
- PostgreSQL
- NATS JetStream
- Apache Kafka
- Redis Streams (learning/optional)

## Identity/secrets
- Keycloak (OIDC)
- External Secrets Operator
- HashiCorp Vault / OpenBao adapter

## Observability
- Prometheus
- Grafana
- OpenTelemetry Collector
- Tempo / Jaeger
- Loki

## Delivery/platform
- Docker
- Kubernetes
- Helm
- Kustomize
- Argo CD / Flux
- cert-manager

Do not integrate all of these at once. Each adapter should exist because it exercises a concrete engineering concern.
