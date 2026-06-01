import { sampleGames } from "@52archive/core";
import { theme } from "@52archive/ui";

export default function GamesPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top right, rgba(214, 176, 138, 0.18), transparent 30%), linear-gradient(180deg, #fbf7ef 0%, #f2eadf 100%)",
        color: theme.colors.text,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        padding: 24,
      }}
    >
      <section style={{ maxWidth: 1240, margin: "0 auto" }}>
        <p style={{ letterSpacing: 3, textTransform: "uppercase", color: theme.colors.muted, marginBottom: 8 }}>
          Archive
        </p>
        <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 4.6rem)", lineHeight: 0.95, margin: "0 0 14px" }}>
          All games
        </h1>
        <p style={{ maxWidth: 760, color: theme.colors.muted, lineHeight: 1.65 }}>
          Browse the archive of deck-only games. Each game stores a structured rule graph so the game flow can
          be understood, edited, and eventually played by AI or humans using the same underlying rules.
        </p>

        <div
          style={{
            marginTop: 28,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
          }}
        >
          {sampleGames.map((game) => (
            <article
              key={game.id}
              style={{
                background: theme.colors.surfaceRaised,
                borderRadius: theme.radii.lg,
                border: `1px solid ${theme.colors.border}`,
                padding: 24,
                boxShadow: theme.shadow,
              }}
            >
              <p style={{ color: theme.colors.accent, textTransform: "uppercase", letterSpacing: 2 }}>Archive</p>
              <h2 style={{ fontSize: 30, margin: "10px 0" }}>{game.title}</h2>
              <p style={{ color: theme.colors.muted, lineHeight: 1.6 }}>{game.summary}</p>
              <dl style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 20 }}>
                <div>
                  <dt style={{ color: theme.colors.muted, fontSize: 12 }}>Players</dt>
                  <dd>
                    {game.minPlayers}-{game.maxPlayers}
                  </dd>
                </div>
                <div>
                  <dt style={{ color: theme.colors.muted, fontSize: 12 }}>Time</dt>
                  <dd>{game.playTimeMinutes} min</dd>
                </div>
                <div>
                  <dt style={{ color: theme.colors.muted, fontSize: 12 }}>Decks</dt>
                  <dd>{game.deckCount}</dd>
                </div>
                <div>
                  <dt style={{ color: theme.colors.muted, fontSize: 12 }}>Scorekeeping</dt>
                  <dd>{game.needsPaperScorekeeping ? "Paper" : "None"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
