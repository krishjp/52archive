import pytest
from env import TrickTakingEnv

def test_default_config_parsing(create_yaml_config):
    """Verify that default values are populated correctly when settings are omitted in the YAML."""
    yaml_path = create_yaml_config("default_game")
    env = TrickTakingEnv(yaml_path)
    
    assert env.passing is False
    assert env.passing_count == 3
    assert env.passing_sequence == ["left", "right", "across", "none"]
    assert env.scoring_goal == "maximize"
    assert env.card_point_rules == []
    assert env.bidding_required is False

def test_starting_player_modes(create_yaml_config):
    """Verify that GameSession sets the correct starting player based on turn_selection_mode."""
    from game_session import GameSession
    yaml_path = create_yaml_config("starting_turn_game", mechanics={"deal_sequence": [10, 10, 10]})
    
    # Test rotating mode
    session = GameSession(yaml_path, turn_selection_mode="rotating")
    session.start_game([0, 1, 2])
    assert session.env.current_turn == 0
    session.env.phase = "completed"
    session.next_round()
    assert session.env.current_turn == 1
    session.env.phase = "completed"
    session.next_round()
    assert session.env.current_turn == 2
    
    # Test most_points mode
    session_most = GameSession(yaml_path, turn_selection_mode="most_points")
    session_most.round_indices = [0, 1]
    session_most.cumulative_scores = {0: 10, 1: 50, 2: 30, 3: 5}
    session_most.start_round()
    # Starts with player with max score (Player 1)
    assert session_most.env.current_turn == 1
    
    # Test least_points mode
    session_least = GameSession(yaml_path, turn_selection_mode="least_points")
    session_least.round_indices = [0, 1]
    session_least.cumulative_scores = {0: 10, 1: 50, 2: 30, 3: 5}
    session_least.start_round()
    # Starts with player with min score (Player 3)
    assert session_least.env.current_turn == 3
