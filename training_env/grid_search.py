import argparse
import os
import time
import csv
import itertools
from concurrent.futures import ProcessPoolExecutor, as_completed
from train import train

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

def run_grid_worker(config_tuple):
    """Worker target function executed in separate parallel processes."""
    (
        arch, lr, hidden_dim, reward_mode, idx, total_runs, 
        rules_yaml, episodes, imitation_episodes, gamma, silent, num_envs
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
        num_envs=num_envs
    )
    
    print(f"[RUN {idx+1}/{total_runs} STARTING] arch={arch}, lr={lr}, hidden={hidden_dim}, mode={reward_mode}")
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
    parser.add_argument("--workers", type=int, default=1, help="Number of concurrent worker processes (set > 1 for parallel runs)")
    parser.add_argument("--num_envs", type=int, default=1, help="Number of vectorized environments per worker")
    
    # Grid lists to search over (comma-separated strings)
    parser.add_argument("--archs", type=str, default="mlp,lstm,transformer", help="Architectures list (comma separated)")
    parser.add_argument("--lrs", type=str, default="0.001,0.0005", help="Learning rates list (comma separated)")
    parser.add_argument("--hidden_dims", type=str, default="64,128", help="Hidden dimensions list (comma separated)")
    parser.add_argument("--reward_modes", type=str, default="zero_sum,shaped", help="Reward modes list (comma separated)")
    parser.add_argument("--clear_all", action="store_true", help="Clear all past model, report, and plot files from the directory before running")
    
    args = parser.parse_args()

    # Clear all past training files if requested
    if args.clear_all:
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
        print(f"Cleared {deleted_count} total files. Proceeding with grid search...\n")
    
    # Parse lists
    arch_list = [a.strip() for a in args.archs.split(",") if a.strip()]
    lr_list = [float(x.strip()) for x in args.lrs.split(",") if x.strip()]
    hidden_dim_list = [int(d.strip()) for d in args.hidden_dims.split(",") if d.strip()]
    reward_mode_list = [r.strip() for r in args.reward_modes.split(",") if r.strip()]
    
    combinations = list(itertools.product(arch_list, lr_list, hidden_dim_list, reward_mode_list))
    total_runs = len(combinations)
    
    print("=" * 70)
    print(f" STARTING HYPERPARAMETER GRID SEARCH ({total_runs} combinations)")
    print(f" Concurrency: {args.workers} worker process(es)")
    print(f" Vectorized Environments: {args.num_envs}")
    print(f" Rules config: {args.rules_yaml}")
    print(f" Architectures: {arch_list}")
    print(f" Learning Rates: {lr_list}")
    print(f" Hidden Dimensions: {hidden_dim_list}")
    print(f" Reward Modes: {reward_mode_list}")
    print("=" * 70)
    
    results = []
    
    # Prepare parameters tuple list for ProcessPoolExecutor workers
    # If workers > 1, we force silent mode to prevent stdout cluttering
    use_silent = args.workers > 1
    worker_inputs = [
        (
            arch, lr, hidden_dim, reward_mode, idx, total_runs, 
            args.rules_yaml, args.episodes, args.imitation_episodes, args.gamma, use_silent, args.num_envs
        )
        for idx, (arch, lr, hidden_dim, reward_mode) in enumerate(combinations)
    ]
    
    if args.workers > 1:
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
        writer.writerow(["Arch", "LR", "Hidden Dim", "Reward Mode", "Avg Reward", "Avg Reward (Last 10%)", "Max Reward", "Time (Sec)", "Model Path"])
        for r in results:
            writer.writerow([
                r["arch"], r["lr"], r["hidden_dim"], r["reward_mode"],
                f"{r['avg_reward']:.2f}", f"{r['avg_reward_last_10pct']:.2f}",
                f"{r['max_reward']:.2f}", f"{r['time_sec']:.1f}", r["model_name"]
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
