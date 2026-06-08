import argparse
import os

# Set default device selector to hide integrated graphics and target dedicated Intel Arc GPU
if "ONEAPI_DEVICE_SELECTOR" not in os.environ:
    os.environ["ONEAPI_DEVICE_SELECTOR"] = "level_zero:0"

import torch
import torch.optim as optim
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import random
import time
from env import TrickTakingEnv
from models import MLPPolicy, LSTMPolicy, SimpleGNNPolicy, TransformerPolicy
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

def get_device() -> torch.device:
    # 1. Try Mac Metal (MPS)
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    # 2. Try Intel XPU (Natively or via IPEX)
    if hasattr(torch, "xpu") and torch.xpu.is_available():
        return torch.device("xpu")
    try:
        if torch.__version__.startswith("2.8"):
            import intel_extension_for_pytorch as ipex
            if hasattr(torch, "xpu") and torch.xpu.is_available():
                return torch.device("xpu")
    except BaseException:
        pass
    # 3. Try CUDA (Nvidia GPU)
    if torch.cuda.is_available():
        return torch.device("cuda")
    # 4. Fallback to CPU
    return torch.device("cpu")

def stack_lstm_hidden(hidden_list, device):
    if all(h is None for h in hidden_list):
        return None
    sample = next(h for h in hidden_list if h is not None)
    num_layers, _, hidden_dim = sample[0].shape
    
    hs = []
    cs = []
    for h in hidden_list:
        if h is None:
            hs.append(torch.zeros(num_layers, 1, hidden_dim, device=device))
            cs.append(torch.zeros(num_layers, 1, hidden_dim, device=device))
        else:
            hs.append(h[0])
            cs.append(h[1])
            
    return (torch.cat(hs, dim=1), torch.cat(cs, dim=1))

def split_lstm_hidden(hidden, active_indices, num_envs):
    if hidden is None:
        return [None] * num_envs
    h_n, c_n = hidden
    hidden_list = [None] * num_envs
    for i, idx in enumerate(active_indices):
        hidden_list[idx] = (h_n[:, i:i+1, :].detach(), c_n[:, i:i+1, :].detach())
    return hidden_list

def stack_transformer_history(history_list, device):
    if all(h is None for h in history_list):
        return None
    sample = next(h for h in history_list if h is not None)
    input_dim = sample.shape[2]
    max_len = max(h.shape[1] if h is not None else 0 for h in history_list)
    
    padded_list = []
    for h in history_list:
        if h is None:
            padded_list.append(torch.zeros(1, max_len, input_dim, device=device))
        else:
            if h.shape[1] < max_len:
                padding = torch.zeros(1, max_len - h.shape[1], input_dim, device=device)
                padded_list.append(torch.cat([h, padding], dim=1))
            else:
                padded_list.append(h)
    return torch.cat(padded_list, dim=0)

def split_transformer_history(history, active_indices, num_envs):
    if history is None:
        return [None] * num_envs
    history_list = [None] * num_envs
    for i, idx in enumerate(active_indices):
        history_list[idx] = history[i:i+1, :, :].detach()
    return history_list

def compute_gae(trajectory, gamma, lam):
    values = [t['value'] for t in trajectory]
    rewards = [t['reward'] for t in trajectory]
    dones = [t['done'] for t in trajectory]
    
    advantages = []
    gae = 0
    values = values + [0.0]
    
    for t in reversed(range(len(trajectory))):
        delta = rewards[t] + gamma * values[t+1] * (1.0 - float(dones[t])) - values[t]
        gae = delta + gamma * lam * (1.0 - float(dones[t])) * gae
        advantages.insert(0, gae)
        
    returns = [adv + val for adv, val in zip(advantages, values[:-1])]
    return advantages, returns


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
            # Play the agent's action (since player is 0, reward_returned is player 0's reward)
            obs, reward_returned, done, _ = env.step(actions[i])
            agent_reward = reward_returned
            
            # Step heuristic opponents
            while obs["player_id"] != 0 and not done:
                action = get_heuristic_action(obs)
                obs, _, done, _ = env.step(action)
                # Accumulate any rewards player 0 received during opponents' turns
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
        # Include reward_mode to prevent deleting files from other reward modes during grid search
        pattern = f"*{args.arch}_ep{args.episodes}_lr{args.lr}_h{args.hidden_dim}_{args.reward_mode}_*"
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
            hidden_list = [None] * num_envs
            history_list = [None] * num_envs
            
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
                    
                    prev_hidden = [hidden_list[idx] for idx in active_indices]
                    prev_history = [history_list[idx] for idx in active_indices]
                    
                    if args.arch == "lstm":
                        active_hidden = stack_lstm_hidden(prev_hidden, device)
                        logits, active_hidden = playing_policy(playing_obs_batch, active_hidden)
                        new_hidden_list = split_lstm_hidden(active_hidden, active_indices, num_envs)
                        for idx in active_indices:
                            hidden_list[idx] = new_hidden_list[idx]
                    elif args.arch == "transformer":
                        active_history = stack_transformer_history(prev_history, device)
                        logits, active_history = playing_policy(playing_obs_batch, active_history)
                        new_history_list = split_transformer_history(active_history, active_indices, num_envs)
                        for idx in active_indices:
                            history_list[idx] = new_history_list[idx]
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
    else:
        print(f"--- Bootstrapping Phase: running {args.imitation_episodes} episodes of Imitation Learning ---")
        for episode in range(1, args.imitation_episodes + 1):
            obs = env.reset()
            done = False
            hidden = None
            history = None
            
            while not done:
                player_id = obs["player_id"]
                heuristic_action = get_heuristic_action(obs)
                
                if player_id == 0:
                    if obs["phase"] == "passing":
                        action = heuristic_action
                    elif obs["phase"] == "bidding":
                        bidding_obs = preprocess_bidding_obs(obs).to(device)
                        optimizer_bid.zero_grad()
                        logits = bidding_policy(bidding_obs)
                        loss = cross_entropy(logits.unsqueeze(0), torch.tensor([heuristic_action], device=device))
                        loss.backward()
                        optimizer_bid.step()
                        action = heuristic_action
                    else:
                        playing_obs = preprocess_playing_obs(obs).to(device)
                        optimizer_play.zero_grad()
                        if args.arch == "lstm":
                            logits, hidden = playing_policy(playing_obs.unsqueeze(0), hidden)
                            if hidden is not None:
                                hidden = (hidden[0].detach(), hidden[1].detach())
                        elif args.arch == "transformer":
                            logits, history = playing_policy(playing_obs.unsqueeze(0), history)
                            if history is not None:
                                history = history.detach()
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
                    action = heuristic_action
                    
                obs, reward, done, _ = env.step(action)
                
            if not getattr(args, "silent", False):
                if episode % max(1, args.imitation_episodes // 5) == 0:
                    print(f"Imitation Pre-training: Episode {episode}/{args.imitation_episodes} Completed.")

    # ── Reinforcement Learning Phase (PPO) ───────────────────────────────────
    if args.arch == "mlp":
        playing_critic = MLPPolicy(input_dim=112, action_dim=1, hidden_dim=args.hidden_dim).to(device)
    elif args.arch == "lstm":
        playing_critic = LSTMPolicy(input_dim=112, action_dim=1, hidden_dim=args.hidden_dim).to(device)
    elif args.arch == "transformer":
        playing_critic = TransformerPolicy(input_dim=112, action_dim=1, hidden_dim=args.hidden_dim).to(device)
    elif args.arch == "gnn":
        playing_critic = SimpleGNNPolicy(num_nodes=120, node_dim=16, action_dim=1, hidden_dim=args.hidden_dim).to(device)
        
    optimizer_play = optim.Adam(list(playing_policy.parameters()) + list(playing_critic.parameters()), lr=args.lr)
    
    vec_env = VectorTrickTakingEnv(num_envs, args.rules_yaml, reward_mode=args.reward_mode)
    
    if not getattr(args, "silent", False):
        print(f"\n--- Reinforcement Learning Phase: running {args.episodes} episodes of PPO learning ---")
        
    for episode in range(1, args.episodes + 1):
        obs_list = vec_env.reset()
        done = [False] * num_envs
        
        hidden_list = [None] * num_envs
        hidden_critic_list = [None] * num_envs
        history_list = [None] * num_envs
        history_critic_list = [None] * num_envs
        
        trajectories = [[] for _ in range(num_envs)]
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
                
                prev_hidden = [hidden_list[idx] for idx in active_indices]
                prev_hidden_critic = [hidden_critic_list[idx] for idx in active_indices]
                prev_history = [history_list[idx] for idx in active_indices]
                prev_history_critic = [history_critic_list[idx] for idx in active_indices]
                
                # Policy forward pass
                if args.arch == "lstm":
                    active_hidden = stack_lstm_hidden(prev_hidden, device)
                    logits, active_hidden = playing_policy(playing_obs_batch, active_hidden)
                    new_hidden_list = split_lstm_hidden(active_hidden, active_indices, num_envs)
                    for idx in active_indices:
                        hidden_list[idx] = new_hidden_list[idx]
                elif args.arch == "transformer":
                    active_history = stack_transformer_history(prev_history, device)
                    logits, active_history = playing_policy(playing_obs_batch, active_history)
                    new_history_list = split_transformer_history(active_history, active_indices, num_envs)
                    for idx in active_indices:
                        history_list[idx] = new_history_list[idx]
                elif args.arch == "gnn":
                    node_idx = torch.randint(0, 120, (len(active_indices), 30), device=device)
                    adj = torch.eye(30, device=device).unsqueeze(0).expand(len(active_indices), -1, -1)
                    logits = playing_policy(node_idx, adj)
                else:
                    logits = playing_policy(playing_obs_batch)
                    
                # Critic forward pass
                with torch.no_grad():
                    if args.arch == "lstm":
                        active_hidden_critic = stack_lstm_hidden(prev_hidden_critic, device)
                        values, active_hidden_critic = playing_critic(playing_obs_batch, active_hidden_critic)
                        new_hidden_critic_list = split_lstm_hidden(active_hidden_critic, active_indices, num_envs)
                        for idx in active_indices:
                            hidden_critic_list[idx] = new_hidden_critic_list[idx]
                    elif args.arch == "transformer":
                        active_history_critic = stack_transformer_history(prev_history_critic, device)
                        values, active_history_critic = playing_critic(playing_obs_batch, active_history_critic)
                        new_history_critic_list = split_transformer_history(active_history_critic, active_indices, num_envs)
                        for idx in active_indices:
                            hidden_critic_list[idx] = new_history_critic_list[idx]
                    elif args.arch == "gnn":
                        values = playing_critic(node_idx, adj)
                    else:
                        values = playing_critic(playing_obs_batch)
                
                values = values.flatten()
                
                # Sample actions and record trajectories
                for i, (idx, act_obs) in enumerate(zip(active_indices, active_obs)):
                    env_logits = logits[i]
                    legal_moves = act_obs["legal_moves"]
                    legal_indices = [suits.index(s) * 13 + (r - 2) for s, r in legal_moves]
                    
                    masked_logits = torch.full_like(env_logits, -float('inf'))
                    masked_logits[legal_indices] = env_logits[legal_indices]
                    probs = torch.softmax(masked_logits, dim=-1)
                    dist = torch.distributions.Categorical(probs)
                    
                    act_idx = dist.sample()
                    log_prob = dist.log_prob(act_idx)
                    idx_val = act_idx.item()
                    
                    actions[idx] = (suits[idx_val // 13], (idx_val % 13) + 2)
                    
                    trajectories[idx].append({
                        'obs': playing_obs_batch[i].cpu(),
                        'action_idx': idx_val,
                        'log_prob': log_prob.item(),
                        'value': values[i].item(),
                        'legal_indices': legal_indices,
                        'hidden': prev_hidden[i],
                        'hidden_critic': prev_hidden_critic[i],
                        'history': prev_history[i],
                        'history_critic': prev_history_critic[i],
                        'node_idx': node_idx[i].cpu() if args.arch == "gnn" else None,
                        'adj': adj[i].cpu() if args.arch == "gnn" else None
                    })
                    
            obs_list_new, step_rewards, dones_new = vec_env.step(actions)
            for idx in active_indices:
                obs_list[idx] = obs_list_new[idx]
                episode_rewards[idx] += step_rewards[idx]
                done[idx] = dones_new[idx]
                
                if first_obs["phase"] == "playing" and len(trajectories[idx]) > 0:
                    trajectories[idx][-1]['reward'] = step_rewards[idx]
                    trajectories[idx][-1]['done'] = dones_new[idx]
                    
        # Compute returns and advantages
        all_transitions = []
        for idx in range(num_envs):
            traj = trajectories[idx]
            if not traj:
                continue
            advantages, returns = compute_gae(traj, args.gamma, args.gae_lambda)
            for t, trans in enumerate(traj):
                trans['advantage'] = advantages[t]
                trans['return'] = returns[t]
                all_transitions.append(trans)
                
        # PPO optimization epochs
        if all_transitions:
            for epoch in range(args.ppo_epochs):
                random.shuffle(all_transitions)
                for start_idx in range(0, len(all_transitions), args.mini_batch_size):
                    end_idx = min(start_idx + args.mini_batch_size, len(all_transitions))
                    batch = all_transitions[start_idx:end_idx]
                    
                    obs_b = torch.stack([t['obs'] for t in batch]).to(device)
                    actions_b = torch.tensor([t['action_idx'] for t in batch], dtype=torch.long, device=device)
                    old_log_probs_b = torch.tensor([t['log_prob'] for t in batch], dtype=torch.float32, device=device)
                    returns_b = torch.tensor([t['return'] for t in batch], dtype=torch.float32, device=device)
                    advantages_b = torch.tensor([t['advantage'] for t in batch], dtype=torch.float32, device=device)
                    
                    if args.arch == "lstm":
                        hiddens_b = stack_lstm_hidden([t['hidden'] for t in batch], device)
                        hiddens_critic_b = stack_lstm_hidden([t['hidden_critic'] for t in batch], device)
                        logits, _ = playing_policy(obs_b, hiddens_b)
                        values, _ = playing_critic(obs_b, hiddens_critic_b)
                    elif args.arch == "transformer":
                        histories_b = stack_transformer_history([t['history'] for t in batch], device)
                        histories_critic_b = stack_transformer_history([t['history_critic'] for t in batch], device)
                        logits, _ = playing_policy(obs_b, histories_b)
                        values, _ = playing_critic(obs_b, histories_critic_b)
                    elif args.arch == "gnn":
                        node_idx_b = torch.stack([t['node_idx'] for t in batch]).to(device)
                        adj_b = torch.stack([t['adj'] for t in batch]).to(device)
                        logits = playing_policy(node_idx_b, adj_b)
                        values = playing_critic(node_idx_b, adj_b)
                    else:
                        logits = playing_policy(obs_b)
                        values = playing_critic(obs_b)
                        
                    values = values.flatten()
                    
                    masked_logits = torch.full_like(logits, -float('inf'))
                    for i, t in enumerate(batch):
                        masked_logits[i, t['legal_indices']] = logits[i, t['legal_indices']]
                        
                    probs = torch.softmax(masked_logits, dim=-1)
                    dist = torch.distributions.Categorical(probs)
                    new_log_probs = dist.log_prob(actions_b)
                    entropy = dist.entropy()
                    
                    ratios = torch.exp(new_log_probs - old_log_probs_b)
                    
                    if len(advantages_b) > 1:
                        adv_std = advantages_b.std() + 1e-8
                        advantages_norm = (advantages_b - advantages_b.mean()) / adv_std
                    else:
                        advantages_norm = advantages_b
                        
                    surr1 = ratios * advantages_norm
                    surr2 = torch.clamp(ratios, 1.0 - args.clip_eps, 1.0 + args.clip_eps) * advantages_norm
                    policy_loss = -torch.min(surr1, surr2).mean()
                    
                    value_loss = F.mse_loss(values, returns_b)
                    entropy_loss = -entropy.mean()
                    
                    loss = policy_loss + args.value_coef * value_loss + args.entropy_coef * entropy_loss
                    
                    optimizer_play.zero_grad()
                    loss.backward()
                    nn.utils.clip_grad_norm_(list(playing_policy.parameters()) + list(playing_critic.parameters()), max_norm=0.5)
                    optimizer_play.step()
                    
        rewards_history.extend(episode_rewards.tolist())
        if not getattr(args, "silent", False):
            if episode % max(1, args.episodes // 10) == 0:
                print(f"RL Episode {episode}/{args.episodes} | Average reward: {np.mean(rewards_history[-max(1, len(rewards_history)//10):]):.1f}")
            
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
    
    # PPO Specific Arguments
    parser.add_argument("--ppo_epochs", type=int, default=4, help="Number of PPO optimization epochs per update")
    parser.add_argument("--clip_eps", type=float, default=0.2, help="PPO clip range parameter")
    parser.add_argument("--value_coef", type=float, default=0.5, help="PPO value function loss coefficient")
    parser.add_argument("--entropy_coef", type=float, default=0.01, help="PPO entropy loss coefficient to encourage exploration")
    parser.add_argument("--gae_lambda", type=float, default=0.95, help="GAE lambda parameter for advantage estimation")
    parser.add_argument("--mini_batch_size", type=int, default=64, help="PPO mini-batch size")
    
    args = parser.parse_args()
    train(args)
