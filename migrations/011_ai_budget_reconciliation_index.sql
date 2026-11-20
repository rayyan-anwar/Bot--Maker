-- Index open reservations by expiry for operator reconciliation and bounded audits.
-- This does not automatically release expired holds: a provider request may have
-- reached the provider before the application crashed, so an operator must
-- reconcile provider billing before changing the reservation state.
CREATE INDEX IF NOT EXISTS ai_budget_reservations_expiry_idx
  ON ai_budget_reservations(expires_at,created_at)
  WHERE state='reserved' AND expires_at IS NOT NULL;
