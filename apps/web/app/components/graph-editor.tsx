"use client";

import { useMemo, useState, useEffect, useCallback, type CSSProperties } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { buildStarterFlow, createFlowNode, flowTemplates, type FlowTemplateKey } from "@52archive/core";
import type { Game, GraphEdge, GraphNode } from "@52archive/core";
import { theme } from "@52archive/ui";
import { toast } from "sonner";
import CozyRuleNode from "./cozy-rule-node";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("52archive_session_id");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("52archive_session_id", id); }
  return id;
}

type EditorGame = Pick<
  Game,
  | "title"
  | "subtitle"
  | "summary"
  | "minPlayers"
  | "maxPlayers"
  | "playTimeMinutes"
  | "difficulty"
  | "deckCount"
  | "needsPaperScorekeeping"
>;

type FlowGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type CardAction = "place" | "swap" | "discard" | "draw" | "reveal" | "pass";

const cardActionLabels: Record<CardAction, string> = {
  place: "Place card",
  swap: "Swap cards",
  discard: "Discard card",
  draw: "Draw card",
  reveal: "Reveal card",
  pass: "Pass turn",
};

const stageOrder: FlowTemplateKey[] = ["setup", "team-creation", "turns", "scoring", "game-end", "branch"];

// Define our custom node types for React Flow
const nodeTypes = {
  cozyRule: CozyRuleNode as any,
};

export function GraphEditor({ game }: { game: EditorGame }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  const [isTextBased, setIsTextBased] = useState(false);
  const [gameTitle, setGameTitle] = useState(game.title);
  const [gameSubtitle, setGameSubtitle] = useState(game.subtitle || "");
  const [gameSummary, setGameSummary] = useState(game.summary);
  const [minPlayers, setMinPlayers] = useState<number | "">(game.minPlayers);
  const [maxPlayers, setMaxPlayers] = useState<number | "">(game.maxPlayers ?? "");
  const [playTime, setPlayTime] = useState<number | "">(game.playTimeMinutes);
  const [needsScore, setNeedsScore] = useState(game.needsPaperScorekeeping);
  const [textRules, setTextRules] = useState(
    `### Setup\nShuffle one standard deck and initialize starting score sheet.\n\n### Dealing & Loops\nEach player is dealt cards equal to the current round number. In Round 1, deal 1 card each; in Round 10, deal 10 cards each. The game loops clockwise, increasing card count each round up to the peak (10), then decreasing back down to 1.\n\n### Round Master Suit (Trump Suit)\nAt the start of each round, a new Round Master Suit is determined. The trump suit rotates each round through Hearts (♥), Diamonds (♦), Clubs (♣), Spades (♠), and No-Trumps (NT).\n\n### Bidding\nEach player declares exactly how many tricks they aim to win in the round.\n\n### Trick Play & Evaluation\nStandard trick-taking play; players must follow the led suit if possible. Highest card of lead suit or active Trump suit wins the trick and resolves trick ownership.\n\n### Scoring\nCompare actual tricks won to player bids. Match your bid exactly to score 10 points + 1 point per trick won. Otherwise, score 0 points.`
  );

  const initialGraph = useMemo(() => buildStarterFlow(false), []);
  const [graph, setGraph] = useState<FlowGraph>(initialGraph);
  const [selectedId, setSelectedId] = useState(initialGraph.nodes[0]?.id ?? "");

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    initialGraph.nodes.map((node) => ({
      id: node.id,
      type: "cozyRule",
      position: { x: node.x, y: node.y },
      data: { ...node },
    })) as Node[]
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    initialGraph.edges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.label,
      animated: edge.branchType === "conditional",
      style: { stroke: theme.colors.accent, strokeWidth: 2 },
    })) as Edge[]
  );

  useEffect(() => {
    if (typeof window === "undefined" || !mounted) return;
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get("id");
    if (!gameId) return;

    fetch(`${API}/api/games/${gameId}`)
      .then((r) => r.json())
      .then((loadedGame: any) => {
        if (loadedGame.error) {
          toast.error("Game not found", { description: loadedGame.error });
          return;
        }
        setActiveGameId(loadedGame.id);
        setGameTitle(loadedGame.title);
        setGameSubtitle(loadedGame.subtitle || "");
        setGameSummary(loadedGame.summary);
        setMinPlayers(loadedGame.minPlayers);
        setMaxPlayers(loadedGame.maxPlayers ?? "");
        setPlayTime(loadedGame.playTimeMinutes);
        setNeedsScore(loadedGame.needsPaperScorekeeping);
        setIsTextBased(!!loadedGame.isTextBased);
        if (loadedGame.textRules) setTextRules(loadedGame.textRules);
        if (loadedGame.graph?.nodes?.length) {
          setGraph({ nodes: loadedGame.graph.nodes, edges: loadedGame.graph.edges || [] });
          setNodes(
            loadedGame.graph.nodes.map((node: any) => ({
              id: node.id, type: "cozyRule",
              position: { x: node.x, y: node.y },
              data: { ...node },
            }))
          );
          setEdges(
            (loadedGame.graph.edges || []).map((edge: any) => ({
              id: edge.id, source: edge.from, target: edge.to,
              label: edge.label,
              animated: edge.branchType === "conditional",
              style: { stroke: theme.colors.accent, strokeWidth: 2 },
            }))
          );
        }
        // Store version for optimistic lock check on save
        setGameVersion(loadedGame.version ?? 1);
        toast.info(`Loaded "${loadedGame.title}" — lock is held. Save to release it.`);
      })
      .catch(() => toast.error("Failed to load game from server"));
  }, [mounted, game]);

  const [gameVersion, setGameVersion] = useState(1);
  const [isDirty, setIsDirty] = useState(false);
  const defaultTextRules = `### Setup\nShuffle one standard deck and initialize starting score sheet.\n\n### Dealing & Loops\nEach player is dealt cards equal to the current round number. In Round 1, deal 1 card each; in Round 10, deal 10 cards each. The game loops clockwise, increasing card count each round up to the peak (10), then decreasing back down to 1.\n\n### Round Master Suit (Trump Suit)\nAt the start of each round, a new Round Master Suit is determined. The trump suit rotates each round through Hearts (♥), Diamonds (♦), Clubs (♣), Spades (♠), and No-Trumps (NT).\n\n### Bidding\nEach player declares exactly how many tricks they aim to win in the round.\n\n### Trick Play & Evaluation\nStandard trick-taking play; players must follow the led suit if possible. Highest card of lead suit or active Trump suit wins the trick and resolves trick ownership.\n\n### Scoring\nCompare actual tricks won to player bids. Match your bid exactly to score 10 points + 1 point per trick won. Otherwise, score 0 points.`;

  useEffect(() => {
    const hasMetadataChanged =
      gameTitle !== game.title ||
      gameSubtitle !== (game.subtitle || "") ||
      gameSummary !== game.summary ||
      (minPlayers === "" ? null : minPlayers) !== (game.minPlayers ?? null) ||
      (maxPlayers === "" ? null : maxPlayers) !== (game.maxPlayers ?? null) ||
      (playTime === "" ? null : playTime) !== (game.playTimeMinutes ?? null) ||
      needsScore !== game.needsPaperScorekeeping;

    const hasTextRulesChanged = textRules !== defaultTextRules;

    const hasGraphChanged =
      graph.nodes.length !== initialGraph.nodes.length ||
      graph.edges.length !== initialGraph.edges.length ||
      JSON.stringify(graph.nodes.map(n => ({ id: n.id, title: n.title, body: n.body }))) !==
      JSON.stringify(initialGraph.nodes.map(n => ({ id: n.id, title: n.title, body: n.body })));

    if (hasMetadataChanged || hasTextRulesChanged || hasGraphChanged) {
      setIsDirty(true);
    } else {
      setIsDirty(false);
    }
  }, [gameTitle, gameSubtitle, gameSummary, minPlayers, maxPlayers, playTime, needsScore, textRules, graph, initialGraph]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleBack = (e: React.MouseEvent) => {
    if (isDirty) {
      const confirmLeave = window.confirm(
        "You have unsaved changes. Going back will discard your edits. Are you sure you want to return to the home page?"
      );
      if (!confirmLeave) {
        e.preventDefault();
        return;
      }
    }
    window.location.href = "/";
  };

  const selectedNode = graph.nodes.find((node) => node.id === selectedId) ?? graph.nodes[0];
  const activeNode = selectedNode ?? graph.nodes[0];

  // Sync React Flow node positions back to our core graph structure when dragged
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      setGraph((current) => {
        const updatedNodes = current.nodes.map((node) => {
          const match = changes.find((c) => c.type === "position" && (c as any).id === node.id);
          if (match && (match as any).position) {
            return {
              ...node,
              x: (match as any).position.x,
              y: (match as any).position.y,
            };
          }
          return node;
        });
        return { ...current, nodes: updatedNodes };
      });
    },
    [onNodesChange]
  );

  // Sync edge changes back to our core graph
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
      setGraph((current) => {
        let updatedEdges = [...current.edges];
        changes.forEach((change) => {
          if (change.type === "remove") {
            updatedEdges = updatedEdges.filter((e) => e.id !== change.id);
          }
        });
        return { ...current, edges: updatedEdges };
      });
    },
    [onEdgesChange]
  );

  // Handle dynamic edge creation by drag-and-dropping handles in React Flow
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const newEdge: GraphEdge = {
        id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
        from: connection.source,
        to: connection.target,
        label: "connected",
        branchType: "sequential",
      };

      setGraph((current) => ({
        ...current,
        edges: [...current.edges, newEdge],
      }));

      setEdges((eds: Edge[]) =>
        addEdge(
          {
            ...connection,
            id: newEdge.id,
            style: { stroke: theme.colors.accent, strokeWidth: 2 },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      setEdges((els) =>
        els.map((e) =>
          e.id === oldEdge.id
            ? {
                ...e,
                source: newConnection.source || e.source,
                target: newConnection.target || e.target,
                sourceHandle: newConnection.sourceHandle || e.sourceHandle,
                targetHandle: newConnection.targetHandle || e.targetHandle,
              }
            : e
        )
      );
      setGraph((current) => ({
        ...current,
        edges: current.edges.map((e) =>
          e.id === oldEdge.id
            ? {
                ...e,
                from: newConnection.source || e.from,
                to: newConnection.target || e.to,
              }
            : e
        ),
      }));
    },
    [setEdges]
  );

  // Reset graph layout
  function resetGraph(includeTeams: boolean) {
    const next = buildStarterFlow(includeTeams);
    setGraph(next);
    setSelectedId(next.nodes[0]?.id ?? "");

    // Reset React Flow states
    setNodes(
      next.nodes.map((node) => ({
        id: node.id,
        type: "cozyRule",
        position: { x: node.x, y: node.y },
        data: { ...node },
      }))
    );
    setEdges(
      next.edges.map((edge) => ({
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label: edge.label,
        animated: edge.branchType === "conditional",
        style: { stroke: theme.colors.accent, strokeWidth: 2 },
      }))
    );
  }

  // Update a single node property and sync it to the React Flow node data properties
  function updateNode(id: string, patch: Partial<GraphNode>) {
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
    }));

    setNodes((rfNodes: Node[]) =>
      rfNodes.map((n: Node) => {
        if (n.id === id) {
          return {
            ...n,
            data: { ...n.data, ...patch },
          };
        }
        return n;
      })
    );
  }

  // Add card action as a child note connected to a turns stage node
  function addCardAction(fromId: string, actionType: CardAction) {
    const sourceNode = graph.nodes.find((n) => n.id === fromId);
    if (!sourceNode) return;

    const actionId = `action-${sourceNode.id}-${actionType}-${Date.now()}`;
    const newX = sourceNode.x + 280;
    const newY = sourceNode.y + 100;

    const actionNode: GraphNode = {
      id: actionId,
      kind: "note",
      title: cardActionLabels[actionType],
      body: `Player ${actionType === "swap" ? "swaps cards" : actionType === "place" ? "places card" : actionType === "discard" ? "discards card" : actionType === "draw" ? "draws card" : actionType === "reveal" ? "reveals card" : "passes their turn"}`,
      x: newX,
      y: newY,
      stageKey: "turns",
      occurrence: "per_turn",
      actor: "player",
      aiHint: `The player can ${actionType} at this point`,
    };

    const newEdge: GraphEdge = {
      id: `edge-${sourceNode.id}-${actionId}`,
      from: sourceNode.id,
      to: actionId,
      label: actionType,
      branchType: "sequential",
    };

    setGraph((current) => ({
      nodes: [...current.nodes, actionNode],
      edges: [...current.edges, newEdge],
    }));

    setNodes((currentNodes: Node[]) => [
      ...currentNodes,
      {
        id: actionId,
        type: "cozyRule",
        position: { x: newX, y: newY },
        data: { ...actionNode },
      },
    ]);

    setEdges((currentEdges: Edge[]) => [
      ...currentEdges,
      {
        id: newEdge.id,
        source: sourceNode.id,
        target: actionId,
        label: actionType,
        style: { stroke: theme.colors.accent, strokeWidth: 2 },
      },
    ]);

    setSelectedId(actionId);
  }

  // Insert a new node, shifting right as necessary to avoid collision
  function addNode(template: FlowTemplateKey, afterId?: string) {
    const index = graph.nodes.length;
    let x = index * 260 + 50;
    let y = template === "branch" ? 250 : 50;

    if (afterId) {
      const source = graph.nodes.find((n) => n.id === afterId);
      if (source) {
        x = source.x + 280;
        y = source.y;
      }
    }

    const node = createFlowNode(template, index, x, y);
    const prevNode = graph.nodes[graph.nodes.length - 1];

    const newEdge: GraphEdge | null = prevNode
      ? {
          id: `edge-${prevNode.id}-${node.id}`,
          from: prevNode.id,
          to: node.id,
          label: template === "branch" ? "branch" : "next",
          branchType: template === "branch" ? "conditional" : "sequential",
        }
      : null;

    setGraph((current) => ({
      nodes: [...current.nodes, node],
      edges: newEdge ? [...current.edges, newEdge] : current.edges,
    }));

    setNodes((currentNodes: Node[]) => [
      ...currentNodes,
      {
        id: node.id,
        type: "cozyRule",
        position: { x, y },
        data: { ...node },
      },
    ]);

    if (newEdge) {
      setEdges((currentEdges: Edge[]) => [
        ...currentEdges,
        {
          id: newEdge.id,
          source: newEdge.from,
          target: newEdge.to,
          label: newEdge.label,
          animated: newEdge.branchType === "conditional",
          style: { stroke: theme.colors.accent, strokeWidth: 2 },
        },
      ]);
    }

    setSelectedId(node.id);
  }

  // Add conditional branching from the selected node
  function addBranch(fromId: string) {
    const sourceNode = graph.nodes.find((n) => n.id === fromId);
    if (!sourceNode) return;

    const existing = graph.nodes.filter((n) => graph.edges.some((e) => e.from === fromId && e.to === n.id));
    const idx = existing.length;
    const branchX = sourceNode.x + 140 + idx * 300;
    const branchY = sourceNode.y + 200 + Math.floor(idx / 3) * 20;

    const branch = createFlowNode("branch", graph.nodes.length, branchX, branchY);
    const newEdge: GraphEdge = {
      id: `edge-${sourceNode.id}-${branch.id}`,
      from: sourceNode.id,
      to: branch.id,
      label: "branch",
      branchType: "conditional",
    };

    setGraph((current) => ({
      nodes: [...current.nodes, branch],
      edges: [...current.edges, newEdge],
    }));

    setNodes((currentNodes: Node[]) => [
      ...currentNodes,
      {
        id: branch.id,
        type: "cozyRule",
        position: { x: branchX, y: branchY },
        data: { ...branch },
      },
    ]);

    setEdges((currentEdges: Edge[]) => [
      ...currentEdges,
      {
        id: newEdge.id,
        source: sourceNode.id,
        target: branch.id,
        label: "branch",
        animated: true,
        style: { stroke: theme.colors.accent, strokeWidth: 2 },
      },
    ]);

    setSelectedId(branch.id);
  }

  // Add a specific branch condition node
  function addBranchCondition(fromId: string) {
    const sourceNode = graph.nodes.find((n) => n.id === fromId);
    if (!sourceNode || sourceNode.stageKey !== "branch") return;

    const outgoing = graph.edges.filter((e) => e.from === fromId);
    const idx = outgoing.length;
    const targetX = sourceNode.x + 140 + idx * 300;
    const targetY = sourceNode.y + 200 + Math.floor(idx / 3) * 20;

    const target: GraphNode = {
      id: `note-${graph.nodes.length}-${Math.random().toString(36).slice(2, 7)}`,
      kind: "note",
      title: `Condition Target`,
      body: "Add logic requirements for this branch condition.",
      stageKey: "branch",
      occurrence: "conditional",
      actor: "system",
      x: targetX,
      y: targetY,
    };
    const newEdge: GraphEdge = {
      id: `edge-${sourceNode.id}-${target.id}-${Date.now()}`,
      from: sourceNode.id,
      to: target.id,
      label: `condition_${outgoing.length + 1}`,
      branchType: "conditional",
    };

    setGraph((current) => ({
      nodes: [...current.nodes, target],
      edges: [...current.edges, newEdge],
    }));

    setNodes((currentNodes: Node[]) => [
      ...currentNodes,
      {
        id: target.id,
        type: "cozyRule",
        position: { x: targetX, y: targetY },
        data: { ...target },
      },
    ]);

    setEdges((currentEdges: Edge[]) => [
      ...currentEdges,
      {
        id: newEdge.id,
        source: sourceNode.id,
        target: target.id,
        label: newEdge.label,
        animated: true,
        style: { stroke: theme.colors.accent, strokeWidth: 2 },
      },
    ]);

    setSelectedId(target.id);
  }

  // Remove an edge connection
  function removeEdge(edgeId: string) {
    setGraph((current) => ({
      ...current,
      edges: current.edges.filter((e) => e.id !== edgeId),
    }));
    setEdges((eds: Edge[]) => eds.filter((e) => e.id !== edgeId));
  }

  // Remove a node and cascading edges
  function removeNode(nodeId: string) {
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.filter((n) => n.id !== nodeId),
      edges: current.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
    }));
    setNodes((nds: Node[]) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds: Edge[]) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedId === nodeId) setSelectedId("");
  }

  if (!mounted) {
    return (
      <div
        style={{
          minHeight: 720,
          display: "grid",
          placeItems: "center",
          background: "linear-gradient(180deg, #fffdf8 0%, #f4eadc 100%)",
          borderRadius: 32,
          border: `1px solid ${theme.colors.border}`,
          boxShadow: theme.shadow,
        }}
      >
        <p style={{ color: theme.colors.muted, fontSize: 16 }}>Loading graph editor canvas...</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Page-level Back button and dirty warning */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 4 }}>
        <button
          onClick={handleBack}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            borderRadius: 999,
            background: "#ffffff",
            border: `1px solid ${theme.colors.border}`,
            color: theme.colors.text,
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(35, 27, 21, 0.04)",
            transition: "background 0.2s ease, transform 0.1s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#fffdfa")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
        >
          ← Back to Home
        </button>
        {isDirty && (
          <span style={{ fontSize: 13, color: "#b06b34", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <span>⚠️</span> Unsaved work will be wiped if you navigate away!
          </span>
        )}
      </div>

      <section
        style={{
          borderRadius: 32,
          border: `1px solid ${theme.colors.border}`,
          background: "linear-gradient(180deg, #fffdf8 0%, #f4eadc 100%)",
          boxShadow: theme.shadow,
          overflow: "hidden",
        }}
      >
        {/* Visual Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            padding: 24,
            borderBottom: `1px solid ${theme.colors.border}`,
            alignItems: "start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                color: theme.colors.accent,
                textTransform: "uppercase",
                letterSpacing: 2,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Add a game
            </p>
            <h2 style={{ margin: "8px 0 6px", fontSize: 30, fontWeight: 800 }}>{game.title}</h2>
            <p style={{ margin: 0, maxWidth: 680, color: theme.colors.muted, lineHeight: 1.6 }}>
              Define the game as a branched flow: setup, optional teams, turns, scoring, and game end. Double-click to focus on details, drag connections, or select stages.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {!isTextBased && (
              <button
                type="button"
                style={{
                  ...pillButton(),
                  background: "#2e7d32",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 700,
                  boxShadow: "0 4px 12px rgba(46, 125, 50, 0.25)",
                }}
                onClick={async () => {
                  if (!gameTitle.trim()) {
                    toast.error("Validation error", { description: "Game Title is required." });
                    return;
                  }
                  if (minPlayers === "" || minPlayers <= 0) {
                    toast.error("Validation error", { description: "Minimum Players must be at least 1." });
                    return;
                  }
                  if (playTime === "" || playTime <= 0) {
                    toast.error("Validation error", { description: "Playtime must be at least 1 minute." });
                    return;
                  }
                  if (maxPlayers !== "" && Number(maxPlayers) < Number(minPlayers)) {
                    toast.error("Validation error", { description: "Maximum Players cannot be less than Minimum Players." });
                    return;
                  }

                  setIsDirty(false);
                  const sessionId = getSessionId();
                  const graphPayload = { nodes: graph.nodes, edges: graph.edges };
                  const finalMinPlayers = Number(minPlayers);
                  const finalMaxPlayers = maxPlayers === "" ? null : Number(maxPlayers);
                  const finalPlayTime = Number(playTime);

                  if (activeGameId) {
                    // Existing game — PUT to update
                    const res = await fetch(`${API}/api/games/${activeGameId}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        sessionId,
                        version: gameVersion,
                        graph: graphPayload,
                        title: gameTitle,
                        subtitle: gameSubtitle,
                        summary: gameSummary,
                        minPlayers: finalMinPlayers,
                        maxPlayers: finalMaxPlayers,
                        playTimeMinutes: finalPlayTime,
                        needsPaperScorekeeping: needsScore,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      toast.error("Save failed", { description: data.error });
                      return;
                    }
                    toast.success("Graph Game Saved!", {
                      description: `"${gameTitle}" saved with ${graph.nodes.length} nodes. Lock released.`,
                    });
                  } else {
                    // New game — POST to create
                    const newId = `custom-${gameTitle.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;
                    const res = await fetch(`${API}/api/games`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        id: newId, title: gameTitle, subtitle: gameSubtitle, summary: gameSummary,
                        minPlayers: finalMinPlayers, maxPlayers: finalMaxPlayers, playTimeMinutes: finalPlayTime,
                        difficulty: "moderate", needsPaperScorekeeping: needsScore,
                        deckCount: 1, tags: ["custom", "graph-based"], isTextBased: false,
                        graph: graphPayload,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      toast.error("Create failed", { description: data.error });
                      return;
                    }
                    toast.success("Graph Game Created!", {
                      description: `"${gameTitle}" added to the catalog.`,
                    });
                  }
                  // Return to catalog — lock is released server-side on PUT
                  window.location.href = "/games";
                }}
              >
                Save Graph
              </button>
            )}
            <button
              type="button"
              style={{
                ...pillButton(),
                background: !isTextBased ? theme.colors.accent : theme.colors.surfaceRaised,
                color: !isTextBased ? "#ffffff" : theme.colors.text,
              }}
              onClick={() => setIsTextBased(false)}
            >
              Graph Editor
            </button>
            <button
              type="button"
              style={{
                ...pillButton(),
                background: isTextBased ? theme.colors.accent : theme.colors.surfaceRaised,
                color: isTextBased ? "#ffffff" : theme.colors.text,
              }}
              onClick={() => setIsTextBased(true)}
            >
              Simple Text Rules
            </button>
          </div>
        </div>

      <div
        style={{
          padding: 12,
          background: "rgba(214, 176, 138, 0.08)",
          borderBottom: `1px solid ${theme.colors.border}`,
          fontSize: 12,
          color: theme.colors.muted,
        }}
      >
        {isTextBased ? (
          <div>
            <strong style={{ color: theme.colors.text }}>Catalog Mode:</strong> Documenting game rules using free-form text. These catalog-only games are not playable by AI agents.
          </div>
        ) : (
          <div>
            <strong style={{ color: theme.colors.text }}>Canvas controls:</strong> Touch-drag to pan • Cmd/Ctrl + Scroll to zoom • Drag connection handles to link rules • Click a card to edit properties
          </div>
        )}
      </div>

      {/* Editor Grid containing Sidebars and React Flow Canvas */}
      {isTextBased ? (
        <div style={{ padding: 40, maxWidth: 800, margin: "0 auto", display: "grid", gap: 24, width: "100%", boxSizing: "border-box" }}>
          <div style={{ borderBottom: `1px solid ${theme.colors.border}`, paddingBottom: 16 }}>
            <h3 style={{ fontSize: 24, margin: "0 0 8px", fontWeight: 800 }}>Game Metadata & Text Rules</h3>
            <p style={{ color: theme.colors.muted, margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              Type standard, plain-text instructions and descriptions of the game flow directly. This text-only description is for catalog records and is not compatible with pure-compute AI simulations.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <Field label="Game Title">
              <input value={gameTitle} onChange={(e) => setGameTitle(e.target.value)} style={inputStyle()} />
            </Field>
            <Field label="Subtitle">
              <input value={gameSubtitle} onChange={(e) => setGameSubtitle(e.target.value)} style={inputStyle()} />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <Field label="Min Players">
              <input
                type="number"
                value={minPlayers}
                onChange={(e) => {
                  const val = e.target.value;
                  setMinPlayers(val === "" ? "" : parseInt(val));
                }}
                style={inputStyle()}
              />
            </Field>
            <Field label="Max Players">
              <input
                type="number"
                value={maxPlayers}
                placeholder="+"
                onChange={(e) => {
                  const val = e.target.value;
                  setMaxPlayers(val === "" ? "" : parseInt(val));
                }}
                style={inputStyle()}
              />
            </Field>
            <Field label="Playtime (mins)">
              <input
                type="number"
                value={playTime}
                onChange={(e) => {
                  const val = e.target.value;
                  setPlayTime(val === "" ? "" : parseInt(val));
                }}
                style={inputStyle()}
              />
            </Field>
          </div>

          <Field label="Plain-Text Rules & Instructions">
            <textarea
              value={textRules}
              onChange={(e) => setTextRules(e.target.value)}
              style={{ ...textareaStyle(), minHeight: 280, lineHeight: 1.6 }}
              placeholder="1. Set up by shuffling the deck...\n2. Deal 7 cards to each player...\n3. Clockwise play..."
            />
          </Field>

          <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
            <button
              type="button"
              style={{
                padding: "14px 24px",
                borderRadius: 16,
                background: theme.colors.accent,
                color: "#ffffff",
                border: "none",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(159, 108, 63, 0.25)",
              }}
              onClick={async () => {
                if (!gameTitle.trim()) {
                  toast.error("Validation error", { description: "Game Title is required." });
                  return;
                }
                if (minPlayers === "" || minPlayers <= 0) {
                  toast.error("Validation error", { description: "Minimum Players must be at least 1." });
                  return;
                }
                if (playTime === "" || playTime <= 0) {
                  toast.error("Validation error", { description: "Playtime must be at least 1 minute." });
                  return;
                }
                if (maxPlayers !== "" && Number(maxPlayers) < Number(minPlayers)) {
                  toast.error("Validation error", { description: "Maximum Players cannot be less than Minimum Players." });
                  return;
                }

                setIsDirty(false);
                const sessionId = getSessionId();
                const graphPayload = { nodes: [], edges: [], textRules };
                const finalMinPlayers = Number(minPlayers);
                const finalMaxPlayers = maxPlayers === "" ? null : Number(maxPlayers);
                const finalPlayTime = Number(playTime);

                if (activeGameId) {
                  // Existing game — PUT to update
                  const res = await fetch(`${API}/api/games/${activeGameId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      sessionId,
                      version: gameVersion,
                      graph: graphPayload,
                      title: gameTitle,
                      subtitle: gameSubtitle,
                      summary: gameSummary,
                      minPlayers: finalMinPlayers,
                      maxPlayers: finalMaxPlayers,
                      playTimeMinutes: finalPlayTime,
                      needsPaperScorekeeping: needsScore,
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    toast.error("Save failed", { description: data.error });
                    return;
                  }
                  toast.success("Text Game Saved!", {
                    description: `"${gameTitle}" saved. Lock released.`,
                  });
                } else {
                  // New game — POST to create
                  const newId = `custom-${gameTitle.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;
                  const res = await fetch(`${API}/api/games`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      id: newId, title: gameTitle, subtitle: gameSubtitle, summary: gameSummary,
                      minPlayers: finalMinPlayers, maxPlayers: finalMaxPlayers, playTimeMinutes: finalPlayTime,
                      difficulty: "moderate", needsPaperScorekeeping: needsScore,
                      deckCount: 1, tags: ["custom", "text-based"], isTextBased: true,
                      textRules,
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    toast.error("Create failed", { description: data.error });
                    return;
                  }
                  toast.success("Text Game Created!", {
                    description: `"${gameTitle}" added to the catalog.`,
                  });
                }
                window.location.href = "/games";
              }}
            >
              Save Text Game Definition
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "280px minmax(0, 1fr) 300px", minHeight: 720 }}>
          {/* Left Library */}
          <aside
            style={{
              padding: 20,
              borderRight: `1px solid ${theme.colors.border}`,
              background: "rgba(255,255,255,0.5)",
              overflowY: "auto",
              maxHeight: 720,
            }}
          >
            {/* Collapsible Game Settings */}
            <details open style={{ marginBottom: 20, borderBottom: `1px solid ${theme.colors.border}`, paddingBottom: 20 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 15, color: theme.colors.accent, outline: "none", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>⚙️ Game Identity</span>
                <span style={{ fontSize: 10 }}>▼</span>
              </summary>
              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                <Field label="Game Title">
                  <input
                    value={gameTitle}
                    onChange={(e) => setGameTitle(e.target.value)}
                    style={{ ...inputStyle(), padding: "8px 10px", borderRadius: 10, fontSize: 13 }}
                  />
                </Field>
                <Field label="Subtitle">
                  <input
                    value={gameSubtitle}
                    onChange={(e) => setGameSubtitle(e.target.value)}
                    style={{ ...inputStyle(), padding: "8px 10px", borderRadius: 10, fontSize: 13 }}
                  />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Field label="Min Players">
                    <input
                      type="number"
                      value={minPlayers}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMinPlayers(val === "" ? "" : parseInt(val));
                      }}
                      style={{ ...inputStyle(), padding: "8px 10px", borderRadius: 10, fontSize: 13 }}
                    />
                  </Field>
                  <Field label="Max Players">
                    <input
                      type="number"
                      value={maxPlayers}
                      placeholder="+"
                      onChange={(e) => {
                        const val = e.target.value;
                        setMaxPlayers(val === "" ? "" : parseInt(val));
                      }}
                      style={{ ...inputStyle(), padding: "8px 10px", borderRadius: 10, fontSize: 13 }}
                    />
                  </Field>
                </div>
                <Field label="Playtime (mins)">
                  <input
                    type="number"
                    value={playTime}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPlayTime(val === "" ? "" : parseInt(val));
                    }}
                    style={{ ...inputStyle(), padding: "8px 10px", borderRadius: 10, fontSize: 13 }}
                  />
                </Field>
              </div>
            </details>

            <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Stage library</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {stageOrder.map((key) => {
                const template = flowTemplates.find((item) => item.key === key)!;
                return (
                  <button
                    type="button"
                    key={key}
                    style={libraryButton()}
                    onClick={() => addNode(key, selectedId || undefined)}
                    title={template.description}
                  >
                    <div style={{ fontWeight: 700 }}>{template.label}</div>
                    <div style={{ fontSize: 11, color: theme.colors.muted, lineHeight: 1.35, marginTop: 2 }}>
                      {template.description}
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                marginTop: 24,
                padding: 14,
                borderRadius: 18,
                background: theme.colors.paper,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                  color: theme.colors.muted,
                  fontWeight: 700,
                }}
              >
                Game fit
              </div>
              <div style={{ marginTop: 8, lineHeight: 1.6, color: theme.colors.text, fontSize: 13 }}>
                {game.minPlayers}-{game.maxPlayers} players
                <br />
                {game.playTimeMinutes} min
                <br />
                {game.needsPaperScorekeeping ? "Paper scorekeeping" : "No score sheet"}
              </div>
            </div>
          </aside>

          {/* React Flow Core Interactive Canvas */}
<div
            style={{
              position: "relative",
              minHeight: 720,
              background:
                "radial-gradient(circle at 50% 20%, rgba(214, 176, 138, 0.05), transparent 26%), linear-gradient(180deg, rgba(255,255,255,0.2), rgba(244,234,220,0.4))",
            }}
          >
            {(() => {
              const styledEdges = edges.map((edge) => {
                const srcNode = nodes.find((n) => n.id === edge.source);
                const isSourceBranch = srcNode?.data?.kind === "decision";
                return {
                  ...edge,
                  style: {
                    stroke: theme.colors.accent,
                    strokeWidth: 2,
                    strokeDasharray: isSourceBranch ? "5,5" : undefined,
                  },
                };
              });

              return (
                <ReactFlow
                  nodes={nodes}
                  edges={styledEdges}
                  onNodesChange={handleNodesChange}
                  onEdgesChange={handleEdgesChange}
                  onConnect={onConnect}
                  onReconnect={onReconnect}
                  nodeTypes={nodeTypes}
                  onNodeClick={(_event: any, node: Node) => setSelectedId(node.id)}
                  fitView
                  style={{ width: "100%", height: "100%" }}
                >
                  <Controls style={{ left: 16, bottom: 16 }} />
                  <MiniMap zoomable pannable style={{ background: "#fcfaf7", borderRadius: 12, border: `1px solid ${theme.colors.border}` }} />
                  <Background color="#b17a4b" gap={20} size={1} style={{ opacity: 0.08 }} />
                </ReactFlow>
              );
            })()}
          </div>

          {/* Right Properties Panel */}
          <aside
            style={{
              padding: 20,
              borderLeft: `1px solid ${theme.colors.border}`,
              background: "rgba(255,255,255,0.62)",
              overflow: "auto",
              maxHeight: 720,
            }}
          >
            <h3 style={{ marginTop: 0, fontSize: 18, fontWeight: 700 }}>Selected stage</h3>
            {activeNode ? (
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="Title">
                  <input
                    value={activeNode.title}
                    onChange={(e) => updateNode(activeNode.id, { title: (e.target as HTMLInputElement).value })}
                    style={inputStyle()}
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    value={activeNode.body}
                    onChange={(e) => updateNode(activeNode.id, { body: (e.target as HTMLTextAreaElement).value })}
                    style={textareaStyle()}
                  />
                </Field>
                <Field label="Stage">
                  <select
                    value={activeNode.stageKey ?? "branch"}
                    onChange={(e) =>
                      updateNode(activeNode.id, {
                        stageKey: (e.target as HTMLSelectElement).value as GraphNode["stageKey"],
                      })
                    }
                    style={inputStyle()}
                  >
                    <option value="setup">Setup</option>
                    <option value="teams">Team creation</option>
                    <option value="turns">Player turns</option>
                    <option value="scoring">Scoring</option>
                    <option value="end">Game end</option>
                    <option value="branch">Branch</option>
                  </select>
                </Field>
                <Field label="Occurrence">
                  <select
                    value={activeNode.occurrence ?? "once"}
                    onChange={(e) =>
                      updateNode(activeNode.id, {
                        occurrence: (e.target as HTMLSelectElement).value as GraphNode["occurrence"],
                      })
                    }
                    style={inputStyle()}
                  >
                    <option value="once">Once</option>
                    <option value="per_round">Per round</option>
                    <option value="per_turn">Per turn</option>
                    <option value="conditional">Conditional</option>
                  </select>
                </Field>
                <Field label="Actor">
                  <select
                    value={activeNode.actor ?? "system"}
                    onChange={(e) =>
                      updateNode(activeNode.id, { actor: (e.target as HTMLSelectElement).value as GraphNode["actor"] })
                    }
                    style={inputStyle()}
                  >
                    <option value="system">System</option>
                    <option value="player">Player</option>
                    <option value="team">Team</option>
                    <option value="ai">AI</option>
                  </select>
                </Field>
                <Field label="AI hint">
                  <textarea
                    value={activeNode.aiHint ?? ""}
                    onChange={(e) => updateNode(activeNode.id, { aiHint: (e.target as HTMLTextAreaElement).value })}
                    style={textareaStyle()}
                    placeholder="How an AI can reason about this node"
                  />
                </Field>

                {activeNode.stageKey === "turns" && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${theme.colors.border}` }}>
                    <p
                      style={{
                        margin: "0 0 12px",
                        fontSize: 11,
                        letterSpacing: 2,
                        textTransform: "uppercase",
                        color: theme.colors.muted,
                        fontWeight: 700,
                      }}
                    >
                      Card actions
                    </p>
                    <div style={{ display: "grid", gap: 8 }}>
                      {(["place", "swap", "discard", "draw", "reveal", "pass"] as CardAction[]).map((action) => (
                        <button
                          key={action}
                          type="button"
                          onClick={() => addCardAction(activeNode.id, action)}
                          style={{
                            border: `1px solid ${theme.colors.border}`,
                            background: theme.colors.surfaceRaised,
                            color: theme.colors.text,
                            borderRadius: 12,
                            padding: "10px 12px",
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 600,
                            textAlign: "left",
                          }}
                        >
                          + {cardActionLabels[action]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeNode.stageKey === "branch" && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${theme.colors.border}` }}>
                    <p
                      style={{
                        margin: "0 0 12px",
                        fontSize: 11,
                        letterSpacing: 2,
                        textTransform: "uppercase",
                        color: theme.colors.muted,
                        fontWeight: 700,
                      }}
                    >
                      Branch conditions
                    </p>
                    <div style={{ display: "grid", gap: 8 }}>
                      {graph.edges
                        .filter((e) => e.from === activeNode.id)
                        .map((edge) => {
                          const target = graph.nodes.find((n) => n.id === edge.to);
                          return (
                            <div
                              key={edge.id}
                              style={{
                                display: "flex",
                                gap: 6,
                                alignItems: "center",
                                padding: "6px 8px",
                                background: theme.colors.surfaceRaised,
                                borderRadius: 8,
                              }}
                            >
                              <span style={{ flex: 1, fontSize: 11, color: theme.colors.text, fontWeight: 500 }}>
                                → {target?.title ?? "unknown"}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeEdge(edge.id)}
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  color: theme.colors.muted,
                                  padding: 0,
                                  cursor: "pointer",
                                  fontSize: 10,
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                    </div>
                    <button
                      type="button"
                      onClick={() => addBranchCondition(activeNode.id)}
                      style={{
                        marginTop: 8,
                        border: `1px solid ${theme.colors.border}`,
                        background: theme.colors.surfaceRaised,
                        color: theme.colors.text,
                        borderRadius: 12,
                        padding: "10px 12px",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                        width: "100%",
                      }}
                    >
                      + Add condition
                    </button>
                  </div>
                )}

                <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${theme.colors.border}` }}>
                  <button
                    type="button"
                    onClick={() => removeNode(activeNode.id)}
                    style={{
                      border: `1px solid ${theme.colors.border}`,
                      background: "#fff5f5",
                      color: "#d94444",
                      borderRadius: 12,
                      padding: "10px 12px",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      width: "100%",
                    }}
                  >
                    Delete node
                  </button>
                </div>
              </div>
            ) : null}

            <div
              style={{
                marginTop: 24,
                padding: 14,
                borderRadius: 18,
                background: theme.colors.paper,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                  color: theme.colors.muted,
                  fontWeight: 700,
                }}
              >
                Flow summary
              </div>
              <div style={{ marginTop: 8, lineHeight: 1.6, fontSize: 13 }}>
                {graph.nodes.length} nodes
                <br />
                {graph.edges.length} connections
                <br />
                {graph.nodes.some((node) => node.actor === "ai") ? "AI-friendly" : "AI hints editable"}
              </div>
            </div>

            <details style={{ marginTop: 20 }}>
              <summary style={{ cursor: "pointer", color: theme.colors.accent, fontWeight: 700 }}>
                Serialized graph
              </summary>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: theme.colors.muted, lineHeight: 1.45 }}>
                {JSON.stringify(graph, null, 2)}
              </pre>
            </details>
          </aside>
        </div>
      )}
    </section>
  </div>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span
        style={{
          fontSize: 11,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: theme.colors.muted,
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function pillButton(): CSSProperties {
  return {
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surfaceRaised,
    color: theme.colors.text,
    borderRadius: 999,
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: 600,
  };
}

function libraryButton(): CSSProperties {
  return {
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surfaceRaised,
    color: theme.colors.text,
    borderRadius: 18,
    padding: 14,
    textAlign: "left",
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(35, 27, 21, 0.05)",
    width: "100%",
  };
}

function inputStyle(): CSSProperties {
  return {
    width: "100%",
    borderRadius: 14,
    border: `1px solid ${theme.colors.border}`,
    background: "#fffdf8",
    padding: "12px 14px",
    color: theme.colors.text,
    font: "inherit",
    boxSizing: "border-box",
  };
}

function textareaStyle(): CSSProperties {
  return {
    ...inputStyle(),
    minHeight: 100,
    resize: "vertical",
  };
}
