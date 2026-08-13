# Temporal

Use Temporal only after the in-process escalation implementation works.

Recommended workflow:

```text
IncidentWorkflow(incidentID)
  -> notify primary activity
  -> durable timer 10m
  -> if not acknowledged: notify secondary
  -> durable timer 10m
  -> if not acknowledged: notify team lead
  -> await ACK/RESOLVE signal
```

Exercises:
- Add Temporal SDK as an explicit dependency.
- Define deterministic workflow code and side-effecting activities.
- Signal the workflow on ACK/resolve.
- Add activity retry policies.
- Test workflow time-skipping.
