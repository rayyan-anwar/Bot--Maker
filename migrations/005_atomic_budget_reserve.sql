-- Atomic reservation function. Caller must still record provider usage and settle/release.
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
BEGIN
  IF p_request_key IS NULL OR length(trim(p_request_key)) = 0 THEN
    RAISE EXCEPTION 'request_key is required';
  END IF;
  IF p_amount < 0 OR p_input_token_cap < 0 OR p_output_token_cap < 0 THEN
    RAISE EXCEPTION 'reservation amount and token caps must be non-negative';
  END IF;

  -- Serialize globally by request key before locking the budget scope. This avoids\n  -- cross-scope races on the unique reservation key and keeps lock order stable.\n  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_key,0));\n\n  SELECT * INTO v_scope FROM ai_budget_scopes WHERE id=p_scope_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'budget scope not found'; END IF;
  IF NOW() < v_scope.window_start OR NOW() >= v_scope.window_end THEN
    RAISE EXCEPTION 'budget scope window is not active';
  END IF;

  SELECT * INTO v_existing FROM ai_budget_reservations WHERE request_key=p_request_key;
  IF FOUND THEN
    IF v_existing.scope_id <> p_scope_id OR v_existing.reserved_amount <> p_amount
       OR v_existing.model_id <> p_model_id OR v_existing.pricing_version <> p_pricing_version THEN
      RAISE EXCEPTION 'idempotency key reused with different reservation parameters';
    END IF;
    RETURN v_existing.id;
  END IF;

  IF v_scope.reserved_amount + v_scope.spent_amount + p_amount > v_scope.limit_amount THEN
    RAISE EXCEPTION 'AI budget limit exceeded';
  END IF;

  INSERT INTO ai_budget_reservations(
    request_key,scope_id,model_id,pricing_version,input_token_cap,output_token_cap,
    reserved_amount,state,expires_at
  ) VALUES (
    p_request_key,p_scope_id,p_model_id,p_pricing_version,p_input_token_cap,p_output_token_cap,
    p_amount,'reserved',p_expires_at
  ) RETURNING id INTO v_id;

  UPDATE ai_budget_scopes SET reserved_amount=reserved_amount+p_amount,updated_at=NOW()
    WHERE id=p_scope_id;
  INSERT INTO ai_budget_ledger_entries(reservation_id,scope_id,event_type,amount_delta,currency,request_key)
    VALUES(v_id,p_scope_id,'reserve',p_amount,v_scope.currency,p_request_key);
  RETURN v_id;
END;
$$;
