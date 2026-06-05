import pytest
from env import TrickTakingEnv

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
