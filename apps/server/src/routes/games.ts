import { Router, Request, Response } from "express";
import { getCollection } from "@52archive/core/db";

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
    const gamesCol = await getCollection("games");
    const existing = await gamesCol.findOne({ _id: id });
    if (existing) {
      res.status(409).json({ error: "A game with this ID already exists" });
      return;
    }

    await gamesCol.insertOne({
      _id: id,
      title,
      subtitle: subtitle ?? "",
      summary,
      min_players: minPlayers ?? 2,
      max_players: maxPlayers ?? 6,
      play_time_minutes: playTimeMinutes ?? 30,
      difficulty: difficulty ?? "moderate",
      tags: tags ?? ["custom"],
      needs_paper_scorekeeping: needsPaperScorekeeping ?? false,
      deck_count: deckCount ?? 1,
      featured: false,
      status: "draft",
      version: 1,
      created_at: new Date(),
      updated_at: new Date()
    });

    const graphPayload = isTextBased
      ? { nodes: [], edges: [], textRules: textRules ?? "" }
      : (graph ?? { nodes: [], edges: [] });

    const gameVersionsCol = await getCollection("game_versions");
    await gameVersionsCol.insertOne({
      game_id: id,
      version: 1,
      graph: graphPayload,
      created_at: new Date()
    });

    res.status(201).json({ ok: true, id });
  } catch (err: any) {
    console.error("[POST /api/games]", err.message);
    res.status(500).json({ error: err.message });
  }
});

gamesRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const gamesCol = await getCollection("games");
    const gameVersionsCol = await getCollection("game_versions");

    const games = await gamesCol.find().sort({ created_at: -1 }).toArray();

    const gameList = [];
    for (const g of games) {
      const latestVersion = await gameVersionsCol.findOne(
        { game_id: g._id },
        { sort: { version: -1 } }
      );
      gameList.push({
        id: g._id,
        title: g.title,
        subtitle: g.subtitle,
        summary: g.summary,
        minPlayers: g.min_players,
        maxPlayers: g.max_players,
        playTimeMinutes: g.play_time_minutes,
        difficulty: g.difficulty,
        tags: g.tags,
        needsPaperScorekeeping: g.needs_paper_scorekeeping,
        deckCount: g.deck_count,
        featured: g.featured,
        status: g.status,
        version: g.version || 1,
        lockedBy: g.locked_by ?? null,
        lockExpiresAt: g.lock_expires_at ?? null,
        graph: latestVersion?.graph ?? { nodes: [], edges: [] },
        isTextBased: !latestVersion?.graph?.nodes?.length,
        textRules: !latestVersion?.graph?.nodes?.length ? (latestVersion?.graph?.textRules ?? "") : undefined,
      });
    }

    res.json(gameList);
  } catch (err: any) {
    console.error("[GET /api/games]", err.message);
    res.status(500).json({ error: err.message });
  }
});
