-- Phase 7 target schema. The starter backend still uses in-memory storage.
CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS incidents (
  id text PRIMARY KEY,
  fingerprint text NOT NULL,
  service text NOT NULL,
  severity text NOT NULL,
  summary text NOT NULL,
  status text NOT NULL,
  alert_count integer NOT NULL DEFAULT 1,
  acknowledged_by text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS incidents_open_fingerprint_idx ON incidents(fingerprint) WHERE status <> 'resolved';

CREATE TABLE IF NOT EXISTS incident_events (
  id bigserial PRIMARY KEY,
  incident_id text NOT NULL REFERENCES incidents(id),
  event_type text NOT NULL,
  actor text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id bigserial PRIMARY KEY,
  incident_id text NOT NULL REFERENCES incidents(id),
  channel text NOT NULL,
  destination text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
