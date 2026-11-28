-- Automatically record budget alert transitions whenever a scope's financial state changes.
-- This keeps alert generation independent of an administrator dashboard refresh.
CREATE OR REPLACE FUNCTION botforge_sync_ai_budget_alert_from_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_consumed NUMERIC(20,8);
  v_percent NUMERIC;
  v_status TEXT;
  v_threshold INTEGER;
  v_message TEXT;
  v_snapshot JSONB;
BEGIN
  v_consumed := NEW.reserved_amount + NEW.spent_amount;
  IF NEW.limit_amount IS NULL OR NEW.limit_amount <= 0 THEN
    v_status := 'unknown';
    v_percent := NULL;
    v_threshold := NULL;
    v_message := 'Budget alert cannot be evaluated from an invalid or zero limit.';
  ELSE
    v_percent := ROUND((v_consumed / NEW.limit_amount) * 100, 2);
    IF v_percent >= 100 THEN
      v_status := 'exhausted';
      v_threshold := 100;
      v_message := 'Budget is fully consumed or exceeded.';
    ELSIF v_percent >= 85 THEN
      v_status := 'critical';
      v_threshold := 85;
      v_message := 'Budget consumption has reached at least 85%.';
    ELSIF v_percent >= 70 THEN
      v_status := 'warning';
      v_threshold := 70;
      v_message := 'Budget consumption has reached at least 70%.';
    ELSE
      v_status := 'normal';
      v_threshold := NULL;
      v_message := 'Budget consumption is below alert thresholds.';
    END IF;
  END IF;

  v_snapshot := jsonb_build_object(
    'scopeId', NEW.id,
    'scopeType', NEW.scope_type,
    'scopeLabel', NEW.scope_type || ': ' || NEW.scope_key,
    'currency', NEW.currency,
    'limitAmount', NEW.limit_amount,
    'reservedAmount', NEW.reserved_amount,
    'spentAmount', NEW.spent_amount,
    'percentUsed', v_percent,
    'threshold', v_threshold,
    'status', v_status,
    'message', v_message,
    'windowStart', NEW.window_start,
    'windowEnd', NEW.window_end,
    'generatedAt', NOW()
  );

  PERFORM botforge_record_ai_budget_alert(NEW.id, v_status, v_snapshot);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS botforge_ai_budget_scope_alert_trigger ON ai_budget_scopes;
CREATE TRIGGER botforge_ai_budget_scope_alert_trigger
AFTER INSERT OR UPDATE OF scope_type, scope_key, currency, limit_amount, reserved_amount, spent_amount, window_start, window_end
ON ai_budget_scopes
FOR EACH ROW
EXECUTE FUNCTION botforge_sync_ai_budget_alert_from_scope();
