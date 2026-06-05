"use client";

import React, { useState } from "react";
import { theme } from "@52archive/ui";

interface GuideSection {
  title: string;
  description: string;
  options: {
    name: string;
    key: string;
    type: string;
    description: string;
    values?: string[];
    example: string;
  }[];
}

export default function GuidePage() {
  const [searchQuery, setSearchQuery] = useState("");

  const sections: GuideSection[] = [
    {
      title: "1. Game Metadata",
      description: "Basic branding, identification, and catalog information for the card game.",
      options: [
        {
          name: "Game Title",
          key: "name",
          type: "Text",
          description: "The official name of the game (e.g. Hearts, Spades, Oh Hell). Shown in headers, catalog, and active editor sessions.",
          example: "Hearts"
        },
        {
          name: "Subtitle",
          key: "subtitle",
          type: "Text",
          description: "A short, descriptive subtitle explaining the core hook of the game.",
          example: "Avoid Hearts & Queen of Spades"
        },
        {
          name: "Summary / Description",
          key: "summary",
          type: "Text Area",
          description: "A detailed description outlining the rules, objective, and gameplay highlights for players.",
          example: "Avoid taking point cards (Hearts and Q♠) unless you try to shoot the moon."
        }
      ]
    },
    {
      title: "2. Deck & Players",
      description: "Defines player capacities, deck configuration, and team structures.",
      options: [
        {
          name: "Deck Size",
          key: "deck_size",
          type: "Number",
          description: "The total number of cards in the playing deck. Standard deck is 52, short decks (Skat/Euchre) can be 32 or 24.",
          example: "52"
        },
        {
          name: "Player Count Range",
          key: "player_count_min / player_count_max",
          type: "Numbers",
          description: "Defines the valid number of players. For games with variable players, specify a range (e.g., 3 to 7). For exact numbers, set min and max to the same value (e.g., 4 to 4). If there is no maximum limit, leave max empty.",
          example: "Min: 3, Max: 7"
        },
        {
          name: "Team Structure",
          key: "team_structure",
          type: "Select",
          description: "Determines how players are grouped during the game.",
          values: [
            "singles: Individual players playing for themselves.",
            "fixed_partnerships: Team play with set partners (e.g., 2v2 across from each other).",
            "dynamic_partnerships: Teams are decided dynamically during bidding or card reveal."
          ],
          example: "fixed_partnerships"
        }
      ]
    },
    {
      title: "3. Card Distribution",
      description: "Controls how cards are dealt to players and managing extra cards (kitty).",
      options: [
        {
          name: "Distribution Mode",
          key: "distribution_mode",
          type: "Select",
          description: "Determines how many cards are dealt per player across game rounds.",
          values: [
            "static: Players receive a fixed, equal number of cards in every round.",
            "dynamic_sequence: The hand size changes from round to round in a specified sequence."
          ],
          example: "dynamic_sequence"
        },
        {
          name: "Cards Dealt Per Player",
          key: "cards_per_player",
          type: "Number",
          description: "Used when Distribution Mode is 'Static'. Defines the exact number of cards each player receives.",
          example: "13"
        },
        {
          name: "Deal Sequence",
          key: "deal_sequence",
          type: "Text (Comma Separated)",
          description: "Used when Distribution Mode is 'Dynamic Sequence'. Specifies a comma-separated list of hand sizes for sequential rounds. Players will receive this number of cards in round 1, round 2, etc.",
          example: "10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10"
        },
        {
          name: "Kitty Size",
          key: "kitty_size",
          type: "Number",
          description: "The number of cards set aside in the center (blind/kitty) during dealing. Often picked up by the highest bidder.",
          example: "4"
        },
        {
          name: "Starting Player Rotation Rule",
          key: "turn_selection_mode",
          type: "Select",
          description: "Defines the rule used to determine who starts bidding and leads the first trick of each round.",
          values: [
            "rotating: Standard rotating dealer sequence.",
            "most_points: The player with the highest cumulative score starts.",
            "least_points: The player with the lowest cumulative score starts."
          ],
          example: "rotating"
        }
      ]
    },
    {
      title: "4. Card Passing Phase",
      description: "Pre-round card swapping mechanics.",
      options: [
        {
          name: "Passing Enabled",
          key: "passing",
          type: "Toggle",
          description: "Enable or disable card swapping between players before play begins.",
          example: "True"
        },
        {
          name: "Passing Card Count",
          key: "passing_count",
          type: "Number",
          description: "The exact number of cards each player must choose and pass.",
          example: "3"
        },
        {
          name: "Passing Sequence",
          key: "passing_sequence",
          type: "Text (Comma Separated)",
          description: "A comma-separated sequence defining passing targets for each consecutive round. Use relative numerical offsets or named directions. Numerical offsets automatically wrap around. For instance, in a 3-player game, an offset of 4 is equivalent to 1 (left).",
          values: [
            "1 / +1 / left: Pass to the player on the left.",
            "-1 / right: Pass to the player on the right.",
            "2 / across: Pass across (or N+2).",
            "0 / none: No passing for this round."
          ],
          example: "1, -1, 2, 0"
        }
      ]
    },
    {
      title: "5. Bidding Phase",
      description: "Controls the rules for bidding before trick-taking begins.",
      options: [
        {
          name: "Bidding Enabled",
          key: "bidding_required",
          type: "Toggle",
          description: "Toggles whether players must declare bids on how many tricks they will win before playing.",
          example: "True"
        },
        {
          name: "Bidding Order",
          key: "bidding_order",
          type: "Select",
          description: "The sequence in which bids are placed.",
          values: [
            "sequential_clockwise: Players take turns bidding in clockwise order.",
            "simultaneous: All players submit bids at the same time."
          ],
          example: "sequential_clockwise"
        },
        {
          name: "Min Bid",
          key: "bid_min",
          type: "Number",
          description: "The minimum number of tricks a player is allowed to bid.",
          example: "0"
        },
        {
          name: "Max Bid",
          key: "bid_max",
          type: "Text / Number",
          description: "The maximum number of tricks a player can bid. Can be a fixed number, or the special keyword 'hand_size' to dynamically limit it to the number of cards currently held.",
          example: "hand_size"
        },
        {
          name: "Hook Dealer Rule",
          key: "hook_rule",
          type: "Toggle",
          description: "If active, the final bidder (dealer) cannot bid a number that makes the total sum of all bids equal to the number of cards dealt in that round. Prevents zero-sum scenarios where everyone could make their bid.",
          example: "True"
        }
      ]
    },
    {
      title: "6. Trump Rules",
      description: "How the trump suit is determined and selected for each round.",
      options: [
        {
          name: "Trump Mode",
          key: "trump_mode",
          type: "Select",
          description: "The mechanism used to select the trump suit.",
          values: [
            "none: No trump is used, or a single fallback suit is permanently active.",
            "fixed_rotation: The trump suit cycles through a pre-defined sequence each round.",
            "top_card_reveal: The top card of the remaining deck is flipped to determine trump.",
            "highest_bidder_decides: The winner of the bidding phase selects the trump suit."
          ],
          example: "top_card_reveal"
        },
        {
          name: "Fallback/Fixed Suit",
          key: "fallback_suit",
          type: "Select",
          description: "The suit used when Trump Mode is 'None' or when a deck runout occurs.",
          values: ["clubs", "diamonds", "hearts", "spades", "no_trump"],
          example: "no_trump"
        },
        {
          name: "Rotation Sequence",
          key: "rotation_sequence",
          type: "Text (Comma Separated)",
          description: "Used when Trump Mode is 'Fixed Rotation'. A comma-separated list of suits that will be cycled through in order (e.g. clubs, diamonds, hearts, spades).",
          example: "clubs, diamonds, hearts, spades"
        }
      ]
    },
    {
      title: "7. Play Constraints",
      description: "Restricts legal moves during trick play.",
      options: [
        {
          name: "Lead Restrictions",
          key: "lead_restrictions",
          type: "Select",
          description: "Determines restrictions on the opening lead of a trick.",
          values: [
            "any: Players can lead any card in their hand.",
            "no_trump_until_broken: Players cannot lead a trump card until trump has been broken (played on a previous trick).",
            "no_hearts_first: Hearts (or other penalty suits) cannot be led on the very first trick of a round."
          ],
          example: "no_trump_until_broken"
        },
        {
          name: "Trump Play Policy",
          key: "trump_play_policy",
          type: "Select",
          description: "Enforces how players must play trump cards when they are void of the lead suit.",
          values: [
            "optional: If a player is void of the lead suit, they can play any card (trump or off-suit).",
            "must_trump_if_void: Players must play a trump card if they are out of the lead suit.",
            "must_overtrump: Players must play a higher trump card than the current highest trump card in the trick if void of lead suit."
          ],
          example: "optional"
        }
      ]
    },
    {
      title: "8. Scoring System",
      description: "Highly custom scoring options, base rewards, and game goals.",
      options: [
        {
          name: "Scoring Rule",
          key: "scoring_rule",
          type: "Select",
          description: "The rule/formula applied at the end of each round to calculate scores.",
          values: [
            "tricks_only: Score points equal to the number of tricks won.",
            "card_points: Scores are derived from taking specific cards (e.g. Hearts/Tarot).",
            "bid_matching_bonus: Get points per trick won, plus a bonus if you match your bid exactly.",
            "exact_bid_only: Score only if you win exactly the number of tricks you bid. Otherwise get a failure penalty.",
            "penalty_for_undertricks: Penalize players who win fewer tricks than bid.",
            "penalty_for_overtricks: Penalize players who take more tricks than bid (accumulate bags)."
          ],
          example: "exact_bid_only"
        },
        {
          name: "Base Points / Trick",
          key: "base_points_per_trick",
          type: "Number",
          description: "Points awarded for each trick won during the round.",
          example: "10"
        },
        {
          name: "Success Bonus",
          key: "success_bonus",
          type: "Number",
          description: "Extra points awarded to players who successfully meet their bidding contract.",
          example: "10"
        },
        {
          name: "Failure Penalty",
          key: "failure_penalty",
          type: "Number",
          description: "Points deducted or fixed fallback score applied when failing a bid contract.",
          example: "0"
        },
        {
          name: "Scoring Goal",
          key: "scoring_goal",
          type: "Select",
          description: "Determines the objective of the game.",
          values: [
            "maximize: Players want to score the highest possible points (e.g. Spades, Oh Hell).",
            "minimize: Players want to keep their score as low as possible (e.g. Hearts)."
          ],
          example: "minimize"
        },
        {
          name: "Card Point Rules (JSON Array)",
          key: "card_point_rules",
          type: "JSON Text",
          description: "Used when Scoring Rule is 'Card Points'. Defines specific point values for specific suits and ranks. Must be a valid JSON array of rule objects.",
          example: '[\n  { "suit": "Hearts", "points": 1 },\n  { "suit": "Spades", "rank": 12, "points": 13 }\n]'
        }
      ]
    },
    {
      title: "9. Terminal Conditions",
      description: "Determines the criteria for when a game session is completed.",
      options: [
        {
          name: "Terminal Condition Type",
          key: "terminal_condition",
          type: "Select",
          description: "The condition that triggers the end of the game.",
          values: [
            "rounds_completed: The game ends after a fixed number of rounds have been played.",
            "score_threshold_reached: The game ends as soon as any player reaches or exceeds the threshold score."
          ],
          example: "score_threshold_reached"
        },
        {
          name: "Threshold Value",
          key: "terminal_threshold",
          type: "Number",
          description: "The target number of rounds or score required to end the game.",
          example: "100"
        }
      ]
    }
  ];

  // Filter sections and options based on search query
  const filteredSections = sections
    .map((section) => {
      const filteredOptions = section.options.filter(
        (opt) =>
          opt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          opt.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
          opt.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
      return { ...section, options: filteredOptions };
    })
    .filter((section) => section.options.length > 0);

  return (
    <div style={{ fontFamily: "Inter, sans-serif", padding: "40px 24px", maxWidth: 1000, margin: "0 auto" }}>
      {/* HEADER */}
      <header style={{ borderBottom: "1.5px solid rgba(35,27,21,0.08)", paddingBottom: 24, marginBottom: 32 }}>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 2.8rem)", fontWeight: 800, margin: 0, letterSpacing: "-1px", color: "#231b15" }}>
          Schema Option Reference
        </h1>
        <p style={{ color: theme.colors.muted, marginTop: 8, fontSize: 16, maxWidth: 650, lineHeight: 1.5 }}>
          A complete, interactive reference detailing every input parameter and configuration key in the Game Editor.
        </p>
      </header>

      {/* SEARCH BAR */}
      <div style={{ marginBottom: 32 }}>
        <input
          type="text"
          placeholder="Search options, keys, or descriptions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "14px 20px",
            fontSize: 16,
            borderRadius: 14,
            border: "1.5px solid rgba(35,27,21,0.12)",
            background: "#ffffff",
            outline: "none",
            boxShadow: "0 4px 20px rgba(177, 122, 75, 0.05)",
            fontFamily: "inherit"
          }}
        />
      </div>

      {/* RENDER SECTIONS */}
      {filteredSections.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          {filteredSections.map((sec, sIdx) => (
            <div key={sIdx} style={{ background: "rgba(255, 253, 250, 0.6)", border: "1px solid rgba(35,27,21,0.06)", borderRadius: 24, padding: "32px 24px", boxShadow: "0 10px 30px rgba(35,27,21,0.02)" }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px 0", color: "#b17a4b" }}>
                {sec.title}
              </h2>
              <p style={{ fontSize: 14, color: theme.colors.muted, margin: "0 0 24px 0", lineHeight: 1.5 }}>
                {sec.description}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {sec.options.map((opt, oIdx) => (
                  <div key={oIdx} style={{ borderTop: oIdx > 0 ? "1px solid rgba(35,27,21,0.06)" : "none", paddingTop: oIdx > 0 ? 24 : 0 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#231b15" }}>
                        {opt.name}
                      </h3>
                      <span style={{ fontSize: 12, background: "rgba(177, 122, 75, 0.08)", color: "#b17a4b", padding: "4px 10px", borderRadius: 20, fontWeight: 600 }}>
                        Key: <code>{opt.key}</code>
                      </span>
                    </div>

                    <p style={{ fontSize: 14, color: "#4a3c31", margin: "0 0 12px 0", lineHeight: 1.6 }}>
                      {opt.description}
                    </p>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, background: "#fffdfa", border: "1px solid rgba(35,27,21,0.04)", borderRadius: 14 }}>
                      <div style={{ fontSize: 13 }}>
                        <span style={{ fontWeight: 600, color: theme.colors.muted }}>Type:</span> <span style={{ fontFamily: "monospace", color: "#231b15" }}>{opt.type}</span>
                      </div>
                      
                      {opt.values && (
                        <div style={{ fontSize: 13 }}>
                          <span style={{ fontWeight: 600, color: theme.colors.muted, display: "block", marginBottom: 6 }}>Allowed Values / Options:</span>
                          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.5, color: "#4a3c31" }}>
                            {opt.values.map((val, vIdx) => (
                              <li key={vIdx} style={{ marginBottom: 4 }}>{val}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div style={{ fontSize: 13 }}>
                        <span style={{ fontWeight: 600, color: theme.colors.muted }}>Example Input:</span> <code style={{ color: "#b17a4b", background: "rgba(177,122,75,0.06)", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace" }}>{opt.example}</code>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "40px 0", color: theme.colors.muted }}>
          No options match your search criteria.
        </div>
      )}
    </div>
  );
}
