import gymnasium as gym
from gymnasium import spaces
import numpy as np
import torch

from env import TrickTakingEnv
from heuristics import get_heuristic_action

def preprocess_bidding_obs(obs: dict) -> torch.Tensor:
    """Preprocesses variables for bidding model input."""
    # Hand cards indicators (52) + Trump suit indicators (5) = 57 dimensions
    vec = [0] * 57
    suits = ["Clubs", "Diamonds", "Hearts", "Spades"]
    for s, r in obs["hand"]:
        idx = suits.index(s) * 13 + (r - 2)
        vec[idx] = 1
    if obs["trump_suit"]:
        vec[52 + suits.index(obs["trump_suit"])] = 1
    else:
        vec[56] = 1
    return torch.tensor(vec, dtype=torch.float32)

def preprocess_playing_obs(obs: dict) -> torch.Tensor:
    """Converts observation dict to playing policy input vector (112 dims)."""
    vec = []
    
    # 52 cards indicator: 1 if in hand, 0 otherwise
    hand_vector = [0] * 52
    suits = ["Clubs", "Diamonds", "Hearts", "Spades"]
    for s, r in obs["hand"]:
        idx = suits.index(s) * 13 + (r - 2)
        hand_vector[idx] = 1
    vec.extend(hand_vector)
    
    # Trump suit: one-hot (Clubs, Diamonds, Hearts, Spades, None)
    trump_one_hot = [0] * 5
    if obs["trump_suit"]:
        trump_one_hot[suits.index(obs["trump_suit"])] = 1
    else:
        trump_one_hot[4] = 1
    vec.extend(trump_one_hot)
    
    # Current trick state: 52 card indicators representing played cards
    trick_vector = [0] * 52
    for p_id, card in obs["current_trick"]:
        idx = suits.index(card[0]) * 13 + (card[1] - 2)
        trick_vector[idx] = 1
    vec.extend(trick_vector)
    
    # Info: player_id, tricks won, bidding info
    vec.append(obs["player_id"] / 4.0)
    vec.append(obs["bids"].get(obs["player_id"], 0) / 10.0)
    vec.append(obs["tricks_won"].get(obs["player_id"], 0) / 10.0)
    
    return torch.tensor(vec, dtype=torch.float32)

class GymnasiumTrickTakingWrapper(gym.Env):
    """
    Gymnasium wrapper for TrickTakingEnv to train with MaskablePPO.
    Exposes only the playing phase to the RL agent, auto-stepping 
    bidding/passing phases and opponent turns.
    """
    def __init__(self, yaml_path, reward_mode="zero_sum"):
        super().__init__()
        self.env = TrickTakingEnv(yaml_path, reward_mode=reward_mode)
        
        # Action space: 52 card play indices
        self.action_space = spaces.Discrete(52)
        
        # Observation space: 112 dimensions
        self.observation_space = spaces.Box(
            low=0.0, high=1.0, shape=(112,), dtype=np.float32
        )
        self.current_obs = None
        self.suits = ["Clubs", "Diamonds", "Hearts", "Spades"]

    def action_masks(self) -> np.ndarray:
        mask = np.zeros(52, dtype=bool)
        if self.current_obs and "legal_moves" in self.current_obs:
            for s, r in self.current_obs["legal_moves"]:
                idx = self.suits.index(s) * 13 + (r - 2)
                mask[idx] = True
        else:
            mask[:] = True # Fallback if no observation is active
        return mask

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        obs = self.env.reset()
        
        # Auto-step bidding/passing phases using heuristic actions
        while obs["phase"] != "playing" and self.env.phase != "completed":
            action = get_heuristic_action(obs)
            obs, _, _, _ = self.env.step(action)
            
        if self.env.phase == "completed":
            return self.reset(seed, options)
            
        # Step heuristic opponents until player 0's turn
        while obs["player_id"] != 0 and self.env.phase != "completed":
            action = get_heuristic_action(obs)
            obs, _, _, _ = self.env.step(action)
            
        if self.env.phase == "completed":
            return self.reset(seed, options)
            
        self.current_obs = obs
        return preprocess_playing_obs(obs).numpy(), {}

    def step(self, action_idx):
        # Translate action index to (suit, rank)
        suit = self.suits[action_idx // 13]
        rank = (action_idx % 13) + 2
        action = (suit, rank)
        
        obs, reward, done, _ = self.env.step(action)
        accumulated_reward = reward
        
        # Step opponents until player 0's turn or round finishes
        while obs["player_id"] != 0 and not done:
            opp_action = get_heuristic_action(obs)
            obs, _, done, _ = self.env.step(opp_action)
            accumulated_reward += self.env.accumulated_rewards[0]
            self.env.accumulated_rewards[0] = 0.0
            
        self.current_obs = obs
        flat_obs = preprocess_playing_obs(obs).numpy()
        
        return flat_obs, accumulated_reward, done, False, {}
