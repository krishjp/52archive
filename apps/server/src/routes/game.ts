/**
 * GET  /api/games/:id  — fetch single game with latest graph and lock status
 * PUT  /api/games/:id  — save game (requires lock + version match), releases lock on success
 */
import { Router, Request, Response } from "express";
import { getCollection } from "@52archive/core/db";
import { emitLockReleased, emitGameSaved } from "../lib/socket.js";

export const gameRouter = Router({ mergeParams: true });

gameRouter.get("/", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const gamesCol = await getCollection("games");
    const gameVersionsCol = await getCollection("game_versions");

    const game = await gamesCol.findOne({ _id: id });
    if (!game) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const latestVersion = await gameVersionsCol.findOne(
      { game_id: id },
      { sort: { version: -1 } }
    );

    const graphPayload = latestVersion?.graph ?? { nodes: [], edges: [] };
    const isTextBased = !graphPayload.nodes?.length;

    res.json({
      id: game._id,
      title: game.title,
      subtitle: game.subtitle,
      summary: game.summary,
      minPlayers: game.min_players,
      maxPlayers: game.max_players,
      playTimeMinutes: game.play_time_minutes,
      difficulty: game.difficulty,
      tags: game.tags,
      needsPaperScorekeeping: game.needs_paper_scorekeeping,
      deckCount: game.deck_count,
      version: game.version,
      lockedBy: game.locked_by ?? null,
      lockExpiresAt: game.lock_expires_at ?? null,
      graph: graphPayload,
      isTextBased,
      // Pull textRules out of the graph blob if it's a text-based game
      textRules: isTextBased ? (graphPayload.textRules ?? "") : undefined,
    });
  } catch (err: any) {
    console.error(`[GET /api/games/${id}]`, err.message);
    res.status(500).json({ error: err.message });
  }
});

gameRouter.put("/", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const {
    sessionId, version, graph,
    title, subtitle, summary, minPlayers, maxPlayers,
    playTimeMinutes, needsPaperScorekeeping, status,
  } = req.body as {
    sessionId: string;
    version: number;
    graph: { nodes: any[]; edges: any[] };
    title?: string;
    subtitle?: string;
    summary?: string;
    minPlayers?: number;
    maxPlayers?: number;
    playTimeMinutes?: number;
    needsPaperScorekeeping?: boolean;
    status?: string;
  };

  if (!sessionId || version === undefined || !graph) {
    res.status(400).json({ error: "sessionId, version, and graph are required" });
    return;
  }

  try {
    const gamesCol = await getCollection("games");
    const game = await gamesCol.findOne({ _id: id });
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }

    if (game.locked_by !== sessionId) {
      res.status(403).json({ error: "You do not hold the edit lock. Return to the catalog and click Edit to acquire it." });
      return;
    }

    if (game.version !== version) {
      res.status(409).json({
        error: "Version conflict — another save occurred. Reload and retry.",
        currentVersion: game.version,
      });
      return;
    }

    const nextVersion = version + 1;

    const gameVersionsCol = await getCollection("game_versions");
    await gameVersionsCol.insertOne({
      game_id: id,
      version: nextVersion,
      graph: graph,
      created_at: new Date()
    });

    const lockExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const updateFields: any = {
      version: nextVersion,
      locked_at: new Date(),
      lock_expires_at: lockExpiresAt,
      updated_at: new Date()
    };

    if (title !== undefined) updateFields.title = title;
    if (subtitle !== undefined) updateFields.subtitle = subtitle;
    if (summary !== undefined) updateFields.summary = summary;
    if (minPlayers !== undefined) updateFields.min_players = minPlayers;
    if (maxPlayers !== undefined) updateFields.max_players = maxPlayers;
    if (playTimeMinutes !== undefined) updateFields.play_time_minutes = playTimeMinutes;
    if (needsPaperScorekeeping !== undefined) updateFields.needs_paper_scorekeeping = needsPaperScorekeeping;
    if (status !== undefined) updateFields.status = status;

    await gamesCol.updateOne(
      { _id: id },
      { $set: updateFields }
    );

    emitGameSaved(id);

    res.json({ ok: true, version: nextVersion, lockExpiresAt: lockExpiresAt.toISOString() });
  } catch (err: any) {
    console.error(`[PUT /api/games/${id}]`, err.message);
    res.status(500).json({ error: err.message });
  }
});
