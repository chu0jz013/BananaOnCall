# Local platform

Start the Go API on your host, then: `docker compose up -d`.

The compose file intentionally uses `latest` for learning convenience; pin immutable image versions/digests before treating it as a production deployment. Temporal is kept as a separate phase because its local stack is larger—follow `integrations/temporal.md` when you reach that milestone.
