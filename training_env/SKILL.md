---
name: training-env
description: Guides development, configuration, and execution of RL training loops and vectorized environments for trick-taking card games.
version: 1.0.0
author: krish-patel
tags:
  - reinforcement-learning
  - card-games
  - pytorch
  - ipex
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
- Debugging device assignments (MPS, IPEX/XPU, CUDA).

## Instructions
1. **Select Device Mapping**:
   Eagerly check hardware acceleration devices (MPS, IPEX/XPU, CUDA) using `get_device()`.
2. **Define Neural Architectures**:
   - `MLPPolicy`: Static state-action mapping.
   - `LSTMPolicy`: Recurrent sequence tracking.
   - `TransformerPolicy`: Attention-based sequence representation over history.
   - `SimpleGNNPolicy`: Message-passing node/edge graph configuration.
3. **Run Vectorized Environments**:
   If `--num_envs` > 1, batch simulation steps in `VectorTrickTakingEnv` and forward stacked observation tensors. Detach recurrent hidden layers (`hidden.detach()`) at every step to prevent autograd graph memory leaks.
4. **Tune Hyperparameters**:
   Use `grid_search.py` with the `--workers` and `--num_envs` parameters to run process pools.
5. **Manage Dependencies via pyproject.toml**:
   Install standard cross-platform dependencies using `uv pip install -e .`. To include Intel GPU (XPU) support, run `uv pip install -e .[xpu]`.
6. **Configure Starting Player / Rotation Rules**:
   Specify turn selection modes when initializing sessions or running HTTP simulations. The system resolves starting player logic prior to bidding and playing:
   - `rotating`: Default rotating dealer.
   - `most_points`: Starts with the player who holds the highest cumulative score.
   - `least_points`: Starts with the player who holds the lowest cumulative score.

## Output Format
Always preserve the following outputs:
- Model weights: Saved to `model_<run_info>.pt`.
- Data reports: Saved as CSV and TXT files.
- Plots: Generated line charts of rewards over episodes.

## Examples
### Vectorized Transformer Training Run
```powershell
.venv\Scripts\python.exe train.py --rules_yaml oh_hell.yaml --arch transformer --num_envs 16 --imitation_episodes 500 --episodes 15000
```

### Concurrent Grid Search
```powershell
.venv\Scripts\python.exe grid_search.py --rules_yaml oh_hell.yaml --workers 5 --num_envs 8 --archs "mlp,lstm,transformer" --episodes 10000 --imitation_episodes 500
```

## Notes
- `game_session.py` loads models using `map_location=torch.device('cpu')` so that models trained on high-performance accelerators can run anywhere.
