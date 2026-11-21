-- Lease-based claiming and bounded retry lifecycle for AI budget alert outbox.
ALTER TABLE ai_budget_alert_outbox
  ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS ai_budget_alert_outbox_lease_idx
  ON ai_budget_alert_outbox(lease_until) WHERE delivery_state='attempted';

CREATE OR REPLACE FUNCTION botforge_claim_ai_budget_alert_outbox(
  p_batch_size INTEGER DEFAULT 20,
  p_lease_seconds INTEGER DEFAULT 60
) RETURNS SETOF ai_budget_alert_outbox
LANGUAGE plpgsql AS $$
BEGIN
  IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 100 THEN
    RAISE EXCEPTION 'batch size must be between 1 and 100';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 10 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'lease seconds must be between 10 and 900';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT id FROM ai_budget_alert_outbox
    WHERE available_at <= NOW()
      AND (delivery_state='pending' OR (delivery_state='attempted' AND lease_until <= NOW()))
      AND attempts < 10
    ORDER BY available_at,created_at,id
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  UPDATE ai_budget_alert_outbox AS target
    SET delivery_state='attempted',attempts=target.attempts+1,
        claimed_at=NOW(),lease_until=NOW()+make_interval(secs=>p_lease_seconds),
        last_error=NULL
  FROM candidates WHERE target.id=candidates.id
  RETURNING target.*;
END;
$$;

CREATE OR REPLACE FUNCTION botforge_finish_ai_budget_alert_outbox(
  p_id UUID,
  p_delivered BOOLEAN,
  p_error TEXT DEFAULT NULL,
  p_retry_seconds INTEGER DEFAULT 60,
  p_max_attempts INTEGER DEFAULT 5
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_row ai_budget_alert_outbox%ROWTYPE;
  v_state TEXT;
BEGIN
  IF p_retry_seconds IS NULL OR p_retry_seconds < 1 OR p_retry_seconds > 86400 THEN
    RAISE EXCEPTION 'retry seconds must be between 1 and 86400';
  END IF;
  IF p_max_attempts IS NULL OR p_max_attempts < 1 OR p_max_attempts > 10 THEN
    RAISE EXCEPTION 'max attempts must be between 1 and 10';
  END IF;
  SELECT * INTO v_row FROM ai_budget_alert_outbox WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('updated',false,'reason','not_found'); END IF;
  IF v_row.delivery_state <> 'attempted' THEN
    RETURN jsonb_build_object('updated',false,'reason','not_claimed','state',v_row.delivery_state);
  END IF;
  IF p_delivered THEN
    UPDATE ai_budget_alert_outbox SET delivery_state='delivered',delivered_at=NOW(),
      lease_until=NULL,last_error=NULL WHERE id=p_id;
    v_state := 'delivered';
  ELSIF v_row.attempts >= p_max_attempts THEN
    UPDATE ai_budget_alert_outbox SET delivery_state='failed',lease_until=NULL,
      last_error=LEFT(COALESCE(p_error,'Delivery failed.'),500) WHERE id=p_id;
    v_state := 'failed';
  ELSE
    UPDATE ai_budget_alert_outbox SET delivery_state='pending',lease_until=NULL,
      available_at=NOW()+make_interval(secs=>p_retry_seconds),
      last_error=LEFT(COALESCE(p_error,'Delivery failed.'),500) WHERE id=p_id;
    v_state := 'pending';
  END IF;
  RETURN jsonb_build_object('updated',true,'state',v_state,'attempts',v_row.attempts);
END;
$$;
