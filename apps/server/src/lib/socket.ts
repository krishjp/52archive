/**
 * Socket.io event emitters for the 52Archive server.
 * The io instance is set once at startup via registerSocketIO()
 * and used throughout all route handlers.
 */
import type { Server as SocketIOServer } from "socket.io";

let _io: SocketIOServer | null = null;

export function registerSocketIO(io: SocketIOServer) {
  _io = io;
}

export function emitLockAcquired(gameId: string, sessionId: string, expiresAt: string) {
  _io?.emit("lock:acquired", { gameId, sessionId, expiresAt });
}

export function emitLockReleased(gameId: string) {
  _io?.emit("lock:released", { gameId });
}

export function emitGameSaved(gameId: string) {
  _io?.emit("game:saved", { gameId });
}
