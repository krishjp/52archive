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
  | "setup"
  | "team-creation"
  | "turn"
  | "decision"
  | "score"
  | "game-end"
  | "variant"
  | "note";

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  title: string;
  body: string;
  x: number;
  y: number;
  stageKey?: "setup" | "teams" | "turns" | "scoring" | "end" | "branch";
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
