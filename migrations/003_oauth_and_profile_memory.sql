-- Allow passwordless OAuth accounts and account-wide memory notes.
-- OAuth identities remain in the JSONB runtime record; password_hash is null for OAuth-only users.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE memory_notes ALTER COLUMN bot_id DROP NOT NULL;
