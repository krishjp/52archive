import { Router, Request, Response } from "express";
import { getCollection } from "@52archive/core/db";
import { emitLockReleased, emitGameSaved } from "../lib/socket.js";

const SIMULATION_API = process.env.SIMULATION_API ?? "http://localhost:5001";

export const gameRouter = Router({ mergeParams: true });

function jsonToYaml(config: any): string {
  return `
id: "${config.name ? config.name.toLowerCase().replace(/[^a-z0-9]/g, "-") : "custom-game"}"
title: "${config.name || "Custom Game"}"
subtitle: "${config.subtitle || ""}"
summary: "${config.summary || ""}"
minPlayers: ${config.player_count_min || 3}
maxPlayers: ${config.player_count_max || 4}
playTimeMinutes: 30
difficulty: "moderate"
tags: [custom]
deckCount: ${config.deck_size && config.deck_size > 52 ? 2 : 1}
needsPaperScorekeeping: false

mechanics:
  type: "trick_taking"
  followSuit: true
  hasTrump: ${config.trump_mode !== "none"}
  trumpSelection: "${config.trump_mode === "none" ? "none" : "round_rotation"}"
  trickResolution: "highest_rank_lead_or_trump"
  scoringType: "exact_bid_only"

rules:
  rewardWeights:
    terminal_win: 100
    terminal_loss: -100
    trick_won: 10
    penalty_card_taken: -5
`;
}

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
      textRules: isTextBased ? (graphPayload.textRules ?? "") : undefined,
      hasModel: !!game.model?.weights_base64,
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
    rulesYaml,
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
    rulesYaml?: string;
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
    if (rulesYaml !== undefined) updateFields.rules_yaml = rulesYaml;

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

gameRouter.post("/model", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { arch, hiddenDim, weightsBase64 } = req.body;

  if (!arch || !hiddenDim || !weightsBase64) {
    res.status(400).json({ error: "arch, hiddenDim, and weightsBase64 are required" });
    return;
  }

  try {
    const gamesCol = await getCollection("games");
    const game = await gamesCol.findOne({ _id: id });
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }

    await gamesCol.updateOne(
      { _id: id },
      {
        $set: {
          model: {
            arch,
            hidden_dim: parseInt(hiddenDim, 10),
            weights_base64: weightsBase64,
            uploaded_at: new Date()
          }
        }
      }
    );

    // Evict the sim server's cached .pt file so the next simulate call
    // picks up the newly uploaded weights.
    try {
      await fetch(`${SIMULATION_API}/cache/${id}`, { method: "DELETE" });
    } catch {
      // Non-fatal — the sim server may not be running yet.
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

gameRouter.post("/simulate", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { action, state, roundIndices, turnSelectionMode } = req.body;

  try {
    const gamesCol = await getCollection("games");
    const game = await gamesCol.findOne({ _id: id });
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }

    const gameVersionsCol = await getCollection("game_versions");
    const latestVersion = await gameVersionsCol.findOne(
      { game_id: id },
      { sort: { version: -1 } }
    );

    // Prefer the stored YAML; fall back to generating one from the structured config
    const storedYaml = game.rules_yaml as string | undefined;
    const config = latestVersion?.graph?.structuredConfig || {
      name: game.title,
      player_count_min: game.min_players,
      player_count_max: game.max_players,
      deck_size: game.deck_count * 52,
      trump_mode: game.deck_count > 1 ? "fixed_rotation" : "none",
    };
    const rulesYaml = storedYaml || jsonToYaml(config);

    // Pass game_id to the sim server so it can fetch and cache model weights
    // from MongoDB itself — avoids re-sending the full weights binary on every
    // action request.
    const payload: Record<string, any> = {
      game_id: id,
      rules_yaml: rulesYaml,
      arch: game.model?.arch || "mlp",
      hidden_dim: game.model?.hidden_dim || 128,
      action: action ?? null,
      state: state ?? null,
    };

    if (roundIndices) {
      payload.round_indices = roundIndices;
    }
    if (turnSelectionMode) {
      payload.turn_selection_mode = turnSelectionMode;
    }

    const simRes = await fetch(`${SIMULATION_API}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!simRes.ok) {
      const detail = await simRes.text();
      console.error(`[simulate] simulation server error (${simRes.status}):`, detail);
      res.status(502).json({ error: "Simulation server returned an error", details: detail });
      return;
    }

    const data = await simRes.json();
    res.json(data);
  } catch (err: any) {
    console.error("[simulate] failed to reach simulation server:", err.message);
    res.status(502).json({
      error: "Could not connect to simulation server",
      details: `Make sure the simulation server is running: cd training_env && uvicorn simulation_server:app --port 5001`,
    });
  }
});
