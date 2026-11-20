-- Tighten AI budget idempotency checks without rewriting historical migrations.
CREATE OR REPLACE FUNCTION botforge_reserve_ai_budget(
  p_request_key TEXT,
  p_scope_id UUID,
  p_model_id TEXT,
  p_pricing_version TEXT,
  p_input_token_cap BIGINT,
  p_output_token_cap BIGINT,
  p_amount NUMERIC(20,8),
  p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_scope ai_budget_scopes%ROWTYPE;
  v_existing ai_budget_reservations%ROWTYPE;
  v_id UUID;
  v_emergency_stop BOOLEAN;
BEGIN
  IF p_request_key IS NULL OR length(trim(p_request_key))=0
     OR p_model_id IS NULL OR length(trim(p_model_id))=0
     OR p_pricing_version IS NULL OR length(trim(p_pricing_version))=0 THEN
    RAISE EXCEPTION 'request key, model and pricing version are required';
  END IF;
  IF p_amount IS NULL OR p_amount<0 OR p_input_token_cap IS NULL OR p_input_token_cap<0
     OR p_output_token_cap IS NULL OR p_output_token_cap<0 THEN
    RAISE EXCEPTION 'reservation amount and token caps must be non-negative';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_key,0));
  -- An exact retry returns the original reservation even if the emergency stop
  -- was enabled or its scope window has since closed. The advisory lock makes
  -- this lookup safe against concurrent requests using the same key.
  SELECT * INTO v_existing FROM ai_budget_reservations WHERE request_key=p_request_key;
  IF FOUND THEN
    IF v_existing.scope_id IS DISTINCT FROM p_scope_id
       OR v_existing.reserved_amount IS DISTINCT FROM p_amount
       OR v_existing.model_id IS DISTINCT FROM p_model_id
       OR v_existing.pricing_version IS DISTINCT FROM p_pricing_version
       OR v_existing.input_token_cap IS DISTINCT FROM p_input_token_cap
       OR v_existing.output_token_cap IS DISTINCT FROM p_output_token_cap
       OR v_existing.expires_at IS DISTINCT FROM p_expires_at THEN
      RAISE EXCEPTION 'idempotency key reused with different reservation parameters';
    END IF;
    RETURN v_existing.id;
  END IF;

  -- Lock the singleton control row so emergency-stop changes serialize with
  -- creation of new reservations.
  SELECT emergency_stop INTO v_emergency_stop
    FROM ai_budget_controls WHERE id=1 FOR SHARE;
  IF COALESCE(v_emergency_stop,FALSE) THEN
    RAISE EXCEPTION 'AI emergency stop is enabled';
  END IF;

  SELECT * INTO v_scope FROM ai_budget_scopes WHERE id=p_scope_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'budget scope not found'; END IF;
  IF NOW()<v_scope.window_start OR NOW()>=v_scope.window_end THEN
    RAISE EXCEPTION 'budget scope window is not active';
  END IF;

  IF v_scope.reserved_amount+v_scope.spent_amount+p_amount>v_scope.limit_amount THEN
    RAISE EXCEPTION 'AI budget limit exceeded';
  END IF;
  INSERT INTO ai_budget_reservations(request_key,scope_id,model_id,pricing_version,input_token_cap,output_token_cap,reserved_amount,state,expires_at)
  VALUES(p_request_key,p_scope_id,p_model_id,p_pricing_version,p_input_token_cap,p_output_token_cap,p_amount,'reserved',p_expires_at)
  RETURNING id INTO v_id;
  UPDATE ai_budget_scopes SET reserved_amount=reserved_amount+p_amount,updated_at=NOW() WHERE id=p_scope_id;
  INSERT INTO ai_budget_ledger_entries(reservation_id,scope_id,event_type,amount_delta,currency,request_key)
  VALUES(v_id,p_scope_id,'reserve',p_amount,v_scope.currency,p_request_key);
  RETURN v_id;
END;
$$;

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
  IF p_adjustment IS NULL OR p_adjustment=0 THEN RAISE EXCEPTION 'adjustment must be non-zero'; END IF;
  IF p_request_key IS NULL OR length(trim(p_request_key))=0 THEN RAISE EXCEPTION 'reconciliation request key is required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason))<8 OR length(p_reason)>500 THEN RAISE EXCEPTION 'reconciliation reason must be 8 to 500 characters'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_key,0));
  SELECT * INTO v_scope FROM ai_budget_scopes WHERE id=p_scope_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'budget scope not found'; END IF;
  SELECT * INTO v_existing FROM ai_budget_ledger_entries WHERE request_key=p_request_key AND event_type='adjust';
  IF FOUND THEN
    IF v_existing.scope_id IS DISTINCT FROM p_scope_id
       OR v_existing.amount_delta IS DISTINCT FROM p_adjustment
       OR v_existing.metadata_redacted->>'reason' IS DISTINCT FROM left(p_reason,500) THEN
      RAISE EXCEPTION 'reconciliation key reused with different parameters';
    END IF;
    RETURN v_existing.id;
  END IF;
  IF v_scope.spent_amount+p_adjustment<0 THEN RAISE EXCEPTION 'reconciliation would make spent amount negative'; END IF;
  IF v_scope.reserved_amount+v_scope.spent_amount+p_adjustment>v_scope.limit_amount THEN RAISE EXCEPTION 'reconciliation would exceed budget limit'; END IF;
  UPDATE ai_budget_scopes SET spent_amount=spent_amount+p_adjustment,updated_at=NOW() WHERE id=p_scope_id;
  INSERT INTO ai_budget_ledger_entries(scope_id,event_type,amount_delta,currency,request_key,metadata_redacted)
  VALUES(p_scope_id,'adjust',p_adjustment,v_scope.currency,p_request_key,jsonb_build_object('reason',left(p_reason,500)))
  RETURNING id INTO v_entry;
  RETURN v_entry;
END;
$$;
