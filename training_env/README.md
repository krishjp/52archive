# Reinforcement Learning Game Training Environment & CLI Preview

This directory contains the reinforcement learning (RL) training pipeline and interactive CLI preview environment built dynamically from structured YAML game definition files (e.g., `oh_hell.yaml` or `judgement_game.yaml`).

## Architecture & Code Map

1. **[env.py](env.py)**:
   - A trick-taking and bidding simulator wrapper.
   - Loads rules (number of decks, players, bidding policies, trump selection constraints, scoring systems, and reward weights) dynamically from a YAML file.
   - Implements standardized step mechanics, card distribution, valid turn masking, and scoring tallies.
   - Fully supports 5 scoring rules: `exact_bid_only` (e.g., Oh Hell), `tricks_only`, `bid_matching_bonus`, `penalty_for_undertricks`, and `penalty_for_overtricks`.

2. **[models.py](models.py)**:
   - Contains PyTorch neural network policy structures.
   - **`MLPPolicy`**: Simple feedforward network mapping flattened observations to action distributions.
   - **`LSTMPolicy`**: Sequence-aware recurrent policy capable of encoding the history of played cards, round bidding contexts, and teammate plays.
    - **`SimpleGNNPolicy`**: Represents card values, suits, and players as graph nodes. Features an embedding vocabulary of 120 indices with message passing over 30 active indices (mock structure currently using identity adjacency matrices).

3. **[train.py](train.py)**:
   - CLI execution script to run policy training.
   - Allows fine-tuning parameters (learning rate, discount factor, hidden embedding dimensions) and switching neural network architectures (`mlp`, `lstm`, `gnn`).
   - Learns trick-taking tactics by playing against random agents and self-play models.

4. **[cli_preview.py](cli_preview.py)**:
   - Interactive terminal-based application using the same environment logic.
   - Allows you to play hands of `Oh Hell` or `Judgement` in your console against automated neural/rule-based agents.
   - Supports range selection for skipping/selecting specific rounds (e.g., playing only `4-12`).

5. **[game_session.py](game_session.py)**:
   - An abstraction controller wrapper designed to manage multi-round gameplay sessions, AI turns, scoring accumulations, and player moves.
   - Decoupled from console inputs, serving as the interface for both CLI execution and future Web API integrations.
   - Supports `turn_selection_mode` configuration modes (`rotating`, `most_points`, `least_points`) to dynamically select the starting dealer, bidding lead, and play lead per round.

6. **[grid_search.py](grid_search.py)**:
   - Hyperparameter optimization pipeline that trains agents over combinations of models, learning rates, reward structures, and hidden sizes, selecting the best model configuration.
---

## How to Run & Train

Ensure you have dependencies installed in your virtual environment. Since we use `uv` for package management:

```bash
# Install dependencies including native PyTorch 2.6.0 with XPU/SYCL support
uv pip install -e .
```

### 1. Training Agents

Run the training script, specifying the configuration YAML, training parameters, model architecture, and reward modes.

**Recommended Training Command (15k Episodes MLP, Zero-Sum reward mode):**
```bash
.venv\Scripts\python.exe train.py --rules_yaml oh_hell.yaml --imitation_episodes 500 --episodes 15000 --arch mlp --reward_mode zero_sum
```

**Alternative commands:**
```bash
# Train an LSTM agent on Oh Hell rules
.venv\Scripts\python.exe train.py --rules_yaml oh_hell.yaml --arch lstm --episodes 1000 --lr 0.001

# Train a Graph Neural Network (GNN) agent
.venv\Scripts\python.exe train.py --rules_yaml oh_hell.yaml --arch gnn --episodes 500
```

*   **`--clear_previous`**: Add this flag if you wish to wipe any previous training runs sharing the exact same architecture, learning rate, and parameters.

### 2. Playing the Game Preview

Launch the terminal interface to play directly in the console.

```bash
# Start the preview with oh_hell configuration
.venv\Scripts\python.exe cli_preview.py --rules_yaml oh_hell.yaml
```

*   **Round Selection**: The CLI will ask you which rounds you want to play. You can choose a single number (e.g., `5` to play rounds 1 to 5) or a range of rounds (e.g., `4-12` to play rounds 4 to 12, skipping the first 3).
*   **Trump Rotation**: In Oh Hell rules, the trump suit rotates sequentially (`Spades` -> `Diamonds` -> `Clubs` -> `Hearts` -> `Spades`...) each round.
*   **Scoring Rule (`exact_bid_only`)**: Under this rule, you only score points if you win the exact number of tricks you bid. If you miss your bid, you get 0 points.

**Play against a loaded PyTorch model (`.pt`):**
Specify the `.pt` file generated during training:
```bash
.venv\Scripts\python.exe cli_preview.py --rules_yaml oh_hell.yaml --model_path agent_model.pt --arch mlp
```

### 3. Hyperparameter Tuning Grid Search
You can run a search across combinations of architectures, learning rates, reward structures, and hidden layer dimensions:

```bash
# Run grid search sequentially on GPU (Recommended for Intel XPU to avoid context conflicts)
.venv\Scripts\python.exe grid_search.py --clear_all --rules_yaml oh_hell.yaml --workers 1 --num_envs 16 --episodes 1000 --imitation_episodes 250 --archs "mlp,lstm" --lrs "0.001" --hidden_dims "64,128" --reward_modes "zero_sum"

# Run grid search concurrently on CPU (Use workers > 1 only if device is set to CPU)
.venv\Scripts\python.exe grid_search.py --rules_yaml oh_hell.yaml --clear_all --workers 4 --num_envs 2 --episodes 500 --imitation_episodes 100 --archs "mlp,lstm" --reward_modes "zero_sum"
```

*   **Concurrency (`--workers N`)**: Runs the hyperparameter optimization grid search. **WARNING**: When XPU acceleration is enabled under Windows, setting `--workers > 1` triggers Level Zero context crashes. `grid_search.py` automatically detects XPU and overrides the worker count to `1` to prevent system/display crashes. Use `--num_envs` (vectorized environments) to achieve fast parallelized training on the GPU instead.
*   **Console Output**: Prints a sorted leaderboard of all completed runs based on the highest average reward achieved in the last 10% of RL episodes.
*   **Consolidated Report**: Saves a CSV report (e.g., `grid_search_report_*.csv`) containing parameters, scores, training durations, and model filenames.
*   **Best Model Auto-Caching**: Automatically copies the weights of the best performing configuration to `agent_model.pt` so you can immediately play against it in the preview CLI.

# Attaching a model to a game-id
python attach_model_direct.py --game_id XXX-XXXX-XXXX --model_path XXXX --arch XXXX --hidden_dim XXX

python attach_model_direct.py --mongo_uri "mongodb+srv://<username>:<password>@<cluster-url>/52archive?retryWrites=true&w=majority"
