import torch
import torch.nn as nn
import torch.nn.functional as F

class MLPPolicy(nn.Module):
    """
    Standard Multi-Layer Perceptron Policy network for card games.
    """
    def __init__(self, input_dim: int, action_dim: int, hidden_dim: int = 128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, action_dim)
        )
        
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class LSTMPolicy(nn.Module):
    """
    LSTM Policy Network designed to track card history and bidded tricks over time.
    """
    def __init__(self, input_dim: int, action_dim: int, hidden_dim: int = 128, lstm_layers: int = 1):
        super().__init__()
        self.fc_in = nn.Linear(input_dim, hidden_dim)
        self.lstm = nn.LSTM(hidden_dim, hidden_dim, num_layers=lstm_layers, batch_first=True)
        self.fc_out = nn.Linear(hidden_dim, action_dim)
        
    def forward(self, x: torch.Tensor, hidden=None) -> tuple:
        # Input shape: [batch, seq_len, input_dim] or [batch, input_dim]
        if len(x.shape) == 2:
            x = x.unsqueeze(1) # Add sequence dimension
            
        emb = F.relu(self.fc_in(x))
        lstm_out, hidden = self.lstm(emb, hidden)
        logits = self.fc_out(lstm_out[:, -1, :]) # Predict on the last output
        return logits, hidden


class SimpleGNNPolicy(nn.Module):
    """
    Graph Neural Network Policy.
    Represents the state as a graph:
    - Nodes: Cards in hand, Cards on trick pile, Players.
    - Edges: Player holds card, Card is currently lead, Card matches trump.
    Uses simple message passing to compute state representation.
    """
    def __init__(self, num_nodes: int, node_dim: int, action_dim: int, hidden_dim: int = 64):
        super().__init__()
        # Node embedding layer
        self.node_embed = nn.Embedding(num_nodes, node_dim)
        
        # Message passing layers: updates node representations using adjacency matrix
        self.conv1 = nn.Linear(node_dim, hidden_dim)
        self.conv2 = nn.Linear(hidden_dim, hidden_dim)
        
        # Action selector
        self.fc_out = nn.Linear(hidden_dim, action_dim)
        
    def forward(self, node_indices: torch.Tensor, adj_matrix: torch.Tensor) -> torch.Tensor:
        """
        node_indices: [Batch, NumNodes]
        adj_matrix: [Batch, NumNodes, NumNodes]
        """
        # [Batch, NumNodes, NodeDim]
        h = self.node_embed(node_indices)
        
        # First layer GNN message passing: H_new = Relu(Adj * H * W)
        msg1 = torch.bmm(adj_matrix, h)
        h = F.relu(self.conv1(msg1))
        
        # Second layer GNN message passing
        msg2 = torch.bmm(adj_matrix, h)
        h = F.relu(self.conv2(msg2))
        
        # Graph pooling (mean of node representations)
        graph_repr = h.mean(dim=1)
        
        return self.fc_out(graph_repr)


class TransformerPolicy(nn.Module):
    """
    Sequence Transformer Policy designed to process history of observations using self-attention.
    """
    def __init__(self, input_dim: int, action_dim: int, hidden_dim: int = 128, num_heads: int = 4, num_layers: int = 2, max_seq_len: int = 20):
        super().__init__()
        self.max_seq_len = max_seq_len
        self.fc_in = nn.Linear(input_dim, hidden_dim)
        # Positional encoding for sequence index
        self.pos_emb = nn.Embedding(max_seq_len, hidden_dim)
        
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=hidden_dim,
            nhead=num_heads,
            dim_feedforward=hidden_dim * 2,
            batch_first=True,
            activation='relu',
            dropout=0.0
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.fc_out = nn.Linear(hidden_dim, action_dim)
        
    def forward(self, x: torch.Tensor, history: torch.Tensor = None) -> tuple:
        """
        x: current observation tensor [batch, input_dim]
        history: past sequence observations tensor [batch, seq_len, input_dim]
        Returns:
            logits: action logit values [batch, action_dim]
            new_history: updated history tensor [batch, new_seq_len, input_dim]
        """
        if len(x.shape) == 1:
            x = x.unsqueeze(0)
            
        if history is None:
            history = x.unsqueeze(1) # [batch, 1, input_dim]
        else:
            # Concatenate current step to history
            history = torch.cat([history, x.unsqueeze(1)], dim=1)
            # Limit history to max_seq_len
            if history.shape[1] > self.max_seq_len:
                history = history[:, -self.max_seq_len:, :]
                
        # Embed sequence
        seq_emb = self.fc_in(history) # [batch, seq_len, hidden_dim]
        
        # Add positional embedding
        seq_len = history.shape[1]
        pos_ids = torch.arange(seq_len, device=x.device).unsqueeze(0).expand(history.shape[0], -1)
        seq_emb = seq_emb + self.pos_emb(pos_ids)
        
        # Self-attention over history
        out = self.transformer(seq_emb)
        
        # Predict logits based on the last element of the sequence
        logits = self.fc_out(out[:, -1, :])
        
        return logits, history

