/**
 * POST   /api/games/:id/lock  — acquire or heartbeat-refresh an edit lock (30 min TTL)
 * DELETE /api/games/:id/lock  — voluntarily release a lock
 *
 * Lock lifecycle:
 *  - Acquired when a user clicks "Edit Rules" in the catalog
 *  - Released automatically when a save succeeds (PUT /api/games/:id)
 *  - Auto-expires after 30 minutes if the editor tab is closed without saving
 *  - Heartbeat (POST with refresh:true) extends TTL every 5 minutes while editing
 */
import { Router, Request, Response } from "express";
import { getCollection } from "@52archive/core/db";
import { emitLockAcquired, emitLockReleased } from "../lib/socket.js";

export const lockRouter = Router({ mergeParams: true });

const LOCK_MINUTES = 30;

lockRouter.post("/", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { sessionId, refresh = false } = req.body as { sessionId: string; refresh?: boolean };

  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }

  try {
    const gamesCol = await getCollection("games");
    const game = await gamesCol.findOne({ _id: id });
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }

    const { locked_by, lock_expires_at } = game;
    const now = new Date();
    const isExpired = !lock_expires_at || new Date(lock_expires_at) < now;
    const heldBySelf = locked_by === sessionId;
    const heldByOther = locked_by && locked_by !== sessionId && !isExpired;

    if (refresh && !heldBySelf) {
      res.status(403).json({ error: "You do not hold this lock" });
      return;
    }

    if (!refresh && heldByOther) {
      res.status(423).json({
        error: "Game is currently being edited",
        lockedBy: locked_by,
        expiresAt: lock_expires_at,
      });
      return;
    }

    const expiresAt = new Date(now.getTime() + LOCK_MINUTES * 60 * 1000);

    await gamesCol.updateOne(
      { _id: id },
      {
        $set: {
          locked_by: sessionId,
          locked_at: new Date(),
          lock_expires_at: expiresAt
        }
      }
    );

    if (!refresh) {
      emitLockAcquired(id, sessionId, expiresAt.toISOString());
    }

    res.json({ ok: true, expiresAt: expiresAt.toISOString() });
  } catch (err: any) {
    console.error(`[POST /api/games/${id}/lock]`, err.message);
    res.status(500).json({ error: err.message });
  }
});

lockRouter.delete("/", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { sessionId } = req.body as { sessionId?: string };

  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }

  try {
    const gamesCol = await getCollection("games");
    const result = await gamesCol.updateOne(
      { _id: id, locked_by: sessionId },
      {
        $set: {
          locked_by: null,
          locked_at: null,
          lock_expires_at: null
        }
      }
    );

    if (result.modifiedCount > 0) {
      emitLockReleased(id);
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error(`[DELETE /api/games/${id}/lock]`, err.message);
    res.status(500).json({ error: err.message });
  }
});
