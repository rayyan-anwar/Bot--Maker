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
