"""
FastAPI HTTP server wrapping the game simulation logic.

Start with:
    uvicorn simulation_server:app --host 0.0.0.0 --port 5001 --reload

Environment variables:
    MONGODB_URI   MongoDB connection string (same as the Express server).
                  When set, model weights are fetched from the database and
                  cached in memory by game_id so they are never re-sent on
                  every action request. When absent, the server falls back to
                  accepting an explicit model_path (local dev only).

The server exposes a single endpoint:
    POST /simulate
        Body fields:
            game_id      str              ID of the game in MongoDB (used for
                                          model weight cache lookup).
            rules_yaml   str              Compiled YAML rules for this game.
            arch         str              Model architecture (default: "mlp").
            hidden_dim   int              Hidden layer size (default: 128).
            action       any | null       Player action, or null to start/poll.
            state        dict | null      Serialised game state from previous
                                          response, or null to start a new game.
            round_indices list[int]       Round sequence (default: [0]).
"""

import os
import base64
import tempfile
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from game_session import GameSession

# ── Model weight cache ────────────────────────────────────────────────────────
# Keyed by game_id. Each entry is the absolute path to a temp .pt file written
# once on first use and reused for every subsequent action in that game session.
# The files persist for the lifetime of the server process; on Render's free
# tier the ephemeral disk is wiped on restart anyway.
_model_cache: dict[str, str] = {}  # game_id → local .pt file path

# ── MongoDB client (optional) ─────────────────────────────────────────────────
_mongo_client = None
_games_col = None

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
print(f"[sim] Startup: MONGODB_URI = {MONGODB_URI}")
if MONGODB_URI:
    try:
        from pymongo import MongoClient
        _mongo_client = MongoClient(MONGODB_URI)
        _games_col = _mongo_client["52archive"]["games"]
        print(f"[sim] Connected to MongoDB — model weight caching enabled. Collection: {_games_col}")
    except Exception as e:
        print(f"[sim] WARNING: Could not connect to MongoDB: {e}", flush=True)
        print(f"[sim] Model weights must be supplied via model_path (local dev only).", flush=True)
else:
    print("[sim] MONGODB_URI is not set in environment!", flush=True)


def _resolve_model_path(game_id: str, arch: str, hidden_dim: int) -> Optional[str]:
    """
    Return a local path to the model weights for the given game_id.
    """
    print(f"[sim] _resolve_model_path called. game_id={game_id}, arch={arch}, hidden_dim={hidden_dim}", flush=True)
    # 1. Cache hit
    cached = _model_cache.get(game_id)
    if cached and os.path.exists(cached):
        print(f"[sim] Cache hit: {cached}", flush=True)
        return cached

    # 2. Fetch from MongoDB
    if _games_col is not None:
        try:
            print(f"[sim] Fetching game {game_id} from MongoDB...", flush=True)
            game = _games_col.find_one({"_id": game_id}, {"model": 1})
            print(f"[sim] Mongo returned model config for game '{game_id}'", flush=True)
            weights_b64 = game and game.get("model", {}).get("weights_base64")
            if weights_b64:
                tmp = tempfile.NamedTemporaryFile(
                    suffix=".pt", delete=False, prefix=f"model_{game_id}_"
                )
                tmp.write(base64.b64decode(weights_b64))
                tmp.close()
                _model_cache[game_id] = tmp.name
                print(f"[sim] Cached model weights for game '{game_id}' at {tmp.name}", flush=True)
                return tmp.name
            else:
                print(f"[sim] No weights_base64 found in game doc '{game_id}'", flush=True)
        except Exception as e:
            print(f"[sim] WARNING: Failed to fetch model for game '{game_id}': {e}", flush=True)
    else:
        print("[sim] _games_col is None!", flush=True)

    # 3. No model available
    return None


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="52archive Simulation API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "DELETE"],
    allow_headers=["*"],
)


class SimulateRequest(BaseModel):
    game_id: str
    rules_yaml: str
    arch: str = "mlp"
    hidden_dim: int = 128
    action: Optional[Any] = None
    state: Optional[dict] = None
    round_indices: list[int] = Field(default_factory=lambda: [0])
    # Local-dev fallback only — not used when MONGODB_URI is set
    model_path: Optional[str] = None


@app.post("/simulate")
def simulate(req: SimulateRequest):
    temp_yaml_path = None
    try:
        # Write rules_yaml to a temp file that GameSession can read
        with tempfile.NamedTemporaryFile(
            suffix=".yaml", delete=False, mode="w", encoding="utf-8"
        ) as f:
            f.write(req.rules_yaml)
            temp_yaml_path = f.name

        # Resolve model — DB cache first, then explicit path (local dev)
        model_path = _resolve_model_path(req.game_id, req.arch, req.hidden_dim) \
            or req.model_path

        session = GameSession(
            temp_yaml_path,
            model_path=model_path,
            arch=req.arch,
            hidden_dim=req.hidden_dim,
        )

        # ── Restore or start session ──────────────────────────────────────────
        if req.state:
            s = req.state
            session.round_indices = s["round_indices"]
            session.current_round_idx_of_game = s["current_round_idx_of_game"]
            session.cumulative_scores = {
                int(k): v for k, v in s["cumulative_scores"].items()
            }
            session.done = s["done"]

            e = s["env_state"]
            session.env.hands = {
                int(k): [tuple(c) for c in v] for k, v in e["hands"].items()
            }
            session.env.tricks_won = {int(k): v for k, v in e["tricks_won"].items()}
            session.env.bids = {int(k): v for k, v in e["bids"].items()}
            session.env.scores = {int(k): v for k, v in e["scores"].items()}
            session.env.round_card_points = {
                int(k): v for k, v in e["round_card_points"].items()
            }
            session.env.passed_cards = {
                int(k): [tuple(c) for c in v] for k, v in e["passed_cards"].items()
            }
            session.env.round_idx = e["round_idx"]
            session.env.cards_per_player = e["cards_per_player"]
            session.env.tricks_played = e.get("tricks_played", 0)
            session.env.trump_suit = e["trump_suit"]
            session.env.lead_suit = e["lead_suit"]
            session.env.current_turn = e["current_turn"]
            session.env.trick_leader = e["trick_leader"]
            session.env.current_trick = [(int(c[0]), tuple(c[1])) for c in e["current_trick"]]
            session.env.phase = e["phase"]
            session.obs = session.env._get_obs(session.env.current_turn)
        else:
            session.start_game(req.round_indices)

        # ── Process action ────────────────────────────────────────────────────
        logs: list[str] = []
        action = req.action

        if action == "next_round":
            session.next_round()
            logs.append(
                f"Starting next round: Round {session.current_round_idx_of_game + 1}"
            )
        elif action is not None:
            if session.env.phase == "bidding":
                _, msg = session.human_bid(action)
                logs.append(msg)
            elif session.env.phase == "passing":
                card_to_find = tuple(action)
                card_idx = next(
                    (i for i, c in enumerate(session.obs["hand"]) if tuple(c) == card_to_find),
                    -1,
                )
                _, msg = session.human_pass(card_idx) if card_idx != -1 \
                    else (False, "Card not found in hand.")
                logs.append(msg)
            elif session.env.phase == "playing":
                card_to_find = tuple(action)
                card_idx = next(
                    (i for i, c in enumerate(session.obs["hand"]) if tuple(c) == card_to_find),
                    -1,
                )
                _, msg = session.human_play(card_idx) if card_idx != -1 \
                    else (False, "Card not found in hand.")
                logs.append(msg)

        # ── Run AI responses ──────────────────────────────────────────────────
        if session.env.phase == "passing":
            logs.extend(session.execute_ai_passes())
        elif session.env.phase == "bidding":
            logs.extend(session.execute_ai_bids())

        if session.env.phase == "playing":
            logs.extend(session.execute_ai_plays())

        round_completed = session.env.phase == "completed"

        # ── Serialize state ───────────────────────────────────────────────────
        updated_state = {
            "round_indices": session.round_indices,
            "current_round_idx_of_game": session.current_round_idx_of_game,
            "cumulative_scores": {
                str(k): v for k, v in session.cumulative_scores.items()
            },
            "done": session.done,
            "env_state": {
                "hands": {str(k): v for k, v in session.env.hands.items()},
                "tricks_won": {str(k): v for k, v in session.env.tricks_won.items()},
                "bids": {str(k): v for k, v in session.env.bids.items()},
                "scores": {str(k): v for k, v in session.env.scores.items()},
                "round_card_points": {
                    str(k): v for k, v in session.env.round_card_points.items()
                },
                "passed_cards": {
                    str(k): v for k, v in session.env.passed_cards.items()
                },
                "round_idx": session.env.round_idx,
                "cards_per_player": session.env.cards_per_player,
                "tricks_played": session.env.tricks_played,
                "trump_suit": session.env.trump_suit,
                "lead_suit": session.env.lead_suit,
                "current_turn": session.env.current_turn,
                "trick_leader": session.env.trick_leader,
                "current_trick": session.env.current_trick,
                "phase": session.env.phase,
            },
        }

        obs = session.obs
        return {
            "state": updated_state,
            "logs": logs,
            "observation": {
                "player_id": obs["player_id"] if obs else 0,
                "hand": obs["hand"] if obs else [],
                "trump_suit": obs["trump_suit"] if obs else None,
                "bids": {str(k): v for k, v in obs["bids"].items()} if obs else {},
                "tricks_won": (
                    {str(k): v for k, v in obs["tricks_won"].items()} if obs else {}
                ),
                "current_trick": obs["current_trick"] if obs else [],
                "lead_suit": obs["lead_suit"] if obs else None,
                "phase": obs["phase"] if obs else "completed",
                "scores": (
                    {str(k): v for k, v in obs["scores"].items()} if obs else {}
                ),
                "legal_moves": obs["legal_moves"] if obs else [],
                "done": session.done,
            },
            "round_completed": round_completed,
            "done": session.done,
            "has_model": session.playing_policy is not None,
        }

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    finally:
        if temp_yaml_path and os.path.exists(temp_yaml_path):
            os.remove(temp_yaml_path)


@app.delete("/cache/{game_id}")
def evict_model_cache(game_id: str):
    """
    Remove a cached model weight file for the given game_id.
    Call this from the Express server after a new model is uploaded via
    upload_model.py so the sim server picks up the updated weights on the
    next simulate request.
    """
    path = _model_cache.pop(game_id, None)
    if path and os.path.exists(path):
        os.remove(path)
        return {"evicted": True, "game_id": game_id}
    return {"evicted": False, "game_id": game_id}
