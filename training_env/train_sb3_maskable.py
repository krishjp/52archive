import argparse
import os
import random
import time
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from gym_env import GymnasiumTrickTakingWrapper
from sb3_contrib import MaskablePPO
from sb3_contrib.common.maskable.utils import get_action_masks

def train_sb3(args):
    # Determine device
    device = "cpu"
    if torch.cuda.is_available():
        device = "cuda"
    elif hasattr(torch, "xpu") and torch.xpu.is_available():
        device = "xpu"

    print(f"Using device: {device}")
    
    # Create environment
    env = GymnasiumTrickTakingWrapper(args.rules_yaml, reward_mode=args.reward_mode)
    
    # Initialize MaskablePPO model
    policy_kwargs = dict(
        net_arch=dict(pi=[args.hidden_dim, args.hidden_dim], vf=[args.hidden_dim, args.hidden_dim])
    )
    
    model = MaskablePPO(
        "MlpPolicy",
        env,
        learning_rate=args.lr,
        n_steps=512,
        batch_size=args.mini_batch_size,
        n_epochs=args.ppo_epochs,
        gamma=args.gamma,
        gae_lambda=args.gae_lambda,
        clip_range=args.clip_eps,
        ent_coef=args.entropy_coef,
        policy_kwargs=policy_kwargs,
        verbose=1,
        device=device
    )
    
    # Load or generate imitation dataset for pre-training
    imitation_cache_path = args.imitation_cache_path
    if args.imitation_episodes > 0:
        if os.path.exists(imitation_cache_path):
            print(f"Loading cached imitation dataset from {imitation_cache_path}...")
            dataset = torch.load(imitation_cache_path)
        else:
            print(f"Generating {args.imitation_episodes} imitation episodes...")
            from train import generate_imitation_cache
            dataset = generate_imitation_cache(args.rules_yaml, args.imitation_episodes, args.reward_mode)
            torch.save(dataset, imitation_cache_path)
            
        playing_rounds = dataset["playing"]
        if playing_rounds:
            print(f"Pre-training SB3 policy network via Behavioral Cloning...")
            all_obs = torch.cat([r["obs"] for r in playing_rounds]).to(device)
            all_act = torch.cat([r["act"] for r in playing_rounds]).to(device)
            
            # Behavioral cloning optimization loop
            optimizer = torch.optim.Adam(model.policy.parameters(), lr=args.lr)
            batch_size = 64
            num_batches = (len(all_obs) + batch_size - 1) // batch_size
            
            model.policy.train()
            for epoch in range(args.imitation_epochs):
                indices = torch.randperm(len(all_obs))
                epoch_loss = 0.0
                for b in range(num_batches):
                    batch_idx = indices[b * batch_size : (b + 1) * batch_size]
                    obs_batch = all_obs[batch_idx]
                    act_batch = all_act[batch_idx]
                    
                    optimizer.zero_grad()
                    distribution = model.policy.get_distribution(obs_batch)
                    logits = distribution.distribution.logits
                    loss = F.cross_entropy(logits, act_batch)
                    loss.backward()
                    optimizer.step()
                    epoch_loss += loss.item()
                print(f"BC Epoch {epoch+1}/{args.imitation_epochs} | Loss: {epoch_loss/num_batches:.4f}")
                
    # Online Reinforcement Learning Phase
    print(f"\n--- Reinforcement Learning Phase: running {args.episodes} timesteps of MaskablePPO ---")
    model.learn(total_timesteps=args.episodes)
    
    # Save the trained model weights
    suffix = f"_{getattr(args, 'run_id', '')}" if getattr(args, 'run_id', '') else f"_{int(time.time())}"
    model_name = f"model_sb3_maskable_{args.rules_yaml.split('.')[0]}{suffix}.zip"
    model.save(model_name)
    print(f"Model saved successfully to {model_name}")

    if len(model.ep_info_buffer) > 0:
        rewards = [info["r"] for info in model.ep_info_buffer]
        avg_reward = float(np.mean(rewards))
        last_10 = max(1, len(rewards) // 10)
        avg_reward_last_10pct = float(np.mean(rewards[-last_10:]))
        max_reward = float(np.max(rewards))
        min_reward = float(np.min(rewards))
    else:
        avg_reward = 0.0
        avg_reward_last_10pct = 0.0
        max_reward = 0.0
        min_reward = 0.0

    return {
        "avg_reward": avg_reward,
        "avg_reward_last_10pct": avg_reward_last_10pct,
        "max_reward": max_reward,
        "min_reward": min_reward,
        "model_name": model_name,
        "csv_name": "",
        "txt_name": "",
        "plot_name": ""
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SB3 MaskablePPO Training Script")
    parser.add_argument("--rules_yaml", type=str, default="oh_hell.yaml", help="Path to rules configuration")
    parser.add_argument("--episodes", type=int, default=5000, help="Total training timesteps for RL")
    parser.add_argument("--imitation_episodes", type=int, default=100, help="Number of imitation bootstrap episodes")
    parser.add_argument("--imitation_epochs", type=int, default=10, help="Number of BC training epochs")
    parser.add_argument("--imitation_cache_path", type=str, default="imitation_cache.pt", help="Path to cached imitation data")
    parser.add_argument("--lr", type=float, default=0.0003, help="Learning rate")
    parser.add_argument("--gamma", type=float, default=0.99, help="Discount factor")
    parser.add_argument("--hidden_dim", type=int, default=128, help="Hidden layers dimension")
    parser.add_argument("--reward_mode", type=str, default="zero_sum", help="RL reward function strategy")
    parser.add_argument("--ppo_epochs", type=int, default=4, help="PPO optimization epochs per update")
    parser.add_argument("--clip_eps", type=float, default=0.2, help="PPO clip range parameter")
    parser.add_argument("--value_coef", type=float, default=0.5, help="PPO value function loss coefficient")
    parser.add_argument("--entropy_coef", type=float, default=0.01, help="PPO entropy loss coefficient")
    parser.add_argument("--gae_lambda", type=float, default=0.95, help="GAE lambda parameter")
    parser.add_argument("--mini_batch_size", type=int, default=64, help="PPO mini-batch size")
    
    args = parser.parse_args()
    train_sb3(args)
