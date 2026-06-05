import pytest
from game_session import GameSession

def test_final_player_round_completion_scores_and_done(create_yaml_config):
    """
    Test that when Player 0 (human) is the final player of the trick/round in the final round,
    the scores are calculated and cumulative_scores is updated, and the session is marked as done.
    """
    yaml_path = create_yaml_config("final_player_game", mechanics={
        "scoringType": "exact_bid_only"
    })
    
    # 4-player game session
    session = GameSession(yaml_path)
    session.env.num_players = 4
    
    # Start a 1-round game sequence
    session.start_game([0]) # round 0
    session.env.cards_per_player = 1
    session.env.hands = {
        0: [("Clubs", 2)],
        1: [("Clubs", 10)],
        2: [("Clubs", 5)],
        3: [("Clubs", 7)]
    }
    
    # Mock bids phase already complete
    session.env.bids = {0: 0, 1: 0, 2: 0, 3: 0}
    session.env.phase = "playing"
    session.env.current_turn = 0 # It will be Player 0's turn to play last in the trick
    
    # Simulate Player 1, 2, 3 playing first
    # Trick order: 1 -> 2 -> 3 -> 0 (user plays last)
    session.env.current_trick = [
        (1, ("Clubs", 10)),
        (2, ("Clubs", 5)),
        (3, ("Clubs", 7))
    ]
    session.env.lead_suit = "Clubs"
    session.env.trick_leader = 1
    session.env.tricks_played = 0
    
    # Set session observation to match Player 0
    session.obs = session.env._get_obs(0)
    
    # Assert starting conditions
    assert session.done is False
    assert session.cumulative_scores == {0: 0, 1: 0, 2: 0, 3: 0}
    
    # Player 0 plays their card ("Clubs", 2), completing the trick, round and game.
    success, msg = session.human_play(0) # Card at index 0
    assert success is True
    
    # Check that the round is completed
    assert session.env.phase == "completed"
    
    # Check that scores are calculated
    # Player 1 won the trick (Clubs 10) with bid 0 -> score 0
    # Player 0 won 0 tricks with bid 0 -> score 10 (bid success bonus)
    # Player 2 won 0 tricks with bid 0 -> score 10
    # Player 3 won 0 tricks with bid 0 -> score 10
    assert session.env.scores == {0: 10, 1: 0, 2: 10, 3: 10}
    
    # Check that cumulative_scores are correctly updated
    assert session.cumulative_scores == {0: 10, 1: 0, 2: 10, 3: 10}
    
    # Check that the game is marked as done/over because it was the last round
    assert session.done is True
