/**
 * GET  /api/games/:id  — fetch single game with latest graph and lock status
 * PUT  /api/games/:id  — save game (requires lock + version match), releases lock on success
 */
import { Router, Request, Response } from "express";
import { query } from "@52archive/core/db";
import { emitLockReleased, emitGameSaved } from "../lib/socket.js";

export const gameRouter = Router({ mergeParams: true });

gameRouter.get("/", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const result = await query<any>(`
      SELECT g.*,
             gv.graph as latest_graph
      FROM games g
      LEFT JOIN LATERAL (
        SELECT graph FROM game_versions
        WHERE game_id = g.id
        ORDER BY version DESC LIMIT 1
      ) gv ON true
      WHERE g.id = $1
    `, [id]);

    if (!result.rows.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const row = result.rows[0];
    const graphPayload = row.latest_graph ?? { nodes: [], edges: [] };
    const isTextBased = !graphPayload.nodes?.length;
    res.json({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      summary: row.summary,
      minPlayers: row.min_players,
      maxPlayers: row.max_players,
      playTimeMinutes: row.play_time_minutes,
      difficulty: row.difficulty,
      tags: row.tags,
      needsPaperScorekeeping: row.needs_paper_scorekeeping,
      deckCount: row.deck_count,
      version: row.version,
      lockedBy: row.locked_by ?? null,
      lockExpiresAt: row.lock_expires_at ?? null,
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
    playTimeMinutes, needsPaperScorekeeping,
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
  };

  if (!sessionId || version === undefined || !graph) {
    res.status(400).json({ error: "sessionId, version, and graph are required" });
    return;
  }

  try {
    const current = await query<{ version: number; locked_by: string | null }>(
      "SELECT version, locked_by FROM games WHERE id = $1", [id]
    );
    if (!current.rows.length) {
      res.status(404).json({ error: "Game not found" });
      return;
    }

    const row = current.rows[0];

    if (row.locked_by !== sessionId) {
      res.status(403).json({ error: "You do not hold the edit lock. Return to the catalog and click Edit to acquire it." });
      return;
    }

    if (row.version !== version) {
      res.status(409).json({
        error: "Version conflict — another save occurred. Reload and retry.",
        currentVersion: row.version,
      });
      return;
    }

    const nextVersion = version + 1;

    await query(
      `INSERT INTO game_versions (game_id, version, graph) VALUES ($1, $2, $3)`,
      [id, nextVersion, JSON.stringify(graph)]
    );

    await query(
      `UPDATE games
       SET version = $1,
           locked_by = NULL,
           locked_at = NULL,
           lock_expires_at = NULL,
           updated_at = NOW(),
           title = COALESCE($3, title),
           subtitle = COALESCE($4, subtitle),
           summary = COALESCE($5, summary),
           min_players = COALESCE($6, min_players),
           max_players = COALESCE($7, max_players),
           play_time_minutes = COALESCE($8, play_time_minutes),
           needs_paper_scorekeeping = COALESCE($9, needs_paper_scorekeeping)
       WHERE id = $2`,
      [
        nextVersion,
        id,
        title ?? null,
        subtitle ?? null,
        summary ?? null,
        minPlayers ?? null,
        maxPlayers ?? null,
        playTimeMinutes ?? null,
        needsPaperScorekeeping !== undefined ? needsPaperScorekeeping : null,
      ]
    );

    emitLockReleased(id);
    emitGameSaved(id);

    res.json({ ok: true, version: nextVersion });
  } catch (err: any) {
    console.error(`[PUT /api/games/${id}]`, err.message);
    res.status(500).json({ error: err.message });
  }
});
