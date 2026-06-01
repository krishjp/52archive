import type { Game, RuleGraph } from "./types";
import { judgementGame } from "./judgement";

const sampleGraph = {
  nodes: [
    {
      id: "setup",
      kind: "setup",
      title: "Setup the table",
      body: "Shuffle one deck. Deal the opening hand and place a score sheet nearby.",
      x: 0,
      y: 0,
    },
    {
      id: "turn",
      kind: "turn",
      title: "Take a turn",
      body: "Choose from the allowed actions. Some games branch based on whether a card is held, discarded, or revealed.",
      x: 340,
      y: 0,
    },
    {
      id: "score",
      kind: "score",
      title: "Score the round",
      body: "Track points on paper after each round or at the end of play.",
      x: 680,
      y: 120,
    },
  ],
  edges: [
    { id: "e1", from: "setup", to: "turn", label: "begin" },
    { id: "e2", from: "turn", to: "score", label: "round ends" },
  ],
} satisfies RuleGraph;

export const sampleGames: Game[] = [
  {
    id: "candlelit-rummy",
    title: "Candlelit Rummy",
    subtitle: "A warm archive game with a quiet table feel.",
    summary:
      "A flexible rummy-style game with branching rule variants for score pressure, hand size, and round pacing.",
    minPlayers: 2,
    maxPlayers: 6,
    playTimeMinutes: 25,
    difficulty: "moderate",
    tags: ["classic", "cozy", "strategy"],
    needsPaperScorekeeping: true,
    deckCount: 1,
    graph: sampleGraph,
    featured: true,
  },
  judgementGame,
];
