---
name: core-engine
description: Central TypeScript rule-graph engine, state validation, and computational tree-search game AI for card game rules.
version: 1.0.0
author: krish-patel
tags:
  - rule-engine
  - typescript
  - min-max
  - mcts
  - zod
---

# Core Rule-Graph Engine

## Overview
This skill details the architecture and mechanisms of the TypeScript rule-graph engine, which models game nodes, validates zone transitions, and evaluates offline computational game-tree searches.

## When to Use
Use when:
- Editing Zod schema definitions (`stateEngine.ts`) for game nodes, zone states, and transition actions.
- Modifying structural types (`types.ts`) or graph helper functions (`graph.ts`).
- Implementing or tweaking offline game AI strategies (Expectiminimax or Monte Carlo Tree Search) in `aiEngine.ts`.
- Building template nodes for the graph editor in `flowTemplates.ts`.

## Instructions
1. **Define Graph Structures**:
   Use `GraphNode` to define game states (e.g. `deal-phase`) and `GraphEdge` for sequential/conditional traversal links.
2. **Execute State Traversal**:
   Model zones like `playerHands`, `stockDeck`, and `discardPile` inside the `GameStateNode`. Maintain player information hiding using `CardVisibility` states.
3. **Run Expectiminimax**:
   Call `expectiminimax()` to search down the state tree, multiplying probabilities across stochastic chance nodes to determine expected utility.
4. **Run MCTS Rollouts**:
   Call `runMctsRollout()` to simulate random gameplay steps down to terminal states, back-propagating win-ratio scores.

## Output Format
- Game templates: Exported as JSON structures matching the `RuleGraph` type definition.
- AI decisions: Returns `GameTransitionEdge` selections.

## Examples
### Custom State Cloning
```typescript
import { cloneGameState } from "./stateEngine";
const newState = cloneGameState(currentState);
```

### Expectiminimax Invocation
```typescript
const { score, bestEdge } = ai.expectiminimax(
  state,
  depth,
  true,
  playerId,
  generateLegalTransitions,
  applyTransition
);
```

## Notes
- Rely on Zod schemas for all serialization and configuration checking.
