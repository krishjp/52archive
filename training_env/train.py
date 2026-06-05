import argparse
import os
import torch
import torch.optim as optim
import torch.nn as nn
import numpy as np
import random
import time
from env import TrickTakingEnv
from models import MLPPolicy, LSTMPolicy, SimpleGNNPolicy, TransformerPolicy

def get_heuristic_action(obs: dict) -> any:
    """
    A heuristic policy for trick-taking bidding and play (Judgement / Oh Hell)
    inspired by the research work on JudgmentBot:
    - Bidding: Calculates bids based on K, Q, A count + trump high cards.
    - Play:
      - If tricks_won < bid (goal not reached): play highest card that can win the trick.
        If cannot win, discard the lowest card.
      - If tricks_won == bid (goal reached): play highest card that still loses (sluffing high cards).
        If forced to win, minimize winning card value.
    """
    legal_moves = obs["legal_moves"]
    if obs["phase"] == "bidding":
        # Bid estimation: count high ranks (12=Q, 13=K, 14=A) + high trump cards
        hand = obs["hand"]
        trump = obs["trump_suit"]
        bid = 0
        for suit, rank in hand:
            if rank >= 12:
                bid += 1
            elif trump and suit == trump and rank >= 10:
                bid += 1
        return min(bid, len(hand))
        
    # Playing Phase
    player_id = obs["player_id"]
    bid = obs["bids"].get(player_id, 0)
    won = obs["tricks_won"].get(player_id, 0)
    
    current_trick = obs["current_trick"]
    lead_suit = obs["lead_suit"]
    trump_suit = obs["trump_suit"]
    
    def card_strength(card) -> int:
        suit, rank = card
        if trump_suit and suit == trump_suit:
            return rank + 100
        if lead_suit and suit == lead_suit:
            return rank
        if not lead_suit:
            return rank  # if leading, strength is rank
        return 0  # off-suit cards that aren't trump have 0 strength
        
    trick_strengths = [card_strength(c) for _, c in current_trick]
    highest_trick_strength = max(trick_strengths) if trick_strengths else -1
    
    winning_cards = [c for c in legal_moves if card_strength(c) > highest_trick_strength]
    losing_cards = [c for c in legal_moves if card_strength(c) <= highest_trick_strength]
    
    if won < bid:
        # Wants to win the trick: play highest card that wins
        if winning_cards:
            return max(winning_cards, key=card_strength)
        else:
            # Cannot win: throw away lowest card to preserve high cards
            return min(legal_moves, key=card_strength)
    else:
        # Wants to lose: play highest card that still loses (discarding high cards)
        if losing_cards:
            return max(losing_cards, key=card_strength)
        else:
            # Forced to win: play lowest card that wins to conserve higher cards
            return min(winning_cards, key=card_strength)

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

def get_device() -> torch.device:
    # 1. Try Mac Metal (MPS)
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    # 2. Try Intel XPU (Natively or via IPEX)
    if hasattr(torch, "xpu") and torch.xpu.is_available():
        return torch.device("xpu")
    try:
        import intel_extension_for_pytorch as ipex
        if hasattr(torch, "xpu") and torch.xpu.is_available():
            return torch.device("xpu")
    except Exception:
        pass
    # 3. Try CUDA (Nvidia GPU)
    if torch.cuda.is_available():
        return torch.device("cuda")
    # 4. Fallback to CPU
    return torch.device("cpu")

def train(args):
    # Clear all past training files if requested
    if getattr(args, "clear_all", False):
        import glob
        patterns = ["model_*", "report_*", "plot_*", "training_report*", "training_reward_plot.png", "grid_search_report_*"]
        print("Clearing all past model, report, and plot files from the directory...")
        deleted_count = 0
        for pattern in patterns:
            for f in glob.glob(pattern):
                try:
                    os.remove(f)
                    deleted_count += 1
                except Exception as e:
                    print(f"Error removing {f}: {e}")
        print(f"Cleared {deleted_count} total file runs.")

    # Clear previous training results matching parameter pattern if requested
    elif getattr(args, "clear_previous", False):
        import glob
        # Matches both old format (without reward mode) and new format (with reward mode)
        pattern = f"*{args.arch}_ep{args.episodes}_lr{args.lr}_h{args.hidden_dim}_*"
        print(f"Clearing previous training results matching parameter prefix: {pattern}")
        deleted_count = 0
        for f in glob.glob(pattern):
            try:
                os.remove(f)
                deleted_count += 1
            except Exception as e:
                print(f"Error removing {f}: {e}")
        print(f"Cleared {deleted_count} previous file runs.")

class VectorTrickTakingEnv:
    def __init__(self, num_envs: int, rules_yaml: str, reward_mode: str = "zero_sum"):
        self.num_envs = num_envs
        self.envs = [TrickTakingEnv(rules_yaml, reward_mode=reward_mode) for _ in range(num_envs)]
        
    def reset(self):
        obs_list = []
        for env in self.envs:
            obs = env.reset()
            while obs["player_id"] != 0 and env.phase != "completed":
                action = get_heuristic_action(obs)
                obs, _, _, _ = env.step(action)
            obs_list.append(obs)
        return obs_list

    def step(self, actions: list):
        obs_list = []
        rewards = []
        dones = []
        for i, env in enumerate(self.envs):
            # Play the agent's action
            obs, _, done, _ = env.step(actions[i])
            agent_reward = env.accumulated_rewards[0]
            env.accumulated_rewards[0] = 0.0
            
            # Step heuristic opponents
            while obs["player_id"] != 0 and not done:
                action = get_heuristic_action(obs)
                obs, _, done, _ = env.step(action)
                agent_reward += env.accumulated_rewards[0]
                env.accumulated_rewards[0] = 0.0
                
            obs_list.append(obs)
            rewards.append(agent_reward)
            dones.append(done)
            
        return obs_list, np.array(rewards, dtype=np.float32), np.array(dones, dtype=bool)

def train(args):
    # Clear all past training files if requested
    if getattr(args, "clear_all", False):
        import glob
        patterns = ["model_*", "report_*", "plot_*", "training_report*", "training_reward_plot.png", "grid_search_report_*"]
        print("Clearing all past model, report, and plot files from the directory...")
        deleted_count = 0
        for pattern in patterns:
            for f in glob.glob(pattern):
                try:
                    os.remove(f)
                    deleted_count += 1
                except Exception as e:
                    print(f"Error removing {f}: {e}")
        print(f"Cleared {deleted_count} total file runs.")

    # Clear previous training results matching parameter pattern if requested
    elif getattr(args, "clear_previous", False):
        import glob
        # Matches both old format (without reward mode) and new format (with reward mode)
        pattern = f"*{args.arch}_ep{args.episodes}_lr{args.lr}_h{args.hidden_dim}_*"
        print(f"Clearing previous training results matching parameter prefix: {pattern}")
        deleted_count = 0
        for f in glob.glob(pattern):
            try:
                os.remove(f)
                deleted_count += 1
            except Exception as e:
                print(f"Error removing {f}: {e}")
        print(f"Cleared {deleted_count} previous file runs.")

    device = get_device()
    num_envs = getattr(args, "num_envs", 1)
    if not getattr(args, "silent", False):
        print(f"Loading rules configuration from: {args.rules_yaml}")
        print(f"Using device: {device} | num_envs: {num_envs}")
    env = TrickTakingEnv(args.rules_yaml, reward_mode=args.reward_mode)
    
    # Initialize separate Bidding and Playing policy models
    # Bidding Policy Model (57 dimensions -> 11 actions for bids [0..10])
    bidding_policy = MLPPolicy(input_dim=57, action_dim=11, hidden_dim=args.hidden_dim).to(device)
    
    # Playing Policy Model (112 dimensions -> 52 card play actions)
    if not getattr(args, "silent", False):
        print(f"Initializing Playing network model: {args.arch}...")
    if args.arch == "mlp":
        playing_policy = MLPPolicy(input_dim=112, action_dim=52, hidden_dim=args.hidden_dim).to(device)
    elif args.arch == "lstm":
        playing_policy = LSTMPolicy(input_dim=112, action_dim=52, hidden_dim=args.hidden_dim).to(device)
    elif args.arch == "transformer":
        playing_policy = TransformerPolicy(input_dim=112, action_dim=52, hidden_dim=args.hidden_dim).to(device)
    elif args.arch == "gnn":
        playing_policy = SimpleGNNPolicy(num_nodes=120, node_dim=16, action_dim=52, hidden_dim=args.hidden_dim).to(device)
    else:
        raise ValueError(f"Unknown architecture {args.arch}")
        
    optimizer_bid = optim.Adam(bidding_policy.parameters(), lr=args.lr)
    optimizer_play = optim.Adam(playing_policy.parameters(), lr=args.lr)
    
    cross_entropy = nn.CrossEntropyLoss()
    
    rewards_history = []
    suits = ["Clubs", "Diamonds", "Hearts", "Spades"]
    
    if num_envs > 1:
        vec_env = VectorTrickTakingEnv(num_envs, args.rules_yaml, reward_mode=args.reward_mode)
        
        print(f"--- Bootstrapping Phase: running {args.imitation_episodes} episodes of Imitation Learning (vectorized) ---")
        for episode in range(1, args.imitation_episodes + 1):
            obs_list = vec_env.reset()
            done = [False] * num_envs
            hidden = None
            
            while not all(done):
                active_indices = [i for i in range(num_envs) if not done[i]]
                if not active_indices:
                    break
                active_obs = [obs_list[i] for i in active_indices]
                first_obs = active_obs[0]
                
                if first_obs["phase"] == "bidding":
                    optimizer_bid.zero_grad()
                    bidding_obs_batch = torch.stack([preprocess_bidding_obs(o) for o in active_obs]).to(device)
                    logits = bidding_policy(bidding_obs_batch)
                    heuristic_actions = [get_heuristic_action(o) for o in active_obs]
                    target_tensor = torch.tensor(heuristic_actions, dtype=torch.long, device=device)
                    loss = cross_entropy(logits, target_tensor)
                    loss.backward()
                    optimizer_bid.step()
                    
                    actions = [None] * num_envs
                    for idx, a in zip(active_indices, heuristic_actions):
                        actions[idx] = a
                    obs_list_new, _, dones_new = vec_env.step(actions)
                else:
                    optimizer_play.zero_grad()
                    playing_obs_batch = torch.stack([preprocess_playing_obs(o) for o in active_obs]).to(device)
                    if args.arch == "lstm" or args.arch == "transformer":
                        logits, hidden = playing_policy(playing_obs_batch, hidden)
                        if hidden is not None:
                            if isinstance(hidden, tuple):
                                hidden = (hidden[0].detach(), hidden[1].detach())
                            else:
                                hidden = hidden.detach()
                    elif args.arch == "gnn":
                        node_idx = torch.randint(0, 120, (len(active_indices), 30), device=device)
                        adj = torch.eye(30, device=device).unsqueeze(0).expand(len(active_indices), -1, -1)
                        logits = playing_policy(node_idx, adj)
                    else:
                        logits = playing_policy(playing_obs_batch)
                        
                    heuristic_actions = [get_heuristic_action(o) for o in active_obs]
                    target_indices = [suits.index(a[0]) * 13 + (a[1] - 2) for a in heuristic_actions]
                    target_tensor = torch.tensor(target_indices, dtype=torch.long, device=device)
                    loss = cross_entropy(logits, target_tensor)
                    loss.backward()
                    optimizer_play.step()
                    
                    actions = [None] * num_envs
                    for idx, a in zip(active_indices, heuristic_actions):
                        actions[idx] = a
                    obs_list_new, _, dones_new = vec_env.step(actions)
                    
                for idx in active_indices:
                    obs_list[idx] = obs_list_new[idx]
                    done[idx] = dones_new[idx]
                    
            if not getattr(args, "silent", False):
                if episode % max(1, args.imitation_episodes // 5) == 0:
                    print(f"Imitation Pre-training: Episode batch {episode}/{args.imitation_episodes} Completed.")
                    
        if not getattr(args, "silent", False):
            print(f"\n--- Reinforcement Learning Phase: running {args.episodes} episodes of PG learning (vectorized) ---")
        for episode in range(1, args.episodes + 1):
            obs_list = vec_env.reset()
            done = [False] * num_envs
            hidden = None
            saved_log_probs = [[] for _ in range(num_envs)]
            episode_rewards = np.zeros(num_envs, dtype=np.float32)
            
            while not all(done):
                active_indices = [i for i in range(num_envs) if not done[i]]
                if not active_indices:
                    break
                active_obs = [obs_list[i] for i in active_indices]
                first_obs = active_obs[0]
                actions = [None] * num_envs
                
                if first_obs["phase"] == "bidding":
                    bidding_obs_batch = torch.stack([preprocess_bidding_obs(o) for o in active_obs]).to(device)
                    with torch.no_grad():
                        logits = bidding_policy(bidding_obs_batch)
                    probs = torch.softmax(logits, dim=-1)
                    dist = torch.distributions.Categorical(probs)
                    bids = dist.sample()
                    for idx, act_obs, b in zip(active_indices, active_obs, bids):
                        actions[idx] = min(b.item(), len(act_obs["hand"]))
                else:
                    playing_obs_batch = torch.stack([preprocess_playing_obs(o) for o in active_obs]).to(device)
                    if args.arch == "lstm" or args.arch == "transformer":
                        logits, hidden = playing_policy(playing_obs_batch, hidden)
                    elif args.arch == "gnn":
                        node_idx = torch.randint(0, 120, (len(active_indices), 30), device=device)
                        adj = torch.eye(30, device=device).unsqueeze(0).expand(len(active_indices), -1, -1)
                        logits = playing_policy(node_idx, adj)
                    else:
                        logits = playing_policy(playing_obs_batch)
                        
                    for i, (idx, act_obs) in enumerate(zip(active_indices, active_obs)):
                        env_logits = logits[i]
                        legal_moves = act_obs["legal_moves"]
                        legal_indices = [suits.index(s) * 13 + (r - 2) for s, r in legal_moves]
                        masked_logits = torch.full_like(env_logits, -1e9)
                        masked_logits[legal_indices] = env_logits[legal_indices]
                        probs = torch.softmax(masked_logits, dim=-1)
                        dist = torch.distributions.Categorical(probs)
                        act_idx = dist.sample()
                        log_prob = dist.log_prob(act_idx)
                        saved_log_probs[idx].append(log_prob)
                        idx_val = act_idx.item()
                        actions[idx] = (suits[idx_val // 13], (idx_val % 13) + 2)
                        
                obs_list_new, step_rewards, dones_new = vec_env.step(actions)
                for idx in active_indices:
                    obs_list[idx] = obs_list_new[idx]
                    episode_rewards[idx] += step_rewards[idx]
                    done[idx] = dones_new[idx]
                    
            optimizer_play.zero_grad()
            policy_loss = []
            for i in range(num_envs):
                if saved_log_probs[i]:
                    for lp in saved_log_probs[i]:
                        policy_loss.append(-lp * episode_rewards[i])
            if policy_loss:
                total_loss = torch.stack(policy_loss).mean()
                total_loss.backward()
                optimizer_play.step()
                
            rewards_history.extend(episode_rewards.tolist())
            if not getattr(args, "silent", False):
                if episode % max(1, args.episodes // 10) == 0:
                    print(f"RL Episode batch {episode}/{args.episodes} | Average reward: {np.mean(rewards_history[-max(1, len(rewards_history)//10):]):.1f}")
    else:
        print(f"--- Bootstrapping Phase: running {args.imitation_episodes} episodes of Imitation Learning ---")
        for episode in range(1, args.imitation_episodes + 1):
            obs = env.reset()
            done = False
            hidden = None
            
            while not done:
                player_id = obs["player_id"]
                heuristic_action = get_heuristic_action(obs)
                
                if player_id == 0:
                    if obs["phase"] == "bidding":
                        bidding_obs = preprocess_bidding_obs(obs).to(device)
                        optimizer_bid.zero_grad()
                        logits = bidding_policy(bidding_obs)
                        # Cross Entropy loss against heuristic target bid
                        loss = cross_entropy(logits.unsqueeze(0), torch.tensor([heuristic_action], device=device))
                        loss.backward()
                        optimizer_bid.step()
                        action = heuristic_action
                    else:
                        playing_obs = preprocess_playing_obs(obs).to(device)
                        optimizer_play.zero_grad()
                        if args.arch == "lstm" or args.arch == "transformer":
                            logits, hidden = playing_policy(playing_obs.unsqueeze(0), hidden)
                            if hidden is not None:
                                if isinstance(hidden, tuple):
                                    hidden = (hidden[0].detach(), hidden[1].detach())
                                else:
                                    hidden = hidden.detach()
                        elif args.arch == "gnn":
                            node_idx = torch.randint(0, 120, (1, 30), device=device)
                            adj = torch.eye(30, device=device).unsqueeze(0)
                            logits = playing_policy(node_idx, adj)
                        else:
                            logits = playing_policy(playing_obs)
                            
                        target_idx = suits.index(heuristic_action[0]) * 13 + (heuristic_action[1] - 2)
                        logits_2d = logits.flatten().unsqueeze(0)
                        loss = cross_entropy(logits_2d, torch.tensor([target_idx], device=device))
                        loss.backward()
                        optimizer_play.step()
                        action = heuristic_action
                else:
                    # Heuristic Opponents play realistically
                    action = heuristic_action
                    
                obs, reward, done, _ = env.step(action)
                
            if not getattr(args, "silent", False):
                if episode % max(1, args.imitation_episodes // 5) == 0:
                    print(f"Imitation Pre-training: Episode {episode}/{args.imitation_episodes} Completed.")
                
        if not getattr(args, "silent", False):
            print(f"\n--- Reinforcement Learning Phase: running {args.episodes} episodes of PG learning against Heuristic opponents ---")
        for episode in range(1, args.episodes + 1):
            obs = env.reset()
            done = False
            episode_reward = 0.0
            hidden = None
            
            # Track transitions for policy gradient updates
            saved_log_probs = []
            
            while not done:
                player_id = obs["player_id"]
                
                if player_id == 0:
                    if obs["phase"] == "bidding":
                        bidding_obs = preprocess_bidding_obs(obs).to(device)
                        with torch.no_grad():
                            logits = bidding_policy(bidding_obs)
                        probs = torch.softmax(logits, dim=-1)
                        dist = torch.distributions.Categorical(probs)
                        bid = dist.sample().item()
                        action = min(bid, len(obs["hand"])) # restrict to hand size
                    else:
                        playing_obs = preprocess_playing_obs(obs).to(device)
                        if args.arch == "lstm" or args.arch == "transformer":
                            logits, hidden = playing_policy(playing_obs.unsqueeze(0), hidden)
                            logits = logits.flatten()
                        elif args.arch == "gnn":
                            node_idx = torch.randint(0, 120, (1, 30), device=device)
                            adj = torch.eye(30, device=device).unsqueeze(0)
                            logits = playing_policy(node_idx, adj).flatten()
                        else:
                            logits = playing_policy(playing_obs)
                            
                        legal_moves = obs["legal_moves"]
                        legal_indices = [suits.index(s) * 13 + (r - 2) for s, r in legal_moves]
                        
                        masked_logits = torch.full_like(logits, -1e9)
                        masked_logits[legal_indices] = logits[legal_indices]
                        probs = torch.softmax(masked_logits, dim=-1)
                        dist = torch.distributions.Categorical(probs)
                        
                        action_idx = dist.sample()
                        log_prob = dist.log_prob(action_idx)
                        saved_log_probs.append(log_prob)
                        
                        idx = action_idx.item()
                        action = (suits[idx // 13], (idx % 13) + 2)
                else:
                    # Opponents continue using heuristic behavior
                    action = get_heuristic_action(obs)
                    
                obs, reward, done, _ = env.step(action)
                if player_id == 0:
                    episode_reward += reward
                    
            # Perform Policy Gradient (REINFORCE) weight update at round termination
            if saved_log_probs:
                optimizer_play.zero_grad()
                policy_loss = []
                for lp in saved_log_probs:
                    # REINFORCE loss: -log_prob * target reward
                    policy_loss.append(-lp * episode_reward)
                total_loss = torch.stack(policy_loss).sum()
                total_loss.backward()
                optimizer_play.step()
                
            rewards_history.append(episode_reward)
            if not getattr(args, "silent", False):
                if episode % max(1, args.episodes // 10) == 0:
                    print(f"RL Episode {episode}/{args.episodes} | Average reward: {np.mean(rewards_history[-max(1, episode//10):]):.1f}")
            
    run_id = getattr(args, "run_id", None)
    suffix = f"_{run_id}" if run_id else f"_{int(time.time())}"
    run_info = f"{args.arch}_ep{args.episodes}_lr{args.lr}_h{args.hidden_dim}_{args.reward_mode}{suffix}"
    model_name = f"model_{run_info}.pt"
    csv_name = f"report_{run_info}.csv"
    txt_name = f"report_{run_info}.txt"
    plot_name = f"plot_{run_info}.png"
 
    if not getattr(args, "silent", False):
        print(f"Training finished successfully. Saving model to {model_name}")
    torch.save(playing_policy.state_dict(), model_name)

    # Save CSV Report
    import csv
    with open(csv_name, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["Episode", "Reward"])
        for idx, r in enumerate(rewards_history):
            writer.writerow([idx + 1, r])
    if not getattr(args, "silent", False):
        print(f"Saved training CSV data to: {csv_name}")
 
    # Generate TXT Report
    with open(txt_name, "w") as f:
        f.write(f"TRAINING REPORT - {env.title}\n")
        f.write(f"Architecture: {args.arch}\n")
        f.write(f"Learning Rate: {args.lr}\n")
        f.write(f"RL Episodes: {args.episodes}\n")
        f.write(f"Imitation Episodes: {args.imitation_episodes}\n")
        f.write(f"Average Reward: {np.mean(rewards_history):.2f}\n")
        f.write(f"Max Reward: {np.max(rewards_history):.2f}\n")
        f.write(f"Min Reward: {np.min(rewards_history):.2f}\n")
    if not getattr(args, "silent", False):
        print(f"Saved training text summary to: {txt_name}")

    # Try plotting
    try:
        import matplotlib.pyplot as plt
        plt.figure(figsize=(10, 5))
        plt.plot(range(1, len(rewards_history) + 1), rewards_history, label="Episode Reward", color="blue")
        sma_window = max(1, len(rewards_history) // 10)
        sma = np.convolve(rewards_history, np.ones(sma_window)/sma_window, mode='valid')
        plt.plot(range(sma_window, len(rewards_history) + 1), sma, label=f"SMA-{sma_window}", color="red", linestyle="--")
        plt.xlabel("Episode")
        plt.ylabel("Reward")
        plt.title(f"Training Progress ({args.arch}) on {env.title}")
        plt.legend()
        plt.grid(True)
        plt.savefig(plot_name)
        if not getattr(args, "silent", False):
            print(f"Generated reward progression graph at: {plot_name}")
    except Exception as e:
        if not getattr(args, "silent", False):
            print(f"Skipping image plot generation: {e}")

    # Return metrics dictionary
    return {
        "avg_reward": float(np.mean(rewards_history)),
        "avg_reward_last_10pct": float(np.mean(rewards_history[-max(1, len(rewards_history)//10):])),
        "max_reward": float(np.max(rewards_history)),
        "min_reward": float(np.min(rewards_history)),
        "model_name": model_name,
        "csv_name": csv_name,
        "txt_name": txt_name,
        "plot_name": plot_name,
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI Agent Training Script")
    parser.add_argument("--rules_yaml", type=str, default="../judgement_game.yaml", help="Path to the rule configuration YAML")
    parser.add_argument("--arch", type=str, default="lstm", choices=["mlp", "lstm", "gnn", "transformer"], help="Neural network architecture")
    parser.add_argument("--episodes", type=int, default=100, help="Number of RL training episodes")
    parser.add_argument("--imitation_episodes", type=int, default=100, help="Number of imitation bootstrap episodes")
    parser.add_argument("--lr", type=float, default=0.001, help="Learning rate")
    parser.add_argument("--gamma", type=float, default=0.99, help="Discount factor")
    parser.add_argument("--hidden_dim", type=int, default=128, help="Hidden layers dimension")
    parser.add_argument("--clear_previous", action="store_true", help="Delete all previous files matching this run's parameter prefix")
    parser.add_argument("--clear_all", action="store_true", help="Clear all past model, report, and plot files from the directory")
    parser.add_argument("--reward_mode", type=str, default="zero_sum", choices=["shaped", "pure", "zero_sum"], help="RL reward function strategy")
    parser.add_argument("--silent", action="store_true", help="Suppress detailed training loop logs")
    parser.add_argument("--run_id", type=str, default="", help="Unique identifier for output filenames")
    parser.add_argument("--num_envs", type=int, default=1, help="Number of vectorized environments to run in parallel")
    
    args = parser.parse_args()
    train(args)
