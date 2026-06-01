"use client";

import { useEffect, useState } from "react";
import { sampleGames } from "@52archive/core";
import { theme } from "@52archive/ui";


interface SavedGame {
  id: string;
  title: string;
  subtitle?: string;
  summary: string;
  minPlayers: number;
  maxPlayers: number;
  playTimeMinutes: number;
  difficulty: string;
  needsPaperScorekeeping: boolean;
  deckCount: number;
  tags: string[];
  isTextBased: boolean;
  textRules?: string;
  graph?: {
    nodes: any[];
    edges: any[];
  };
}

export default function GamesPage() {
  const [allGames, setAllGames] = useState<SavedGame[]>([]);
  const [selectedGame, setSelectedGame] = useState<SavedGame | null>(null);



  // Load custom saved games from localStorage on mount and merge with standard archive
  useEffect(() => {
    const existing = localStorage.getItem("52archive_custom_games");
    const customGames = existing ? JSON.parse(existing) : [];
    
    // Map static games to SavedGame interface
    const mappedStatic = sampleGames.map((game) => ({
      ...game,
      isTextBased: !game.graph || !game.graph.nodes || game.graph.nodes.length === 0,
      tags: game.tags || ["classic"],
    })) as SavedGame[];

    // Filter out custom games that have duplicate official IDs to clean up stale test data
    const cleanedCustomGames = customGames.filter(
      (cg: any) => !mappedStatic.some((sg) => sg.id === cg.id)
    );

    setAllGames([...mappedStatic, ...cleanedCustomGames]);
  }, []);

  // Format plaintext rules nicely
  function renderTextRules(rules: string) {
    return rules.split("\n").map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return <div key={idx} style={{ height: 12 }} />;
      }
      if (trimmed.startsWith("###")) {
        return (
          <h4
            key={idx}
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: theme.colors.accent,
              margin: "24px 0 10px 0",
              borderBottom: `1px solid ${theme.colors.border}`,
              paddingBottom: 6,
            }}
          >
            {trimmed.replace(/^###\s*/, "")}
          </h4>
        );
      }
      return (
        <p
          key={idx}
          style={{
            lineHeight: 1.65,
            color: theme.colors.text,
            fontSize: 14.5,
            margin: "0 0 12px 0",
          }}
        >
          {trimmed}
        </p>
      );
    });
  }

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
      <section style={{ maxWidth: 1240, margin: "0 auto", position: "relative" }}>
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

        <p style={{ letterSpacing: 3, textTransform: "uppercase", color: theme.colors.muted, marginBottom: 8 }}>
          Archive
        </p>
        <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 4.6rem)", lineHeight: 0.95, margin: "0 0 14px", fontWeight: 800 }}>
          All games
        </h1>
        <p style={{ maxWidth: 760, color: theme.colors.muted, lineHeight: 1.65, marginBottom: 32 }}>
          Browse the archive of deck-only card games. Select a game card to view rules summaries, custom plain-text guides, or dynamic game graph intelligence.
        </p>

        {/* Catalog Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 24,
          }}
        >
          {allGames.map((game, idx) => (
            <article
              key={`${game.id}-${idx}`}
              onClick={() => setSelectedGame(game)}
              style={{
                background: theme.colors.surfaceRaised,
                borderRadius: theme.radii.lg,
                border: `1.5px solid ${selectedGame?.id === game.id ? theme.colors.accent : theme.colors.border}`,
                padding: 28,
                boxShadow: selectedGame?.id === game.id ? "0 18px 48px rgba(177, 122, 75, 0.15)" : theme.shadow,
                cursor: "pointer",
                transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
                transform: selectedGame?.id === game.id ? "translateY(-4px)" : "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = "0 20px 48px rgba(35, 27, 21, 0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = selectedGame?.id === game.id ? "translateY(-4px)" : "none";
                e.currentTarget.style.boxShadow = selectedGame?.id === game.id ? "0 18px 48px rgba(177, 122, 75, 0.15)" : theme.shadow;
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <span
                  style={{
                    color: theme.colors.accent,
                    textTransform: "uppercase",
                    letterSpacing: 2,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {game.isTextBased ? "Catalog Text" : "Rule Flow Graph"}
                </span>
                <span style={{ fontSize: 12, color: theme.colors.muted, background: "rgba(214, 176, 138, 0.12)", padding: "2px 8px", borderRadius: 999 }}>
                  {game.id.startsWith("custom") ? "Custom" : "Official"}
                </span>
              </div>
              <h2 style={{ fontSize: 26, margin: "12px 0 8px", fontWeight: 800 }}>{game.title}</h2>
              <p style={{ color: theme.colors.muted, fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>{game.summary}</p>
              
              <dl style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, borderTop: `1px solid ${theme.colors.border}`, paddingTop: 16 }}>
                <div>
                  <dt style={{ color: theme.colors.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Players</dt>
                  <dd style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 600 }}>
                    {game.minPlayers}-{game.maxPlayers}
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

        {/* Selected Game Detail Modal / Panel Overlay */}
        {selectedGame && (
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "100%",
              maxWidth: 580,
              background: "#ffffff",
              boxShadow: "-10px 0 50px rgba(35, 27, 21, 0.15)",
              zIndex: 1000,
              display: "flex",
              flexDirection: "column",
              borderLeft: `1.5px solid ${theme.colors.border}`,
              animation: "slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Slide animation helper */}
            <style>{`
              @keyframes slideIn {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
              }
            `}</style>

            {/* Panel Header */}
            <div
              style={{
                padding: "24px 32px",
                borderBottom: `1px solid ${theme.colors.border}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "start",
                background: "linear-gradient(180deg, #fffdfb 0%, #fbf8f4 100%)",
              }}
            >
              <div>
                <span
                  style={{
                    color: theme.colors.accent,
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 2,
                    fontWeight: 700,
                  }}
                >
                  {selectedGame.isTextBased ? "Text Catalog Entry" : "Graph Rule Flow"}
                </span>
                <h2 style={{ fontSize: 32, margin: "6px 0 4px 0", fontWeight: 800 }}>{selectedGame.title}</h2>
                {selectedGame.subtitle && (
                  <p style={{ margin: 0, color: theme.colors.muted, fontSize: 14 }}>{selectedGame.subtitle}</p>
                )}
              </div>
              <button
                onClick={() => setSelectedGame(null)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 24,
                  cursor: "pointer",
                  color: theme.colors.muted,
                  padding: 8,
                }}
              >
                ✕
              </button>
            </div>

            {/* Panel Scrollable Content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "32px" }}>
              {/* Summary */}
              <div style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 2, color: theme.colors.muted, margin: "0 0 8px 0" }}>Summary</h3>
                <p style={{ margin: 0, color: theme.colors.text, fontSize: 15, lineHeight: 1.6 }}>{selectedGame.summary}</p>
              </div>

              {/* Game Metadata Info */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: theme.colors.background, padding: 20, borderRadius: theme.radii.md, marginBottom: 28 }}>
                <div>
                  <strong style={{ fontSize: 12, color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 1 }}>Players</strong>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{selectedGame.minPlayers} - {selectedGame.maxPlayers} players</div>
                </div>
                <div>
                  <strong style={{ fontSize: 12, color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 1 }}>Playtime</strong>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{selectedGame.playTimeMinutes} minutes</div>
                </div>
                <div>
                  <strong style={{ fontSize: 12, color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 1 }}>Decks Required</strong>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{selectedGame.deckCount} Standard Deck{selectedGame.deckCount > 1 ? "s" : ""}</div>
                </div>
                <div>
                  <strong style={{ fontSize: 12, color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 1 }}>Scorekeeping</strong>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{selectedGame.needsPaperScorekeeping ? "Paper & Pencil" : "Mental Only"}</div>
                </div>
              </div>

              {/* Dynamic Content: Text-Based or Graph-Based */}
              {selectedGame.isTextBased ? (
                <div>
                  <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 2, color: theme.colors.muted, margin: "0 0 12px 0" }}>
                    Text-Based Rules & Instructions
                  </h3>
                  <div
                    style={{
                      background: theme.colors.surfaceRaised,
                      border: `1.5px solid ${theme.colors.border}`,
                      borderRadius: theme.radii.md,
                      padding: "20px 24px",
                      boxShadow: "0 4px 12px rgba(35, 27, 21, 0.02)",
                    }}
                  >
                    {selectedGame.textRules ? renderTextRules(selectedGame.textRules) : (
                      <p style={{ color: theme.colors.muted, fontSize: 14 }}>No custom plaintext rules defined.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 2, color: theme.colors.muted, margin: "0 0 12px 0" }}>
                    Interpreted Graph Intelligence
                  </h3>
                  
                  {/* Graph Stats Dashboard */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                    <div style={{ border: `1px solid ${theme.colors.border}`, padding: 12, borderRadius: 12, textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: theme.colors.accent }}>
                        {selectedGame.graph?.nodes.length || 0}
                      </div>
                      <div style={{ fontSize: 11, color: theme.colors.muted }}>Rule Stages</div>
                    </div>
                    <div style={{ border: `1px solid ${theme.colors.border}`, padding: 12, borderRadius: 12, textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: theme.colors.accent }}>
                        {selectedGame.graph?.edges.length || 0}
                      </div>
                      <div style={{ fontSize: 11, color: theme.colors.muted }}>Transitions</div>
                    </div>
                    <div style={{ border: `1px solid ${theme.colors.border}`, padding: 12, borderRadius: 12, textAlign: "center", display: "grid", placeItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#2e7d32", background: "rgba(46, 125, 50, 0.1)", padding: "4px 8px", borderRadius: 8 }}>
                        ★ AI-Ready
                      </span>
                    </div>
                  </div>

                  {/* Flow Map Visual Cards Stream */}
                  <div style={{ position: "relative", paddingLeft: 20, borderLeft: `2.5px solid ${theme.colors.accentSoft}` }}>
                    {selectedGame.graph?.nodes.map((node, index) => (
                      <div key={node.id} style={{ position: "relative", marginBottom: index === selectedGame.graph!.nodes.length - 1 ? 0 : 24 }}>
                        {/* Bullet point anchor */}
                        <div
                          style={{
                            position: "absolute",
                            left: -27.5,
                            top: 4,
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            background: theme.colors.accent,
                            border: "3px solid #ffffff",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                          }}
                        />
                        <div
                          style={{
                            background: "#ffffff",
                            border: `1px solid ${theme.colors.border}`,
                            borderRadius: 16,
                            padding: 16,
                            boxShadow: "0 4px 12px rgba(35, 27, 21, 0.03)",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: 1.5,
                              color: theme.colors.accent,
                            }}
                          >
                            {node.kind || "step"}
                          </span>
                          <h4 style={{ margin: "4px 0 6px 0", fontSize: 16, fontWeight: 700 }}>{node.title}</h4>
                          <p style={{ margin: 0, fontSize: 13, color: theme.colors.muted, lineHeight: 1.5 }}>
                            {node.body}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Close Button Footer */}
            <div
              style={{
                padding: "20px 32px",
                borderTop: `1px solid ${theme.colors.border}`,
                display: "flex",
                justifyContent: "flex-end",
                background: "linear-gradient(180deg, #fbf8f4 0%, #fffdfb 100%)",
              }}
            >
              <a
                href={`/editor?id=${selectedGame.id}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "10px 24px",
                  borderRadius: 16,
                  background: theme.colors.accent,
                  color: "#ffffff",
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                  marginRight: 12,
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(177, 122, 75, 0.2)",
                }}
              >
                ✏️ Edit Rules
              </a>
              <button
                onClick={() => setSelectedGame(null)}
                style={{
                  padding: "10px 24px",
                  borderRadius: 16,
                  background: theme.colors.text,
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Close View
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
