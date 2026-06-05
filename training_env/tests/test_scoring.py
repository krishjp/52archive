import pytest
from env import TrickTakingEnv

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

