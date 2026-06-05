---
name: project-archive-root
description: Root-level guide to route developers and agents to sub-directory rule engines, visual editors, database schemas, and RL environments.
version: 1.0.0
author: krish-patel
tags:
  - project-root
  - routing-guide
  - monorepo
---

# 52Archive Monorepo Root Guide

## Overview
This skill acts as the entry-point router for the 52Archive project monorepo. It points agents and developers to the directory-specific guides describing the game rules engine, graph editor, local database, and reinforcement learning simulator.

## When to Use
Use when:
- Exploring the monorepo structure for the first time.
- Routing tasks to specific packages or applications.
- Staging or testing the end-to-end game authoring pipeline.

## Instructions
1. **Locate Subdirectory Skills**:
   Refer to the specific directory guides to execute tasks:
   - **RL Simulator**: Go to [training_env/SKILL.md](training_env/SKILL.md) to train policies, configure rewards, or run grid searches.
   - **Types & Traversals**: Go to [packages/core/SKILL.md](packages/core/SKILL.md) to check schemas or update MCTS/Minimax AI engines.
   - **Graph Editor Frontend**: Go to [apps/web/SKILL.md](apps/web/SKILL.md) to edit Next.js pointer event panning/zooming canvas elements.
   - **Express API**: Go to [apps/server/SKILL.md](apps/server/SKILL.md) to configure REST routes or collaborative Socket.io game lock events.
   - **Database Setup**: Go to [db/SKILL.md](db/SKILL.md) to inspect PostgreSQL schemas, table indices, or run DockerCompose.
   - **Mobile App**: Go to [apps/mobile/SKILL.md](apps/mobile/SKILL.md) to edit the Expo native iOS shell.
2. **Synchronize Changes**:
   Ensure modifications across packages (e.g. changing model schemas in core) are verified in dependent modules (e.g. training environment or web editor page).

## Output Format
- Reference documentation routing directions pointing to individual package paths.

## Examples
### Starting the Local Development Workspace
```bash
# 1. Start the Docker database container
docker compose up -d db

# 2. Start Express API Server (Websockets/Locks)
npm run dev:server

# 3. Start Next.js rule editor frontend (Web)
npm run dev:web
```

## Notes
- Always check the corresponding subdirectory SKILL.md file before modifying any package to understand its specific architectures, commands, and design rules.

