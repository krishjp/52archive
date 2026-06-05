# Deployment Guide

This guide details the steps required to deploy the 52Archive stack using MongoDB Atlas (for persistence), Render (for the Express API server and Python simulation server), and Vercel (for the Next.js web application).

## Architecture Overview

```
Vercel (Next.js web)
    |
    |-- /api/games/*  ─────────────────► Render: Express + Socket.io
    |                                        (Node.js Web Service)
    |                                        - Game CRUD (MongoDB Atlas)
    |                                        - Edit locks
    |                                        - Socket.io live updates
    |                                        - /simulate → proxies to ▼
    |                                        - /model upload → evicts sim cache
    |
    └── (simulation via Express proxy) ──► Render: FastAPI Simulation Server
                                               (Python Web Service)
                                               - Stateless per-request game logic
                                               - Fetches model weights from Atlas
                                                 once per game_id, caches in memory
                                               - Heuristic fallback when no model
```

Two separate Render services are required because the backend is Node.js and
the simulation engine is Python. The sim server fetches model weights from
MongoDB Atlas on first use per game and caches them in memory, so weights are
never re-transmitted on every action request. If you want to defer deploying
the simulation server, the Express server will return a clear 502 with
instructions rather than crashing silently.

---

## 1. Database Setup: MongoDB Atlas

Since 52Archive uses structured rule schemas and versioned graphs, MongoDB's
document-based model is a natural fit for storing the JSON-like game structures.

### Step-by-Step Setup
1. Log in to the [MongoDB Atlas Console](https://cloud.mongodb.com/).
2. Create a new project and provision a shared cluster (e.g., M0 Free Tier).
3. Under **Database Access**, create a database user with read/write access.
4. Under **Network Access**, whitelist `0.0.0.0/0` (or add Render's outbound
   IP ranges if using a static outbound proxy) to allow incoming connections
   from the backend.
5. Navigate to **Database**, click **Connect**, select **Drivers**, and copy
   the connection string:
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxx.mongodb.net/52archive?retryWrites=true&w=majority
   ```

### Collections

- **`games`** — one document per game entry
  ```json
  {
    "_id": "game-id-slug",
    "title": "Game Title",
    "subtitle": "Subtitle",
    "summary": "One-line summary",
    "min_players": 2,
    "max_players": 6,
    "play_time_minutes": 30,
    "difficulty": "moderate",
    "tags": ["classic", "strategy"],
    "deck_count": 1,
    "needs_paper_scorekeeping": true,
    "rules_yaml": "id: ...\ntitle: ...\n...",
    "status": "draft",
    "featured": false,
    "version": 1
  }
  ```

- **`game_versions`** — one document per save, linked to a game
  ```json
  {
    "game_id": "game-id-slug",
    "version": 1,
    "graph": { "nodes": [], "edges": [] },
    "created_at": "2025-01-01T00:00:00.000Z"
  }
  ```

---

## 2. Express API Server: Render (Node.js Web Service)

The Express + Socket.io backend ([apps/server](apps/server)) is deployed as a
Web Service on Render.

### Environment Variables

| Variable | Value | Description |
|---|---|---|
| `PORT` | `10000` | Render default port |
| `NODE_ENV` | `production` | Run Node in production mode |
| `MONGODB_URI` | `mongodb+srv://...` | Connection URI from MongoDB Atlas |
| `CORS_ORIGIN` | `https://your-app.vercel.app` | URL of your deployed Vercel web app |
| `SIMULATION_API` | `https://52archive-sim.onrender.com` | URL of your deployed simulation server |

### Deployment Steps
1. Log in to [Render](https://render.com/) and click **New > Web Service**.
2. Connect your Git repository.
3. Configure the service:
   - **Name**: `52archive-api`
   - **Root Directory**: leave empty (commands run from repo root)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node --import tsx apps/server/src/index.ts`
4. Add the environment variables listed above.
5. Click **Deploy Web Service** and copy the generated URL
   (e.g., `https://52archive-api.onrender.com`).

> If the `SIMULATION_API` service is not yet deployed, omit that variable for
> now. The `/api/games/:id/simulate` endpoint will return a `502` with
> instructions rather than crashing the main service.

---

## 3. Simulation Server: Render (Python Web Service)

The FastAPI simulation server ([training_env/simulation_server.py](training_env/simulation_server.py))
is deployed as a separate Python Web Service on Render. It is fully stateless —
every request carries the complete game state in the request body and receives
the updated state back in the response.

### Environment Variables

| Variable | Value | Description |
|---|---|---|
| `MONGODB_URI` | `mongodb+srv://...` | Same Atlas URI as the Express server — used to fetch model weights on first simulate call per game and cache them in memory. Without this, the server runs heuristics only. |

### Deployment Steps
1. In Render, click **New > Web Service**.
2. Connect the same Git repository.
3. Configure the service:
   - **Name**: `52archive-sim`
   - **Root Directory**: `training_env`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install fastapi uvicorn pymongo pyyaml`
   - **Start Command**: `uvicorn simulation_server:app --host 0.0.0.0 --port 10000`
4. Add the `MONGODB_URI` environment variable.
5. Click **Deploy Web Service** and copy the generated URL.
6. Set that URL as the `SIMULATION_API` environment variable on the
   `52archive-api` service (see section 2).

> When a new model is uploaded via `upload_model.py`, the Express server
> automatically sends `DELETE /cache/:game_id` to the sim server so it evicts
> the stale cached weights and fetches the updated version from Atlas on the
> next simulate request. This call is non-fatal if the sim server is not yet
> running.

### Running Locally

```bash
cd training_env
pip install fastapi uvicorn
uvicorn simulation_server:app --host 0.0.0.0 --port 5001 --reload
```

The Express server defaults to `http://localhost:5001` when `SIMULATION_API`
is not set, so no extra configuration is needed for local development.

---

## 4. Web Frontend: Vercel

The Next.js web application ([apps/web](apps/web)) is deployed on Vercel.

### Environment Variables

| Variable | Value | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://52archive-api.onrender.com` | Deployed URL of your Render Express API |

### Deployment Steps
1. Log in to [Vercel](https://vercel.com/) and click **Add New > Project**.
2. Import your Git repository.
3. Configure the project:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `apps/web`
4. Add the environment variable listed above.
5. Click **Deploy**.

---

## Summary: Service Checklist

| Service | Platform | Runtime | Depends On |
|---|---|---|---|
| MongoDB Atlas | Atlas (M0 free) | — | — |
| `52archive-api` | Render Web Service | Node.js | MongoDB Atlas, `52archive-sim` |
| `52archive-sim` | Render Web Service | Python 3 | MongoDB Atlas (model cache) |
| `52archive-web` | Vercel | Next.js | `52archive-api` |
