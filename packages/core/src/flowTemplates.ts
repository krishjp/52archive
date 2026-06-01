import type { Game, GraphNode, RuleGraph } from "./types";

export type FlowTemplateKey = "setup" | "team-creation" | "turns" | "scoring" | "game-end" | "branch";

export type FlowTemplate = {
  key: FlowTemplateKey;
  label: string;
  description: string;
};

export const flowTemplates: FlowTemplate[] = [
  {
    key: "setup",
    label: "Setup",
    description: "Deal, table prep, shuffle, and initial state.",
  },
  {
    key: "team-creation",
    label: "Team creation",
    description: "Optional team assignment or seat-order grouping.",
  },
  {
    key: "turns",
    label: "Player turns",
    description: "The repeating move sequence and turn order.",
  },
  {
    key: "scoring",
    label: "Scoring",
    description: "How points are calculated and recorded.",
  },
  {
    key: "game-end",
    label: "Game end",
    description: "How the game closes and a winner is determined.",
  },
  {
    key: "branch",
    label: "Branch",
    description: "Conditional rules, variants, and alternate paths.",
  },
];

export function createFlowNode(template: FlowTemplateKey, index: number, x: number, y: number): GraphNode {
  const copy: Record<FlowTemplateKey, Omit<GraphNode, "id" | "x" | "y">> = {
    setup: {
      kind: "setup",
      title: "Set up the table",
      body: "Shuffle the deck, prepare scorekeeping, and establish the initial game state.",
      stageKey: "setup",
      occurrence: "once",
      actor: "system",
      aiHint: "AI should be able to infer setup state from the starting graph.",
    },
    "team-creation": {
      kind: "team-creation",
      title: "Create teams",
      body: "If the game uses teams, assign seats or groups before regular play begins.",
      stageKey: "teams",
      occurrence: "once",
      actor: "system",
      aiHint: "Teams can be optional and may be skipped for solo or free-for-all games.",
    },
    turns: {
      kind: "turn",
      title: "Run player turns",
      body: "Describe the loop for player actions, turn order, and legal choices.",
      stageKey: "turns",
      occurrence: "per_turn",
      actor: "player",
      aiHint: "This node should express the turn loop clearly enough for AI play.",
    },
    scoring: {
      kind: "score",
      title: "Score the round",
      body: "Track points, penalties, or bonuses based on the game rules.",
      stageKey: "scoring",
      occurrence: "per_round",
      actor: "system",
      aiHint: "Scoring should be deterministic for AI evaluation.",
    },
    "game-end": {
      kind: "game-end",
      title: "End the game",
      body: "Define the winning condition, final tally, and end-of-game checks.",
      stageKey: "end",
      occurrence: "once",
      actor: "system",
      aiHint: "This closes the flow and produces the final result.",
    },
    branch: {
      kind: "decision",
      title: "Branch rule",
      body: "Add a conditional path for variants, house rules, or alternate branches.",
      stageKey: "branch",
      occurrence: "conditional",
      actor: "player",
      aiHint: "Branches must be explicit so AI can choose valid paths.",
    },
  };

  return {
    id: `${template}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    x,
    y,
    ...copy[template],
  };
}

export function buildStarterFlow(includeTeams: boolean): RuleGraph {
  const setup = createFlowNode("setup", 0, 0, 0);
  const teams = createFlowNode("team-creation", 1, 360, 0);
  const turns = createFlowNode("turns", 2, 720, 0);
  const scoring = createFlowNode("scoring", 3, 1080, 0);
  const end = createFlowNode("game-end", 4, 1440, 0);
  const branch = createFlowNode("branch", 5, 720, 240);

  const nodes = includeTeams ? [setup, teams, turns, branch, scoring, end] : [setup, turns, branch, scoring, end];
  const edges = includeTeams
    ? ([
        { id: "e-setup-teams", from: setup.id, to: teams.id, label: "if teams", branchType: "choice" },
        { id: "e-teams-turns", from: teams.id, to: turns.id, label: "start play", branchType: "sequential" },
        { id: "e-turns-branch", from: turns.id, to: branch.id, label: "variant", branchType: "conditional" },
        { id: "e-branch-scoring", from: branch.id, to: scoring.id, label: "continue", branchType: "sequential" },
        { id: "e-scoring-end", from: scoring.id, to: end.id, label: "finish", branchType: "sequential" },
      ] satisfies RuleGraph["edges"])
    : ([
        { id: "e-setup-turns", from: setup.id, to: turns.id, label: "start play", branchType: "sequential" },
        { id: "e-turns-branch", from: turns.id, to: branch.id, label: "variant", branchType: "conditional" },
        { id: "e-branch-scoring", from: branch.id, to: scoring.id, label: "continue", branchType: "sequential" },
        { id: "e-scoring-end", from: scoring.id, to: end.id, label: "finish", branchType: "sequential" },
      ] satisfies RuleGraph["edges"]);

  return { nodes, edges };
}

export function formatGraphForClipboard(game: Game) {
  return JSON.stringify(game.graph, null, 2);
}
