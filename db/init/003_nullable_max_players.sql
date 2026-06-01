-- Migration to allow max_players to be nullable (blanked out), representing no maximum player limit.
ALTER TABLE games ALTER COLUMN max_players DROP NOT NULL;
