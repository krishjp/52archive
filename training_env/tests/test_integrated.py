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

def test_scoring_goals_and_point_rules_minimize(create_yaml_config):
    """Verify that card point matching works and minimize goal yields negative rewards (shaped mode)."""
    yaml_path = create_yaml_config("hearts_like", mechanics={
        "scoringType": "card_points"
    }, scoring_rules={
        "scoringGoal": "minimize",
        "cardPointRules": [
            {"suit": "Hearts", "points": 1},
            {"suit": "Spades", "rank": 12, "points": 13}
        ]
    })
    
    env = TrickTakingEnv(yaml_path, reward_mode="shaped")
    env.reward_weights["trick_won"] = 0
    env.phase = "playing"
    
    # Set up trick where P3 plays Clubs 14, P1 Hearts 2, P2 Spades 12, P0 Clubs 2.
    # Clubs 14 wins (P3), P0 is active player completing the trick.
    env.hands[0] = [("Clubs", 2)]
    env.current_turn = 0
    env.current_trick = [
        (3, ("Clubs", 14)),
        (1, ("Hearts", 2)),
        (2, ("Spades", 12))
    ]
    obs, reward, done, _ = env.step(("Clubs", 2)) # Resolves trick
    
    # P3 captures 14 points total
    assert env.round_card_points[3] == 14
    # In shaped/minimize mode, P3 takes points and gets penalized, while P0 gets no penalty
    assert env.accumulated_rewards[3] == -14.0
    assert reward == 5.0

def test_scoring_goals_and_point_rules_maximize(create_yaml_config):
    """Verify that card point matching works and maximize goal yields positive rewards (shaped mode)."""
    yaml_path = create_yaml_config("points_max", mechanics={
        "scoringType": "card_points"
    }, scoring_rules={
        "scoringGoal": "maximize",
        "cardPointRules": [
            {"suit": "Hearts", "points": 1},
            {"suit": "Spades", "rank": 12, "points": 13}
        ]
    })
    
    env = TrickTakingEnv(yaml_path, reward_mode="shaped")
    env.reward_weights["trick_won"] = 0
    env.phase = "playing"
    env.hands[0] = [("Clubs", 2)]
    env.current_turn = 0
    env.current_trick = [
        (3, ("Clubs", 14)),
        (1, ("Hearts", 2)),
        (2, ("Spades", 12))
    ]
    obs, reward, done, _ = env.step(("Clubs", 2))
    
    assert env.round_card_points[3] == 14
    # In maximize mode, points taken must yield positive rewards
    assert env.accumulated_rewards[3] == 14.0
    assert reward == 5.0

@pytest.mark.parametrize("reward_mode, expected_p3_reward, expected_p0_reward", [
    ("pure", -15.0, 0.0),
    ("zero_sum", -15.0, 5.0),
    ("shaped", -15.0, 5.0),
])
def test_terminal_rewards_by_mode(create_yaml_config, reward_mode, expected_p3_reward, expected_p0_reward):
    """Verify terminal round/game end rewards scale correctly by mode for card point scoring."""
    yaml_path = create_yaml_config("term_test", mechanics={
        "scoringType": "card_points"
    }, scoring_rules={
        "scoringGoal": "minimize",
        "cardPointRules": [{"suit": "Hearts", "points": 1}]
    })

    env = TrickTakingEnv(yaml_path, reward_mode=reward_mode)
    env.reward_weights["trick_won"] = 0
    env.round_card_points = {0: 0, 1: 0, 2: 0, 3: 15}
    env.phase = "playing"
    env.hands[0] = [("Clubs", 2)]
    env.current_turn = 0
    env.tricks_played = env.cards_per_player - 1 # Force final trick
    env.current_trick = [
        (3, ("Clubs", 14)),
        (1, ("Clubs", 3)),
        (2, ("Clubs", 4))
    ]
    
    # Step resolves final trick, ending round and applying terminal rewards
    obs, reward, done, _ = env.step(("Clubs", 2))
    
    assert env.accumulated_rewards[3] == expected_p3_reward
    assert reward == expected_p0_reward

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

def test_shoot_the_moon(create_yaml_config):
    """Verify that shooting the moon gives the shooter 0 points and all other players 26 points when configured in card point rules."""
    yaml_path = create_yaml_config("hearts_moon", mechanics={
        "scoringType": "card_points"
    }, scoring_rules={
        "scoringGoal": "minimize",
        "cardPointRules": [
            {"suit": "Hearts", "points": 1},
            {"suit": "Spades", "rank": 12, "points": 13},
            {"special": "shoot_the_moon", "points": 26}
        ]
    })
    
    env = TrickTakingEnv(yaml_path)
    env.round_card_points = {0: 0, 1: 0, 2: 0, 3: 26} # P3 gets all points (13 Hearts + Q Spades = 26)
    
    env._calculate_final_scores()
    
    # Shooter should have 0 score, everyone else should get 26 points penalty
    assert env.scores[3] == 0
    assert env.scores[0] == 26
    assert env.scores[1] == 26
    assert env.scores[2] == 26

    # Test when shoot the moon rule is absent
    yaml_path_disabled = create_yaml_config("hearts_moon_disabled", mechanics={
        "scoringType": "card_points"
    }, scoring_rules={
        "scoringGoal": "minimize",
        "cardPointRules": [
            {"suit": "Hearts", "points": 1},
            {"suit": "Spades", "rank": 12, "points": 13}
        ]
    })
    env_disabled = TrickTakingEnv(yaml_path_disabled)
    env_disabled.round_card_points = {0: 0, 1: 0, 2: 0, 3: 26}
    env_disabled._calculate_final_scores()
    # P3 should keep the 26 points as score
    assert env_disabled.scores[3] == 26
    assert env_disabled.scores[0] == 0


