create table if not exists games (
  id text primary key,
  title text not null,
  subtitle text not null,
  summary text not null,
  min_players integer not null,
  max_players integer,
  play_time_minutes integer not null,
  difficulty text not null,
  tags text[] not null default '{}',
  needs_paper_scorekeeping boolean not null default true,
  deck_count integer not null default 1,
  featured boolean not null default false,
  status text not null default 'draft',
  created_by text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists game_versions (
  id bigserial primary key,
  game_id text not null references games(id) on delete cascade,
  version integer not null,
  graph jsonb not null,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists games_status_idx on games(status);
create index if not exists games_featured_idx on games(featured);
create index if not exists game_versions_game_id_idx on game_versions(game_id);
