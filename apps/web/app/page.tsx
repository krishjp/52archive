import { sampleGames } from "@52archive/core";
import { theme } from "@52archive/ui";

const filters = ["Play tonight", "Cozy", "Classic", "Two-player"];

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top right, rgba(214, 176, 138, 0.25), transparent 30%), linear-gradient(180deg, #fbf7ef 0%, #f2eadf 100%)",
        color: theme.colors.text,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        padding: 24,
      }}
    >
      <section style={{ maxWidth: 1240, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, 0.85fr)",
            gap: 24,
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          <div>
            <p style={{ letterSpacing: 3, textTransform: "uppercase", color: theme.colors.muted, marginBottom: 8 }}>
              52Archive
            </p>
            <h1 style={{ fontSize: "clamp(3rem, 8vw, 6rem)", lineHeight: 0.95, margin: "10px 0 14px" }}>
              A simple archive for card games.
            </h1>
            <p style={{ maxWidth: 680, fontSize: 18, color: theme.colors.muted, lineHeight: 1.65 }}>
              Clean, off-suit inspired games for a standard deck and a score sheet.
            </p>
          </div>
          <figure
            aria-label="Classic playing cards cover composition"
            style={{
              margin: 0,
              minHeight: 360,
              position: "relative",
              borderRadius: theme.radii.lg,
              border: `1px solid ${theme.colors.border}`,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(244,234,220,0.95) 100%)",
              boxShadow: theme.shadow,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at 20% 18%, rgba(177, 122, 75, 0.08), transparent 18%), radial-gradient(circle at 78% 24%, rgba(214, 176, 138, 0.08), transparent 18%)",
              }}
            />
            <CardArt
              label="J"
              suit="♣"
              tint="#1d1815"
              rotate="-18deg"
              left="6%"
              top="44%"
              zIndex={1}
            />
            <CardArt
              label="2"
              suit="♣"
              tint="#1d1815"
              rotate="-10deg"
              left="22%"
              top="48%"
              zIndex={2}
            />
            <CardArt
              label="Q"
              suit="♥"
              tint="#c12828"
              rotate="-4deg"
              left="39%"
              top="30%"
              zIndex={3}
            />
            <CardArt
              label="10"
              suit="♦"
              tint="#c12828"
              rotate="6deg"
              left="56%"
              top="24%"
              zIndex={4}
            />
            <CardArt
              label="A"
              suit="♠"
              tint="#1d1815"
              rotate="14deg"
              left="73%"
              top="18%"
              zIndex={5}
            />
          </figure>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
          {filters.map((filter) => (
            <span
              key={filter}
              style={{
                padding: "10px 16px",
                borderRadius: 999,
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                color: theme.colors.accentSoft,
              }}
            >
              {filter}
            </span>
          ))}
        </div>

        <div
          style={{
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
              <p style={{ color: theme.colors.accent, textTransform: "uppercase", letterSpacing: 2 }}>
                Featured
              </p>
              <h2 style={{ fontSize: 30, margin: "10px 0" }}>{game.title}</h2>
              <p style={{ color: theme.colors.muted }}>{game.subtitle}</p>
              <dl style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 20 }}>
                <div>
                  <dt style={{ color: theme.colors.muted, fontSize: 12 }}>Players</dt>
                  <dd>{game.minPlayers}-{game.maxPlayers}</dd>
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

        <div style={{ marginTop: 34, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a
            href="/editor"
            style={{
              padding: "14px 18px",
              borderRadius: 999,
              background: theme.colors.accent,
              color: "#fffaf2",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Add a game
          </a>
          <a
            href="/games"
            style={{
              padding: "14px 18px",
              borderRadius: 999,
              background: theme.colors.surfaceRaised,
              color: theme.colors.text,
              textDecoration: "none",
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            View all games
          </a>
        </div>
      </section>
    </main>
  );
}

function CardArt({
  label,
  suit,
  tint,
  rotate,
  left,
  top,
  zIndex,
  face = false,
}: {
  label: string;
  suit: string;
  tint: string;
  rotate: string;
  left: string;
  top: string;
  zIndex: number;
  face?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: 196,
        height: 282,
        borderRadius: 22,
        background: "#ffffff",
        boxShadow: "0 18px 32px rgba(35, 27, 21, 0.18)",
        border: "1px solid rgba(35, 27, 21, 0.08)",
        transform: `rotate(${rotate})`,
        zIndex,
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: 14, display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontSize: 24, lineHeight: 1, color: tint, fontWeight: 500 }}>
          <div>{label}</div>
          <div style={{ fontSize: 24, marginTop: 2 }}>{suit}</div>
        </div>
        <div style={{ fontSize: 24, lineHeight: 1, color: tint, transform: "rotate(180deg)", fontWeight: 500 }}>
          <div>{label}</div>
          <div style={{ fontSize: 24, marginTop: 2 }}>{suit}</div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          color: tint,
          fontSize: face ? 56 : 64,
          opacity: face ? 1 : 0.94,
          letterSpacing: -2,
        }}
      >
        {face ? "♟" : suit}
      </div>
    </div>
  );
}
