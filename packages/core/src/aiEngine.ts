import { GameStateNode, GameTransitionEdge, YAMLGameDefinition } from "./stateEngine";

// Reward weights configuration matching the graph_definition.yaml
export interface RewardWeights {
  terminal_win: number;
  terminal_loss: number;
  trick_won: number;
  penalty_card_taken: number;
}

const defaultRewards: RewardWeights = {
  terminal_win: 100,
  terminal_loss: -100,
  trick_won: 10,
  penalty_card_taken: -5,
};

/**
 * Pure Compute Game AI Traversal Engine
 * Operates purely offline using game-tree search and Monte Carlo methods, with no LLM dependencies.
 */
export class ComputationalGameAI {
  private rewards: RewardWeights;

  constructor(customRewards?: Partial<RewardWeights>) {
    this.rewards = { ...defaultRewards, ...customRewards };
  }

  /**
   * Evaluates the immediate utility reward score of a Game State Node for a given player
   */
  public evaluateState(state: GameStateNode, playerId: string): number {
    let score = 0;

    // Terminal state scoring
    if (state.phase === "terminal-condition") {
      const hands = state.zones.playerHands;
      const handCounts = Object.entries(hands).map(([pId, cards]) => ({
        pId,
        count: cards.length,
      }));

      // In Rummy-style games: first player to empty hand wins
      const winner = handCounts.find((hc) => hc.count === 0);
      if (winner) {
        if (winner.pId === playerId) {
          score += this.rewards.terminal_win;
        } else {
          score += this.rewards.terminal_loss;
        }
      }
      return score;
    }

    // In-game trick-taking evaluation
    // Give rewards for tricks won (tracked in score or simulated table state)
    // E.g., penalty cards taken (like Hearts in Hearts game)
    const penaltyCardIds = state.zones.discardPile.filter(c => c.startsWith("H-") || c === "S-12"); // Hearts or Queen of Spades
    if (penaltyCardIds.length > 0) {
      score += penaltyCardIds.length * this.rewards.penalty_card_taken;
    }

    return score;
  }

  /**
   * Pure Compute Expectiminimax search down the state-transition tree
   * Handles both deterministic player choices and stochastic chance nodes (e.g. deals/shuffles)
   */
  public expectiminimax(
    state: GameStateNode,
    depth: number,
    isMaximizingPlayer: boolean,
    playerId: string,
    generateLegalTransitions: (s: GameStateNode) => GameTransitionEdge[],
    applyTransition: (s: GameStateNode, e: GameTransitionEdge) => GameStateNode
  ): { score: number; bestEdge: GameTransitionEdge | null } {
    
    // Base Case: depth limit or terminal node
    if (depth === 0 || state.phase === "terminal-condition") {
      return { score: this.evaluateState(state, playerId), bestEdge: null };
    }

    const legalTransitions = generateLegalTransitions(state);
    if (legalTransitions.length === 0) {
      return { score: this.evaluateState(state, playerId), bestEdge: null };
    }

    let bestEdge: GameTransitionEdge | null = null;

    if (isMaximizingPlayer) {
      let maxScore = -Infinity;
      for (const edge of legalTransitions) {
        const nextState = applyTransition(state, edge);
        
        let score = 0;
        if (edge.transitionType === "stochastic") {
          // If stochastic (chance node), compute expected utility
          const nextChoices = generateLegalTransitions(nextState);
          for (const nextEdge of nextChoices) {
            const stochasticState = applyTransition(nextState, nextEdge);
            const evaluation = this.expectiminimax(
              stochasticState,
              depth - 1,
              stochasticState.activePlayerId === playerId,
              playerId,
              generateLegalTransitions,
              applyTransition
            );
            score += nextEdge.probability * evaluation.score;
          }
        } else {
          const evaluation = this.expectiminimax(
            nextState,
            depth - 1,
            nextState.activePlayerId === playerId,
            playerId,
            generateLegalTransitions,
            applyTransition
          );
          score = evaluation.score;
        }

        if (score > maxScore) {
          maxScore = score;
          bestEdge = edge;
        }
      }
      return { score: maxScore, bestEdge };
    } else {
      let minScore = Infinity;
      for (const edge of legalTransitions) {
        const nextState = applyTransition(state, edge);
        
        let score = 0;
        if (edge.transitionType === "stochastic") {
          const nextChoices = generateLegalTransitions(nextState);
          for (const nextEdge of nextChoices) {
            const stochasticState = applyTransition(nextState, nextEdge);
            const evaluation = this.expectiminimax(
              stochasticState,
              depth - 1,
              stochasticState.activePlayerId === playerId,
              playerId,
              generateLegalTransitions,
              applyTransition
            );
            score += nextEdge.probability * evaluation.score;
          }
        } else {
          const evaluation = this.expectiminimax(
            nextState,
            depth - 1,
            nextState.activePlayerId === playerId,
            playerId,
            generateLegalTransitions,
            applyTransition
          );
          score = evaluation.score;
        }

        if (score < minScore) {
          minScore = score;
          bestEdge = edge;
        }
      }
      return { score: minScore, bestEdge };
    }
  }

  /**
   * Monte Carlo Tree Search (MCTS) selection simulation
   * Simulates rollouts of random or heuristic moves down to terminal outcomes
   */
  public runMctsRollout(
    state: GameStateNode,
    playerId: string,
    iterations: number,
    generateLegalTransitions: (s: GameStateNode) => GameTransitionEdge[],
    applyTransition: (s: GameStateNode, e: GameTransitionEdge) => GameStateNode
  ): GameTransitionEdge | null {
    const rootActions = generateLegalTransitions(state);
    if (rootActions.length === 0) return null;
    if (rootActions.length === 1) return rootActions[0];

    const actionScores = new Map<string, { wins: number; visits: number }>();
    for (const action of rootActions) {
      actionScores.set(action.id, { wins: 0, visits: 0 });
    }

    for (let i = 0; i < iterations; i++) {
      // 1. Selection & Expansion
      const selectedAction = rootActions[Math.floor(Math.random() * rootActions.length)];
      let tempState = applyTransition(state, selectedAction);

      // 2. Rollout / Simulation (using fast random play)
      let movesCount = 0;
      while (tempState.phase !== "terminal-condition" && movesCount < 100) {
        const legal = generateLegalTransitions(tempState);
        if (legal.length === 0) break;
        const randomMove = legal[Math.floor(Math.random() * legal.length)];
        tempState = applyTransition(tempState, randomMove);
        movesCount++;
      }

      // 3. Backpropagation / Scoring
      const stats = actionScores.get(selectedAction.id)!;
      const scoreResult = this.evaluateState(tempState, playerId);
      if (scoreResult > 0) {
        stats.wins += 1;
      }
      stats.visits += 1;
    }

    // Return the action that resulted in the highest win ratio
    let bestAction: GameTransitionEdge | null = null;
    let highestRatio = -1;

    for (const action of rootActions) {
      const stats = actionScores.get(action.id)!;
      const ratio = stats.visits === 0 ? 0 : stats.wins / stats.visits;
      if (ratio > highestRatio) {
        highestRatio = ratio;
        bestAction = action;
      }
    }

    return bestAction;
  }
}
