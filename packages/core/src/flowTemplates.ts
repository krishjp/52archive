import type { Game, GraphNode, RuleGraph } from "./types";

export type FlowTemplateKey =
  | "deck-initialization"
  | "deal-phase"
  | "trump-selection"
  | "bidding-phase"
  | "trick-loop"
  | "scoring-phase"
  | "terminal-condition"
  | "note";

export type FlowTemplate = {
  key: FlowTemplateKey;
  label: string;
  description: string;
};

export const flowTemplates: FlowTemplate[] = [
  {
    key: "deck-initialization",
    label: "Deck Initialization",
    description: "Define deck composition, custom cards, and shuffling rules.",
  },
  {
    key: "deal-phase",
    label: "Deal Phase",
    description: "Specify card distribution, initial hands, and deal mechanics.",
  },
  {
    key: "trump-selection",
    label: "Trump Selection",
    description: "Determine the trump suit or trump card selection process.",
  },
  {
    key: "bidding-phase",
    label: "Bidding Phase",
    description: "Define bidding rules, predictions, and contract options.",
  },
  {
    key: "trick-loop",
    label: "Trick Loop",
    description: "Handle individual trick execution, suit following, and trick resolution.",
  },
  {
    key: "scoring-phase",
    label: "Scoring Phase",
    description: "Tally points, check bids against results, and assign scores.",
  },
  {
    key: "terminal-condition",
    label: "Terminal Condition",
    description: "Define standard end-of-game checks and final victory thresholds.",
  },
  {
    key: "note",
    label: "Note",
    description: "Add annotations, developer comments, or regional rule variants.",
  },
];

export function createFlowNode(template: FlowTemplateKey, index: number, x: number, y: number): GraphNode {
  const copy: Record<FlowTemplateKey, Omit<GraphNode, "id" | "x" | "y">> = {
    "deck-initialization": {
      kind: "deck-initialization",
      title: "Initialize Deck",
      body: "Prepare a standard 52-card deck (or custom sizes) and shuffle.",
      stageKey: "deck-initialization",
      occurrence: "once",
      actor: "system",
      aiHint: "Establish the starting deck properties and randomize order.",
    },
    "deal-phase": {
      kind: "deal-phase",
      title: "Deal Cards",
      body: "Distribute cards to each active player to establish initial hands.",
      stageKey: "deal-phase",
      occurrence: "per_round",
      actor: "system",
      aiHint: "Determine hand sizes and assign cards to player zones.",
    },
    "trump-selection": {
      kind: "trump-selection",
      title: "Select Trump",
      body: "Reveal a card, rotate suits, or award trump determination to the bid winner.",
      stageKey: "trump-selection",
      occurrence: "per_round",
      actor: "system",
      aiHint: "Set the trump suit modifier for trick evaluation.",
    },
    "bidding-phase": {
      kind: "bidding-phase",
      title: "Place Bids",
      body: "Players bid predictions for the number of tricks they expect to win.",
      stageKey: "bidding-phase",
      occurrence: "per_round",
      actor: "player",
      aiHint: "Collect expectations for the round.",
    },
    "trick-loop": {
      kind: "trick-loop",
      title: "Play Tricks",
      body: "Lead card, follow suit if possible, and resolve the trick winner.",
      stageKey: "trick-loop",
      occurrence: "per_turn",
      actor: "player",
      aiHint: "Evaluate trick winner based on ranks, leads, and active trumps.",
    },
    "scoring-phase": {
      kind: "scoring-phase",
      title: "Calculate Scores",
      body: "Compare bid accuracy against tricks won and record points.",
      stageKey: "scoring-phase",
      occurrence: "per_round",
      actor: "system",
      aiHint: "Execute mathematical scoring formulas.",
    },
    "terminal-condition": {
      kind: "terminal-condition",
      title: "Determine Winner",
      body: "Tally points over all rounds to announce the winner.",
      stageKey: "terminal-condition",
      occurrence: "once",
      actor: "system",
      aiHint: "Finalize game loops and report game end.",
    },
    note: {
      kind: "note",
      title: "Rule Note",
      body: "Add context or descriptions for specific play variants.",
      stageKey: "note",
      occurrence: "conditional",
      actor: "system",
      aiHint: "Human annotation.",
    },
  };

  return {
    id: `${template}-${index}`,
    x,
    y,
    ...copy[template],
  };
}

export function buildStarterFlow(includeTeams?: boolean): RuleGraph {
  const deckInit = createFlowNode("deck-initialization", 0, 0, 0);
  const deal = createFlowNode("deal-phase", 1, 360, 0);
  const trump = createFlowNode("trump-selection", 2, 720, 0);
  const bidding = createFlowNode("bidding-phase", 3, 1080, 0);
  const trickLoop = createFlowNode("trick-loop", 4, 1440, 0);
  const scoring = createFlowNode("scoring-phase", 5, 1800, 0);
  const terminal = createFlowNode("terminal-condition", 6, 2160, 0);

  const nodes = [deckInit, deal, trump, bidding, trickLoop, scoring, terminal];
  const edges: RuleGraph["edges"] = [
    { id: "e-deck-deal", from: deckInit.id, to: deal.id, label: "deal cards", branchType: "sequential" },
    { id: "e-deal-trump", from: deal.id, to: trump.id, label: "select trump", branchType: "sequential" },
    { id: "e-trump-bidding", from: trump.id, to: bidding.id, label: "place bids", branchType: "sequential" },
    { id: "e-bidding-trick", from: bidding.id, to: trickLoop.id, label: "play tricks", branchType: "sequential" },
    { id: "e-trick-scoring", from: trickLoop.id, to: scoring.id, label: "tally scores", branchType: "sequential" },
    { id: "e-scoring-terminal", from: scoring.id, to: terminal.id, label: "check winner", branchType: "sequential" },
  ];

  return { nodes, edges };
}

export function formatGraphForClipboard(game: Game) {
  return JSON.stringify(game.graph, null, 2);
}
