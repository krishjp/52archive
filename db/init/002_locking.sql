ALTER TABLE games
  ADD COLUMN IF NOT EXISTS version         integer     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS locked_by       text,
  ADD COLUMN IF NOT EXISTS locked_at       timestamptz,
  ADD COLUMN IF NOT EXISTS lock_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS games_lock_idx ON games(locked_by)
  WHERE locked_by IS NOT NULL;
