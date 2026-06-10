"""
tournament.py — Head-to-head tournament simulator for comparing trained model checkpoints.

Each agent occupies one player seat for the entire tournament.  All agents share the
same game environment so the only variable is the policy driving each seat.

Usage (CLI):
    python tournament.py \\
        --rules_yaml oh_hell.yaml \\
        --agents "model_a.pt:lstm:128" "model_b.pt:transformer:128" heuristic \\
        --games 200 \\
        --rounds_per_game 5

Agent spec format:
    "<path>.pt:<arch>:<hidden_dim>"   — a trained model file
    "heuristic"                       — built-in heuristic baseline
    "random"                          — random legal-move agent (sanity-check floor)

Output:
    A summary table printed to stdout with per-agent metrics that are reward-mode
    agnostic: bid accuracy, average game score, win rate, and avg card points taken.
    Optionally saved to a CSV with --output report.csv.
"""

import argparse
import csv
import os
import random
import sys
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import numpy as np

# ---------------------------------------------------------------------------
# Lazy torch import — allows the script to import cleanly even without torch
# as long as no model agents are requested.
# ---------------------------------------------------------------------------
_torch = None

def _get_torch():
    global _torch
    if _torch is None:
        import torch
        _torch = torch
    return _torch


# ---------------------------------------------------------------------------
# Agent descriptors
# ---------------------------------------------------------------------------

@dataclass
class AgentSpec:
    """Parsed description of one player seat."""
    label: str                  # human-readable name shown in reports
    kind: str                   # "model" | "heuristic" | "random"
    model_path: Optional[str] = None
    arch: str = "mlp"
    hidden_dim: int = 128

    # Loaded at runtime
    playing_policy: object = field(default=None, repr=False)
    bidding_policy: object = field(default=None, repr=False)


def parse_agent_spec(spec_str: str) -> AgentSpec:
    """
    Parses a CLI agent spec string into an AgentSpec.

    Formats accepted:
      "heuristic"
      "random"
      "/path/to/model.pt:lstm:128"
      "/path/to/model.pt:transformer"       (hidden_dim defaults to 128)
      "/path/to/model.pt"                   (arch defaults to mlp, hidden_dim to 128)
    """
    spec_str = spec_str.strip()

    if spec_str.lower() == "heuristic":
        return AgentSpec(label="heuristic", kind="heuristic")
    if spec_str.lower() == "random":
        return AgentSpec(label="random", kind="random")

    parts = spec_str.split(":")
    model_path = parts[0]
    arch = parts[1] if len(parts) > 1 else "mlp"
    hidden_dim = int(parts[2]) if len(parts) > 2 else 128

    # Derive a short label from the filename
    label = os.path.splitext(os.path.basename(model_path))[0]

    return AgentSpec(
        label=label,
        kind="model",
        model_path=model_path,
        arch=arch,
        hidden_dim=hidden_dim,
    )


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

_PLAYING_INPUT_DIM = 112
_PLAYING_ACTION_DIM = 52
_BIDDING_INPUT_DIM = 57
_BIDDING_ACTION_DIM = 11   # bids 0..10


def load_agent_models(agent: AgentSpec, device) -> None:
    """Loads the playing and bidding policy networks into the agent in-place."""
    if agent.kind != "model":
        return

    torch = _get_torch()
    from models import MLPPolicy, LSTMPolicy, SimpleGNNPolicy, TransformerPolicy, DQN

    arch = agent.arch
    h = agent.hidden_dim

    # Playing policy
    if arch == "mlp":
        playing = MLPPolicy(_PLAYING_INPUT_DIM, _PLAYING_ACTION_DIM, h)
    elif arch == "lstm":
        playing = LSTMPolicy(_PLAYING_INPUT_DIM, _PLAYING_ACTION_DIM, h)
    elif arch == "transformer":
        playing = TransformerPolicy(_PLAYING_INPUT_DIM, _PLAYING_ACTION_DIM, h)
    elif arch == "gnn":
        playing = SimpleGNNPolicy(num_nodes=120, node_dim=16,
                                  action_dim=_PLAYING_ACTION_DIM, hidden_dim=h)
    elif arch == "dqn":
        playing = DQN(_PLAYING_INPUT_DIM, _PLAYING_ACTION_DIM, h)
    else:
        raise ValueError(f"Unknown architecture: {arch}")

    try:
        playing.load_state_dict(
            torch.load(agent.model_path, map_location=torch.device("cpu"))
        )
        playing.eval()
        agent.playing_policy = playing.to(device)
    except Exception as e:
        print(f"[WARNING] Failed to load playing weights for {agent.label}: {e}",
              file=sys.stderr)
        agent.playing_policy = None

    # Bidding policy — always MLP regardless of playing arch
    bidding = MLPPolicy(_BIDDING_INPUT_DIM, _BIDDING_ACTION_DIM, h)
    try:
        # The checkpoint only stores the playing policy weights; bidding policy
        # weights are not persisted separately in the current training pipeline.
        # Fall back to the heuristic bidder for all agents until that changes.
        agent.bidding_policy = None
    except Exception:
        agent.bidding_policy = None


# ---------------------------------------------------------------------------
# Inference helpers  (match the exact inference used in game_session.py / train.py)
# ---------------------------------------------------------------------------

SUITS = ["Clubs", "Diamonds", "Hearts", "Spades"]


def preprocess_playing_obs(obs: dict):
    """Converts observation dict to a 112-dim playing policy tensor."""
    torch = _get_torch()
    vec = []

    hand_vector = [0] * 52
    for s, r in obs["hand"]:
        hand_vector[SUITS.index(s) * 13 + (r - 2)] = 1
    vec.extend(hand_vector)

    trump_one_hot = [0] * 5
    if obs["trump_suit"]:
        trump_one_hot[SUITS.index(obs["trump_suit"])] = 1
    else:
        trump_one_hot[4] = 1
    vec.extend(trump_one_hot)

    trick_vector = [0] * 52
    for p_id, card in obs["current_trick"]:
        trick_vector[SUITS.index(card[0]) * 13 + (card[1] - 2)] = 1
    vec.extend(trick_vector)

    vec.append(obs["player_id"] / 4.0)
    vec.append(obs["bids"].get(obs["player_id"], 0) / 10.0)
    vec.append(obs["tricks_won"].get(obs["player_id"], 0) / 10.0)

    return torch.tensor(vec, dtype=torch.float32)


def preprocess_bidding_obs(obs: dict):
    """Converts observation dict to a 57-dim bidding policy tensor."""
    torch = _get_torch()
    vec = [0] * 57
    for s, r in obs["hand"]:
        vec[SUITS.index(s) * 13 + (r - 2)] = 1
    if obs["trump_suit"]:
        vec[52 + SUITS.index(obs["trump_suit"])] = 1
    else:
        vec[56] = 1
    return torch.tensor(vec, dtype=torch.float32)


def model_action(agent: AgentSpec, obs: dict, hidden_state, device):
    """
    Runs a forward pass through the agent's playing policy and returns
    (chosen_card, new_hidden_state).

    Falls back to the heuristic if the model failed to load.
    """
    from heuristics import get_heuristic_action

    if agent.playing_policy is None:
        return get_heuristic_action(obs), hidden_state

    torch = _get_torch()
    obs_tensor = preprocess_playing_obs(obs).to(device)
    legal_cards = obs["legal_moves"]
    legal_indices = [SUITS.index(s) * 13 + (r - 2) for s, r in legal_cards]

    with torch.no_grad():
        arch = agent.arch

        if arch == "lstm":
            logits, new_hidden = agent.playing_policy(
                obs_tensor.unsqueeze(0), hidden_state
            )
            logits = logits.flatten()
        elif arch == "transformer":
            history = hidden_state  # reused as the sequence history tensor
            logits, new_hidden = agent.playing_policy(obs_tensor, history)
            logits = logits.flatten()
        elif arch == "gnn":
            node_idx = torch.randint(0, 120, (1, 30), device=device)
            adj = torch.eye(30, device=device).unsqueeze(0)
            logits = agent.playing_policy(node_idx, adj).flatten()
            new_hidden = hidden_state
        else:
            # mlp / dqn
            logits = agent.playing_policy(obs_tensor).flatten()
            new_hidden = hidden_state

    masked = torch.full_like(logits, -float("inf"))
    masked[legal_indices] = logits[legal_indices]
    action_idx = int(torch.argmax(masked).item())
    card = (SUITS[action_idx // 13], (action_idx % 13) + 2)
    return card, new_hidden


def heuristic_bid(obs: dict) -> int:
    """Heuristic bid estimate (mirrors heuristics.py logic)."""
    hand = obs["hand"]
    trump = obs["trump_suit"]
    bid = 0
    for suit, rank in hand:
        if rank >= 12:
            bid += 1
        elif trump and suit == trump and rank >= 10:
            bid += 1
    return min(bid, len(hand))


def get_bid(agent: AgentSpec, obs: dict, device) -> int:
    """Returns a bid action for the given agent. Always heuristic for now."""
    legal = obs["legal_moves"]
    bid = heuristic_bid(obs)
    # Clamp to legal range
    if bid not in legal:
        bid = min(legal, key=lambda b: abs(b - bid))
    return bid


# ---------------------------------------------------------------------------
# Per-agent statistics accumulator
# ---------------------------------------------------------------------------

@dataclass
class AgentStats:
    label: str
    games_played: int = 0
    rounds_played: int = 0

    # Bid accuracy: did tricks_won == bid?
    bids_made: int = 0
    bids_total: int = 0

    # Raw game scores (from env.scores — scoring rule dependent)
    total_score: int = 0

    # Card points (Hearts-style: points on cards taken — lower is better)
    total_card_points: int = 0

    # Game wins: seat with highest cumulative score at end of full game
    game_wins: int = 0

    @property
    def bid_accuracy(self) -> float:
        return self.bids_made / self.bids_total if self.bids_total else 0.0

    @property
    def avg_score_per_round(self) -> float:
        return self.total_score / self.rounds_played if self.rounds_played else 0.0

    @property
    def avg_card_points_per_round(self) -> float:
        return self.total_card_points / self.rounds_played if self.rounds_played else 0.0

    @property
    def win_rate(self) -> float:
        return self.game_wins / self.games_played if self.games_played else 0.0


# ---------------------------------------------------------------------------
# Core tournament loop
# ---------------------------------------------------------------------------

def run_single_game(
    env,
    agents: List[AgentSpec],
    rounds_per_game: int,
    device,
) -> Tuple[List[AgentStats], int]:
    """
    Plays one full game (multiple rounds) with each agent occupying a fixed seat.
    Returns (per-agent round stats list, winning_seat_index).
    """
    from heuristics import get_heuristic_action

    num_players = env.num_players
    if len(agents) != num_players:
        raise ValueError(
            f"Expected {num_players} agents for this environment, got {len(agents)}."
        )

    cumulative_scores = {p: 0 for p in range(num_players)}
    round_stats = [AgentStats(label=agents[p].label) for p in range(num_players)]

    deal_seq = getattr(env, "deal_sequence", [10])
    round_indices = random.sample(range(len(deal_seq)), min(rounds_per_game, len(deal_seq)))

    for r_idx, round_seq_idx in enumerate(round_indices):
        cards = deal_seq[round_seq_idx]
        starting_player = r_idx % num_players
        obs = env.reset(cards_per_player=cards, round_idx=round_seq_idx,
                        starting_player=starting_player)

        # Per-round hidden states (keyed by seat)
        hidden_states = {p: None for p in range(num_players)}

        # --- Bidding phase ---
        while env.phase == "bidding":
            seat = obs["player_id"]
            bid = get_bid(agents[seat], obs, device)
            obs, _, _, _ = env.step(bid)

        # --- Passing phase (heuristic for all) ---
        while env.phase == "passing":
            seat = obs["player_id"]
            card = get_heuristic_action(obs)
            obs, _, _, _ = env.step(card)

        # --- Playing phase ---
        while env.phase == "playing":
            seat = obs["player_id"]
            agent = agents[seat]

            if agent.kind == "model":
                card, hidden_states[seat] = model_action(
                    agent, obs, hidden_states[seat], device
                )
            elif agent.kind == "heuristic":
                card = get_heuristic_action(obs)
                hidden_states[seat] = None
            else:  # random
                card = random.choice(obs["legal_moves"])
                hidden_states[seat] = None

            obs, _, done, _ = env.step(card)

        # --- Round completed: collect stats ---
        for p in range(num_players):
            bid = env.bids[p]
            won = env.tricks_won[p]
            score = env.scores[p]
            card_pts = env.round_card_points[p]

            round_stats[p].rounds_played += 1
            round_stats[p].bids_total += 1
            round_stats[p].bids_made += int(won == bid)
            round_stats[p].total_score += score
            round_stats[p].total_card_points += card_pts
            cumulative_scores[p] += score

    # Determine game winner (highest cumulative score)
    scoring_goal = getattr(env, "scoring_goal", "maximize")
    if scoring_goal == "minimize":
        winner_seat = min(cumulative_scores, key=lambda p: cumulative_scores[p])
    else:
        winner_seat = max(cumulative_scores, key=lambda p: cumulative_scores[p])

    return round_stats, winner_seat


def run_tournament(
    agents: List[AgentSpec],
    rules_yaml: str,
    games: int,
    rounds_per_game: int,
    device,
    verbose: bool = True,
) -> List[AgentStats]:
    """
    Runs a full multi-game tournament and returns aggregated per-agent stats.
    """
    from env import TrickTakingEnv

    # Use pure mode so the env doesn't add training reward noise to scores
    env = TrickTakingEnv(rules_yaml, reward_mode="pure")
    num_players = env.num_players

    if len(agents) != num_players:
        print(
            f"[WARNING] This game requires exactly {num_players} players. "
            f"Got {len(agents)}. Padding with heuristic agents.",
            file=sys.stderr,
        )
        while len(agents) < num_players:
            agents.append(AgentSpec(label=f"heuristic_{len(agents)}", kind="heuristic"))
        agents = agents[:num_players]

    # Load all model agents
    for agent in agents:
        load_agent_models(agent, device)
        if verbose and agent.kind == "model":
            status = "loaded" if agent.playing_policy is not None else "FAILED (using heuristic)"
            print(f"  [{agent.label}] playing model {status}")

    totals = [AgentStats(label=agents[p].label) for p in range(num_players)]

    for game_num in range(1, games + 1):
        round_stats, winner_seat = run_single_game(
            env, agents, rounds_per_game, device
        )
        for p in range(num_players):
            totals[p].games_played += 1
            totals[p].rounds_played += round_stats[p].rounds_played
            totals[p].bids_made += round_stats[p].bids_made
            totals[p].bids_total += round_stats[p].bids_total
            totals[p].total_score += round_stats[p].total_score
            totals[p].total_card_points += round_stats[p].total_card_points
            if p == winner_seat:
                totals[p].game_wins += 1

        if verbose and game_num % max(1, games // 10) == 0:
            print(f"  Game {game_num}/{games} complete...")

    return totals


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def print_report(stats: List[AgentStats], scoring_goal: str = "maximize") -> None:
    card_pts_label = "Avg Card Pts/Round"
    card_pts_note = "(lower=better)" if scoring_goal == "minimize" else "(higher=better)"

    col_w = max(len(s.label) for s in stats) + 2
    header = (
        f"{'Agent':<{col_w}} "
        f"{'Games':>6} "
        f"{'Win%':>7} "
        f"{'BidAcc%':>8} "
        f"{'Avg Score/Rnd':>14} "
        f"{card_pts_label + ' ' + card_pts_note:>28}"
    )
    sep = "-" * len(header)
    print()
    print("=" * len(header))
    print(" TOURNAMENT RESULTS")
    print("=" * len(header))
    print(header)
    print(sep)

    # Sort by win rate descending
    for s in sorted(stats, key=lambda x: x.win_rate, reverse=True):
        print(
            f"{s.label:<{col_w}} "
            f"{s.games_played:>6} "
            f"{s.win_rate * 100:>6.1f}% "
            f"{s.bid_accuracy * 100:>7.1f}% "
            f"{s.avg_score_per_round:>14.2f} "
            f"{s.avg_card_points_per_round:>28.2f}"
        )
    print(sep)
    print()


def save_csv(stats: List[AgentStats], output_path: str) -> None:
    with open(output_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "agent", "games_played", "game_wins", "win_rate",
            "bids_made", "bids_total", "bid_accuracy",
            "total_score", "avg_score_per_round",
            "total_card_points", "avg_card_points_per_round",
        ])
        for s in stats:
            writer.writerow([
                s.label, s.games_played, s.game_wins, round(s.win_rate, 4),
                s.bids_made, s.bids_total, round(s.bid_accuracy, 4),
                s.total_score, round(s.avg_score_per_round, 4),
                s.total_card_points, round(s.avg_card_points_per_round, 4),
            ])
    print(f"Report saved to: {output_path}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Head-to-head tournament simulator for trained model checkpoints.",
        formatter_class=argparse.RawTextHelpFormatter,
        epilog="""
Agent spec format:
  heuristic                       built-in heuristic baseline (no model file needed)
  random                          random legal-move agent (sanity-check floor)
  /path/to/model.pt:lstm:128      trained model — arch and hidden_dim after colons
  /path/to/model.pt:transformer   hidden_dim defaults to 128 if omitted
  /path/to/model.pt               arch defaults to mlp if omitted

Example:
  python tournament.py \\
      --rules_yaml oh_hell.yaml \\
      --agents model_a.pt:lstm:128 model_b.pt:transformer:128 heuristic heuristic \\
      --games 200 \\
      --rounds_per_game 5 \\
      --output results.csv
        """,
    )
    parser.add_argument(
        "--rules_yaml", type=str, required=True,
        help="Path to the game rule YAML configuration file.",
    )
    parser.add_argument(
        "--agents", type=str, nargs="+", required=True,
        help="Agent specs, one per player seat (must match num_players in the YAML).",
    )
    parser.add_argument(
        "--games", type=int, default=100,
        help="Number of full games to simulate (default: 100).",
    )
    parser.add_argument(
        "--rounds_per_game", type=int, default=5,
        help="Number of rounds per game (default: 5).",
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help="Optional path to save a CSV report (e.g. results.csv).",
    )
    parser.add_argument(
        "--silent", action="store_true",
        help="Suppress progress output.",
    )

    args = parser.parse_args()

    # Parse agents
    agent_specs = [parse_agent_spec(s) for s in args.agents]

    # Resolve device (same logic as train.py)
    try:
        torch = _get_torch()
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            device = torch.device("mps")
        elif hasattr(torch, "xpu") and torch.xpu.is_available():
            device = torch.device("xpu")
        elif torch.cuda.is_available():
            device = torch.device("cuda")
        else:
            device = torch.device("cpu")
    except ImportError:
        device = None  # no torch, only heuristic/random agents possible

    if not args.silent:
        print(f"\nTournament: {args.games} games × {args.rounds_per_game} rounds")
        print(f"Rules: {args.rules_yaml}")
        print(f"Agents ({len(agent_specs)}):")
        for i, a in enumerate(agent_specs):
            print(f"  Seat {i}: {a.label} ({a.kind})")
        print()

    stats = run_tournament(
        agents=agent_specs,
        rules_yaml=args.rules_yaml,
        games=args.games,
        rounds_per_game=args.rounds_per_game,
        device=device,
        verbose=not args.silent,
    )

    # Load env once more just to get scoring_goal for the report label
    from env import TrickTakingEnv
    env = TrickTakingEnv(args.rules_yaml)
    scoring_goal = getattr(env, "scoring_goal", "maximize")

    print_report(stats, scoring_goal=scoring_goal)

    if args.output:
        save_csv(stats, args.output)


if __name__ == "__main__":
    main()
