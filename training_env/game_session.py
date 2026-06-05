import os
import random
from typing import List, Tuple, Dict, Any
from env import TrickTakingEnv
from heuristics import get_heuristic_action

class GameSession:
    """
    Manages the state and turns of a single Oh Hell / Judgement game session.
    Encapsulates all environment calls and AI decision making (heuristic or neural),
    providing a clean step-based API suitable for CLI play or Web UI backend routing.
    """
    def __init__(self, rules_yaml: str, model_path: str = None, arch: str = "mlp", hidden_dim: int = 128, turn_selection_mode: str = "rotating"):
        self.rules_yaml = rules_yaml
        self.env = TrickTakingEnv(rules_yaml)
        self.deal_sequence = getattr(self.env, "deal_sequence", [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        self.cumulative_scores = {p: 0 for p in range(self.env.num_players)}
        
        self.arch = arch
        self.hidden_dim = hidden_dim
        self.playing_policy = None
        self.hidden_states = {p: None for p in range(self.env.num_players)}
        self.turn_selection_mode = turn_selection_mode
        
        if model_path and os.path.exists(model_path):
            self._load_model(model_path)
            
        self.round_indices = []
        self.current_round_idx_of_game = 0  # pointer to round_indices index
        self.obs = None
        self.done = False
        
    def _load_model(self, model_path: str):
        try:
            import torch
            from models import MLPPolicy, LSTMPolicy, SimpleGNNPolicy
        except ImportError as e:
            print(f"Warning: PyTorch or models not available, cannot load model: {e}", file=__import__('sys').stderr)
            return

        if self.arch == "mlp":
            self.playing_policy = MLPPolicy(input_dim=112, action_dim=52, hidden_dim=self.hidden_dim)
        elif self.arch == "lstm":
            self.playing_policy = LSTMPolicy(input_dim=112, action_dim=52, hidden_dim=self.hidden_dim)
        elif self.arch == "gnn":
            self.playing_policy = SimpleGNNPolicy(num_nodes=120, node_dim=16, action_dim=52, hidden_dim=self.hidden_dim)

        try:
            self.playing_policy.load_state_dict(torch.load(model_path, map_location=torch.device('cpu')))
            self.playing_policy.eval()
        except Exception as e:
            print(f"Warning: Failed to load model weights: {e}")
            self.playing_policy = None

    def start_game(self, round_indices: List[int]):
        self.round_indices = round_indices
        self.current_round_idx_of_game = 0
        self.cumulative_scores = {p: 0 for p in range(self.env.num_players)}
        self.done = False
        self.start_round()
        
    def start_round(self):
        if self.current_round_idx_of_game >= len(self.round_indices):
            self.done = True
            return
        round_idx = self.round_indices[self.current_round_idx_of_game]
        cards_in_round = self.deal_sequence[round_idx]
        # Determine starting player based on selection mode
        if self.turn_selection_mode == "most_points":
            starting_player = max(self.cumulative_scores.keys(), key=lambda p: self.cumulative_scores[p])
        elif self.turn_selection_mode == "least_points":
            starting_player = min(self.cumulative_scores.keys(), key=lambda p: self.cumulative_scores[p])
        else:
            starting_player = (round_idx) % self.env.num_players

        self.obs = self.env.reset(cards_per_player=cards_in_round, round_idx=round_idx, starting_player=starting_player)
        self.hidden_states = {p: None for p in range(self.env.num_players)}
        
    def get_active_player(self) -> int:
        return self.obs["player_id"] if self.obs else 0

    def get_phase(self) -> str:
        return self.env.phase if self.env else "completed"

    def execute_ai_bids(self) -> List[str]:
        """Runs AI bidding turns sequentially until it is the human's turn or bidding finishes."""
        logs = []
        while self.env.phase == "bidding" and self.get_active_player() != 0:
            player = self.get_active_player()
            bid = get_heuristic_action(self.obs)
            self.obs, reward, done, info = self.env.step(bid)
            logs.append(f"AI Agent {player} bids: {bid} tricks.")
        return logs

    def human_bid(self, bid: int) -> Tuple[bool, str]:
        """Processes human bid and then triggers AI bids."""
        if self.env.phase != "bidding" or self.get_active_player() != 0:
            return False, "Not bidding phase or not your turn."
            
        if bid not in self.obs["legal_moves"]:
            return False, f"Illegal bid. Legal bids: {self.obs['legal_moves']}"
            
        self.obs, reward, done, info = self.env.step(bid)
        return True, f"You bid: {bid} tricks."

    def execute_ai_passes(self) -> List[str]:
        """Runs AI passing turns sequentially until it is the human's turn or passing finishes."""
        logs = []
        while self.env.phase == "passing" and self.get_active_player() != 0:
            player = self.get_active_player()
            card = get_heuristic_action(self.obs)
            self.obs, reward, done, info = self.env.step(card)
            logs.append(f"AI Agent {player} selects card to pass: {card}.")
        return logs

    def human_pass(self, card_idx: int) -> Tuple[bool, str]:
        """Processes human card choice to pass."""
        if self.env.phase != "passing" or self.get_active_player() != 0:
            return False, "Not passing phase or not your turn."
            
        if not (0 <= card_idx < len(self.obs["hand"])):
            return False, "Invalid card index."
            
        card = self.obs["hand"][card_idx]
        if card not in self.obs["legal_moves"]:
            return False, "This card was already selected or is invalid."
            
        self.obs, reward, done, info = self.env.step(card)
        return True, f"You chose to pass: {card}"

    def execute_ai_plays(self) -> List[str]:
        """Runs AI playing turns sequentially until it is the human's turn or the round completes."""
        logs = []
        suits = ["Clubs", "Diamonds", "Hearts", "Spades"]
        
        while self.env.phase == "playing" and self.get_active_player() != 0:
            player = self.get_active_player()
            name = f"AI Agent {player}"
            
            if self.playing_policy is not None:
                # Use neural network model — torch is guaranteed available if playing_policy loaded
                import torch
                from train import preprocess_playing_obs
                playing_obs = preprocess_playing_obs(self.obs)
                with torch.no_grad():
                    if self.arch == "lstm":
                        logits, self.hidden_states[player] = self.playing_policy(playing_obs.unsqueeze(0), self.hidden_states[player])
                        logits = logits.flatten()
                    elif self.arch == "gnn":
                        node_idx = torch.randint(0, 120, (1, 30))
                        adj = torch.eye(30).unsqueeze(0)
                        logits = self.playing_policy(node_idx, adj).flatten()
                    else:
                        logits = self.playing_policy(playing_obs)
                        
                legal_cards = self.obs["legal_moves"]
                legal_indices = [suits.index(s) * 13 + (r - 2) for s, r in legal_cards]
                masked_logits = torch.full_like(logits, -float('inf'))
                masked_logits[legal_indices] = logits[legal_indices]
                action_idx = torch.argmax(masked_logits).item()
                action = (suits[action_idx // 13], (action_idx % 13) + 2)
            else:
                action = get_heuristic_action(self.obs)
                
            self.obs, reward, done, info = self.env.step(action)
            logs.append(f"{name} plays: {action}")
            
        if self.env.phase == "completed":
            self._handle_round_completed()
                
        return logs

    def _handle_round_completed(self):
        """Helper to accumulate round scores and mark game done if final round."""
        for p in range(self.env.num_players):
            self.cumulative_scores[p] += self.env.scores[p]
        if self.current_round_idx_of_game == len(self.round_indices) - 1:
            self.done = True

    def human_play(self, card_idx: int) -> Tuple[bool, str]:
        """Plays the selected hand card index for the human."""
        if self.env.phase != "playing" or self.get_active_player() != 0:
            return False, "Not playing phase or not your turn."
            
        if not (0 <= card_idx < len(self.obs["hand"])):
            return False, "Invalid card index."
            
        card = self.obs["hand"][card_idx]
        if card not in self.obs["legal_moves"]:
            return False, "Illegal play! You must follow suit if possible."
            
        self.obs, reward, done, info = self.env.step(card)
        if self.env.phase == "completed":
            self._handle_round_completed()
        return True, f"You played: {card}"

    def next_round(self) -> bool:
        """Proceeds to the next round if the current round is completed."""
        if self.env.phase != "completed":
            return False
        self.current_round_idx_of_game += 1
        self.start_round()
        return True

