import os
import sys
import time
import argparse
from typing import Tuple
from game_session import GameSession

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def format_card(card: Tuple[str, int]) -> str:
    suit, rank = card
    suit_symbols = {
        "Clubs": "♣",
        "Diamonds": "♦",
        "Hearts": "♥",
        "Spades": "♠"
    }
    rank_names = {
        11: "J",
        12: "Q",
        13: "K",
        14: "A"
    }
    r_str = rank_names.get(rank, str(rank))
    symbol = suit_symbols.get(suit, suit)
    
    if suit in ["Hearts", "Diamonds"]:
        return f"\033[91m{r_str}{symbol}\033[0m" # Red
    else:
        return f"\033[90m{r_str}{symbol}\033[0m" # Gray/Black

def print_banner(title: str):
    print("=" * 60)
    print(f"  {title.upper()} - TERMINAL GAME PREVIEW")
    print("=" * 60)

def main():
    parser = argparse.ArgumentParser(description="Terminal Interactive Game Preview against AI Agents")
    parser.add_argument("--rules_yaml", type=str, default="oh_hell.yaml", help="Path to rules YAML file")
    parser.add_argument("--model_path", type=str, default=None, help="Path to trained PyTorch model weights (.pt)")
    parser.add_argument("--arch", type=str, default="mlp", choices=["mlp", "lstm", "gnn"], help="Model architecture")
    parser.add_argument("--hidden_dim", type=int, default=128, help="Model hidden dimensions")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.rules_yaml):
        fallback_yaml = os.path.join("..", args.rules_yaml)
        if os.path.exists(fallback_yaml):
            args.rules_yaml = fallback_yaml
        else:
            print(f"Error: Rules configuration '{args.rules_yaml}' not found.")
            sys.exit(1)
            
    print(f"Loading environment with rules: {args.rules_yaml}")
    session = GameSession(args.rules_yaml, model_path=args.model_path, arch=args.arch, hidden_dim=args.hidden_dim)
    
    num_rounds_available = len(session.deal_sequence)
    print_banner(session.env.title)
    print(f"Deal size sequence for this game: {session.deal_sequence}")
    
    while True:
        try:
            rounds_input = input(f"Select rounds to play (e.g., '5' for rounds 1-5, '4-12' for range) [default: 1]: ").strip()
            if not rounds_input:
                rounds_to_play_indices = [0]
                break
            
            if "-" in rounds_input:
                parts = [p.strip() for p in rounds_input.split("-")]
                if len(parts) == 2:
                    start_r = int(parts[0])
                    end_r = int(parts[1])
                    if 1 <= start_r <= end_r <= num_rounds_available:
                        rounds_to_play_indices = list(range(start_r - 1, end_r))
                        break
            else:
                n_rounds = int(rounds_input)
                if 1 <= n_rounds <= num_rounds_available:
                    rounds_to_play_indices = list(range(0, n_rounds))
                    break
        except ValueError:
            pass
        print(f"Invalid input. Please enter a number (1-{num_rounds_available}) or a range like '4-12'.")
        
    session.start_game(rounds_to_play_indices)
    
    while not session.done:
        # Run AI bids if bidding phase and it's AI turn
        ai_bid_logs = session.execute_ai_bids()
        for log in ai_bid_logs:
            print(log)
            time.sleep(0.5)
            
        # ── Bidding Phase ──
        if session.get_phase() == "bidding":
            # Must be human turn
            print(f"Your Hand: {' '.join(format_card(c) for c in session.obs['hand'])}")
            print(f"Legal bids: {session.obs['legal_moves']}")
            while True:
                try:
                    bid = int(input(f"Enter your bid (0-{session.env.cards_per_player}): "))
                    success, msg = session.human_bid(bid)
                    if success:
                        print(msg)
                        break
                except ValueError:
                    pass
                print("Invalid bid, please choose a valid integer bid.")
            continue
            
        # If we just locked in bids
        if session.env.tricks_played == 0 and len(session.env.current_trick) == 0 and session.get_phase() == "playing":
            print("\nAll bids locked in!")
            for p, b in session.env.bids.items():
                name = "You" if p == 0 else f"AI Agent {p}"
                print(f" - {name}: Bid {b} tricks")
            print("\nPress Enter to start playing tricks...")
            input()
            
        # Execute AI plays until human's turn or trick/round complete
        ai_play_logs = session.execute_ai_plays()
        
        # ── Playing Phase ──
        if session.get_phase() == "playing":
            clear_screen()
            print_banner(session.env.title)
            round_idx = session.round_indices[session.current_round_idx_of_game]
            cards_in_round = session.deal_sequence[round_idx]
            print(f"ROUND {round_idx + 1} OF {num_rounds_available} (Dealing {cards_in_round} cards)")
            print(f"Trump Suit: {format_card((session.env.trump_suit, 2)).split('2')[-1] if session.env.trump_suit else 'None'}")
            print("-" * 40)
            print("ROUND TALLY STATUS:")
            for p in range(session.env.num_players):
                name = "You" if p == 0 else f"AI Agent {p}"
                print(f" - {name}: Bid {session.env.bids[p]} | Tricks Won: {session.env.tricks_won[p]}")
            print("-" * 40)
            
            # Display current trick pile
            if session.obs["current_trick"]:
                print("\nTrick Pile:")
                for p_id, card in session.obs["current_trick"]:
                    name = "You" if p_id == 0 else f"AI Agent {p_id}"
                    print(f"  {name} played -> {format_card(card)}")
            else:
                print("\nTrick Pile is empty. Lead card required.")
                
            # Human's turn to play
            print(f"\nYour Hand:")
            for idx, c in enumerate(session.obs["hand"]):
                print(f"  [{idx}] {format_card(c)}")
                
            print(f"\nYour turn to play.")
            while True:
                try:
                    choice = int(input(f"Select card index to play: "))
                    success, msg = session.human_play(choice)
                    if success:
                        print(msg)
                        break
                except ValueError:
                    pass
                print("Invalid card selection.")
            time.sleep(1.0)
            continue
            
        # ── Round Completed ──
        if session.get_phase() == "completed":
            clear_screen()
            print_banner(session.env.title)
            round_idx = session.round_indices[session.current_round_idx_of_game]
            print(f"\nRound {round_idx + 1} completed! Scoring summary:")
            print("=" * 70)
            for p in range(session.env.num_players):
                name = "You" if p == 0 else f"AI Agent {p}"
                bid = session.env.bids[p]
                won = session.env.tricks_won[p]
                r_score = session.env.scores[p]
                status = "MATCH!" if bid == won else "MISSED"
                print(f"{name:15} | Bid: {bid} | Won: {won} | Result: {status:7} | Round Score: {r_score:3} pts | Cumulative: {session.cumulative_scores[p]:3} pts")
            print("=" * 70)
            
            if round_idx != rounds_to_play_indices[-1]:
                input("\nPress Enter to proceed to the next round...")
                session.next_round()
            else:
                # Break to finish game
                break
                
    # ── Final Scoreboard ──
    clear_screen()
    print_banner(session.env.title)
    print(f"\nGame Over! Final scoreboard after playing {len(rounds_to_play_indices)} round(s):")
    print("=" * 60)
    
    sorted_players = sorted(range(session.env.num_players), key=lambda x: session.cumulative_scores[x], reverse=True)
    for rank, p in enumerate(sorted_players):
        name = "You" if p == 0 else f"AI Agent {p}"
        score = session.cumulative_scores[p]
        medal = "🏆 " if rank == 0 else "   "
        print(f"{medal}{rank+1}. {name:15} | Final Cumulative Score: {score} pts")
    print("=" * 60)
    print("\nThank you for playing the Terminal Game Preview!")

if __name__ == "__main__":
    main()
