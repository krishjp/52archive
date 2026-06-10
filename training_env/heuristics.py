"""
Heuristic policy for trick-taking games (Judgement / Oh Hell).

This module is intentionally free of PyTorch or any heavy ML dependency so it
can be imported in the simulation API even when torch is not installed.
"""


def get_heuristic_action(obs: dict):
    legal_moves = obs["legal_moves"]
    if obs["phase"] == "passing":
        # Pass highest rank cards to minimize points / risk
        return max(legal_moves, key=lambda c: (c[1], c[0]))

    if obs["phase"] == "bidding":
        # Bid estimation: count high ranks (12=Q, 13=K, 14=A) + high trump cards
        hand = obs["hand"]
        trump = obs["trump_suit"]
        bid = 0
        for suit, rank in hand:
            if rank >= 12:
                bid += 1
            elif trump and suit == trump and rank >= 10:
                bid += 1
        return min(bid, len(hand))

    # Playing Phase
    player_id = obs["player_id"]
    bid = obs["bids"].get(player_id, 0)
    won = obs["tricks_won"].get(player_id, 0)

    current_trick = obs["current_trick"]
    lead_suit = obs["lead_suit"]
    trump_suit = obs["trump_suit"]

    def card_strength(card) -> int:
        suit, rank = card
        if trump_suit and suit == trump_suit:
            return rank + 100
        if lead_suit and suit == lead_suit:
            return rank
        if not lead_suit:
            return rank  # if leading, strength is rank
        return 0  # off-suit cards that aren't trump have 0 strength

    trick_strengths = [card_strength(c) for _, c in current_trick]
    highest_trick_strength = max(trick_strengths) if trick_strengths else -1

    winning_cards = [c for c in legal_moves if card_strength(c) > highest_trick_strength]
    losing_cards = [c for c in legal_moves if card_strength(c) <= highest_trick_strength]

    if won < bid:
        # Wants to win the trick: play highest card that wins
        if winning_cards:
            return max(winning_cards, key=card_strength)
        else:
            # Cannot win: throw away lowest card to preserve high cards
            return min(legal_moves, key=card_strength)
    else:
        # Wants to lose: play highest card that still loses (discarding high cards)
        if losing_cards:
            return max(losing_cards, key=card_strength)
        else:
            # Forced to win: play lowest card that wins to conserve higher cards
            return min(winning_cards, key=card_strength)
