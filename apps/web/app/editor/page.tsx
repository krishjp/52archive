import { judgementGame } from "@52archive/core";
import { theme } from "@52archive/ui";
import { GraphEditor } from "../components/graph-editor";

export const metadata = {
  title: "Rule Flow Editor - 52Archive",
  description: "Build, edit, and visualize structured game rules dynamically using our canvas editor.",
};

export default function EditorPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top right, rgba(214, 176, 138, 0.18), transparent 30%), linear-gradient(180deg, #fbf7ef 0%, #f2eadf 100%)",
        color: theme.colors.text,
        padding: 24,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <section style={{ maxWidth: 1440, margin: "0 auto" }}>
        <div style={{ marginBottom: 18 }}>
          <p style={{ letterSpacing: 3, textTransform: "uppercase", color: theme.colors.muted, marginBottom: 8 }}>
            Add a game
          </p>
          <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 4.4rem)", margin: 0, lineHeight: 0.95 }}>
            A simple fan for Judgement.
          </h1>
        </div>
        <GraphEditor game={judgementGame} />
      </section>
    </main>
  );
}
