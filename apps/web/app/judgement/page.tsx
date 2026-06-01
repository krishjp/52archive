import { judgementGame } from "@52archive/core";
import { theme } from "@52archive/ui";

export const metadata = {
  title: "Judgement - 52Archive",
  description: "Learn and play Judgement (Kachufool / Oh Hell), a classic trick-taking card game.",
};

export default function JudgementPage() {
  const { graph } = judgementGame;

  return (
    <main style={{ minHeight: "100vh", background: theme.colors.background, color: theme.colors.text, padding: 32 }}>
      <section style={{ maxWidth: 1200, margin: "0 auto" }}>
        <a
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            borderRadius: 999,
            background: "#ffffff",
            border: `1px solid ${theme.colors.border}`,
            color: theme.colors.text,
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 14,
            marginBottom: 20,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(35, 27, 21, 0.04)",
          }}
        >
          ← Back to Home
        </a>
        <p style={{ color: theme.colors.accentSoft, textTransform: "uppercase", letterSpacing: 2 }}>
          Game archive
        </p>
        <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", marginTop: 0 }}>{judgementGame.title}</h1>
        <p style={{ maxWidth: 740, color: theme.colors.muted, lineHeight: 1.7 }}>{judgementGame.summary}</p>

        <div
          style={{
            marginTop: 28,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {graph.nodes.map((node) => (
            <article
              key={node.id}
              style={{
                borderRadius: theme.radii.lg,
                background: theme.colors.surfaceRaised,
                border: `1px solid ${theme.colors.border}`,
                padding: 20,
              }}
            >
              <p style={{ marginTop: 0, color: theme.colors.accentSoft, textTransform: "uppercase", letterSpacing: 2, fontSize: 11 }}>
                {node.kind}
              </p>
              <h2>{node.title}</h2>
              <p style={{ color: theme.colors.muted, lineHeight: 1.6 }}>{node.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
