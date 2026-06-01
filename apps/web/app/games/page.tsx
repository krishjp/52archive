"use client";

import { useEffect, useRef, useState } from "react";
import { theme } from "@52archive/ui";
import { toast } from "sonner";
import { io as ioClient, Socket } from "socket.io-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GameListing {
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
  version: number;
  lockedBy: string | null;
  lockExpiresAt: string | null;
  graph?: { nodes: any[]; edges: any[] };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("52archive_session_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("52archive_session_id", id);
  }
  return id;
}

/** Returns minutes remaining on a lock, or 0 if expired. */
function minutesRemaining(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 60000));
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GamesPage() {
  const [allGames, setAllGames] = useState<GameListing[]>([]);
  const [selectedGame, setSelectedGame] = useState<GameListing | null>(null);
  const [lockMap, setLockMap] = useState<Record<string, { sessionId: string; expiresAt: string }>>({});
  const [acquiringLock, setAcquiringLock] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // ── Load games from API ──────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/api/games`)
      .then((r) => r.json())
      .then((games: GameListing[]) => {
        setAllGames(games);
        // Populate lockMap from initial DB state
        const initial: typeof lockMap = {};
        for (const g of games) {
          if (g.lockedBy && g.lockExpiresAt && minutesRemaining(g.lockExpiresAt) > 0) {
            initial[g.id] = { sessionId: g.lockedBy, expiresAt: g.lockExpiresAt };
          }
        }
        setLockMap(initial);
      })
      .catch(() => toast.error("Failed to load games catalog"));
  }, []);

  // ── Socket.io — real-time lock updates ──────────────────────────────────
  useEffect(() => {
    const socket = ioClient(API);
    socketRef.current = socket;

    socket.on("lock:acquired", ({ gameId, sessionId, expiresAt }: { gameId: string; sessionId: string; expiresAt: string }) => {
      setLockMap((prev) => ({ ...prev, [gameId]: { sessionId, expiresAt } }));
      // Update game row too so the panel reflects it
      setAllGames((prev) =>
        prev.map((g) => g.id === gameId ? { ...g, lockedBy: sessionId, lockExpiresAt: expiresAt } : g)
      );
    });

    socket.on("lock:released", ({ gameId }: { gameId: string }) => {
      setLockMap((prev) => {
        const next = { ...prev };
        delete next[gameId];
        return next;
      });
      setAllGames((prev) =>
        prev.map((g) => g.id === gameId ? { ...g, lockedBy: null, lockExpiresAt: null } : g)
      );
    });

    socket.on("game:saved", ({ gameId }: { gameId: string }) => {
      // Reload this game's data silently
      fetch(`${API}/api/games/${gameId}`)
        .then((r) => r.json())
        .then((updated: GameListing) => {
          setAllGames((prev) => prev.map((g) => g.id === gameId ? { ...updated, isTextBased: !updated.graph?.nodes?.length } : g));
          setSelectedGame((sel) => sel?.id === gameId ? { ...updated, isTextBased: !updated.graph?.nodes?.length } : sel);
        })
        .catch(() => { });
    });

    return () => { socket.disconnect(); };
  }, []);

  // ── Acquire lock & navigate to editor ──────────────────────────────────
  async function handleEdit(game: GameListing) {
    const sessionId = getSessionId();
    setAcquiringLock(true);
    try {
      const res = await fetch(`${API}/api/games/${game.id}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();

      if (res.status === 423) {
        const mins = minutesRemaining(data.expiresAt);
        toast.error("Game is being edited", {
          description: `Another editor holds this game (session …${data.lockedBy?.slice(-6)}). Lock expires in ${mins} min.`,
          duration: 6000,
        });
        return;
      }
      if (!res.ok) {
        toast.error("Could not acquire lock", { description: data.error });
        return;
      }

      // Navigate to editor with the lock held
      window.location.href = `/editor?id=${game.id}`;
    } catch {
      toast.error("Network error acquiring lock");
    } finally {
      setAcquiringLock(false);
    }
  }

  // ── Render helpers ───────────────────────────────────────────────────────
  function renderTextRules(rules: string) {
    return rules.split("\n").map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={idx} style={{ height: 12 }} />;
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
        <p key={idx} style={{ lineHeight: 1.65, color: theme.colors.text, fontSize: 14.5, margin: "0 0 12px 0" }}>
          {trimmed}
        </p>
      );
    });
  }

  function LockBadge({ game }: { game: GameListing }) {
    const lock = lockMap[game.id];
    if (!lock) return null;
    const mine = lock.sessionId === getSessionId();
    const mins = minutesRemaining(lock.expiresAt);
    if (mins === 0) return null;
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          fontWeight: 700,
          padding: "3px 10px",
          borderRadius: 999,
          background: mine ? "rgba(46, 125, 50, 0.1)" : "rgba(211, 47, 47, 0.1)",
          color: mine ? "#2e7d32" : "#c62828",
          whiteSpace: "nowrap",
        }}
      >
        {mine ? "🔏" : "🔒"} {mine ? "You're editing" : `In use · ${mins}m`}
      </span>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <main
      style={{
        minHeight: "auto",
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
          Browse the archive of deck-only card games. Select a game card to view rules summaries, custom
          plain-text guides, or dynamic game graph intelligence.
        </p>

        {/* Catalog Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 24 }}>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                <span style={{ color: theme.colors.accent, textTransform: "uppercase", letterSpacing: 2, fontSize: 10, fontWeight: 700 }}>
                  {game.isTextBased ? "Catalog Text" : "Rule Flow Graph"}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <LockBadge game={game} />
                  <span style={{ fontSize: 12, color: theme.colors.muted, background: "rgba(214, 176, 138, 0.12)", padding: "2px 8px", borderRadius: 999 }}>
                    {game.id.startsWith("custom") ? "Custom" : "Official"}
                  </span>
                </div>
              </div>
              <h2 style={{ fontSize: 26, margin: "12px 0 8px", fontWeight: 800 }}>{game.title}</h2>
              <p style={{ color: theme.colors.muted, fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>{game.summary}</p>

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

        {/* Selected Game Detail Panel */}
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
            <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

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
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ color: theme.colors.accent, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>
                    {selectedGame.isTextBased ? "Text Catalog Entry" : "Graph Rule Flow"}
                  </span>
                  <LockBadge game={selectedGame} />
                </div>
                <h2 style={{ fontSize: 32, margin: "0 0 4px 0", fontWeight: 800 }}>{selectedGame.title}</h2>
                {selectedGame.subtitle && (
                  <p style={{ margin: 0, color: theme.colors.muted, fontSize: 14 }}>{selectedGame.subtitle}</p>
                )}
              </div>
              <button
                onClick={() => setSelectedGame(null)}
                style={{ border: "none", background: "transparent", fontSize: 24, cursor: "pointer", color: theme.colors.muted, padding: 8 }}
              >
                ✕
              </button>
            </div>

            {/* Panel Scrollable Content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "32px" }}>
              <div style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 2, color: theme.colors.muted, margin: "0 0 8px 0" }}>Summary</h3>
                <p style={{ margin: 0, color: theme.colors.text, fontSize: 15, lineHeight: 1.6 }}>{selectedGame.summary}</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: theme.colors.background, padding: 20, borderRadius: theme.radii.md, marginBottom: 28 }}>
                <div>
                  <strong style={{ fontSize: 12, color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 1 }}>Players</strong>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
                    {selectedGame.maxPlayers ? `${selectedGame.minPlayers} – ${selectedGame.maxPlayers} players` : `${selectedGame.minPlayers}+ players`}
                  </div>
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

              {selectedGame.isTextBased ? (
                <div>
                  <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 2, color: theme.colors.muted, margin: "0 0 12px 0" }}>
                    Text-Based Rules & Instructions
                  </h3>
                  <div style={{ background: theme.colors.surfaceRaised, border: `1.5px solid ${theme.colors.border}`, borderRadius: theme.radii.md, padding: "20px 24px" }}>
                    {(selectedGame as any).textRules ? renderTextRules((selectedGame as any).textRules) : (
                      <p style={{ color: theme.colors.muted, fontSize: 14 }}>No custom plaintext rules defined.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 2, color: theme.colors.muted, margin: "0 0 12px 0" }}>
                    Interpreted Graph Intelligence
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                    <div style={{ border: `1px solid ${theme.colors.border}`, padding: 12, borderRadius: 12, textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: theme.colors.accent }}>{selectedGame.graph?.nodes.length || 0}</div>
                      <div style={{ fontSize: 11, color: theme.colors.muted }}>Rule Stages</div>
                    </div>
                    <div style={{ border: `1px solid ${theme.colors.border}`, padding: 12, borderRadius: 12, textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: theme.colors.accent }}>{selectedGame.graph?.edges.length || 0}</div>
                      <div style={{ fontSize: 11, color: theme.colors.muted }}>Transitions</div>
                    </div>
                    <div style={{ border: `1px solid ${theme.colors.border}`, padding: 12, borderRadius: 12, textAlign: "center", display: "grid", placeItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#2e7d32", background: "rgba(46, 125, 50, 0.1)", padding: "4px 8px", borderRadius: 8 }}>★ AI-Ready</span>
                    </div>
                  </div>
                  <div style={{ position: "relative", paddingLeft: 20, borderLeft: `2.5px solid ${theme.colors.accentSoft}` }}>
                    {selectedGame.graph?.nodes.map((node, index) => (
                      <div key={node.id} style={{ position: "relative", marginBottom: index === selectedGame.graph!.nodes.length - 1 ? 0 : 24 }}>
                        <div style={{ position: "absolute", left: -27.5, top: 4, width: 12, height: 12, borderRadius: "50%", background: theme.colors.accent, border: "3px solid #ffffff", boxShadow: "0 2px 6px rgba(0,0,0,0.1)" }} />
                        <div style={{ background: "#ffffff", border: `1px solid ${theme.colors.border}`, borderRadius: 16, padding: 16 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: theme.colors.accent }}>{node.kind || "step"}</span>
                          <h4 style={{ margin: "4px 0 6px 0", fontSize: 16, fontWeight: 700 }}>{node.title}</h4>
                          <p style={{ margin: 0, fontSize: 13, color: theme.colors.muted, lineHeight: 1.5 }}>{node.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer: Edit / Close */}
            <div
              style={{
                padding: "20px 32px",
                borderTop: `1px solid ${theme.colors.border}`,
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                background: "linear-gradient(180deg, #fbf8f4 0%, #fffdfb 100%)",
              }}
            >
              {(() => {
                const lock = lockMap[selectedGame.id];
                const mine = lock?.sessionId === getSessionId();
                const lockedByOther = lock && !mine && minutesRemaining(lock.expiresAt) > 0;
                return (
                  <button
                    onClick={() => !lockedByOther && handleEdit(selectedGame)}
                    disabled={!!lockedByOther || acquiringLock}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "10px 24px",
                      borderRadius: 16,
                      background: lockedByOther ? theme.colors.border : theme.colors.accent,
                      color: lockedByOther ? theme.colors.muted : "#ffffff",
                      border: "none",
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: lockedByOther ? "not-allowed" : "pointer",
                      boxShadow: lockedByOther ? "none" : "0 4px 12px rgba(177, 122, 75, 0.2)",
                      opacity: acquiringLock ? 0.7 : 1,
                      transition: "background 0.2s ease",
                    }}
                  >
                    {acquiringLock ? "Acquiring lock…" : lockedByOther ? `🔒 Locked (${minutesRemaining(lock!.expiresAt)}m)` : "Edit Rules"}
                  </button>
                );
              })()}
              <button
                onClick={() => setSelectedGame(null)}
                style={{ padding: "10px 24px", borderRadius: 16, background: theme.colors.text, color: "#ffffff", border: "none", fontWeight: 600, cursor: "pointer" }}
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
