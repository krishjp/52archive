import pytest
import os
import tempfile
import yaml
from env import TrickTakingEnv

@pytest.fixture
def temp_config_dir():
    """Fixture to manage a temporary directory for test config YAMLs."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir

@pytest.fixture
def create_yaml_config(temp_config_dir):
    """Fixture returning a helper function to dynamically create YAML configs."""
    def _create(name="mock_game", mechanics=None, scoring_rules=None):
        if mechanics is None:
            mechanics = {}
        if scoring_rules is None:
            scoring_rules = {}

        config = {
            "schema_version": "2.0.0",
            "description": f"Test configuration for {name}",
            "minPlayers": 4,
            "maxPlayers": 4,
            "deckCount": 1,
            "mechanics": {
                "followSuit": True,
                "hasTrump": False,
                "scoringType": "card_points",
                "deal_sequence": [13],
                **mechanics
            },
            "rules": {
                "scoring": {
                    "scoringGoal": "maximize",
                    "cardPointRules": [],
                    **scoring_rules
                }
            }
        }
        
        file_path = os.path.join(temp_config_dir, f"{name}.yaml")
        with open(file_path, "w") as f:
            yaml.dump(config, f)
        return file_path
    return _create
