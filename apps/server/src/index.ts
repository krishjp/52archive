/**
 * 52Archive — Shared API Server
 *
 * Express + Socket.io. Consumed by all client apps (web, mobile, future).
 * Runs independently of Next.js on its own port.
 *
 * Endpoints:
 *   GET    /api/games
 *   GET    /api/games/:id
 *   PUT    /api/games/:id
 *   POST   /api/games/:id/lock
 *   DELETE /api/games/:id/lock
 *
 * WebSocket events (via Socket.io at /socket.io):
 *   lock:acquired  { gameId, sessionId, expiresAt }
 *   lock:released  { gameId }
 *   game:saved     { gameId }
 */
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";
import { registerSocketIO } from "./lib/socket.js";
import { gamesRouter } from "./routes/games.js";
import { gameRouter } from "./routes/game.js";
import { lockRouter } from "./routes/lock.js";

const PORT = parseInt(process.env.PORT ?? "4000", 10);

// ── Express app ──────────────────────────────────────────────────────────────
const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? "*",
  methods: ["GET", "PUT", "POST", "DELETE"],
}));
app.use(express.json());

// Health check
app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Game routes
app.use("/api/games", gamesRouter);
app.use("/api/games/:id", gameRouter);
app.use("/api/games/:id/lock", lockRouter);

// ── HTTP + Socket.io ─────────────────────────────────────────────────────────
const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN ?? "*" },
});

registerSocketIO(io);

io.on("connection", (socket) => {
  console.log(`[ws] connected  ${socket.id}`);
  socket.on("disconnect", () => console.log(`[ws] disconnected ${socket.id}`));
});

// ── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`✓ 52Archive server running on http://localhost:${PORT}`);
  console.log(`✓ Socket.io accepting connections`);
});
