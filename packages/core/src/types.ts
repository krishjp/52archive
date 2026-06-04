export type GameId = string;

export type GameTag =
  | "solitaire"
  | "two-player"
  | "party"
  | "strategy"
  | "speed"
  | "classic"
  | "cozy";

export type GraphNodeKind =
  | "deck-initialization"
  | "deal-phase"
  | "trump-selection"
  | "bidding-phase"
  | "trick-loop"
  | "scoring-phase"
  | "terminal-condition"
  | "note";

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  title: string;
  body: string;
  x: number;
  y: number;
  stageKey?:
    | "deck-initialization"
    | "deal-phase"
    | "trump-selection"
    | "bidding-phase"
    | "trick-loop"
    | "scoring-phase"
    | "terminal-condition"
    | "note";
  occurrence?: "once" | "per_round" | "per_turn" | "conditional";
  actor?: "system" | "player" | "team" | "ai";
  aiHint?: string;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  condition?: string;
  branchType?: "sequential" | "choice" | "conditional" | "loop";
};

export type RuleGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type Game = {
  id: GameId;
  title: string;
  subtitle: string;
  summary: string;
  minPlayers: number;
  maxPlayers: number;
  playTimeMinutes: number;
  difficulty: "easy" | "moderate" | "advanced";
  tags: GameTag[];
  needsPaperScorekeeping: boolean;
  deckCount: 1 | 2;
  graph: RuleGraph;
  featured: boolean;
};
