import yaml
import random
import numpy as np
from typing import Dict, List, Tuple, Any

class TrickTakingEnv:
    """
    A reinforcement learning environment for trick-taking and bidding card games
    constructed dynamically from a structured rule YAML configuration.
    """
    def __init__(self, yaml_path: str, reward_mode: str = "zero_sum"):
        with open(yaml_path, 'r') as f:
            self.config = yaml.safe_load(f)
        self.reward_mode = reward_mode
        self.title = self.config.get("title", self.config.get("description", "Game"))
        
        # Check if it is a block-based graph definition schema
        if "graph_architecture" in self.config:
            blocks = {b["type"]: b.get("parameters", {}) for b in self.config["graph_architecture"]["blocks"]}
            
            # Deck_Initialization block
            deck_init = blocks.get("Deck_Initialization", {})
            p_count = deck_init.get("player_count", {})
            if isinstance(p_count, dict):
                self.min_players = p_count.get("min", 3)
                self.max_players = p_count.get("max", 4)
            else:
                self.min_players = int(p_count) if p_count else 3
                self.max_players = self.min_players
                
            self.deck_count = 1
            
            # Trump Selection
            trump_sel = blocks.get("Trump_Selection", {})
            self.has_trump = trump_sel.get("mode", "none") != "none"
            self.trump_selection = trump_sel.get("mode", "round_rotation")
            self.fallback_suit = trump_sel.get("fallback_suit", "no_trump")
            self.rotation_sequence = trump_sel.get("rotation_sequence", [])
            
            # Deal Phase
            deal_phase = blocks.get("Deal_Phase", {})
            self.cards_per_player = deal_phase.get("cards_per_player", 10)
            self.deal_sequence = deal_phase.get("deal_sequence", [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
            
            # Scoring & Mechanics
            scoring = blocks.get("Scoring_Phase", {})
            self.scoring_type = scoring.get("scoring_rule", "exact_bid_only")
            self.base_points_per_trick = int(scoring.get("base_points_per_trick", 1))
            self.success_bonus = int(scoring.get("success_bonus", 10))
            self.failure_penalty = int(scoring.get("failure_penalty", 0))
            
            # Rewards (construct from scoring parameters)
            self.reward_weights = {
                "terminal_win": 100 + self.success_bonus,
                "terminal_loss": -50,
                "trick_won": self.base_points_per_trick,
                "penalty_card_taken": 0
            }
            self.follow_suit = True
            self.trick_resolution = "highest_rank_lead_or_trump"
        else:
            # Flat Schema Format
            self.min_players = self.config.get("minPlayers", 3)
            self.max_players = self.config.get("maxPlayers", 4)
            self.deck_count = self.config.get("deckCount", 1)
            
            # Mechanics
            mechanics = self.config.get("mechanics", {})
            self.follow_suit = mechanics.get("followSuit", True)
            self.has_trump = mechanics.get("hasTrump", True)
            self.trump_selection = mechanics.get("trumpSelection", "round_rotation")
            self.trick_resolution = mechanics.get("trickResolution", "highest_rank_lead_or_trump")
            self.scoring_type = mechanics.get("scoringType", "bid_matching")
            self.fallback_suit = mechanics.get("fallbackSuit", "no_trump")
            self.rotation_sequence = mechanics.get("rotationSequence", [])
            self.base_points_per_trick = 10
            self.success_bonus = 10
            self.failure_penalty = 0
            self.deal_sequence = mechanics.get("deal_sequence", [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
            
            # Rewards
            rules_conf = self.config.get("rules", {})
            self.reward_weights = rules_conf.get("rules", {}).get("rewardWeights", {
                "terminal_win": 150,
                "terminal_loss": -150,
                "trick_won": 15,
                "penalty_card_taken": -10
            })

        # Set standard player count
        self.num_players = self.min_players
        
        # Scoring & Passing settings parsing from either schema format
        if "graph_architecture" in self.config:
            scoring = blocks.get("Scoring_Phase", {})
            self.scoring_goal = scoring.get("scoring_goal", "maximize")
            self.card_point_rules = scoring.get("card_point_rules", [])
            
            # Passing block
            passing_block = blocks.get("Passing_Phase", {})
            self.passing = passing_block.get("enabled", False)
            self.passing_count = passing_block.get("passing_count", 3)
            self.passing_sequence = passing_block.get("passing_sequence", ["left", "right", "across", "none"])
            
            self.bidding_required = "Bidding_Phase" in blocks
        else:
            rules_conf = self.config.get("rules", {})
            scoring_conf = rules_conf.get("scoring", {})
            self.scoring_goal = scoring_conf.get("scoringGoal", "maximize")
            self.card_point_rules = scoring_conf.get("cardPointRules", [])
            
            # Flat mechanics passing
            mechanics = self.config.get("mechanics", {})
            self.passing = mechanics.get("passing", False)
            self.passing_count = mechanics.get("passingCount", 3)
            self.passing_sequence = mechanics.get("passingSequence", ["left", "right", "across", "none"])
            
            self.bidding_required = mechanics.get("biddingRequired", self.scoring_type != "card_points")

        # Standard 52 card deck
        # Cards: Suit (0=Clubs, 1=Diamonds, 2=Hearts, 3=Spades), Rank (2-14, 11=J, 12=Q, 13=K, 14=A)
        self.suits = ["Clubs", "Diamonds", "Hearts", "Spades"]
        self.ranks = list(range(2, 15))
        self.deck = [(s, r) for s in self.suits for r in self.ranks]
        
        self.reset()

    def reset(self, cards_per_player: int = None, round_idx: int = None) -> Dict[str, Any]:
        """Resets the environment for a new round/game."""
        self.hands = {p: [] for p in range(self.num_players)}
        self.tricks_won = {p: 0 for p in range(self.num_players)}
        self.bids = {p: 0 for p in range(self.num_players)}
        self.scores = {p: 0 for p in range(self.num_players)}
        self.round_card_points = {p: 0 for p in range(self.num_players)}
        self.accumulated_rewards = {p: 0.0 for p in range(self.num_players)}
        self.passed_cards = {p: [] for p in range(self.num_players)}
        self.round_idx = round_idx if round_idx is not None else 0
        
        # Shuffle and Deal
        shuffled_deck = list(self.deck)
        random.shuffle(shuffled_deck)
        
        # Determine cards per player for this round
        if cards_per_player is not None:
            self.cards_per_player = cards_per_player
        else:
            if not hasattr(self, "cards_per_player") or self.cards_per_player is None:
                self.cards_per_player = min(10, len(shuffled_deck) // self.num_players)
            else:
                self.cards_per_player = min(self.cards_per_player, len(shuffled_deck) // self.num_players)
                
        for p in range(self.num_players):
            self.hands[p] = sorted(
                [shuffled_deck.pop() for _ in range(self.cards_per_player)],
                key=lambda x: (x[0], x[1])
            )
            
        # Determine trump suit (after dealing hands)
        if self.has_trump:
            if self.trump_selection == "top_card_reveal":
                # Reveal the next card of the remaining deck
                if shuffled_deck:
                    self.trump_suit = shuffled_deck[-1][0] # Suit of top card
                else:
                    fallback = getattr(self, "fallback_suit", "no_trump")
                    self.trump_suit = None if fallback == "no_trump" else fallback
            elif self.trump_selection == "fixed_rotation" and getattr(self, "rotation_sequence", None):
                if round_idx is not None:
                    self.trump_suit = self.rotation_sequence[round_idx % len(self.rotation_sequence)]
                else:
                    self.trump_suit = self.rotation_sequence[0]
            elif self.trump_selection == "round_rotation":
                self.trump_suit = random.choice(self.suits)
            else:
                self.trump_suit = "Spades" # fallback
        else:
            self.trump_suit = None
            
        self.current_trick = [] # List of (player_id, card)
        self.lead_suit = None
        self.current_turn = 0
        self.trick_leader = 0
        
        # Determine initial phase based on passing and bidding settings
        direction = self.passing_sequence[self.round_idx % len(self.passing_sequence)]
        if self.passing and direction != "none":
            self.phase = "passing"
        elif self.bidding_required:
            self.phase = "bidding"
        else:
            self.phase = "playing"
            
        self.tricks_played = 0
        
        return self._get_obs(self.current_turn)

    def _get_obs(self, player_id: int) -> Dict[str, Any]:
        """Returns the observation dict for a given player."""
        return {
            "player_id": player_id,
            "hand": self.hands[player_id],
            "trump_suit": self.trump_suit,
            "bids": dict(self.bids),
            "tricks_won": dict(self.tricks_won),
            "current_trick": list(self.current_trick),
            "lead_suit": self.lead_suit,
            "phase": self.phase,
            "scores": dict(self.scores),
            "legal_moves": self.get_legal_moves(player_id)
        }

    def get_legal_moves(self, player_id: int) -> List[Tuple[str, int]]:
        """Returns the list of legal cards the player can play."""
        if self.phase == "passing":
            hand = self.hands[player_id]
            passed = self.passed_cards[player_id]
            return [c for c in hand if c not in passed]
            
        if self.phase == "bidding":
            # During bidding phase, bid options (e.g. 0 to cards_per_player)
            return list(range(self.cards_per_player + 1))
            
        hand = self.hands[player_id]
        if not self.lead_suit:
            return hand # can play any card to lead
            
        if self.follow_suit:
            same_suit_cards = [c for c in hand if c[0] == self.lead_suit]
            if same_suit_cards:
                return same_suit_cards
                
        # If void in lead suit, or no suit restriction, can play any card
        return hand

    def step(self, action: Any) -> Tuple[Dict[str, Any], float, bool, Dict[str, Any]]:
        """
        Executes a game step.
        During passing: action is a tuple (suit, rank) representing the card being passed.
        During bidding: action is an integer (the bid).
        During playing: action is a tuple (suit, rank) from the player's hand.
        """
        player = self.current_turn
        done = False
        
        if self.phase == "passing":
            card = action
            assert card in self.hands[player], f"Card {card} not in hand of player {player}"
            self.passed_cards[player].append(card)
            
            # Check if this player has finished selecting their cards to pass
            if len(self.passed_cards[player]) == self.passing_count:
                self.current_turn = (self.current_turn + 1) % self.num_players
                
            # If all players have selected their cards to pass, execute the pass
            all_done = all(len(self.passed_cards[p]) == self.passing_count for p in range(self.num_players))
            if all_done:
                self._execute_passing()
                self.current_turn = 0
                if self.bidding_required:
                    self.phase = "bidding"
                else:
                    self.phase = "playing"
            return self._get_obs(self.current_turn), 0.0, done, {}
            
        if self.phase == "bidding":
            self.bids[player] = int(action)
            self.current_turn = (self.current_turn + 1) % self.num_players
            if self.current_turn == 0:
                self.phase = "playing"
            return self._get_obs(self.current_turn), 0.0, done, {}
            
        # Playing Phase
        card = action
        assert card in self.hands[player], f"Card {card} not in hand of player {player}"
        self.hands[player].remove(card)
        
        if not self.current_trick:
            self.lead_suit = card[0]
            self.trick_leader = player
            
        self.current_trick.append((player, card))
        
        # Advance turn
        self.current_turn = (self.current_turn + 1) % self.num_players
        
        # Trick complete?
        if len(self.current_trick) == self.num_players:
            winner = self._resolve_trick()
            self.tricks_won[winner] += 1
            
            # Track card points for the trick winner using card_point_rules
            for p_play, c in self.current_trick:
                for rule in self.card_point_rules:
                    if rule.get("special") == "shoot_the_moon" or rule.get("suit") == "ShootTheMoon" or rule.get("rule") == "shoot_the_moon":
                        continue
                    rule_suit = rule.get("suit", "all")
                    rule_rank = rule.get("rank", "all")
                    pts = int(rule.get("points", 0))
                    
                    suit_match = (rule_suit == "all" or c[0] == rule_suit)
                    rank_match = (rule_rank == "all" or c[1] == rule_rank)
                    
                    if suit_match and rank_match:
                        self.round_card_points[winner] += pts
            
            # Distribute trick-won or throwaway rewards to all players if in shaped mode
            if self.reward_mode == "shaped":
                for p in range(self.num_players):
                    bid = self.bids[p]
                    won = self.tricks_won[p]
                    
                    if p == winner:
                        if won <= bid:
                            self.accumulated_rewards[p] += self.reward_weights.get("trick_won", 15)
                        else:
                            # Heavy penalty for going over the bid
                            self.accumulated_rewards[p] -= self.reward_weights.get("trick_won", 15) * 1.5
                    else:
                        if won < bid:
                            self.accumulated_rewards[p] -= 2.0  # slight penalty for failing to win trick when needed
                        else:
                            self.accumulated_rewards[p] += 5.0  # reward for successfully avoiding winning / throwing off cards
            
            # Check for penalty/point cards if shaped mode is selected
            if self.reward_mode == "shaped":
                if self.card_point_rules:
                    for p_play, c in self.current_trick:
                        for rule in self.card_point_rules:
                            if rule.get("special") == "shoot_the_moon" or rule.get("suit") == "ShootTheMoon" or rule.get("rule") == "shoot_the_moon":
                                continue
                            rule_suit = rule.get("suit", "all")
                            rule_rank = rule.get("rank", "all")
                            pts = int(rule.get("points", 0))
                            
                            suit_match = (rule_suit == "all" or c[0] == rule_suit)
                            rank_match = (rule_rank == "all" or c[1] == rule_rank)
                            
                            if suit_match and rank_match:
                                multiplier = -1.0 if self.scoring_goal == "minimize" else 1.0
                                self.accumulated_rewards[winner] += pts * multiplier
                else:
                    for p, c in self.current_trick:
                        if c[0] == "Hearts" or (c[0] == "Spades" and c[1] == 12):
                            if winner == p:
                                self.accumulated_rewards[p] += self.reward_weights.get("penalty_card_taken", -10)
            
            self.current_turn = winner # winner leads next trick
            self.current_trick = []
            self.lead_suit = None
            self.tricks_played += 1
            
            if self.tricks_played == self.cards_per_player:
                self.phase = "completed"
                done = True
                self._calculate_final_scores()
                
                # Terminal game match win/loss rewards
                if self.reward_mode == "pure":
                    for p in range(self.num_players):
                        if self.scoring_type == "card_points":
                            multiplier = -1.0 if self.scoring_goal == "minimize" else 1.0
                            self.accumulated_rewards[p] += self.scores[p] * multiplier
                        else:
                            if self.tricks_won[p] == self.bids[p]:
                                self.accumulated_rewards[p] += self.reward_weights.get("terminal_win", 150)
                            else:
                                self.accumulated_rewards[p] += self.reward_weights.get("terminal_loss", -150)
                elif self.reward_mode == "zero_sum":
                    base_rewards = {}
                    for p in range(self.num_players):
                        if self.scoring_type == "card_points":
                            multiplier = -1.0 if self.scoring_goal == "minimize" else 1.0
                            base_rewards[p] = float(self.scores[p] * multiplier)
                        else:
                            if self.tricks_won[p] == self.bids[p]:
                                base_rewards[p] = float(self.reward_weights.get("terminal_win", 150))
                            else:
                                base_rewards[p] = float(self.reward_weights.get("terminal_loss", -150))
                    
                    # Compute relative reward: player_reward - mean(opponents_rewards)
                    for p in range(self.num_players):
                        opponents_rewards = [base_rewards[opp] for opp in range(self.num_players) if opp != p]
                        self.accumulated_rewards[p] += base_rewards[p] - float(np.mean(opponents_rewards))
                elif self.reward_mode == "shaped":
                    for p in range(self.num_players):
                        if self.scoring_type == "card_points":
                            multiplier = -1.0 if self.scoring_goal == "minimize" else 1.0
                            self.accumulated_rewards[p] += self.scores[p] * multiplier
                        else:
                            if self.tricks_won[p] == self.bids[p]:
                                self.accumulated_rewards[p] += self.reward_weights.get("terminal_win", 150)
                            else:
                                self.accumulated_rewards[p] += self.reward_weights.get("terminal_loss", -150)

        # Retrieve the accumulated rewards for the acting player since their last step
        reward_returned = self.accumulated_rewards[player]
        self.accumulated_rewards[player] = 0.0
        
        # If the game is done, append any remaining terminal rewards for player 0 so the agent receives them
        if done and player != 0:
            reward_returned += self.accumulated_rewards[0]
            self.accumulated_rewards[0] = 0.0

        return self._get_obs(self.current_turn), reward_returned, done, {}

    def _resolve_trick(self) -> int:
        """Determines the winner of the current trick."""
        winning_player, winning_card = self.current_trick[0]
        
        for p, card in self.current_trick[1:]:
            suit, rank = card
            win_suit, win_rank = winning_card
            
            # If current card is trump and winning card is not trump
            if self.has_trump and suit == self.trump_suit and win_suit != self.trump_suit:
                winning_player = p
                winning_card = card
            # If both are trump or both are not trump, and suits match
            elif suit == win_suit:
                if rank > win_rank:
                    winning_player = p
                    winning_card = card
                    
        return winning_player

    def _execute_passing(self):
        direction = self.passing_sequence[self.round_idx % len(self.passing_sequence)]
        if direction == "none":
            return
            
        # Remove passed cards from players' hands
        for p in range(self.num_players):
            for card in self.passed_cards[p]:
                self.hands[p].remove(card)
                
        # Determine target player for each player based on passing direction
        new_cards = {p: [] for p in range(self.num_players)}
        for p in range(self.num_players):
            dir_val = str(direction).strip().lower()
            if dir_val in ["none", "hold", "0"]:
                target = p
            elif dir_val == "left":
                target = (p + 1) % self.num_players
            elif dir_val == "right":
                target = (p - 1) % self.num_players
            elif dir_val == "across":
                target = (p + self.num_players // 2) % self.num_players
            else:
                try:
                    # Strip optional 'n' to support both raw offset and N-based formula formats
                    clean_val = dir_val.replace("n", "")
                    offset = int(clean_val)
                    target = (p + offset) % self.num_players
                except ValueError:
                    target = p
            new_cards[target].extend(self.passed_cards[p])
            
        # Add new cards to hands and sort them
        for p in range(self.num_players):
            self.hands[p].extend(new_cards[p])
            self.hands[p] = sorted(self.hands[p], key=lambda x: (x[0], x[1]))
            
        # Reset passed cards list
        self.passed_cards = {p: [] for p in range(self.num_players)}

    def _calculate_final_scores(self):
        """Calculates player scores based on bids and tricks won."""
        # Find shoot the moon rule in card point rules
        shoot_rule = None
        if self.scoring_type == "card_points" and self.card_point_rules:
            for rule in self.card_point_rules:
                if rule.get("special") == "shoot_the_moon" or rule.get("suit") == "ShootTheMoon" or rule.get("rule") == "shoot_the_moon":
                    shoot_rule = rule
                    break

        # Calculate total possible card points in the deck, excluding the shoot the moon rule itself
        total_possible_points = 0
        if self.scoring_type == "card_points" and self.card_point_rules:
            for c in self.deck:
                for rule in self.card_point_rules:
                    if rule.get("special") == "shoot_the_moon" or rule.get("suit") == "ShootTheMoon" or rule.get("rule") == "shoot_the_moon":
                        continue
                    rule_suit = rule.get("suit", "all")
                    rule_rank = rule.get("rank", "all")
                    pts = int(rule.get("points", 0))
                    
                    suit_match = (rule_suit == "all" or c[0] == rule_suit)
                    rank_match = (rule_rank == "all" or c[1] == rule_rank)
                    
                    if suit_match and rank_match:
                        total_possible_points += pts

        # Check for Shoot the Moon
        shooter = None
        shoot_penalty = 26
        if self.scoring_type == "card_points" and shoot_rule is not None and total_possible_points > 0:
            shoot_penalty = int(shoot_rule.get("points", 26))
            for p in range(self.num_players):
                if self.round_card_points[p] == total_possible_points:
                    shooter = p
                    break

        for p in range(self.num_players):
            won = self.tricks_won[p]
            bid = self.bids[p]
            rule = self.scoring_type
            
            if rule == "exact_bid_only":
                if won == bid:
                    self.scores[p] = won * self.base_points_per_trick + self.success_bonus
                else:
                    self.scores[p] = self.failure_penalty
            elif rule == "tricks_only":
                self.scores[p] = won * self.base_points_per_trick
            elif rule == "card_points":
                if shooter is not None:
                    if p == shooter:
                        self.scores[p] = 0
                        # If shaped mode, offset the trick-play card point penalties the shooter accumulated
                        if self.reward_mode == "shaped":
                            self.accumulated_rewards[p] += float(total_possible_points)
                    else:
                        self.scores[p] = shoot_penalty
                else:
                    self.scores[p] = self.round_card_points[p]
            elif rule in ["bid_matching", "bid_matching_bonus"]:
                if won == bid:
                    self.scores[p] = won * self.base_points_per_trick + self.success_bonus
                else:
                    self.scores[p] = won * self.base_points_per_trick
            elif rule == "penalty_for_undertricks":
                if won == bid:
                    self.scores[p] = won * self.base_points_per_trick + self.success_bonus
                elif won > bid:
                    self.scores[p] = won * self.base_points_per_trick
                else:  # won < bid
                    self.scores[p] = won * self.base_points_per_trick - abs(self.failure_penalty) * (bid - won)
            elif rule == "penalty_for_overtricks":
                if won == bid:
                    self.scores[p] = won * self.base_points_per_trick + self.success_bonus
                elif won < bid:
                    self.scores[p] = won * self.base_points_per_trick
                else:  # won > bid
                    self.scores[p] = won * self.base_points_per_trick - abs(self.failure_penalty) * (won - bid)
            else:
                # Fallback matching
                if won == bid:
                    self.scores[p] = won * self.base_points_per_trick + self.success_bonus
                else:
                    self.scores[p] = self.failure_penalty if self.scoring_type == "exact_bid_only" else (won * self.base_points_per_trick)
