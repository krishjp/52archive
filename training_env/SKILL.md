---
name: training-env
description: Guides development, configuration, and execution of RL training loops and vectorized environments for trick-taking card games.
version: 1.1.0
author: krish-patel
tags:
  - reinforcement-learning
  - card-games
  - pytorch
  - xpu
  - mps
---

# Trick-Taking RL Training Environment

## Overview
This skill outlines how to configure, run, and modify the Python-based RL training environment, neural network architectures, and vectorized concurrent simulators for trick-taking games like Oh Hell / Judgement.

## When to Use
Use when:
- Modifying neural network architectures (MLP, LSTM, Transformer, GNN) in `models.py`.
- Tuning reward modes (`shaped`, `zero_sum`, `pure`) or environment mechanics in `env.py`.
- Running training sessions or hyperparameter grid searches.
- Debugging device assignments (MPS, XPU, CUDA).
- Deploying or attaching trained model weights to MongoDB.

## Instructions
1. **Select Device Mapping**:
   Eagerly check hardware acceleration devices (MPS, XPU, CUDA) using `get_device()`.
2. **Define Neural Architectures**:
   - `MLPPolicy`: Static state-action mapping.
   - `LSTMPolicy`: Recurrent sequence tracking.
   - `TransformerPolicy`: Attention-based sequence representation over history.
   - `SimpleGNNPolicy`: Message-passing node/edge graph configuration.
3. **Run Vectorized Environments**:
   If `--num_envs` > 1, batch simulation steps in `VectorTrickTakingEnv` and forward stacked observation tensors.
4. **Tune Hyperparameters Safely**:
   Use `grid_search.py` to optimize hyperparameters. **CRITICAL**: When using Intel GPU (XPU) acceleration on Windows/Level Zero, `--workers` MUST be set to `1` to prevent GPU crashes/hangs due to concurrent context collisions. Vectorized environments (`--num_envs` > 1) can be safely increased within a single process to leverage GPU parallelism.
5. **Manage Dependencies via pyproject.toml**:
   Install and sync dependencies using `uv sync`. The project utilizes conditional platform dependencies to target native PyTorch `2.6.0+xpu` and associated SYCL runtime libraries only on Windows (`win32`), falling back to standard PyPI libraries on other platforms.
6. **Direct Model Attachment**:
   Trained model weight files (`.pt`) can be directly uploaded and attached to the MongoDB database using `attach_model_direct.py`. The HTTP client `upload_model.py` is deprecated.
7. **Bidding constraints (Hook Rule)**:
   In trick-taking games like Oh Hell, when `restrictions.hook_rule` is active, the last bidder (dealer) of the round cannot bid a number of tricks that makes the total sum of all bids equal the round hand size. The environment dynamically restricts the dealer's legal bids.

## Output Format
Always preserve the following outputs:
- Model weights: Saved to `model_<run_info>.pt`.
- Data reports: Saved as CSV and TXT files.
- Plots: Generated line charts of rewards over episodes.

## Examples
### Vectorized Transformer Training Run (on GPU)
```powershell
.venv\Scripts\python.exe train.py --rules_yaml oh_hell.yaml --arch transformer --num_envs 16 --imitation_episodes 500 --episodes 15000
```

### Direct Model Database Association
```powershell
python attach_model_direct.py --game_id <game_id> --model_path <model_path.pt> --arch lstm --hidden_dim 128
```

### Safe GPU Grid Search (Sequential workers, high vectorized envs)
```powershell
.venv\Scripts\python.exe grid_search.py --rules_yaml oh_hell.yaml --workers 1 --num_envs 16 --archs "mlp,lstm" --episodes 1000 --imitation_episodes 100
```

## Notes
- `game_session.py` loads models using `map_location=torch.device('cpu')` so that models trained on high-performance accelerators can run anywhere.
- Running multiple parallel workers on a single GPU under Windows is blocked by driver constraints; use `--num_envs` for GPU parallelization instead.
