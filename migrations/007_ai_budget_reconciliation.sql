-- Controlled reconciliation for provider invoices or verified usage corrections.
-- The application must expose this operation only to authorized administrators.
CREATE OR REPLACE FUNCTION botforge_reconcile_ai_budget(
  p_scope_id UUID,
  p_adjustment NUMERIC(20,8),
  p_request_key TEXT,
  p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_scope ai_budget_scopes%ROWTYPE;
  v_entry UUID;
  v_existing ai_budget_ledger_entries%ROWTYPE;
BEGIN
  IF p_adjustment IS NULL OR p_adjustment=0 THEN
    RAISE EXCEPTION 'adjustment must be non-zero';
  END IF;
  IF p_request_key IS NULL OR length(trim(p_request_key))=0 THEN
    RAISE EXCEPTION 'reconciliation request key is required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason))<8 THEN
    RAISE EXCEPTION 'a meaningful reconciliation reason is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_key,0));
  SELECT * INTO v_scope FROM ai_budget_scopes WHERE id=p_scope_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'budget scope not found'; END IF;

  SELECT * INTO v_existing FROM ai_budget_ledger_entries
   WHERE request_key=p_request_key AND event_type='adjust';
  IF FOUND THEN
    IF v_existing.scope_id<>p_scope_id OR v_existing.amount_delta<>p_adjustment THEN
      RAISE EXCEPTION 'reconciliation key reused with different parameters';
    END IF;
    RETURN v_existing.id;
  END IF;

  IF v_scope.spent_amount+p_adjustment<0 THEN
    RAISE EXCEPTION 'reconciliation would make spent amount negative';
  END IF;
  IF v_scope.reserved_amount+v_scope.spent_amount+p_adjustment>v_scope.limit_amount THEN
    RAISE EXCEPTION 'reconciliation would exceed budget limit';
  END IF;

  UPDATE ai_budget_scopes
     SET spent_amount=spent_amount+p_adjustment,updated_at=NOW()
   WHERE id=p_scope_id;
  INSERT INTO ai_budget_ledger_entries(
    scope_id,event_type,amount_delta,currency,request_key,metadata_redacted
  ) VALUES (
    p_scope_id,'adjust',p_adjustment,v_scope.currency,p_request_key,
    jsonb_build_object('reason',left(p_reason,500))
  ) RETURNING id INTO v_entry;
  RETURN v_entry;
END;
$$;
