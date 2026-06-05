import pytest
from env import TrickTakingEnv

def test_passing_configs(create_yaml_config):
    """Verify custom passing configurations parse correctly."""
    yaml_path = create_yaml_config("passing_game", mechanics={
        "passing": True,
        "passingCount": 4,
        "passingSequence": ["+1", "-1", "none"]
    })
    env = TrickTakingEnv(yaml_path)
    
    assert env.passing is True
    assert env.passing_count == 4
    assert env.passing_sequence == ["+1", "-1", "none"]

@pytest.mark.parametrize("dir_type, expected_targets", [
    ("+1", {0: 1, 1: 2, 2: 3, 3: 0}),
    ("1", {0: 1, 1: 2, 2: 3, 3: 0}),
    ("left", {0: 1, 1: 2, 2: 3, 3: 0}),
    ("N+1", {0: 1, 1: 2, 2: 3, 3: 0}),
    ("-1", {0: 3, 1: 0, 2: 1, 3: 2}),
    ("right", {0: 3, 1: 0, 2: 1, 3: 2}),
    ("N-1", {0: 3, 1: 0, 2: 1, 3: 2}),
    ("+2", {0: 2, 1: 3, 2: 0, 3: 1}),
    ("2", {0: 2, 1: 3, 2: 0, 3: 1}),
    ("across", {0: 2, 1: 3, 2: 0, 3: 1}),
    ("N+2", {0: 2, 1: 3, 2: 0, 3: 1}),
    ("0", {0: 0, 1: 1, 2: 2, 3: 3}),
    ("none", {0: 0, 1: 1, 2: 2, 3: 3}),
])
def test_passing_offsets_and_directions(create_yaml_config, dir_type, expected_targets):
    """Verify that variant passing directions and formula-based offsets rotate cards correctly."""
    yaml_path = create_yaml_config("dir_test", mechanics={
        "passing": True,
        "passingCount": 1,
        "passingSequence": [dir_type]
    })
    env = TrickTakingEnv(yaml_path)
    
    # Custom initial hands (1 card each to easily verify target mapping)
    env.hands = {
        0: [("Hearts", 2)],
        1: [("Clubs", 3)],
        2: [("Diamonds", 4)],
        3: [("Spades", 5)]
    }
    env.phase = "passing"
    env.current_turn = 0
    
    # Store reference cards being passed
    passed_cards = {p: env.hands[p][0] for p in range(4)}
    
    # Execute sequential passes
    for p in range(4):
        env.step(passed_cards[p])
        
    # Assert target players received the correct passed cards
    for p in range(4):
        target = expected_targets[p]
        assert env.hands[target][0] == passed_cards[p], f"Failed rotation mapping for: {dir_type}"
    assert env.phase == "playing"

@pytest.mark.parametrize("dir_type, expected_targets", [
    ("4", {0: 1, 1: 2, 2: 0}),      # 4 % 3 = 1 -> (p + 1) % 3
    ("-4", {0: 2, 1: 0, 2: 1}),     # -4 % 3 = 2 -> (p + 2) % 3
    ("N+5", {0: 2, 1: 0, 2: 1}),    # 5 % 3 = 2 -> (p + 2) % 3
])
def test_passing_wrap_around(create_yaml_config, dir_type, expected_targets):
    """Verify that passing offsets wrap around correctly when greater than the number of players in a 3-player game."""
    yaml_path = create_yaml_config("wrap_test", mechanics={
        "passing": True,
        "passingCount": 1,
        "passingSequence": [dir_type]
    })
    env = TrickTakingEnv(yaml_path)
    env.num_players = 3
    
    env.hands = {
        0: [("Hearts", 2)],
        1: [("Clubs", 3)],
        2: [("Diamonds", 4)]
    }
    env.passed_cards = {0: [], 1: [], 2: []}
    env.phase = "passing"
    env.current_turn = 0
    
    passed_cards = {p: env.hands[p][0] for p in range(3)}
    
    for p in range(3):
        env.step(passed_cards[p])
        
    for p in range(3):
        target = expected_targets[p]
        assert env.hands[target][0] == passed_cards[p], f"Failed wrap around mapping for: {dir_type}"

