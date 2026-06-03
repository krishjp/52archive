import { Router, Request, Response } from "express";
import { query } from "@52archive/core/db";

export const gamesRouter = Router();

gamesRouter.post("/", async (req: Request, res: Response) => {
  const {
    id, title, subtitle, summary, minPlayers, maxPlayers,
    playTimeMinutes, difficulty, tags, needsPaperScorekeeping,
    deckCount, graph, textRules, isTextBased,
  } = req.body;

  if (!id || !title || !summary) {
    res.status(400).json({ error: "id, title, and summary are required" });
    return;
  }

  try {
    await query(
      `INSERT INTO games (id, title, subtitle, summary, min_players, max_players,
        play_time_minutes, difficulty, tags, needs_paper_scorekeeping, deck_count,
        featured, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,'draft')`,
      [
        id, title, subtitle ?? "", summary, minPlayers ?? 2, maxPlayers ?? 6,
        playTimeMinutes ?? 30, difficulty ?? "moderate", tags ?? ["custom"],
        needsPaperScorekeeping ?? false, deckCount ?? 1,
      ]
    );

    // Store graph or text rules as the first version
    const graphPayload = isTextBased
      ? { nodes: [], edges: [], textRules: textRules ?? "" }
      : (graph ?? { nodes: [], edges: [] });

    await query(
      `INSERT INTO game_versions (game_id, version, graph) VALUES ($1, 1, $2)`,
      [id, JSON.stringify(graphPayload)]
    );

    res.status(201).json({ ok: true, id });
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "A game with this ID already exists" });
    } else {
      console.error("[POST /api/games]", err.message);
      res.status(500).json({ error: err.message });
    }
  }
});

gamesRouter.get("/", async (_req: Request, res: Response) => {
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
      ORDER BY g.created_at DESC
    `);

    const games = result.rows.map((row: any) => ({
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
      featured: row.featured,
      status: row.status,
      version: row.version,
      lockedBy: row.locked_by ?? null,
      lockExpiresAt: row.lock_expires_at ?? null,
      graph: row.latest_graph ?? { nodes: [], edges: [] },
      isTextBased: !row.latest_graph?.nodes?.length,
      textRules: !row.latest_graph?.nodes?.length ? (row.latest_graph?.textRules ?? "") : undefined,
    }));

    res.json(games);
  } catch (err: any) {
    console.error("[GET /api/games]", err.message);
    res.status(500).json({ error: err.message });
  }
});
