-- AI budget scopes and reservation ledger (migration 004).
-- Runtime enforcement/transaction helpers are intentionally implemented separately.
CREATE TABLE IF NOT EXISTS ai_budget_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global','user','model')),
  scope_key TEXT NOT NULL,
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  limit_amount NUMERIC(20,8) NOT NULL CHECK (limit_amount >= 0),
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL CHECK (window_end > window_start),
  reserved_amount NUMERIC(20,8) NOT NULL DEFAULT 0 CHECK (reserved_amount >= 0),
  spent_amount NUMERIC(20,8) NOT NULL DEFAULT 0 CHECK (spent_amount >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope_type, scope_key, currency, window_start, window_end)
);

CREATE TABLE IF NOT EXISTS ai_budget_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key TEXT NOT NULL UNIQUE,
  scope_id UUID NOT NULL REFERENCES ai_budget_scopes(id) ON DELETE RESTRICT,
  model_id TEXT NOT NULL,
  pricing_version TEXT NOT NULL,
  input_token_cap BIGINT NOT NULL CHECK (input_token_cap >= 0),
  output_token_cap BIGINT NOT NULL CHECK (output_token_cap >= 0),
  reserved_amount NUMERIC(20,8) NOT NULL CHECK (reserved_amount >= 0),
  actual_amount NUMERIC(20,8) CHECK (actual_amount >= 0),
  state TEXT NOT NULL CHECK (state IN ('reserved','settled','released','expired')),
  provider_request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ai_budget_reservations_scope_state_idx
  ON ai_budget_reservations(scope_id, state);

CREATE TABLE IF NOT EXISTS ai_budget_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID REFERENCES ai_budget_reservations(id) ON DELETE RESTRICT,
  scope_id UUID NOT NULL REFERENCES ai_budget_scopes(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('reserve','settle','release','expire','adjust')),
  amount_delta NUMERIC(20,8) NOT NULL,
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  request_key TEXT NOT NULL,
  metadata_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_budget_ledger_scope_created_idx
  ON ai_budget_ledger_entries(scope_id, created_at);
CREATE INDEX IF NOT EXISTS ai_budget_ledger_request_idx
  ON ai_budget_ledger_entries(request_key);
