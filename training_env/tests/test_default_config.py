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
