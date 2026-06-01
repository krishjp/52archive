import type { Game, GraphEdge, GraphNode, GraphNodeKind, RuleGraph } from "./types";

export function createNode(kind: GraphNodeKind, title: string, body: string, x: number, y: number): GraphNode {
  return {
    id: `${kind}-${Math.random().toString(36).slice(2, 10)}`,
    kind,
    title,
    body,
    x,
    y,
  };
}

export function createEdge(from: string, to: string, label?: string, condition?: string): GraphEdge {
  return {
    id: `edge-${Math.random().toString(36).slice(2, 10)}`,
    from,
    to,
    label,
    condition,
  };
}

export function cloneGraph(graph: RuleGraph): RuleGraph {
  return {
    nodes: graph.nodes.map((node) => ({ ...node })),
    edges: graph.edges.map((edge) => ({ ...edge })),
  };
}

export function getGraphSummary(game: Game) {
  return {
    nodeCount: game.graph.nodes.length,
    edgeCount: game.graph.edges.length,
    hasVariants: game.graph.nodes.some((node) => node.kind === "variant"),
  };
}
