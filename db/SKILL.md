---
name: db-schema
description: PostgreSQL relational schema schema tables, constraint declarations, and docker compose boot setups.
version: 1.0.0
author: krish-patel
tags:
  - database
  - postgresql
  - docker
  - db-init
---

# PostgreSQL Database Schema

## Overview
This skill outlines the relational schema configurations, constraint rules, indexing properties, and docker compose startup procedures for the local database.

## When to Use
Use when:
- Adding table variables, properties, or locks in initialization SQL files.
- Indexing columns to optimize query speeds.
- Modifying docker compose volume mappings or credentials.

## Instructions
1. **Define Table Relational Constraints**:
   Map `game_versions` references to `games(id)` using a foreign key constraint with cascading deletes.
2. **Implement Index Strategies**:
   - Establish indices on frequently filtered attributes like status and featured flags.
   - Utilize a partial index on locked entries: `WHERE locked_by IS NOT NULL`.

## Output Format
- SQL schemas: Declared tables, references, and indexed structures.

## Examples
### Partial Index Creation
```sql
CREATE INDEX IF NOT EXISTS games_lock_idx ON games(locked_by) WHERE locked_by IS NOT NULL;
```

## Notes
- Keep Docker database volume bindings mapped correctly to prevent local data loss when docker containers restart.
