import os
import sys
import torch
import torch.nn as nn
import torch.optim as optim
import torch.nn.functional as F
import subprocess

import types
import importlib.machinery
spec = importlib.machinery.ModuleSpec("torchaudio", loader=None)
dummy_torchaudio = types.ModuleType("torchaudio")
dummy_torchaudio.__spec__ = spec
sys.modules['torchaudio'] = dummy_torchaudio

from models import MLPPolicy, apply_lora_to_model, merge_lora_weights
from train import VectorTrickTakingEnv, preprocess_playing_obs, preprocess_bidding_obs, generate_imitation_cache
from stable_baselines3 import PPO
from huggingface_hub import hf_hub_download

def get_device():
    return torch.device("cpu")

def run_peft_pipeline():
    device = get_device()
    rules_yaml = "oh_hell.yaml"
    print(f"Using device: {device}")
    
    checkpoint_path = hf_hub_download(
        repo_id="sb3/ppo-CartPole-v1",
        filename="ppo-CartPole-v1.zip"
    )

    sb3_model = PPO.load(checkpoint_path, device=device)
    policy = sb3_model.policy
    
    policy.mlp_extractor.policy_net[0] = nn.Linear(112, 64).to(device)
    policy.mlp_extractor.value_net[0] = nn.Linear(112, 64).to(device)
    policy.action_net = nn.Linear(64, 52).to(device)
    policy.value_net = nn.Linear(64, 1).to(device)
    
    bidding_policy = MLPPolicy(input_dim=57, action_dim=11, hidden_dim=128).to(device)
    optimizer_bid = optim.Adam(bidding_policy.parameters(), lr=0.001)

    print("Generating imitation dataset from heuristic play...")
    dataset = generate_imitation_cache(rules_yaml, num_episodes=500, reward_mode="zero_sum")

    print("Pre-training Bidding Policy via Behavioral Cloning...")
    bid_obs = dataset["bidding"]["obs"].to(device)
    bid_act = dataset["bidding"]["act"].to(device)
    
    bidding_policy.train()
    for epoch in range(15):
        optimizer_bid.zero_grad()
        logits = bidding_policy(bid_obs)
        loss = F.cross_entropy(logits, bid_act)
        loss.backward()
        optimizer_bid.step()

    print("Pre-training Playing Policy via Behavioral Cloning...")
    all_play_obs = []
    all_play_act = []
    for r in dataset["playing"]:
        all_play_obs.append(r["obs"])
        all_play_act.append(r["act"])
    
    play_obs = torch.cat(all_play_obs).to(device)
    play_act = torch.cat(all_play_act).to(device)
    
    optimizer_bc = optim.Adam(policy.parameters(), lr=0.001)
    policy.train()
    bc_epochs = 500
    for epoch in range(bc_epochs):
        optimizer_bc.zero_grad()
        dist = policy.get_distribution(play_obs)
        logits = dist.distribution.logits
        loss = F.cross_entropy(logits, play_act)
        loss.backward()
        optimizer_bc.step()
        if (epoch + 1) % 5 == 0:
            print(f"  BC Epoch {epoch+1}/{bc_epochs} | Loss: {loss.item():.4f}")

    print("Wrapping pre-trained policy with PEFT LoRA adapters...")
    peft_policy = apply_lora_to_model(policy, rank=4, alpha=8.0)
    peft_policy.to(device)
    
    episodes = 5000
    lr = 0.00001
    gamma = 0.99
    gae_lambda = 0.95
    clip_eps = 0.2
    
    vec_env = VectorTrickTakingEnv(num_envs=1, rules_yaml=rules_yaml, reward_mode="zero_sum")
    
    optimizer_play = optim.Adam(
        [p for p in peft_policy.parameters() if p.requires_grad],
        lr=lr
    )
    
    suits = ["Clubs", "Diamonds", "Hearts", "Spades"]
    peft_policy.train()

    print("Running PPO fine-tuning...")
    for ep in range(1, episodes + 1):
        obs_list = vec_env.reset()
        done = [False]
        trajectories = []
        bidding_trajectories = []
        episode_reward = 0.0
        
        while not all(done):
            active_obs = obs_list[0]
            action = None
            
            if active_obs["phase"] == "bidding":
                bidding_obs_batch = preprocess_bidding_obs(active_obs).unsqueeze(0).to(device)
                with torch.no_grad():
                    logits = bidding_policy(bidding_obs_batch)
                probs = torch.softmax(logits, dim=-1)
                dist = torch.distributions.Categorical(probs)
                bid = dist.sample()
                log_prob = dist.log_prob(bid)
                
                bid_val = bid.item()
                action = min(bid_val, len(active_obs["hand"]))
                bidding_trajectories.append({
                    'obs': bidding_obs_batch[0].cpu(),
                    'action': bid_val,
                    'log_prob': log_prob.item()
                })
            else:
                playing_obs_batch = preprocess_playing_obs(active_obs).unsqueeze(0).to(device)
                distribution = peft_policy.get_distribution(playing_obs_batch)
                logits = distribution.distribution.logits
                
                with torch.no_grad():
                    values = peft_policy.predict_values(playing_obs_batch).flatten()
                
                legal_moves = active_obs["legal_moves"]
                legal_indices = [suits.index(s) * 13 + (r - 2) for s, r in legal_moves]
                
                env_logits = logits[0]
                masked_logits = torch.full_like(env_logits, -float('inf'))
                masked_logits[legal_indices] = env_logits[legal_indices]
                probs = torch.softmax(masked_logits, dim=-1)
                dist = torch.distributions.Categorical(probs)
                
                act_idx = dist.sample()
                log_prob = dist.log_prob(act_idx)
                idx_val = act_idx.item()
                
                action = (suits[idx_val // 13], (idx_val % 13) + 2)
                trajectories.append({
                    'obs': playing_obs_batch[0].cpu(),
                    'action_idx': idx_val,
                    'log_prob': log_prob.item(),
                    'value': values[0].item(),
                    'legal_indices': legal_indices
                })
                
            obs_list_new, step_rewards, dones_new = vec_env.step([action])
            obs_list = obs_list_new
            episode_reward += step_rewards[0]
            done[0] = dones_new[0]
            
            if active_obs["phase"] == "playing" and len(trajectories) > 0:
                trajectories[-1]['reward'] = step_rewards[0]
                trajectories[-1]['done'] = dones_new[0]

        if trajectories:
            rewards_arr = [t['reward'] for t in trajectories]
            values_arr = [t['value'] for t in trajectories] + [0.0]
            dones_arr = [t['done'] for t in trajectories]
            
            advantages = []
            gae = 0.0
            for step in reversed(range(len(trajectories))):
                delta = rewards_arr[step] + gamma * values_arr[step + 1] * (1.0 - dones_arr[step]) - values_arr[step]
                gae = delta + gamma * gae_lambda * (1.0 - dones_arr[step]) * gae
                advantages.insert(0, gae)
                
            returns = [adv + val for adv, val in zip(advantages, values_arr[:-1])]
            
            for epoch in range(4):
                for t, trans in enumerate(trajectories):
                    obs_b = trans['obs'].unsqueeze(0).to(device)
                    action_b = torch.tensor([trans['action_idx']], dtype=torch.long, device=device)
                    old_log_prob_b = torch.tensor([trans['log_prob']], dtype=torch.float32, device=device)
                    return_b = torch.tensor([returns[t]], dtype=torch.float32, device=device)
                    advantage_b = torch.tensor([advantages[t]], dtype=torch.float32, device=device)
                    
                    distribution = peft_policy.get_distribution(obs_b)
                    logits = distribution.distribution.logits
                    values = peft_policy.predict_values(obs_b).flatten()
                    
                    env_logits = logits[0]
                    masked_logits = torch.full_like(env_logits, -float('inf'))
                    masked_logits[trans['legal_indices']] = env_logits[trans['legal_indices']]
                    probs = torch.softmax(masked_logits, dim=-1)
                    dist = torch.distributions.Categorical(probs)
                    new_log_prob = dist.log_prob(action_b)
                    entropy = dist.entropy()
                    
                    ratio = torch.exp(new_log_prob - old_log_prob_b)
                    surr1 = ratio * advantage_b
                    surr2 = torch.clamp(ratio, 1.0 - clip_eps, 1.0 + clip_eps) * advantage_b
                    
                    policy_loss = -torch.min(surr1, surr2).mean()
                    value_loss = nn.functional.mse_loss(values, return_b)
                    entropy_loss = -entropy.mean()
                    
                    loss = policy_loss + 0.5 * value_loss + 0.01 * entropy_loss
                    
                    optimizer_play.zero_grad()
                    loss.backward()
                    optimizer_play.step()

        if bidding_trajectories:
            obs_b = torch.stack([t['obs'] for t in bidding_trajectories]).to(device)
            actions_b = torch.tensor([t['action'] for t in bidding_trajectories], dtype=torch.long, device=device)
            
            for epoch in range(4):
                logits = bidding_policy(obs_b)
                probs = torch.softmax(logits, dim=-1)
                dist = torch.distributions.Categorical(probs)
                new_log_probs = dist.log_prob(actions_b)
                
                loss = -(new_log_probs * episode_reward).mean()
                optimizer_bid.zero_grad()
                loss.backward()
                optimizer_bid.step()

        if ep % 1000 == 0:
            print(f"Episode {ep}/{episodes} | Reward: {episode_reward:.1f}")

    merged_policy = merge_lora_weights(peft_policy)
    finetuned_model_path = "lora_finetuned.pt"
    
    def extract_mlp_state_dict(policy_network):
        sd = {}
        sd["net.0.weight"] = policy_network.mlp_extractor.policy_net[0].weight.data
        sd["net.0.bias"] = policy_network.mlp_extractor.policy_net[0].bias.data
        sd["net.2.weight"] = policy_network.mlp_extractor.policy_net[2].weight.data
        sd["net.2.bias"] = policy_network.mlp_extractor.policy_net[2].bias.data
        sd["net.4.weight"] = policy_network.action_net.weight.data
        sd["net.4.bias"] = policy_network.action_net.bias.data
        return sd

    finetuned_state_dict = extract_mlp_state_dict(merged_policy)
    torch.save(finetuned_state_dict, finetuned_model_path)

    base_model = PPO.load(checkpoint_path, device=device)
    base_policy = base_model.policy
    base_policy.mlp_extractor.policy_net[0] = nn.Linear(112, 64).to(device)
    base_policy.action_net = nn.Linear(64, 52).to(device)
    
    base_state_dict = extract_mlp_state_dict(base_policy)
    torch.save(base_state_dict, "adapted_base.pt")
    
    cmd = [
        sys.executable,
        "tournament.py",
        "--rules_yaml", "oh_hell.yaml",
        "--agents",
        "adapted_base.pt:mlp:64",
        "lora_finetuned.pt:mlp:64",
        "heuristic",
        "heuristic",
        "--games", "500"
    ]
    
    print("Running tournament (200 games)...")
    env_copy = os.environ.copy()
    env_copy["PYTHONPATH"] = os.getcwd()
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=os.getcwd(), env=env_copy)
    print(result.stdout)
    if result.stderr:
        print(result.stderr)
        
    for f in ["adapted_base.pt", "lora_finetuned.pt"]:
        if os.path.exists(f):
            os.remove(f)

if __name__ == "__main__":
    run_peft_pipeline()
