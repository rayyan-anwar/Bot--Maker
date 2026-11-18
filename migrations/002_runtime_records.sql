-- Runtime storage and cross-instance quota reservations.
-- The JSONB table preserves current application record fields during staged cutover.
CREATE TABLE IF NOT EXISTS botforge_records (
  collection text NOT NULL CHECK (collection IN ('users','bots','documents','messages','usage','memory')),
  id uuid NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection,id)
);
CREATE INDEX IF NOT EXISTS botforge_records_collection_idx ON botforge_records(collection);
CREATE UNIQUE INDEX IF NOT EXISTS botforge_records_user_email_uidx
  ON botforge_records((lower(data->>'email'))) WHERE collection='users';

-- Reservations are committed independently of provider calls and expire if a worker dies.
CREATE TABLE IF NOT EXISTS botforge_quota_reservations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  usage_day date NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS botforge_quota_user_day_idx
  ON botforge_quota_reservations(user_id,usage_day,expires_at);

-- Shared rate-limit counters for multi-instance deployments.
CREATE TABLE IF NOT EXISTS botforge_rate_limits (
  rate_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits >= 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS botforge_rate_limits_expiry_idx
  ON botforge_rate_limits(expires_at);

-- Webhook idempotency ledger used by Stripe and Razorpay callbacks.
CREATE TABLE IF NOT EXISTS botforge_webhook_events (
  provider text NOT NULL,
  event_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider,event_id)
);

-- Efficient lookup and atomic consumption of one-time password reset tokens.
CREATE INDEX IF NOT EXISTS botforge_records_user_reset_token_idx
  ON botforge_records((data->>'passwordResetTokenHash')) WHERE collection='users';
