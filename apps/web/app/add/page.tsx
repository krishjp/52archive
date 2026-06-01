import { sampleGames } from "@52archive/core";
import { theme } from "@52archive/ui";

const graphNodes = sampleGames[0].graph.nodes;
const graphEdges = sampleGames[0].graph.edges;

export default function AddGamePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: theme.colors.background,
        color: theme.colors.text,
        padding: 32,
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      <section style={{ maxWidth: 1280, margin: "0 auto" }}>
        <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", marginBottom: 10 }}>Add a game</h1>
        <p style={{ maxWidth: 720, color: theme.colors.muted }}>
          Draft rules as a branching graph so authors can describe setup, turns, scoring, variants, and
          edge cases without forcing everything into a flat form.
        </p>

        <div
          style={{
            marginTop: 28,
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: 20,
            alignItems: "start",
          }}
        >
          <section
            style={{
              minHeight: 560,
              position: "relative",
              borderRadius: theme.radii.lg,
              border: `1px solid ${theme.colors.border}`,
              background:
                "linear-gradient(180deg, rgba(43, 34, 26, 0.95) 0%, rgba(21, 16, 12, 0.95) 100%)",
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", inset: 0, opacity: 0.12, backgroundImage: "radial-gradient(circle, #f3e8d8 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
            {graphNodes.map((node) => (
              <article
                key={node.id}
                style={{
                  position: "absolute",
                  left: node.x + 32,
                  top: node.y + 32,
                  width: 280,
                  padding: 18,
                  borderRadius: theme.radii.md,
                  background: theme.colors.surfaceRaised,
                  border: `1px solid ${theme.colors.border}`,
                  boxShadow: theme.shadow,
                }}
              >
                <p style={{ margin: 0, color: theme.colors.accentSoft, textTransform: "uppercase", letterSpacing: 2, fontSize: 11 }}>
                  {node.kind}
                </p>
                <h2 style={{ margin: "8px 0", fontSize: 22 }}>{node.title}</h2>
                <p style={{ margin: 0, color: theme.colors.muted, lineHeight: 1.5 }}>{node.body}</p>
              </article>
            ))}
            {graphEdges.map((edge) => (
              <div
                key={edge.id}
                style={{
                  position: "absolute",
                  left: 92 + (edge.from === "turn" ? 360 : 0),
                  top: edge.from === "turn" ? 98 : 118,
                  width: 260,
                  height: 2,
                  background: `linear-gradient(90deg, transparent, ${theme.colors.accent}, transparent)`,
                  opacity: 0.8,
                }}
              />
            ))}
          </section>

          <aside
            style={{
              borderRadius: theme.radii.lg,
              border: `1px solid ${theme.colors.border}`,
              background: theme.colors.surface,
              padding: 24,
            }}
          >
            <h2 style={{ marginTop: 0 }}>Graph rules</h2>
            <ul style={{ margin: 0, paddingLeft: 18, color: theme.colors.muted, lineHeight: 1.8 }}>
              <li>Create nodes for setup, turns, scoring, and variants.</li>
              <li>Connect branches with labeled conditional edges.</li>
              <li>Version submissions so the archive can grow safely.</li>
            </ul>
          </aside>
        </div>
      </section>
    </main>
  );
}
