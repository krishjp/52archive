import sys
import json
import os
import tempfile
from game_session import GameSession

def run():
    # Read input from stdin
    data = json.load(sys.stdin)
    
    rules_yaml = data.get("rules_yaml")
    model_path = data.get("model_path")
    arch = data.get("arch", "mlp")
    hidden_dim = data.get("hidden_dim", 128)
    
    # Write rules_yaml to a temporary file
    temp_yaml_path = None
    with tempfile.NamedTemporaryFile(suffix=".yaml", delete=False, mode="w", encoding="utf-8") as f:
        f.write(rules_yaml)
        temp_yaml_path = f.name
        
    try:
        session = GameSession(temp_yaml_path, model_path=model_path, arch=arch, hidden_dim=hidden_dim)
        
        # Load state if provided
        state = data.get("state")
        if state:
            session.round_indices = state["round_indices"]
            session.current_round_idx_of_game = state["current_round_idx_of_game"]
            session.cumulative_scores = {int(k): v for k, v in state["cumulative_scores"].items()}
            session.done = state["done"]
            
            # Load env state
            env_state = state["env_state"]
            session.env.hands = {int(k): [tuple(c) for c in v] for k, v in env_state["hands"].items()}
            session.env.tricks_won = {int(k): v for k, v in env_state["tricks_won"].items()}
            session.env.bids = {int(k): v for k, v in env_state["bids"].items()}
            session.env.scores = {int(k): v for k, v in env_state["scores"].items()}
            session.env.round_card_points = {int(k): v for k, v in env_state["round_card_points"].items()}
            session.env.passed_cards = {int(k): [tuple(c) for c in v] for k, v in env_state["passed_cards"].items()}
            session.env.round_idx = env_state["round_idx"]
            session.env.cards_per_player = env_state["cards_per_player"]
            session.env.tricks_played = env_state.get("tricks_played", 0)
            session.env.trump_suit = env_state["trump_suit"]
            session.env.lead_suit = env_state["lead_suit"]
            session.env.current_turn = env_state["current_turn"]
            session.env.trick_leader = env_state["trick_leader"]
            session.env.current_trick = [(int(c[0]), tuple(c[1])) for c in env_state["current_trick"]]
            session.env.phase = env_state["phase"]
            
            # Re-generate obs
            session.obs = session.env._get_obs(session.env.current_turn)
        else:
            # Start a new game
            round_indices = data.get("round_indices", [0])
            session.start_game(round_indices)
            
        logs = []
        action = data.get("action")
        
        if action == "next_round":
            session.next_round()
            logs.append(f"Starting next round: Round {session.current_round_idx_of_game + 1}")
        elif action is not None:
            # Action format can be:
            # For bidding: int (bid amount)
            # For playing/passing: list [suit, rank] (e.g. ["Spades", 14])
            if session.env.phase == "bidding":
                success, msg = session.human_bid(action)
                logs.append(msg)
            elif session.env.phase == "passing":
                # Find index of card in hand
                card_to_find = tuple(action)
                card_idx = -1
                for idx, c in enumerate(session.obs["hand"]):
                    if tuple(c) == card_to_find:
                        card_idx = idx
                        break
                if card_idx != -1:
                    success, msg = session.human_pass(card_idx)
                    logs.append(msg)
                else:
                    success, msg = False, "Card not found in hand."
                    logs.append(msg)
            elif session.env.phase == "playing":
                card_to_find = tuple(action)
                card_idx = -1
                for idx, c in enumerate(session.obs["hand"]):
                    if tuple(c) == card_to_find:
                        card_idx = idx
                        break
                if card_idx != -1:
                    success, msg = session.human_play(card_idx)
                    logs.append(msg)
                else:
                    success, msg = False, "Card not found in hand."
                    logs.append(msg)
                    
        # Now run any AI responses
        if session.env.phase == "passing":
            ai_pass_logs = session.execute_ai_passes()
            logs.extend(ai_pass_logs)
        elif session.env.phase == "bidding":
            ai_bid_logs = session.execute_ai_bids()
            logs.extend(ai_bid_logs)
            
        # If bidding/passing phase just finished, start the playing phase
        if session.env.phase == "playing":
            ai_play_logs = session.execute_ai_plays()
            logs.extend(ai_play_logs)
            
        # If the round is completed, prepare state for next round or finish game
        round_completed = session.env.phase == "completed"
        
        # Serialize updated state
        updated_state = {
            "round_indices": session.round_indices,
            "current_round_idx_of_game": session.current_round_idx_of_game,
            "cumulative_scores": {str(k): v for k, v in session.cumulative_scores.items()},
            "done": session.done,
            "env_state": {
                "hands": {str(k): v for k, v in session.env.hands.items()},
                "tricks_won": {str(k): v for k, v in session.env.tricks_won.items()},
                "bids": {str(k): v for k, v in session.env.bids.items()},
                "scores": {str(k): v for k, v in session.env.scores.items()},
                "round_card_points": {str(k): v for k, v in session.env.round_card_points.items()},
                "passed_cards": {str(k): v for k, v in session.env.passed_cards.items()},
                "round_idx": session.env.round_idx,
                "cards_per_player": session.env.cards_per_player,
                "tricks_played": session.env.tricks_played,
                "trump_suit": session.env.trump_suit,
                "lead_suit": session.env.lead_suit,
                "current_turn": session.env.current_turn,
                "trick_leader": session.env.trick_leader,
                "current_trick": session.env.current_trick,
                "phase": session.env.phase
            }
        }
        
        output = {
            "state": updated_state,
            "logs": logs,
            "observation": {
                "player_id": session.obs["player_id"] if session.obs else 0,
                "hand": session.obs["hand"] if session.obs else [],
                "trump_suit": session.obs["trump_suit"] if session.obs else None,
                "bids": {str(k): v for k, v in session.obs["bids"].items()} if session.obs else {},
                "tricks_won": {str(k): v for k, v in session.obs["tricks_won"].items()} if session.obs else {},
                "current_trick": session.obs["current_trick"] if session.obs else [],
                "lead_suit": session.obs["lead_suit"] if session.obs else None,
                "phase": session.obs["phase"] if session.obs else "completed",
                "scores": {str(k): v for k, v in session.obs["scores"].items()} if session.obs else {},
                "legal_moves": session.obs["legal_moves"] if session.obs else [],
                "done": session.done
            },
            "round_completed": round_completed,
            "done": session.done,
            "has_model": session.playing_policy is not None
        }
        
        print(json.dumps(output))
        
    finally:
        if temp_yaml_path and os.path.exists(temp_yaml_path):
            os.remove(temp_yaml_path)

if __name__ == "__main__":
    run()
