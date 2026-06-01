import { sampleGames } from "@52archive/core";
import { theme } from "@52archive/ui";

const filters = ["Play tonight", "Cozy", "Classic", "Two-player"];

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "auto",
        background:
          "radial-gradient(circle at top right, rgba(214, 176, 138, 0.25), transparent 30%), linear-gradient(180deg, #fbf7ef 0%, #f2eadf 100%)",
        color: theme.colors.text,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        padding: 24,
      }}
    >
      {/* CSS-driven responsive styles injected directly into head to prevent hydration delay flashes */}
      <style dangerouslySetInnerHTML={{ __html: `
        .hero-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
        }
        .hero-figure {
          min-height: 360px;
        }
        .featured-section {
          display: grid;
        }
        .card-art-container {
          width: 196px;
          height: 282px;
          border-radius: 22px;
          box-shadow: 0 18px 32px rgba(35, 27, 21, 0.18);
        }
        .card-art-inset {
          inset: 14px;
        }
        .card-art-label {
          font-size: 24px;
        }
        .card-art-center {
          font-size: 64px;
        }
        .card-art-center.face {
          font-size: 56px;
        }

        @media (max-width: 767px) {
          .hero-grid {
            grid-template-columns: 1fr !important;
          }
          .hero-figure {
            min-height: 240px !important;
          }
          .featured-section {
            display: none !important;
          }
          .card-art-container {
            width: 120px !important;
            height: 172px !important;
            border-radius: 14px !important;
            box-shadow: 0 12px 24px rgba(35, 27, 21, 0.15) !important;
          }
          .card-art-inset {
            inset: 8px !important;
          }
          .card-art-label {
            font-size: 16px !important;
          }
          .card-art-center {
            font-size: 40px !important;
          }
          .card-art-center.face {
            font-size: 36px !important;
          }
        }
      `}} />

      <section style={{ maxWidth: 1240, margin: "0 auto" }}>
        <div
          className="hero-grid"
          style={{
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
              The standard 52, preserved.
            </p>
          </div>
          <figure
            aria-label="Classic playing cards cover composition"
            className="hero-figure"
            style={{
              margin: 0,
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
          className="featured-section"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
            marginTop: 12,
            marginBottom: 32,
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
              <p style={{ color: theme.colors.accent, textTransform: "uppercase", letterSpacing: 2, margin: 0, fontSize: 11, fontWeight: 700 }}>
                Featured
              </p>
              <h2 style={{ fontSize: 28, margin: "8px 0", fontWeight: 800 }}>{game.title}</h2>
              <p style={{ color: theme.colors.muted, fontSize: 14, margin: "0 0 20px" }}>{game.subtitle}</p>
              <dl style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, borderTop: `1px solid ${theme.colors.border}`, paddingTop: 16 }}>
                <div>
                  <dt style={{ color: theme.colors.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Players</dt>
                  <dd style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 600 }}>
                    {game.maxPlayers ? `${game.minPlayers}–${game.maxPlayers}` : `${game.minPlayers}+`}
                  </dd>
                </div>
                <div>
                  <dt style={{ color: theme.colors.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Time</dt>
                  <dd style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 600 }}>{game.playTimeMinutes} min</dd>
                </div>
                <div>
                  <dt style={{ color: theme.colors.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Decks</dt>
                  <dd style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 600 }}>{game.deckCount}</dd>
                </div>
                <div>
                  <dt style={{ color: theme.colors.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Scorekeeping</dt>
                  <dd style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 600 }}>{game.needsPaperScorekeeping ? "Paper" : "None"}</dd>
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
      className="card-art-container"
      style={{
        position: "absolute",
        left,
        top,
        background: "#ffffff",
        border: "1px solid rgba(35, 27, 21, 0.08)",
        transform: `rotate(${rotate})`,
        zIndex,
        overflow: "hidden",
      }}
    >
      <div className="card-art-inset" style={{ position: "absolute", display: "flex", justifyContent: "space-between" }}>
        <div className="card-art-label" style={{ lineHeight: 1, color: tint, fontWeight: 500 }}>
          <div>{label}</div>
          <div style={{ marginTop: 2 }}>{suit}</div>
        </div>
        <div className="card-art-label" style={{ lineHeight: 1, color: tint, transform: "rotate(180deg)", fontWeight: 500 }}>
          <div>{label}</div>
          <div style={{ marginTop: 2 }}>{suit}</div>
        </div>
      </div>
      <div
        className={`card-art-center ${face ? "face" : ""}`}
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          color: tint,
          opacity: face ? 1 : 0.94,
          letterSpacing: -2,
        }}
      >
        {face ? "♟" : suit}
      </div>
    </div>
  );
}
