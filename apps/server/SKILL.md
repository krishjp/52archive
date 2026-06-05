---
name: server-api
description: API backend server Express routing, database connections, and WebSocket game locking event managers.
version: 1.0.0
author: krish-patel
tags:
  - backend
  - express
  - websockets
  - collaborative-lock
---

# API Backend Server

## Overview
This skill details the architecture and endpoint routing of the Express backend server, database connection pooling, and Socket.io collaborative game lock management.

## When to Use
Use when:
- Adding REST API route endpoints in `src/routes/`.
- Changing database queries, PostgreSQL transaction pools, or health checkers.
- Updating real-time WebSocket state handlers in `src/lib/socket.ts`.

## Instructions
1. **Manage Game Versioning**:
   On game state POST requests, construct transaction updates to insert new graph version entries in the `game_versions` history table.
2. **Handle Session Editing Locks**:
   Verify session token and expiry timestamps before updating lock columns in the `games` table.
3. **Emit WebSocket Broadcasts**:
   - Broadcast lock updates (`lock:acquired` / `lock:released`) to all active dashboard connections.

## Output Format
- API responses: Returns standard JSON responses with status codes.
- WebSocket payloads: Structured objects defining locks or events.

## Examples
### WebSocket Client Event Connection
```typescript
socket.on("lock:acquired", (data) => {
  console.log(`Game locked: ${data.gameId} by ${data.sessionId}`);
});
```

## Notes
- Enforce lock expiry timestamps to prevent stale developer locking states.
