"use client";

import { useMemo, useRef, useState, useEffect, type CSSProperties, type WheelEvent } from "react";
import { buildStarterFlow, createFlowNode, flowTemplates, type FlowTemplateKey } from "@52archive/core";
import type { Game, GraphEdge, GraphNode } from "@52archive/core";
import { theme } from "@52archive/ui";

type EditorGame = Pick<Game, "title" | "subtitle" | "summary" | "minPlayers" | "maxPlayers" | "playTimeMinutes" | "difficulty" | "deckCount" | "needsPaperScorekeeping">;

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

const nodeKindStyles: Record<string, { label: string; border: string; accent: string; glow: string }> = {
  setup: { label: "Setup", border: "#ccb28f", accent: "#9f6c3f", glow: "rgba(177, 122, 75, 0.12)" },
  "team-creation": { label: "Teams", border: "#d9c7b0", accent: "#8f5c32", glow: "rgba(177, 122, 75, 0.10)" },
  turn: { label: "Turns", border: "#d6c2a9", accent: "#8f5c32", glow: "rgba(214, 176, 138, 0.12)" },
  decision: { label: "Branch", border: "#c9a57d", accent: "#b06b34", glow: "rgba(177, 122, 75, 0.12)" },
  score: { label: "Score", border: "#d8c9b9", accent: "#876042", glow: "rgba(35, 27, 21, 0.06)" },
  "game-end": { label: "End", border: "#d7b98d", accent: "#9a653a", glow: "rgba(177, 122, 75, 0.08)" },
  variant: { label: "Variant", border: "#dfd2c3", accent: "#8a6f55", glow: "rgba(35, 27, 21, 0.05)" },
  note: { label: "Note", border: "#e0d5c8", accent: "#9d836b", glow: "rgba(35, 27, 21, 0.04)" },
};

const occurrenceLabels: Record<NonNullable<GraphNode["occurrence"]>, string> = {
  once: "Once",
  per_round: "Per round",
  per_turn: "Per turn",
  conditional: "Conditional",
};

const actorLabels: Record<NonNullable<GraphNode["actor"]>, string> = {
  system: "System",
  player: "Player",
  team: "Team",
  ai: "AI",
};

export function GraphEditor({ game }: { game: EditorGame }) {
  const initialGraph = useMemo(() => buildStarterFlow(false), []);
  const [graph, setGraph] = useState<FlowGraph>(initialGraph);
  const [selectedId, setSelectedId] = useState(initialGraph.nodes[0]?.id ?? "");
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [nodeDragStart, setNodeDragStart] = useState({ x: 0, y: 0 });
  const [nodeInitialPos, setNodeInitialPos] = useState({ x: 0, y: 0 });
  
  const selectedNode = graph.nodes.find((node) => node.id === selectedId) ?? graph.nodes[0];
  const activeNode = selectedNode ?? graph.nodes[0];

  function resetGraph(includeTeams: boolean) {
    const next = buildStarterFlow(includeTeams);
    setGraph(next);
    setSelectedId(next.nodes[0]?.id ?? "");
    setPanOffset({ x: 0, y: 0 });
    setZoom(1);
  }

  function updateNode(id: string, patch: Partial<GraphNode>) {
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
    }));
  }

  function addCardAction(fromId: string, actionType: CardAction) {
    setGraph((current) => {
      const source = current.nodes.find((node) => node.id === fromId);
      if (!source) return current;
      
      const actionId = `action-${source.id}-${actionType}-${Date.now()}`;
      const actionNode: GraphNode = {
        id: actionId,
        kind: "note",
        title: cardActionLabels[actionType],
        body: `Player ${actionType === "swap" ? "swaps cards with another player" : actionType === "place" ? "places a card" : actionType === "discard" ? "discards a card" : actionType === "draw" ? "draws a card" : actionType === "reveal" ? "reveals a card" : "passes their turn"}`,
        x: source.x + 280,
        y: source.y + 100,
        stageKey: "turns",
        occurrence: "per_turn",
        actor: "player",
        aiHint: `The player can ${actionType} at this point`,
      };

      const newEdge: GraphEdge = {
        id: `edge-${source.id}-${actionId}`,
        from: source.id,
        to: actionId,
        label: actionType,
        branchType: "sequential",
      };

      return {
        nodes: [...current.nodes, actionNode],
        edges: [...current.edges, newEdge],
      };
    });
  }

  // Insert a new node; if `afterId` is provided insert after that node and shift others right
  function addNode(template: FlowTemplateKey, afterId?: string) {
    setGraph((current) => {
      const index = current.nodes.length;
      // default placement to the end
      let x = index * 220 + 24;
      let y = template === "branch" ? 250 : 0;

      if (afterId) {
        const source = current.nodes.find((n) => n.id === afterId) ?? current.nodes[current.nodes.length - 1];
        if (source) {
          x = source.x + 260;
          y = source.y;
          // shift nodes that would collide
          const shifted = current.nodes.map((n) => (n.x >= x ? { ...n, x: n.x + 220 } : n));
          current = { ...current, nodes: shifted };
        }
      }

      const node = createFlowNode(template, index, x, y);
      const nodes = [...current.nodes, node];
      const previous = current.nodes[current.nodes.length - 1];
      const edges = previous
        ? ([
            ...current.edges,
            {
              id: `edge-${previous.id}-${node.id}`,
              from: previous.id,
              to: node.id,
              label: template === "branch" ? "branch" : "next",
              branchType: template === "branch" ? "conditional" : "sequential",
            },
          ] satisfies GraphEdge[])
        : current.edges;

      setSelectedId(node.id);
      return { nodes, edges };
    });
  }

  function addBranch(fromId: string) {
    setGraph((current) => {
      const source = current.nodes.find((node) => node.id === fromId);
      if (!source) return current;
      // count existing branches for this source to spread them horizontally
      const existing = current.nodes.filter((n) => current.edges.some((e) => e.from === fromId && e.to === n.id));
      const idx = existing.length;
      const branchX = source.x + 140 + idx * 300;
      const branchY = source.y + 180 + Math.floor(idx / 3) * 20;
      const branch = createFlowNode("branch", current.nodes.length, branchX, branchY);
      const edges = [
        ...current.edges,
        {
          id: `edge-${source.id}-${branch.id}`,
          from: source.id,
          to: branch.id,
          label: "branch",
          branchType: "conditional",
        } satisfies GraphEdge,
      ];
      setSelectedId(branch.id);
      return { nodes: [...current.nodes, branch], edges };
    });
  }

  function addBranchCondition(fromId: string) {
    // Create a connection from a branch node to a new target node
    setGraph((current) => {
      const source = current.nodes.find((node) => node.id === fromId);
      if (!source || source.stageKey !== "branch") return current;
      // count existing outgoing edges to spread condition targets
      const outgoing = current.edges.filter((e) => e.from === fromId);
      const idx = outgoing.length;
      const targetX = source.x + 140 + idx * 300;
      const targetY = source.y + 180 + Math.floor(idx / 3) * 20;
      const target = createFlowNode("note", current.nodes.length, targetX, targetY);
      const newEdge: GraphEdge = {
        id: `edge-${source.id}-${target.id}-${Date.now()}`,
        from: source.id,
        to: target.id,
        label: `condition_${outgoing.length + 1}`,
        branchType: "conditional",
      };
      setSelectedId(target.id);
      return {
        nodes: [...current.nodes, target],
        edges: [...current.edges, newEdge],
      };
    });
  }

  function removeEdge(edgeId: string) {
    setGraph((current) => ({
      ...current,
      edges: current.edges.filter((e) => e.id !== edgeId),
    }));
  }

  function removeNode(nodeId: string) {
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.filter((n) => n.id !== nodeId),
      edges: current.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
    }));
    if (selectedId === nodeId) setSelectedId("");
  }

  function handleCanvasWheel(e: WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((prev) => Math.max(0.5, Math.min(3, prev * delta)));
    } else {
      setPanOffset((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  }

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
      // Right-click or Ctrl+left-click for panning
      setIsDraggingCanvas(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (isDraggingCanvas && (e.buttons === 2 || (e.buttons === 1 && e.ctrlKey))) {
      setPanOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  }

  function handleCanvasMouseUp() {
    setIsDraggingCanvas(false);
  }

  // Pointer-based handlers (preferred): supports mouse, touch, and pen. Click/touch-drag to pan.
  function handleCanvasPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // only start pan when clicking/touching the canvas background (not nodes)
    if (e.currentTarget !== e.target) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setIsDraggingCanvas(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingCanvas) return;
    setPanOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }

  function handleCanvasPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    setIsDraggingCanvas(false);
    try {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    } catch (err) {
      // ignore
    }
  }

  function startNodeDrag(nodeId: string, clientX: number, clientY: number) {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setDraggingNodeId(nodeId);
    setNodeDragStart({ x: clientX, y: clientY });
    setNodeInitialPos({ x: node.x, y: node.y });
  }

  // update node position while dragging (window-level mousemove/mouseup to avoid losing events)
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingNodeId) return;
      const dx = (e.clientX - nodeDragStart.x) / zoom;
      const dy = (e.clientY - nodeDragStart.y) / zoom;
      setGraph((current) => ({
        ...current,
        nodes: current.nodes.map((n) => (n.id === draggingNodeId ? { ...n, x: Math.max(0, nodeInitialPos.x + dx), y: Math.max(0, nodeInitialPos.y + dy) } : n)),
      }));
    }

    function onUp() {
      if (draggingNodeId) setDraggingNodeId(null);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingNodeId, nodeDragStart, nodeInitialPos, zoom]);

  return (
    <section
      style={{
        borderRadius: 32,
        border: `1px solid ${theme.colors.border}`,
        background: "linear-gradient(180deg, #fffdf8 0%, #f4eadc 100%)",
        boxShadow: theme.shadow,
        overflow: "hidden",
      }}
    >
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
          <p style={{ margin: 0, color: theme.colors.accent, textTransform: "uppercase", letterSpacing: 2, fontSize: 12 }}>
            Add a game
          </p>
          <h2 style={{ margin: "8px 0 6px", fontSize: 30 }}>{game.title}</h2>
          <p style={{ margin: 0, maxWidth: 680, color: theme.colors.muted, lineHeight: 1.6 }}>
            Define the game as a branched flow: setup, optional teams, turns, scoring, and game end. Each stage
            should read cleanly enough that an AI player could later follow the same rule graph.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={pillButton()} onClick={() => resetGraph(false)}>
            No teams
          </button>
          <button type="button" style={pillButton()} onClick={() => resetGraph(true)}>
            With teams
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
          <strong style={{ color: theme.colors.text }}>Canvas controls:</strong> Click or touch-drag to pan • <kbd>Ctrl</kbd>+scroll (or pinch) to zoom • Select stages to add card actions to turns
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px minmax(0, 1fr) 300px", minHeight: 720 }}>
        <aside style={{ padding: 20, borderRight: `1px solid ${theme.colors.border}`, background: "rgba(255,255,255,0.5)" }}>
          <h3 style={{ marginTop: 0, fontSize: 18 }}>Stage library</h3>
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
                  <div style={{ fontSize: 12, color: theme.colors.muted, lineHeight: 1.35 }}>{template.description}</div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 24, padding: 14, borderRadius: 18, background: theme.colors.paper, border: `1px solid ${theme.colors.border}` }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 2, color: theme.colors.muted }}>Game fit</div>
            <div style={{ marginTop: 8, lineHeight: 1.6, color: theme.colors.text }}>
              {game.minPlayers}-{game.maxPlayers} players
              <br />
              {game.playTimeMinutes} min
              <br />
              {game.needsPaperScorekeeping ? "Paper scorekeeping" : "No score sheet"}
            </div>
          </div>
        </aside>

        <div
          style={{
            position: "relative",
            overflow: "hidden",
            background:
              "radial-gradient(circle at 50% 20%, rgba(214, 176, 138, 0.12), transparent 26%), linear-gradient(180deg, rgba(255,255,255,0.2), rgba(244,234,220,0.55))",
            cursor: isDraggingCanvas ? "grabbing" : "grab",
          }}
          onWheel={handleCanvasWheel}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          // keep mouse handlers as fallback for older browsers
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onContextMenu={(e) => e.preventDefault()}
          ref={canvasRef}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: "radial-gradient(circle, rgba(35, 27, 21, 0.045) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
              opacity: 0.35,
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          />
          <div 
            style={{ 
              position: "relative", 
              minHeight: 720, 
              padding: 28,
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              transition: isDraggingCanvas ? "none" : "transform 0.1s ease-out",
            }}
          >
            {/* SVG edges for accurate connections */}
            <svg style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
              {graph.edges.map((edge) => {
                const fromNode = graph.nodes.find((node) => node.id === edge.from);
                const toNode = graph.nodes.find((node) => node.id === edge.to);
                if (!fromNode || !toNode) return null;
                
                // Calculate node dimensions
                const fromWidth = fromNode.stageKey === "branch" ? 260 : 240;
                const fromHeight = fromNode.stageKey === "branch" ? 260 : 120;
                const toWidth = toNode.stageKey === "branch" ? 260 : 240;
                const toHeight = toNode.stageKey === "branch" ? 260 : 120;
                
                // Connection points: bottom center of from-node, top center of to-node
                const fromX = fromNode.x + 12 + fromWidth / 2;
                const fromY = fromNode.y + 34 + fromHeight;
                const toX = toNode.x + 12 + toWidth / 2;
                const toY = toNode.y + 34;
                
                // Smooth curve control point
                const midX = (fromX + toX) / 2;
                const midY = (fromY + toY) / 2;
                const controlOffset = Math.max(60, Math.abs(toY - fromY) * 0.3);
                
                return (
                  <g key={edge.id}>
                    <path
                      d={`M ${fromX} ${fromY} C ${fromX} ${fromY + controlOffset} ${toX} ${toY - controlOffset} ${toX} ${toY}`}
                      stroke={theme.colors.accent}
                      strokeWidth={2}
                      fill="none"
                      opacity={0.85}
                    />
                    <circle cx={toX} cy={toY} r={5} fill={theme.colors.accent} opacity={0.9} />
                  </g>
                );
              })}
            </svg>

            {graph.nodes.map((node, index) => {
              const style = nodeKindStyles[node.kind] ?? nodeKindStyles.note;
              const isSelected = node.id === activeNode?.id;
              const offsetY = node.stageKey === "branch" ? 260 : 34;
              return (
                <article
                  key={node.id}
                  onClick={() => setSelectedId(node.id)}
                  onMouseDown={(e) => {
                    // start node drag; avoid interfering with canvas pan
                    e.stopPropagation();
                    if ((e.target as HTMLElement).closest("button")) return;
                    startNodeDrag(node.id, e.clientX, e.clientY);
                  }}
                  style={{
                    position: "absolute",
                    left: node.x + 12,
                    top: node.y + offsetY,
                    width: node.stageKey === "branch" ? 260 : 240,
                    padding: 16,
                    borderRadius: 24,
                    background: isSelected ? "#fffdfa" : "#ffffff",
                    border: `1px solid ${isSelected ? style.border : theme.colors.border}`,
                    boxShadow: isSelected ? `0 18px 32px ${style.glow}` : "0 10px 24px rgba(35, 27, 21, 0.08)",
                    cursor: "grab",
                    userSelect: "none",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: style.accent }}>
                        {style.label}
                      </div>
                      <h3 style={{ margin: "6px 0 8px", fontSize: 20, lineHeight: 1.1 }}>{node.title}</h3>
                    </div>
                    <div style={{ color: style.accent, fontSize: 12, textAlign: "right" }}>
                      {occurrenceLabels[node.occurrence ?? "once"]}
                      <br />
                      {actorLabels[node.actor ?? "system"]}
                    </div>
                  </div>
                  <p style={{ margin: 0, color: theme.colors.muted, lineHeight: 1.5, fontSize: 14 }}>{node.body}</p>
                  <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        addBranch(node.id);
                      }}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: theme.colors.accent,
                        padding: 0,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Add branch
                    </button>
                    <span style={{ fontSize: 12, color: theme.colors.muted }}>
                      {node.aiHint ? "AI-ready" : "Rule node"}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside style={{ padding: 20, borderLeft: `1px solid ${theme.colors.border}`, background: "rgba(255,255,255,0.62)", overflow: "auto", maxHeight: 720 }}>
          <h3 style={{ marginTop: 0, fontSize: 18 }}>Selected stage</h3>
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
                  onChange={(e) => updateNode(activeNode.id, { stageKey: (e.target as HTMLSelectElement).value as GraphNode["stageKey"] })}
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
                  onChange={(e) => updateNode(activeNode.id, { occurrence: (e.target as HTMLSelectElement).value as GraphNode["occurrence"] })}
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
                  onChange={(e) => updateNode(activeNode.id, { actor: (e.target as HTMLSelectElement).value as GraphNode["actor"] })}
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
                  <p style={{ margin: "0 0 12px", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: theme.colors.muted }}>Card actions</p>
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
                  <p style={{ margin: "0 0 12px", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: theme.colors.muted }}>Branch conditions</p>
                  <div style={{ display: "grid", gap: 8 }}>
                    {graph.edges.filter((e) => e.from === activeNode.id).map((edge) => {
                      const target = graph.nodes.find((n) => n.id === edge.to);
                      return (
                        <div key={edge.id} style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 8px", background: theme.colors.surfaceRaised, borderRadius: 8 }}>
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

          <div style={{ marginTop: 24, padding: 14, borderRadius: 18, background: theme.colors.paper, border: `1px solid ${theme.colors.border}` }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 2, color: theme.colors.muted }}>Flow summary</div>
            <div style={{ marginTop: 8, lineHeight: 1.6, fontSize: 13 }}>
              {graph.nodes.length} nodes
              <br />
              {graph.edges.length} connections
              <br />
              {graph.nodes.some((node) => node.actor === "ai") ? "AI-friendly" : "AI hints editable"}
              <br />
              <span style={{ fontSize: 11, color: theme.colors.muted, marginTop: 6, display: "block" }}>
                Zoom: {(zoom * 100).toFixed(0)}% • Pan: ({panOffset.x.toFixed(0)}, {panOffset.y.toFixed(0)})
              </span>
            </div>
          </div>

          <details style={{ marginTop: 20 }}>
            <summary style={{ cursor: "pointer", color: theme.colors.accent, fontWeight: 700 }}>Serialized graph</summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: theme.colors.muted, lineHeight: 1.45 }}>
              {JSON.stringify(graph, null, 2)}
            </pre>
          </details>
        </aside>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: theme.colors.muted }}>{label}</span>
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
