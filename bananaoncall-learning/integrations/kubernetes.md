# Kubernetes

Integration has two meanings:

1. **Run bananaoncall on Kubernetes** — Deployment, Service, Ingress, ConfigMap/Secret, probes, PDB/HPA.
2. **Consume Kubernetes events/health** — optional adapter using `client-go` to enrich incidents or watch selected resources.

Keep `client-go` out of the core domain package. Put it behind an adapter.
