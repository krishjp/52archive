import argparse
import os

# Set default device selector to hide integrated graphics and target dedicated Intel Arc GPU
if "ONEAPI_DEVICE_SELECTOR" not in os.environ:
    os.environ["ONEAPI_DEVICE_SELECTOR"] = "level_zero:0"

import time
import csv
import itertools
from concurrent.futures import ProcessPoolExecutor, as_completed
from train import train, generate_imitation_cache

class GridSearchNamespace:
    """Mock namespace to pass config parameters programmatically to train() function."""
    def __init__(self, **kwargs):
        self.rules_yaml = kwargs.get("rules_yaml", "oh_hell.yaml")
        self.arch = kwargs.get("arch", "mlp")
        self.episodes = kwargs.get("episodes", 100)
        self.imitation_episodes = kwargs.get("imitation_episodes", 50)
        self.lr = kwargs.get("lr", 0.001)
        self.gamma = kwargs.get("gamma", 0.99)
        self.hidden_dim = kwargs.get("hidden_dim", 128)
        self.clear_previous = kwargs.get("clear_previous", False)
        self.reward_mode = kwargs.get("reward_mode", "zero_sum")
        self.silent = kwargs.get("silent", False)
        self.run_id = kwargs.get("run_id", "")
        self.num_envs = kwargs.get("num_envs", 1)
        self.imitation_cache_path = kwargs.get("imitation_cache_path", "imitation_cache.pt")
        self.force_regenerate_cache = kwargs.get("force_regenerate_cache", False)
        self.imitation_epochs = kwargs.get("imitation_epochs", 10)
        self.reward_scale = kwargs.get("reward_scale", 1.0)
        
        # PPO parameters
        self.ppo_epochs = kwargs.get("ppo_epochs", 4)
        self.clip_eps = kwargs.get("clip_eps", 0.2)
        self.value_coef = kwargs.get("value_coef", 0.5)
        self.entropy_coef = kwargs.get("entropy_coef", 0.01)
        self.gae_lambda = kwargs.get("gae_lambda", 0.95)
        self.mini_batch_size = kwargs.get("mini_batch_size", 64)
        
        # LoRA parameters
        self.use_lora = kwargs.get("use_lora", False)
        self.lora_rank = kwargs.get("lora_rank", 4)
        self.lora_alpha = kwargs.get("lora_alpha", 8.0)
        self.load_model_path = kwargs.get("load_model_path", "")

def run_grid_worker(config_tuple):
    """Worker target function executed in separate parallel processes."""
    (
        arch, lr, hidden_dim, reward_mode, idx, total_runs, 
        rules_yaml, episodes, imitation_episodes, gamma, silent, num_envs, reward_scale,
        use_lora, lora_rank, lora_alpha, load_model_path
    ) = config_tuple
    
    # Generate unique run ID to avoid filename collisions
    run_id = f"g{idx+1}_{int(time.time())}"
    
    run_args = GridSearchNamespace(
        rules_yaml=rules_yaml,
        arch=arch,
        episodes=episodes,
        imitation_episodes=imitation_episodes,
        lr=lr,
        gamma=gamma,
        hidden_dim=hidden_dim,
        clear_previous=True,
        reward_mode=reward_mode,
        silent=silent,
        run_id=run_id,
        num_envs=num_envs,
        reward_scale=reward_scale,
        use_lora=use_lora,
        lora_rank=lora_rank,
        lora_alpha=lora_alpha,
        load_model_path=load_model_path
    )
    
    lora_str = f", lora=True(r={lora_rank},a={lora_alpha})" if use_lora else ""
    print(f"[RUN {idx+1}/{total_runs} STARTING] arch={arch}, lr={lr}, hidden={hidden_dim}, mode={reward_mode}{lora_str}")
    start_time = time.time()
    try:
        metrics = train(run_args)
        elapsed = time.time() - start_time
        metrics.update({
            "arch": arch,
            "lr": lr,
            "hidden_dim": hidden_dim,
            "reward_mode": reward_mode,
            "time_sec": elapsed
        })
        print(f"[RUN {idx+1}/{total_runs} FINISHED] arch={arch}, lr={lr}, hidden={hidden_dim}, mode={reward_mode} -> Late Avg Reward: {metrics['avg_reward_last_10pct']:.2f} (took {elapsed:.1f}s)")
        return metrics
    except Exception as e:
        print(f"[RUN {idx+1}/{total_runs} FAILED] arch={arch}, lr={lr}, hidden={hidden_dim}, mode={reward_mode} -> {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description="Hyperparameter Grid Tuning Search for Oh Hell RL Agent")
    parser.add_argument("--rules_yaml", type=str, default="oh_hell.yaml", help="Path to YAML rules configuration")
    parser.add_argument("--episodes", type=int, default=150, help="RL training episodes per grid configuration")
    parser.add_argument("--imitation_episodes", type=int, default=50, help="Imitation learning pre-training episodes")
    parser.add_argument("--gamma", type=float, default=0.99, help="Discount factor")
    parser.add_argument("--parallel", action="store_true", help="Run grid search in parallel using multiple worker processes")
    parser.add_argument("--workers", type=int, default=4, help="Number of concurrent worker processes when running in parallel (default: 4)")
    parser.add_argument("--num_envs", type=int, default=1, help="Number of vectorized environments per worker")
    parser.add_argument("--reward_scale", type=float, default=1.0, help="Reward scaling factor")
    
    # LoRA Specific Arguments
    parser.add_argument("--use_lora", action="store_true", help="Apply Low-Rank Adaptation (LoRA) to the policy network")
    parser.add_argument("--lora_rank", type=int, default=4, help="Rank of LoRA adaptation")
    parser.add_argument("--lora_alpha", type=float, default=8.0, help="Alpha parameter for LoRA adaptation")
    parser.add_argument("--load_model_path", type=str, default="", help="Path to pre-trained model weights to load before RL/LoRA training")
    
    # Grid lists to search over (comma-separated strings)
    parser.add_argument("--archs", type=str, default="mlp,lstm,transformer,sb3_maskable", help="Architectures list (comma separated)")
    parser.add_argument("--lrs", type=str, default="0.001,0.0005", help="Learning rates list (comma separated)")
    parser.add_argument("--hidden_dims", type=str, default="64,128", help="Hidden dimensions list (comma separated)")
    parser.add_argument("--reward_modes", type=str, default="zero_sum,shaped,aware_shape", help="Reward modes list (comma separated)")
    parser.add_argument("--clear_all", action="store_true", help="Clear all past model, report, and plot files from the directory before running")
    
    args = parser.parse_args()

    run_parallel = args.parallel

    # Concurrency safety check for GPU architectures (XPU and MPS)
    import torch
    is_xpu = hasattr(torch, "xpu") and torch.xpu.is_available()
    is_mps = hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
    if (is_xpu or is_mps) and run_parallel and args.workers > 1:
        backend_name = "Intel XPU" if is_xpu else "Apple MPS"
        print("\n" + "!" * 80)
        print(f" WARNING: {backend_name} (GPU) acceleration is active and --parallel is requested.")
        print(" Running multiple parallel GPU processes under Windows/macOS will likely")
        print(" cause driver context collisions, GPU hangs, or out-of-memory errors.")
        print(" Automatically overriding to sequential mode (workers = 1) for safety.")
        print("!" * 80 + "\n")
        run_parallel = False

    # Clear all past training files if requested
    if args.clear_all:
        import glob
        patterns = ["model_*", "report_*", "plot_*", "training_report*", "training_reward_plot.png", "grid_search_report_*", "imitation_cache.pt"]
        print("Clearing all past model, report, and plot files from the directory...")
        deleted_count = 0
        for pattern in patterns:
            for f in glob.glob(pattern):
                try:
                    os.remove(f)
                    deleted_count += 1
                except Exception as e:
                    print(f"Error removing {f}: {e}")
        print(f"Cleared {deleted_count} total files. Proceeding with grid search...\n")
    
    # Parse lists
    arch_list = [a.strip() for a in args.archs.split(",") if a.strip()]
    lr_list = [float(x.strip()) for x in args.lrs.split(",") if x.strip()]
    hidden_dim_list = [int(d.strip()) for d in args.hidden_dims.split(",") if d.strip()]
    reward_mode_list = [r.strip() for r in args.reward_modes.split(",") if r.strip()]
    
    # Pre-generate imitation cache if needed so workers can reuse it
    imitation_cache_path = "imitation_cache.pt"
    if args.imitation_episodes > 0 and not os.path.exists(imitation_cache_path):
        print(f"Pre-generating imitation cache for grid search workers ({args.imitation_episodes} episodes)...")
        default_reward_mode = reward_mode_list[0] if reward_mode_list else "zero_sum"
        dataset = generate_imitation_cache(args.rules_yaml, args.imitation_episodes, default_reward_mode)
        import torch
        try:
            torch.save(dataset, imitation_cache_path)
            print(f"Pre-generated cache successfully saved to {imitation_cache_path}\n")
        except Exception as e:
            print(f"Failed to save pre-generated cache: {e}\n")
            
    combinations = list(itertools.product(arch_list, lr_list, hidden_dim_list, reward_mode_list))
    total_runs = len(combinations)
    
    # Determine device for reporting
    device_name = "cpu"
    if is_mps:
        device_name = "mps"
    elif torch.cuda.is_available():
        device_name = "cuda"
    elif is_xpu:
        device_name = "xpu"

    print("=" * 70)
    print(f" STARTING HYPERPARAMETER GRID SEARCH ({total_runs} combinations)")
    print(f" Concurrency: {'parallel (' + str(args.workers) + ' workers)' if run_parallel else 'sequential'}")
    print(f" Active Device: {device_name}")
    print(f" Vectorized Environments: {args.num_envs}")
    print(f" Rules config: {args.rules_yaml}")
    print(f" Architectures: {arch_list}")
    print(f" Learning Rates: {lr_list}")
    print(f" Hidden Dimensions: {hidden_dim_list}")
    print(f" Reward Modes: {reward_mode_list}")
    print("=" * 70)
    
    results = []
    
    # Prepare parameters tuple list for ProcessPoolExecutor workers
    # If run_parallel is True, we force silent mode to prevent stdout cluttering
    use_silent = run_parallel
    worker_inputs = [
        (
            arch, lr, hidden_dim, reward_mode, idx, total_runs, 
            args.rules_yaml, args.episodes, args.imitation_episodes, args.gamma, use_silent, args.num_envs, args.reward_scale,
            args.use_lora, args.lora_rank, args.lora_alpha, args.load_model_path
        )
        for idx, (arch, lr, hidden_dim, reward_mode) in enumerate(combinations)
    ]
    
    if run_parallel and args.workers > 1:
        # Parallel Execution
        print(f"Running parallel process pool with {args.workers} concurrent workers...")
        with ProcessPoolExecutor(max_workers=args.workers) as executor:
            future_to_config = {executor.submit(run_grid_worker, inp): inp for inp in worker_inputs}
            for future in as_completed(future_to_config):
                res = future.result()
                if res is not None:
                    results.append(res)
    else:
        # Sequential Execution
        print("Running sequentially in a single main process...")
        for inp in worker_inputs:
            res = run_grid_worker(inp)
            if res is not None:
                results.append(res)
                
    if not results:
        print("\nError: No grid search runs completed successfully.")
        return
        
    # Sort results by avg_reward_last_10pct descending to find the best configuration
    sorted_results = sorted(results, key=lambda x: x["avg_reward_last_10pct"], reverse=True)
    best_config = sorted_results[0]
    
    # Save a global grid search report CSV
    report_csv = f"grid_search_report_{int(time.time())}.csv"
    with open(report_csv, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["Arch", "LR", "Hidden Dim", "Reward Mode", "Avg Reward", "Avg Reward (Last 10%)", "Max Reward", "Imitation Time (Sec)", "RL Time (Sec)", "Total Time (Sec)", "Model Path"])
        for r in results:
            writer.writerow([
                r["arch"], r["lr"], r["hidden_dim"], r["reward_mode"],
                f"{r['avg_reward']:.2f}", f"{r['avg_reward_last_10pct']:.2f}",
                f"{r['max_reward']:.2f}",
                f"{r.get('imitation_time', 0.0):.1f}",
                f"{r.get('rl_time', 0.0):.1f}",
                f"{r['time_sec']:.1f}",
                r["model_name"]
            ])
            
    # Copy the best policy parameters to a standard model weight file for easy use
    best_model_source = best_config["model_name"]
    best_model_target = "agent_model.pt"
    try:
        import shutil
        shutil.copyfile(best_model_source, best_model_target)
        print(f"\n[Best Model Cached] Copied {best_model_source} to {best_model_target}")
    except Exception as e:
        print(f"Could not copy best model to {best_model_target}: {e}")
        
    print("\n" + "=" * 70)
    print(" GRID TUNING SEARCH COMPLETE")
    print(f" Consolidated report saved to: {report_csv}")
    print("=" * 70)
    print("ALL RUNS SUMMARY (Sorted by Best Late Performance):")
    for r in sorted_results:
        print(f" - Arch: {r['arch']:4} | LR: {r['lr']:.5f} | Hidden: {r['hidden_dim']:3} | Mode: {r['reward_mode']:8} | Late Avg Reward: {r['avg_reward_last_10pct']:5.1f} | Avg Reward: {r['avg_reward']:5.1f}")
    print("=" * 70)
    print("BEST COMBINATION SELECTED:")
    print(f"  Architecture:  {best_config['arch']}")
    print(f"  Learning Rate: {best_config['lr']}")
    print(f"  Hidden Dim:    {best_config['hidden_dim']}")
    print(f"  Reward Mode:   {best_config['reward_mode']}")
    print(f"  Late Performance Average: {best_config['avg_reward_last_10pct']:.2f} points")
    print("=" * 70)

if __name__ == "__main__":
    main()
