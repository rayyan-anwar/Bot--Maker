-- Atomic settlement and release operations for AI budget reservations.
-- All functions lock the scope first, then the reservation, matching migration 005.

CREATE OR REPLACE FUNCTION botforge_settle_ai_budget(
  p_reservation_id UUID,
  p_actual_amount NUMERIC(20,8),
  p_provider_request_id TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_res ai_budget_reservations%ROWTYPE;
  v_scope ai_budget_scopes%ROWTYPE;
BEGIN
  IF p_actual_amount IS NULL OR p_actual_amount < 0 THEN
    RAISE EXCEPTION 'actual amount must be non-negative';
  END IF;

  SELECT s.* INTO v_scope
    FROM ai_budget_scopes s
    JOIN ai_budget_reservations r ON r.scope_id=s.id
   WHERE r.id=p_reservation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation not found'; END IF;
  SELECT * INTO v_scope FROM ai_budget_scopes WHERE id=v_scope.id FOR UPDATE;
  SELECT * INTO v_res FROM ai_budget_reservations WHERE id=p_reservation_id FOR UPDATE;

  IF v_res.state='settled' THEN
    IF v_res.actual_amount=p_actual_amount
       AND (p_provider_request_id IS NULL OR v_res.provider_request_id=p_provider_request_id) THEN
      RETURN 'settled';
    END IF;
    RAISE EXCEPTION 'reservation already settled with conflicting amount or provider request id';
  END IF;
  IF v_res.state<>'reserved' THEN
    RAISE EXCEPTION 'only reserved items can be settled';
  END IF;
  IF p_actual_amount > v_res.reserved_amount THEN
    RAISE EXCEPTION 'actual amount exceeds reservation; reconciliation required';
  END IF;

  UPDATE ai_budget_reservations
     SET state='settled', actual_amount=p_actual_amount,
         provider_request_id=COALESCE(p_provider_request_id,provider_request_id),
         settled_at=NOW()
   WHERE id=p_reservation_id;
  UPDATE ai_budget_scopes
     SET reserved_amount=reserved_amount-v_res.reserved_amount,
         spent_amount=spent_amount+p_actual_amount, updated_at=NOW()
   WHERE id=v_res.scope_id;
  INSERT INTO ai_budget_ledger_entries(
    reservation_id,scope_id,event_type,amount_delta,currency,request_key
  ) VALUES (
    v_res.id,v_res.scope_id,'settle',p_actual_amount,v_scope.currency,v_res.request_key
  );
  RETURN 'settled';
END;
$$;

CREATE OR REPLACE FUNCTION botforge_release_ai_budget(
  p_reservation_id UUID,
  p_expired BOOLEAN DEFAULT FALSE
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_res ai_budget_reservations%ROWTYPE;
  v_scope ai_budget_scopes%ROWTYPE;
  v_event TEXT;
BEGIN
  SELECT s.* INTO v_scope
    FROM ai_budget_scopes s
    JOIN ai_budget_reservations r ON r.scope_id=s.id
   WHERE r.id=p_reservation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation not found'; END IF;
  SELECT * INTO v_scope FROM ai_budget_scopes WHERE id=v_scope.id FOR UPDATE;
  SELECT * INTO v_res FROM ai_budget_reservations WHERE id=p_reservation_id FOR UPDATE;

  IF v_res.state IN ('released','expired') THEN
    IF (v_res.state='expired') = p_expired THEN RETURN v_res.state; END IF;
    RAISE EXCEPTION 'reservation already closed with a different terminal state';
  END IF;
  IF v_res.state<>'reserved' THEN
    RAISE EXCEPTION 'only reserved items can be released';
  END IF;
  IF p_expired AND (v_res.expires_at IS NULL OR v_res.expires_at>NOW()) THEN
    RAISE EXCEPTION 'reservation is not expired';
  END IF;

  v_event := CASE WHEN p_expired THEN 'expire' ELSE 'release' END;
  UPDATE ai_budget_reservations
     SET state=CASE WHEN p_expired THEN 'expired' ELSE 'released' END,
         released_at=NOW()
   WHERE id=p_reservation_id;
  UPDATE ai_budget_scopes
     SET reserved_amount=reserved_amount-v_res.reserved_amount, updated_at=NOW()
   WHERE id=v_res.scope_id;
  INSERT INTO ai_budget_ledger_entries(
    reservation_id,scope_id,event_type,amount_delta,currency,request_key
  ) VALUES (
    v_res.id,v_res.scope_id,v_event,-v_res.reserved_amount,v_scope.currency,v_res.request_key
  );
  RETURN CASE WHEN p_expired THEN 'expired' ELSE 'released' END;
END;
$$;
