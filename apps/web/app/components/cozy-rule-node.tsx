import { Handle, Position, type NodeProps } from "@xyflow/react";
import { theme } from "@52archive/ui";

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

const occurrenceLabels: Record<string, string> = {
  once: "Once",
  per_round: "Per round",
  per_turn: "Per turn",
  conditional: "Conditional",
};

const actorLabels: Record<string, string> = {
  system: "System",
  player: "Player",
  team: "Team",
  ai: "AI",
};

export default function CozyRuleNode({ data, selected }: NodeProps<any>) {
  const kind = data.kind || "note";
  const style = nodeKindStyles[kind] ?? nodeKindStyles.note;

  return (
    <div
      style={{
        width: 250,
        padding: 16,
        borderRadius: 24,
        background: selected ? "#fffdfa" : "#ffffff",
        border: `1.5px solid ${selected ? style.border : "#e1d8cd"}`,
        boxShadow: selected
          ? `0 18px 32px ${style.glow}, 0 0 0 3px rgba(159, 108, 63, 0.15)`
          : "0 10px 24px rgba(35, 27, 21, 0.06)",
        transition: "box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        textAlign: "left",
      }}
    >
      {/* Target Handle at top of the card node */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: style.accent,
          width: 10,
          height: 10,
          border: "2px solid #ffffff",
          top: -5,
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: style.accent,
              fontWeight: 700,
            }}
          >
            {style.label}
          </div>
          <h3
            style={{
              margin: "6px 0 8px",
              fontSize: 18,
              lineHeight: 1.15,
              color: theme.colors.text,
              fontWeight: 700,
            }}
          >
            {data.title}
          </h3>
        </div>
        <div
          style={{
            color: style.accent,
            fontSize: 10,
            textAlign: "right",
            lineHeight: 1.35,
            fontWeight: 500,
          }}
        >
          {occurrenceLabels[data.occurrence ?? "once"]}
          <br />
          {actorLabels[data.actor ?? "system"]}
        </div>
      </div>

      <p
        style={{
          margin: 0,
          color: theme.colors.muted,
          lineHeight: 1.45,
          fontSize: 13,
          wordBreak: "break-word",
        }}
      >
        {data.body}
      </p>

      {data.aiHint && (
        <div
          style={{
            marginTop: 10,
            padding: "6px 8px",
            background: "rgba(214, 176, 138, 0.12)",
            borderRadius: 8,
            fontSize: 11,
            color: theme.colors.accentSoft,
            fontStyle: "italic",
          }}
        >
          ★ AI-ready
        </div>
      )}

      {/* Source Handle at bottom of the card node */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: style.accent,
          width: 10,
          height: 10,
          border: "2px solid #ffffff",
          bottom: -5,
        }}
      />
    </div>
  );
}
