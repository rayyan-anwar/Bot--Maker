-- Admin-managed budget controls for the PostgreSQL AI budget ledger.
CREATE TABLE IF NOT EXISTS ai_budget_controls (
  id SMALLINT PRIMARY KEY CHECK (id=1),
  emergency_stop BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);
INSERT INTO ai_budget_controls(id,emergency_stop)
VALUES(1,FALSE)
ON CONFLICT(id) DO NOTHING;
