import sys
import torch
from typing import Tuple

_PLAYING_INPUT_DIM = 112
_PLAYING_ACTION_DIM = 52

def load_model(model_path: str, arch: str, hidden_dim: int, device) -> Tuple[object, str]:
    """Loads a model policy from file. Handles both standard PyTorch (.pt) weights and SB3 (.zip) packages."""
    if model_path.endswith(".zip") or arch == "sb3_maskable":
        from sb3_contrib import MaskablePPO
        model = MaskablePPO.load(model_path, device=device)
        return model, "sb3_maskable"
    
    from models import MLPPolicy, LSTMPolicy, SimpleGNNPolicy, TransformerPolicy, DQN
    if arch == "mlp":
        playing = MLPPolicy(_PLAYING_INPUT_DIM, _PLAYING_ACTION_DIM, hidden_dim)
    elif arch == "lstm":
        playing = LSTMPolicy(_PLAYING_INPUT_DIM, _PLAYING_ACTION_DIM, hidden_dim)
    elif arch == "transformer":
        playing = TransformerPolicy(_PLAYING_INPUT_DIM, _PLAYING_ACTION_DIM, hidden_dim)
    elif arch == "gnn":
        playing = SimpleGNNPolicy(num_nodes=120, node_dim=16,
                                  action_dim=_PLAYING_ACTION_DIM, hidden_dim=hidden_dim)
    elif arch == "dqn":
        playing = DQN(_PLAYING_INPUT_DIM, _PLAYING_ACTION_DIM, hidden_dim)
    else:
        raise ValueError(f"Unknown architecture: {arch}")

    playing.load_state_dict(
        torch.load(model_path, map_location=torch.device("cpu"))
    )
    playing.eval()
    return playing.to(device), arch
