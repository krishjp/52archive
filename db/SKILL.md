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

# MongoDB Database Schema

## Overview
This skill outlines the database configurations, connection rules, collections structure, and docker compose startup procedures for the local MongoDB database.

## When to Use
Use when:
- Creating database indexes to optimize query speeds.
- Modifying docker compose volume mappings or ports.
- Reviewing schema validation schemas or collection setups.

## Instructions
1. **Define Collections**:
   - `games`: Stores metadata, players limits, tags, status, and edit locking states.
   - `game_versions`: Reference games by `game_id` with incremental version numbers and the actual rule graph object.
2. **Implement Index Strategies**:
   - Establish indexes on frequently queried fields like `status` and `featured` flags.
   - Create a compound index on `{ game_id: 1, version: -1 }` for version queries.

## Output Format
- MongoDB queries: Standard BSON queries and aggregation pipelines.

## Examples
### Index Creation Command
```javascript
db.games.createIndex({ status: 1 });
db.game_versions.createIndex({ game_id: 1, version: -1 });
```

## Notes
- Keep Docker database volume bindings mapped correctly to prevent local data loss when docker containers restart.

