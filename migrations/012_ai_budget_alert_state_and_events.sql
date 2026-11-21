-- Persistent AI budget alert state and transition history (migration 012).
CREATE TABLE IF NOT EXISTS ai_budget_alert_state (
  scope_id UUID PRIMARY KEY REFERENCES ai_budget_scopes(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('normal','warning','critical','exhausted','unknown')),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ai_budget_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES ai_budget_scopes(id) ON DELETE CASCADE,
  previous_status TEXT CHECK (previous_status IS NULL OR previous_status IN ('normal','warning','critical','exhausted','unknown')),
  current_status TEXT NOT NULL CHECK (current_status IN ('normal','warning','critical','exhausted','unknown')),
  event_type TEXT NOT NULL CHECK (event_type IN ('initial','escalated','downgraded','recovered','evaluation_unavailable')),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_budget_alert_events_scope_created_idx
  ON ai_budget_alert_events(scope_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_budget_alert_events_created_idx
  ON ai_budget_alert_events(created_at DESC);

-- Atomically records one current snapshot and emits a history event only on transitions.
CREATE OR REPLACE FUNCTION botforge_record_ai_budget_alert(
  p_scope_id UUID,
  p_status TEXT,
  p_snapshot JSONB
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_previous TEXT;
  v_event TEXT;
  v_changed BOOLEAN := FALSE;
BEGIN
  IF p_status NOT IN ('normal','warning','critical','exhausted','unknown') THEN
    RAISE EXCEPTION 'invalid AI budget alert status';
  END IF;
  INSERT INTO ai_budget_alert_state(scope_id,status,snapshot,updated_at)
    VALUES(p_scope_id,p_status,COALESCE(p_snapshot,'{}'::jsonb),NOW())
    ON CONFLICT(scope_id) DO NOTHING;
  IF FOUND THEN
    v_previous := NULL;
    v_changed := TRUE;
    IF p_status='normal' THEN v_event := NULL;
    ELSE v_event := 'initial'; END IF;
  ELSE
    SELECT status INTO v_previous FROM ai_budget_alert_state WHERE scope_id=p_scope_id FOR UPDATE;
    IF v_previous IS DISTINCT FROM p_status THEN
      v_changed := TRUE;
      IF p_status='unknown' THEN v_event := 'evaluation_unavailable';
      ELSIF p_status='normal' THEN v_event := 'recovered';
      ELSIF v_previous='unknown' THEN v_event := 'initial';
      ELSIF (CASE p_status WHEN 'warning' THEN 1 WHEN 'critical' THEN 2 WHEN 'exhausted' THEN 3 ELSE 0 END)
         > (CASE v_previous WHEN 'warning' THEN 1 WHEN 'critical' THEN 2 WHEN 'exhausted' THEN 3 ELSE 0 END)
        THEN v_event := 'escalated';
      ELSE v_event := 'downgraded';
      END IF;
      UPDATE ai_budget_alert_state SET status=p_status,snapshot=COALESCE(p_snapshot,'{}'::jsonb),updated_at=NOW()
        WHERE scope_id=p_scope_id;
    ELSE
      UPDATE ai_budget_alert_state SET snapshot=COALESCE(p_snapshot,'{}'::jsonb),updated_at=NOW()
        WHERE scope_id=p_scope_id;
    END IF;
  END IF;
  IF v_changed AND v_event IS NOT NULL THEN
    INSERT INTO ai_budget_alert_events(scope_id,previous_status,current_status,event_type,snapshot)
      VALUES(p_scope_id,v_previous,p_status,v_event,COALESCE(p_snapshot,'{}'::jsonb));
  END IF;
  RETURN jsonb_build_object('changed',v_changed,'previous',v_previous,'current',p_status,'event',v_event);
END;
$$;
