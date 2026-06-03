CREATE TABLE IF NOT EXISTS games (
  id text PRIMARY KEY,
  title text NOT NULL,
  subtitle text NOT NULL,
  summary text NOT NULL,
  min_players integer NOT NULL,
  max_players integer,
  play_time_minutes integer NOT NULL,
  difficulty text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  needs_paper_scorekeeping boolean NOT NULL DEFAULT true,
  deck_count integer NOT NULL DEFAULT 1,
  featured boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  created_by text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  locked_by text,
  locked_at timestamptz,
  lock_expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS game_versions (
  id bigserial PRIMARY KEY,
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  version integer NOT NULL,
  graph jsonb NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS games_status_idx ON games(status);
CREATE INDEX IF NOT EXISTS games_featured_idx ON games(featured);
CREATE INDEX IF NOT EXISTS game_versions_game_id_idx ON game_versions(game_id);
CREATE INDEX IF NOT EXISTS games_lock_idx ON games(locked_by) WHERE locked_by IS NOT NULL;
