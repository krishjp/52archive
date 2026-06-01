import { z } from "zod";

// --- CORE ZOD SCHEMAS ---

export const GamePhaseSchema = z.enum([
  "setup",
  "deal",
  "betting",
  "draw",
  "play_action",
  "meld",
  "scoring",
  "terminal",
]);

export const ZoneStateSchema = z.object({
  playerHands: z.record(z.string(), z.array(z.string())), // player_id -> array of card_ids
  stockDeck: z.array(z.string()),
  discardPile: z.array(z.string()),
  tableState: z.array(z.string()), // community cards or current trick
});

export const CardVisibilitySchema = z.enum([
  "VISIBLE",
  "HIDDEN_OWNED_BY_SELF",
  "HIDDEN_OWNED_BY_OPPONENT",
  "HIDDEN_IN_DECK",
]);

export const VisibilityMatrixSchema = z.record(
  z.string(), // player_id
  z.record(z.string(), CardVisibilitySchema) // card_id -> visibility status
);

// Executable Game State Mechanics for compute engine
export const GameMechanicsSchema = z.object({
  type: z.enum(["trick_taking", "rummy", "meld_accumulation", "shedding", "matching"]),
  followSuit: z.boolean().default(true),
  hasTrump: z.boolean().default(false),
  trumpSelection: z.enum(["none", "random", "first_card", "bid_winner", "round_rotation", "deck_reveal"]).default("none"),
  trickResolution: z.enum(["highest_rank_lead_or_trump", "highest_rank_lead_only", "lowest_rank"]).default("highest_rank_lead_or_trump"),
  scoringType: z.enum(["bid_matching", "tricks_won_linear", "penalty_cards", "meld_points", "first_to_shed"]).default("tricks_won_linear"),
});

// High-fidelity executable State Node definition
export const GameStateNodeSchema = z.object({
  id: z.string(),
  phase: GamePhaseSchema,
  activePlayerId: z.string(),
  zones: ZoneStateSchema,
  visibilityMatrix: VisibilityMatrixSchema,
  trumpSuit: z.enum(["H", "D", "C", "S", "NT"]).optional(), // H=Hearts, D=Diamonds, C=Clubs, S=Spades, NT=No Trumps
  leadSuit: z.enum(["H", "D", "C", "S"]).optional(),
  roundNumber: z.number().int().default(1),
  maxRounds: z.number().int().default(5),
  tricksWon: z.record(z.string(), z.number()).default({}), // player_id -> tricks won
  bids: z.record(z.string(), z.number()).default({}), // player_id -> bid predict
});


export const ActionTypeSchema = z.enum([
  "deal_card",
  "play_card",
  "draw_card",
  "discard_card",
  "meld_cards",
  "bet",
  "fold",
  "pass",
]);

export const TransitionTypeSchema = z.enum(["deterministic", "stochastic"]);

// Game transition edge representing gameplay decisions or random events
export const GameTransitionEdgeSchema = z.object({
  id: z.string(),
  actionType: ActionTypeSchema,
  playerId: z.string(),
  payload: z.record(z.string(), z.string()), // e.g. { cardId: "♣-13" }
  transitionType: TransitionTypeSchema,
  probability: z.number().default(1.0),
});

// Structural schema for pure YAML definitions pushed by admin CLI
export const YAMLGameDefinitionSchema = z.object({
  schemaVersion: z.string().default("1.0.0"),
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  summary: z.string(),
  minPlayers: z.number().int().positive(),
  maxPlayers: z.number().int().positive(),
  playTimeMinutes: z.number().int().positive(),
  difficulty: z.enum(["easy", "moderate", "advanced"]),
  tags: z.array(z.string()).default([]),
  deckCount: z.union([z.literal(1), z.literal(2)]).default(1),
  needsPaperScorekeeping: z.boolean().default(true),
  mechanics: GameMechanicsSchema.default({
    type: "trick_taking",
    followSuit: true,
    hasTrump: false,
    trumpSelection: "none",
    trickResolution: "highest_rank_lead_only",
    scoringType: "tricks_won_linear",
  }),
  rules: z.object({
    rewardWeights: z.record(z.string(), z.number()).default({
      terminal_win: 100,
      terminal_loss: -100,
      trick_won: 10,
      penalty_card_taken: -5,
    }),
  }).optional(),
});

// --- TYPES DERIVED FROM SCHEMAS ---

export type GamePhase = z.infer<typeof GamePhaseSchema>;
export type ZoneState = z.infer<typeof ZoneStateSchema>;
export type CardVisibility = z.infer<typeof CardVisibilitySchema>;
export type VisibilityMatrix = z.infer<typeof VisibilityMatrixSchema>;
export type GameStateNode = z.infer<typeof GameStateNodeSchema>;
export type ActionType = z.infer<typeof ActionTypeSchema>;
export type TransitionType = z.infer<typeof TransitionTypeSchema>;
export type GameTransitionEdge = z.infer<typeof GameTransitionEdgeSchema>;
export type YAMLGameDefinition = z.infer<typeof YAMLGameDefinitionSchema>;
export type GameMechanics = z.infer<typeof GameMechanicsSchema>;

// Helper function to clone state cleanly for tree searches
export function cloneGameState(state: GameStateNode): GameStateNode {
  return {
    id: state.id,
    phase: state.phase,
    activePlayerId: state.activePlayerId,
    zones: {
      playerHands: Object.fromEntries(
        Object.entries(state.zones.playerHands).map(([pId, hand]) => [pId, [...hand]])
      ),
      stockDeck: [...state.zones.stockDeck],
      discardPile: [...state.zones.discardPile],
      tableState: [...state.zones.tableState],
    },
    visibilityMatrix: Object.fromEntries(
      Object.entries(state.visibilityMatrix).map(([pId, visMap]) => [pId, { ...visMap }])
    ),
    trumpSuit: state.trumpSuit,
    leadSuit: state.leadSuit,
    roundNumber: state.roundNumber,
    maxRounds: state.maxRounds,
    tricksWon: { ...state.tricksWon },
    bids: { ...state.bids },
  };
}
