"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { theme } from "@52archive/ui";
import { toast } from "sonner";
import { io as ioClient, Socket } from "socket.io-client";
import MarkdownIt from "markdown-it";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

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
  status?: string;
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

  const [searchQuery, setSearchQuery] = useState("");
  const [minPlaytime, setMinPlaytime] = useState<number | "">("");
  const [maxPlaytime, setMaxPlaytime] = useState<number | "">("");
  const [minPlayersFilter, setMinPlayersFilter] = useState<number | "">("");
  const [maxPlayersFilter, setMaxPlayersFilter] = useState<number | "">("");

  const filteredGames = useMemo(() => {
    return allGames.filter((game) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = game.title.toLowerCase().includes(query);
        const matchesSubtitle = game.subtitle?.toLowerCase().includes(query) ?? false;
        const matchesSummary = game.summary.toLowerCase().includes(query);
        const matchesTags = game.tags.some(t => t.toLowerCase().includes(query));
        if (!matchesTitle && !matchesSubtitle && !matchesSummary && !matchesTags) {
          return false;
        }
      }

      // 2. Playtime Range
      if (minPlaytime !== "" && game.playTimeMinutes < minPlaytime) return false;
      if (maxPlaytime !== "" && game.playTimeMinutes > maxPlaytime) return false;

      // 3. Player Count Range
      const effectiveMinFilter = minPlayersFilter !== "" ? minPlayersFilter : maxPlayersFilter;
      const effectiveMaxFilter = maxPlayersFilter !== "" ? maxPlayersFilter : minPlayersFilter;

      if (effectiveMaxFilter !== "" && game.minPlayers > effectiveMaxFilter) return false;
      if (effectiveMinFilter !== "" && game.maxPlayers !== null && game.maxPlayers < effectiveMinFilter) return false;

      return true;
    });
  }, [allGames, searchQuery, minPlaytime, maxPlaytime, minPlayersFilter, maxPlayersFilter]);
  const [lockMap, setLockMap] = useState<Record<string, { sessionId: string; expiresAt: string }>>({});
  const [acquiringLock, setAcquiringLock] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const [activeSimulationGame, setActiveSimulationGame] = useState<GameListing | null>(null);
  const [simState, setSimState] = useState<any>(null);
  const [simObservation, setSimObservation] = useState<any>(null);
  const [simLogs, setSimLogs] = useState<string[]>([]);
  const [simBiddingVal, setSimBiddingVal] = useState<string>("");
  const [simHasModel, setSimHasModel] = useState<boolean>(false);
  const [simIsLoading, setSimIsLoading] = useState<boolean>(false);

  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupGame, setSetupGame] = useState<GameListing | null>(null);
  const [customRoundIndices, setCustomRoundIndices] = useState<string>("0");
  const [activeRoundIndices, setActiveRoundIndices] = useState<number[]>([0]);
  const [turnSelectionMode, setTurnSelectionMode] = useState<string>("rotating");

  const handlePlayGame = async (game: GameListing, roundIndices?: number[], turnMode?: string) => {
    setActiveSimulationGame(game);
    setSimIsLoading(true);
    setSimLogs([]);
    const selectedIndices = roundIndices || activeRoundIndices;
    const selectedTurnMode = turnMode || turnSelectionMode;
    setActiveRoundIndices(selectedIndices);
    setTurnSelectionMode(selectedTurnMode);

    try {
      const res = await fetch(`${API}/api/games/${game.id}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundIndices: selectedIndices,
          turnSelectionMode: selectedTurnMode
        }),
      });
      if (!res.ok) {
        toast.error("Failed to start simulation");
        setActiveSimulationGame(null);
        return;
      }
      const data = await res.json();
      setSimState(data.state);
      setSimObservation(data.observation);
      setSimHasModel(data.has_model);
      setSimLogs(data.logs || []);

      if (!data.has_model) {
        toast.info("Proceeding with Heuristics", {
          description: "No trained neural model weight file is associated with this game entry yet. Falling back to base heuristics.",
          duration: 6000
        });
      }
    } catch (err) {
      console.error(err);
      toast.error("Network error starting simulation");
      setActiveSimulationGame(null);
    } finally {
      setSimIsLoading(false);
    }
  };

  const handleSimSubmitBid = async (bidVal: number) => {
    setSimIsLoading(true);
    try {
      const res = await fetch(`${API}/api/games/${activeSimulationGame!.id}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: bidVal,
          state: simState
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSimState(data.state);
        setSimObservation(data.observation);
        setSimLogs(prev => [...prev, ...data.logs]);
        setSimBiddingVal("");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSimIsLoading(false);
    }
  };

  const handleSimPlayCard = async (card: [string, number]) => {
    setSimIsLoading(true);
    try {
      const res = await fetch(`${API}/api/games/${activeSimulationGame!.id}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: card,
          state: simState
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSimState(data.state);
        setSimObservation(data.observation);
        setSimLogs(prev => [...prev, ...data.logs]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSimIsLoading(false);
    }
  };

  const handleSimNextRound = async () => {
    setSimIsLoading(true);
    try {
      const res = await fetch(`${API}/api/games/${activeSimulationGame!.id}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "next_round",
          state: simState
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSimState(data.state);
        setSimObservation(data.observation);
        setSimLogs(prev => [...prev, ...data.logs]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSimIsLoading(false);
    }
  };


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
    return (
      <div className="text-rules-container">
        <style dangerouslySetInnerHTML={{
          __html: `
          .text-rules-container h1, .text-rules-container h2, .text-rules-container h3, .text-rules-container h4 {
            color: ${theme.colors.accent};
            margin-top: 20px;
            margin-bottom: 8px;
            font-weight: 800;
          }
          .text-rules-container h1 { font-size: 20px; }
          .text-rules-container h2 { font-size: 18px; }
          .text-rules-container h3, .text-rules-container h4 { font-size: 16px; }
          .text-rules-container p {
            margin: 0 0 12px 0;
            line-height: 1.65;
            color: ${theme.colors.text};
            font-size: 14.5px;
          }
          .text-rules-container ul, .text-rules-container ol {
            padding-left: 20px;
            margin-bottom: 12px;
          }
          .text-rules-container li {
            margin-bottom: 4px;
            line-height: 1.5;
            color: ${theme.colors.text};
            font-size: 14.5px;
          }
          .text-rules-container strong {
            font-weight: 700;
            color: ${theme.colors.text};
          }
          .text-rules-container table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
            font-size: 13.5px;
          }
          .text-rules-container th, .text-rules-container td {
            border: 1px solid ${theme.colors.border};
            padding: 8px 12px;
            text-align: left;
          }
          .text-rules-container th {
            background: rgba(35, 27, 21, 0.04);
            font-weight: 700;
          }
          .text-rules-container blockquote {
            border-left: 4px solid ${theme.colors.accent};
            padding: 6px 16px;
            margin: 0 0 16px 0;
            background: rgba(177, 122, 75, 0.05);
            font-style: italic;
            color: ${theme.colors.muted};
          }
          .text-rules-container pre {
            background: #1e1b18;
            color: #f4eadc;
            padding: 14px;
            border-radius: 10px;
            overflow-x: auto;
            margin-bottom: 16px;
          }
          .text-rules-container code {
            font-family: 'Courier New', Courier, monospace;
            background: rgba(35, 27, 21, 0.06);
            padding: 2px 5px;
            border-radius: 4px;
            font-size: 13px;
          }
          .text-rules-container pre code {
            background: transparent;
            padding: 0;
            font-size: 12.5px;
            color: inherit;
          }
          .text-rules-container hr {
            border: 0;
            border-top: 1.5px solid ${theme.colors.border};
            margin: 20px 0;
          }
        `}} />
        <div dangerouslySetInnerHTML={{ __html: md.render(rules) }} />
      </div>
    );
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

        {/* Minimalist Search and Filters Control Center */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "center",
            marginBottom: 28,
            background: "transparent",
          }}
        >
          {/* Minimalist Search Input */}
          <div style={{ position: "relative", flex: "1 1 300px" }}>
            <input
              type="text"
              placeholder="Search by title, rules, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                border: `1.5px solid ${theme.colors.border}`,
                background: "#ffffff",
                fontSize: 13.5,
                color: theme.colors.text,
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "Inter, sans-serif",
              }}
            />
          </div>

          {/* Minimalist Playtime Range */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 68, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: theme.colors.muted }}>
              Time:
            </span>
            <input
              type="number"
              placeholder="Min"
              value={minPlaytime}
              onChange={(e) => setMinPlaytime(e.target.value === "" ? "" : parseInt(e.target.value))}
              style={{
                width: 60,
                padding: "8px 10px",
                borderRadius: 8,
                border: `1.5px solid ${theme.colors.border}`,
                background: "#ffffff",
                fontSize: 12.5,
                outline: "none",
                textAlign: "center",
              }}
            />
            <span style={{ color: theme.colors.muted, fontSize: 12 }}>–</span>
            <input
              type="number"
              placeholder="Max"
              value={maxPlaytime}
              onChange={(e) => setMaxPlaytime(e.target.value === "" ? "" : parseInt(e.target.value))}
              style={{
                width: 60,
                padding: "8px 10px",
                borderRadius: 8,
                border: `1.5px solid ${theme.colors.border}`,
                background: "#ffffff",
                fontSize: 12.5,
                outline: "none",
                textAlign: "center",
              }}
            />
          </div>

          {/* Minimalist Players Range */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 68, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: theme.colors.muted }}>
              Players:
            </span>
            <input
              type="number"
              placeholder="Min"
              value={minPlayersFilter}
              onChange={(e) => setMinPlayersFilter(e.target.value === "" ? "" : parseInt(e.target.value))}
              style={{
                width: 60,
                padding: "8px 10px",
                borderRadius: 8,
                border: `1.5px solid ${theme.colors.border}`,
                background: "#ffffff",
                fontSize: 12.5,
                outline: "none",
                textAlign: "center",
              }}
            />
            <span style={{ color: theme.colors.muted, fontSize: 12 }}>–</span>
            <input
              type="number"
              placeholder="Max"
              value={maxPlayersFilter}
              onChange={(e) => setMaxPlayersFilter(e.target.value === "" ? "" : parseInt(e.target.value))}
              style={{
                width: 60,
                padding: "8px 10px",
                borderRadius: 8,
                border: `1.5px solid ${theme.colors.border}`,
                background: "#ffffff",
                fontSize: 12.5,
                outline: "none",
                textAlign: "center",
              }}
            />
          </div>

          {/* Minimalist Clear Button */}
          {(searchQuery || minPlaytime || maxPlaytime || minPlayersFilter || maxPlayersFilter) && (
            <button
              onClick={() => {
                setSearchQuery("");
                setMinPlaytime("");
                setMaxPlaytime("");
                setMinPlayersFilter("");
                setMaxPlayersFilter("");
              }}
              style={{
                background: "transparent",
                border: "none",
                color: theme.colors.accent,
                fontWeight: 600,
                fontSize: 12.5,
                cursor: "pointer",
                padding: "8px 0",
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Catalog Grid */}
        {filteredGames.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", background: "#ffffff", border: `1.5px solid ${theme.colors.border}`, borderRadius: theme.radii.lg }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: 700 }}>No matching games found</h3>
            <p style={{ color: theme.colors.muted, fontSize: 14, margin: 0 }}>Try clearing your search query or broadening your filters.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 24 }}>
            {filteredGames.map((game, idx) => (
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
                      {game.maxPlayers && game.maxPlayers !== game.minPlayers ? `${game.minPlayers}–${game.maxPlayers}` : game.maxPlayers === game.minPlayers ? `${game.minPlayers}` : `${game.minPlayers}+`}
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
        )}

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
                    {selectedGame.maxPlayers && selectedGame.maxPlayers !== selectedGame.minPlayers
                      ? `${selectedGame.minPlayers} – ${selectedGame.maxPlayers} players`
                      : selectedGame.maxPlayers === selectedGame.minPlayers
                        ? `${selectedGame.minPlayers} players`
                        : `${selectedGame.minPlayers}+ players`}
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
                      {selectedGame.status === "ready_for_training" ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#2e7d32", background: "rgba(46, 125, 50, 0.1)", padding: "4px 8px", borderRadius: 8 }}>★ AI-Ready</span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#d97706", background: "rgba(217, 119, 6, 0.1)", padding: "4px 8px", borderRadius: 8 }}>Draft</span>
                      )}
                    </div>
                  </div>
                  <div style={{ position: "relative", paddingLeft: 24, borderLeft: `3px solid ${theme.colors.accentSoft}` }}>
                    {selectedGame.graph?.nodes.map((node, index) => (
                      <div key={node.id} style={{ position: "relative", marginBottom: index === selectedGame.graph!.nodes.length - 1 ? 0 : 24 }}>
                        <div style={{ position: "absolute", left: "-34.5px", top: "50%", transform: "translateY(-50%)", width: 12, height: 12, borderRadius: "50%", background: theme.colors.accent, border: "3px solid #ffffff", boxShadow: "0 2px 6px rgba(0,0,0,0.1)", zIndex: 2 }} />
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
              <button
                onClick={() => {
                  setSetupGame(selectedGame);
                  setShowSetupModal(true);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "10px 24px",
                  borderRadius: 16,
                  background: "#2e7d32",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(46, 125, 50, 0.2)",
                  transition: "background 0.2s ease",
                }}
              >
                Play Terminal Preview
              </button>
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

      {showSetupModal && setupGame && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(35, 27, 21, 0.5)",
            backdropFilter: "blur(8px)",
            zIndex: 1000,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 500,
              background: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radii.lg,
              boxShadow: "0 24px 64px rgba(35, 27, 21, 0.16)",
              padding: 32,
              display: "flex",
              flexDirection: "column",
              gap: 20
            }}
          >
            <div>
              <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 2, color: theme.colors.muted, display: "block", marginBottom: 4 }}>
                Simulation Config
              </span>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: theme.colors.text, margin: 0 }}>
                Setup Deal Sequence
              </h2>
            </div>

            <p style={{ fontSize: 14, color: theme.colors.muted, lineHeight: 1.6, margin: 0 }}>
              The base game sequence can be long. You can modify which rounds to play from the deal sequence.
            </p>

            <div style={{ background: theme.colors.paper, padding: 16, borderRadius: 16, fontSize: 12.5, lineHeight: 1.5 }}>
              <strong>Default Deal Sequence:</strong><br />
              19 rounds with deal pattern:<br />
              <code style={{ fontSize: 11, background: "rgba(35, 27, 21, 0.05)", padding: "2px 6px", borderRadius: 4, display: "block", marginTop: 4, wordBreak: "break-all" }}>
                [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
              </code>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label htmlFor="round-indices-input" style={{ fontSize: 12, fontWeight: 700, color: theme.colors.text, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Rounds to Play (indices, comma-separated):
              </label>
              <input
                id="round-indices-input"
                type="text"
                value={customRoundIndices}
                onChange={(e) => setCustomRoundIndices(e.target.value)}
                placeholder="e.g. 0, 1, 2"
                style={{
                  background: theme.colors.surfaceRaised,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: 14,
                  padding: "12px 16px",
                  fontSize: 14,
                  fontFamily: "monospace",
                  color: theme.colors.text,
                  outline: "none",
                  transition: "all 0.15s ease"
                }}
                onFocus={(e) => e.target.style.borderColor = theme.colors.accent}
                onBlur={(e) => e.target.style.borderColor = theme.colors.border}
              />
              <span style={{ fontSize: 11, color: theme.colors.muted }}>
                Examples: <code>0</code> (plays round 1 only), <code>0, 1, 2</code> (plays first 3 rounds)
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label htmlFor="turn-mode-input" style={{ fontSize: 12, fontWeight: 700, color: theme.colors.text, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Starting Player / Lead Rotation Rule:
              </label>
              <select
                id="turn-mode-input"
                value={turnSelectionMode}
                onChange={(e) => setTurnSelectionMode(e.target.value)}
                style={{
                  background: theme.colors.surfaceRaised,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: 14,
                  padding: "12px 16px",
                  fontSize: 14,
                  color: theme.colors.text,
                  outline: "none",
                  cursor: "pointer"
                }}
              >
                <option value="rotating">Rotating Dealer (Standard)</option>
                <option value="most_points">Player with Most Cumulative Points Leads</option>
                <option value="least_points">Player with Least Cumulative Points Leads</option>
              </select>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
              <button
                onClick={() => setShowSetupModal(false)}
                style={{
                  background: "transparent",
                  color: theme.colors.muted,
                  border: "none",
                  borderRadius: 12,
                  padding: "10px 20px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 14
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const parsed = customRoundIndices
                    .split(",")
                    .map(s => parseInt(s.trim(), 10))
                    .filter(n => !isNaN(n) && n >= 0 && n < 19);

                  if (parsed.length === 0) {
                    toast.error("Please enter at least one valid round index (0-18)");
                    return;
                  }

                  setShowSetupModal(false);
                  handlePlayGame(setupGame!, parsed, turnSelectionMode);
                }}
                style={{
                  background: theme.colors.accent,
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 16,
                  padding: "10px 24px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: 14,
                  boxShadow: "0 4px 12px rgba(177, 122, 75, 0.2)"
                }}
              >
                Start Simulation
              </button>
            </div>
          </div>
        </div>
      )}

      {activeSimulationGame && simObservation && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(35, 27, 21, 0.5)",
            backdropFilter: "blur(8px)",
            zIndex: 1000,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 1000,
              height: "85vh",
              background: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radii.lg,
              boxShadow: "0 24px 64px rgba(35, 27, 21, 0.16)",
              display: "flex",
              flexDirection: "column",
              color: theme.colors.text,
              overflow: "hidden"
            }}
          >
            {/* Simulation Header */}
            <div
              style={{
                background: theme.colors.surfaceRaised,
                padding: "16px 24px",
                borderBottom: `1px solid ${theme.colors.border}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <div>
                <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 2, color: theme.colors.muted, display: "block" }}>
                  Interactive Simulator
                </span>
                <span style={{ fontWeight: 800, fontSize: 18, color: theme.colors.text }}>
                  {activeSimulationGame.title}
                </span>
              </div>
              <button
                onClick={() => setActiveSimulationGame(null)}
                style={{
                  background: "transparent",
                  color: theme.colors.muted,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: 12,
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                  transition: "all 0.2s ease"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(35, 27, 21, 0.05)";
                  e.currentTarget.style.color = theme.colors.text;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = theme.colors.muted;
                }}
              >
                Exit Simulator
              </button>
            </div>

            {/* Model/Heuristics status banner */}
            {!simHasModel && (
              <div
                style={{
                  background: "#fff9db",
                  color: "#856404",
                  borderBottom: "1px solid #ffeeba",
                  padding: "8px 16px",
                  fontSize: 12,
                  fontWeight: 600,
                  textAlign: "center"
                }}
              >
                ℹ️ Proceeding with heuristics: No trained neural model weights are associated with this game yet.
              </div>
            )}
            {simHasModel && (
              <div
                style={{
                  background: "#e6f4ea",
                  color: "#137333",
                  borderBottom: "1px solid #ceead6",
                  padding: "8px 16px",
                  fontSize: 12,
                  fontWeight: 600,
                  textAlign: "center"
                }}
              >
                ✓ Trained Neural Policy loaded successfully and driving AI agent choices.
              </div>
            )}

            {/* Main simulation layout */}
            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
              {/* Left Panel: Log Monitor */}
              <div
                style={{
                  flex: 1.2,
                  padding: 20,
                  borderRight: `1px solid ${theme.colors.border}`,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column-reverse",
                  fontSize: 13,
                  lineHeight: 1.5,
                  background: theme.colors.paper
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {simLogs.map((log, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "8px 12px",
                        background: theme.colors.surfaceRaised,
                        borderRadius: 10,
                        border: `1px solid ${theme.colors.border}`,
                        color: theme.colors.text,
                        fontSize: 12.5,
                        boxShadow: "0 2px 4px rgba(35, 27, 21, 0.02)"
                      }}
                    >
                      {log}
                    </div>
                  ))}
                  {simLogs.length === 0 && (
                    <div style={{ color: theme.colors.muted, textAlign: "center", padding: 20 }}>
                      Initializing simulator session...
                    </div>
                  )}
                </div>
              </div>

              {/* Right Panel: Game Board */}
              <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 18, overflowY: "auto", background: theme.colors.surface }}>

                {/* Trump & Phase Header */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ background: theme.colors.surfaceRaised, border: `1px solid ${theme.colors.border}`, padding: 12, borderRadius: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Trump Suit</div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>
                      {simObservation.trump_suit ? (
                        <span style={{ color: (simObservation.trump_suit === "Hearts" || simObservation.trump_suit === "Diamonds") ? "#c92a2a" : theme.colors.text }}>
                          {simObservation.trump_suit === "Spades" && "♠ Spades"}
                          {simObservation.trump_suit === "Hearts" && "♥ Hearts"}
                          {simObservation.trump_suit === "Clubs" && "♣ Clubs"}
                          {simObservation.trump_suit === "Diamonds" && "♦ Diamonds"}
                        </span>
                      ) : (
                        <span style={{ color: theme.colors.muted }}>No Trump</span>
                      )}
                    </div>
                  </div>
                  <div style={{ background: theme.colors.surfaceRaised, border: `1px solid ${theme.colors.border}`, padding: 12, borderRadius: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Current Phase</div>
                    <div style={{ fontSize: 18, fontWeight: 800, textTransform: "capitalize", color: theme.colors.accent }}>
                      {simObservation.phase}
                    </div>
                  </div>
                </div>

                {/* Scoreboard Table */}
                <div style={{ background: theme.colors.surfaceRaised, border: `1px solid ${theme.colors.border}`, padding: 16, borderRadius: 16 }}>
                  <div style={{ fontSize: 11, color: theme.colors.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Scoreboard</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${theme.colors.border}`, textAlign: "left", color: theme.colors.muted }}>
                        <th style={{ paddingBottom: 8 }}>Player</th>
                        <th style={{ paddingBottom: 8 }}>Bid</th>
                        <th style={{ paddingBottom: 8 }}>Tricks</th>
                        <th style={{ paddingBottom: 8 }}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(simObservation.scores || {}).map((pKey) => {
                        const isPlayer = pKey === "0";
                        return (
                          <tr
                            key={pKey}
                            style={{
                              borderBottom: `1px solid ${theme.colors.border}`,
                              background: isPlayer ? "rgba(177, 122, 75, 0.08)" : "transparent",
                              fontWeight: isPlayer ? "bold" : "normal"
                            }}
                          >
                            <td style={{ padding: "8px 4px", color: isPlayer ? theme.colors.accent : theme.colors.text }}>
                              {isPlayer ? "You (Player 0)" : `AI Agent ${pKey}`}
                            </td>
                            <td style={{ padding: "8px 4px" }}>
                              {simObservation.bids?.[pKey] !== undefined ? simObservation.bids[pKey] : "-"}
                            </td>
                            <td style={{ padding: "8px 4px" }}>
                              {simObservation.tricks_won?.[pKey] || 0}
                            </td>
                            <td style={{ padding: "8px 4px", fontWeight: "bold" }}>
                              {simObservation.scores?.[pKey] || 0}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Current Trick Cards */}
                <div style={{ background: theme.colors.surfaceRaised, border: `1px solid ${theme.colors.border}`, padding: 16, borderRadius: 16, flex: 1, display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 11, color: theme.colors.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Current Trick Pile</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "center", flex: 1 }}>
                    {simObservation.current_trick?.map((trickItem: any, idx: number) => {
                      const isPlayerTrickCardValid = Array.isArray(trickItem) && trickItem.length === 2 && Array.isArray(trickItem[1]);
                      const suit = isPlayerTrickCardValid ? trickItem[1][0] : "";
                      const rank = isPlayerTrickCardValid ? trickItem[1][1] : 0;
                      const trickPlayer = isPlayerTrickCardValid ? trickItem[0] : null;

                      if (!suit) return null;

                      const isRed = suit === "Hearts" || suit === "Diamonds";
                      const suitSym = suit === "Spades" ? "♠" : suit === "Hearts" ? "♥" : suit === "Clubs" ? "♣" : suit === "Diamonds" ? "♦" : suit;
                      const rankLabel = rank === 11 ? "J" : rank === 12 ? "Q" : rank === 13 ? "K" : rank === 14 ? "A" : rank.toString();

                      return (
                        <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <div
                            style={{
                              width: 54,
                              height: 76,
                              borderRadius: 8,
                              background: "#ffffff",
                              border: `1px solid ${theme.colors.border}`,
                              boxShadow: "0 4px 8px rgba(35, 27, 21, 0.08)",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                              padding: 6,
                              fontWeight: "bold",
                              color: isRed ? "#c92a2a" : theme.colors.text
                            }}
                          >
                            <span style={{ fontSize: 12, textAlign: "left", display: "block" }}>{rankLabel}</span>
                            <span style={{ fontSize: 24, textAlign: "center", alignSelf: "center", margin: "-4px 0" }}>{suitSym}</span>
                            <span style={{ fontSize: 12, textAlign: "left", display: "block", transform: "rotate(180deg)" }}>{rankLabel}</span>
                          </div>
                          <span style={{ fontSize: 10, color: theme.colors.muted, fontWeight: 600 }}>
                            {trickPlayer === 0 ? "You" : `AI ${trickPlayer}`}
                          </span>
                        </div>
                      );
                    })}
                    {(!simObservation.current_trick || simObservation.current_trick.length === 0) && (
                      <div style={{ fontSize: 13, color: theme.colors.muted, fontStyle: "italic", padding: 12 }}>
                        No cards played in this trick yet.
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Bottom Panel: Interactive User Control Panel */}
            <div
              style={{
                background: theme.colors.surfaceRaised,
                borderTop: `1px solid ${theme.colors.border}`,
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 16
              }}
            >
              {/* User's Hand (Always Visible) */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                  Your Hand ({simObservation.hand?.length || 0} cards)
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {simObservation.hand?.map((card: [string, number], idx: number) => {
                    const suit = card[0];
                    const rank = card[1];

                    // A card is playable if we are in playing/passing phase, it is our turn, and it is a legal move
                    const isBidding = simObservation.phase === "bidding";
                    const isOurTurn = simObservation.player_id === 0;
                    const isLegal = !isBidding && isOurTurn && simObservation.legal_moves?.some(
                      (lm: any) => lm[0] === suit && lm[1] === rank
                    );

                    const isRed = suit === "Hearts" || suit === "Diamonds";
                    const suitSym = suit === "Spades" ? "♠" : suit === "Hearts" ? "♥" : suit === "Clubs" ? "♣" : suit === "Diamonds" ? "♦" : suit;
                    const rankLabel = rank === 11 ? "J" : rank === 12 ? "Q" : rank === 13 ? "K" : rank === 14 ? "A" : rank.toString();

                    return (
                      <button
                        key={idx}
                        disabled={isBidding || !isLegal || simIsLoading}
                        onClick={() => handleSimPlayCard(card)}
                        style={{
                          width: 60,
                          height: 84,
                          borderRadius: 8,
                          background: "#ffffff",
                          border: isLegal ? `2px solid ${theme.colors.accent}` : `1px solid ${theme.colors.border}`,
                          boxShadow: isLegal ? "0 6px 12px rgba(177, 122, 75, 0.15)" : "0 2px 4px rgba(35, 27, 21, 0.05)",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          padding: 6,
                          fontWeight: "bold",
                          color: isRed ? "#c92a2a" : theme.colors.text,
                          cursor: isLegal ? "pointer" : isBidding ? "default" : "not-allowed",
                          opacity: (isBidding || isLegal) ? 1 : 0.45,
                          transform: isLegal ? "translateY(-2px)" : "none",
                          transition: "all 0.15s ease",
                          pointerEvents: (isBidding || isLegal) ? "auto" : "none"
                        }}
                        onMouseEnter={(e) => {
                          if (isLegal) {
                            e.currentTarget.style.transform = "translateY(-5px)";
                            e.currentTarget.style.borderColor = theme.colors.accent;
                            e.currentTarget.style.boxShadow = "0 8px 16px rgba(177, 122, 75, 0.25)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (isLegal) {
                            e.currentTarget.style.transform = "translateY(-2px)";
                            e.currentTarget.style.borderColor = theme.colors.accent;
                            e.currentTarget.style.boxShadow = "0 6px 12px rgba(177, 122, 75, 0.15)";
                          }
                        }}
                      >
                        <span style={{ fontSize: 13, textAlign: "left", display: "block" }}>{rankLabel}</span>
                        <span style={{ fontSize: 26, textAlign: "center", alignSelf: "center", margin: "-6px 0" }}>{suitSym}</span>
                        <span style={{ fontSize: 13, textAlign: "left", display: "block", transform: "rotate(180deg)" }}>{rankLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Controls Section */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
                {simObservation.phase === "bidding" && simObservation.player_id === 0 && (
                  <div style={{ width: "100%" }}>
                    <div style={{ fontSize: 12, marginBottom: 8, fontWeight: 700, color: theme.colors.accent, textTransform: "uppercase", letterSpacing: 1 }}>
                      Your Turn to Bid: Select target trick count
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {simObservation.legal_moves?.map((bid: number) => (
                        <button
                          key={bid}
                          onClick={() => handleSimSubmitBid(bid)}
                          style={{
                            background: theme.colors.surfaceRaised,
                            color: theme.colors.text,
                            border: `1px solid ${theme.colors.border}`,
                            borderRadius: 12,
                            padding: "8px 16px",
                            cursor: "pointer",
                            fontWeight: "bold",
                            fontSize: 13,
                            transition: "all 0.15s ease",
                            boxShadow: "0 2px 4px rgba(35, 27, 21, 0.04)"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = theme.colors.accent;
                            e.currentTarget.style.background = theme.colors.surface;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = theme.colors.border;
                            e.currentTarget.style.background = theme.colors.surfaceRaised;
                          }}
                        >
                          Bid {bid}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {simObservation.phase === "completed" && !simObservation.done && (
                  <div style={{ width: "100%", textAlign: "center" }}>
                    <button
                      onClick={handleSimNextRound}
                      style={{
                        background: theme.colors.accent,
                        color: "#ffffff",
                        border: "none",
                        borderRadius: 14,
                        padding: "10px 32px",
                        cursor: "pointer",
                        fontWeight: "bold",
                        fontSize: 14,
                        boxShadow: "0 4px 12px rgba(177, 122, 75, 0.2)"
                      }}
                    >
                      Next Round
                    </button>
                  </div>
                )}

                {simObservation.player_id !== 0 && !simObservation.done && simObservation.phase !== "completed" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: theme.colors.muted, fontSize: 13, fontWeight: 600 }}>
                    <span className="animate-pulse">⏳</span> AI Agents are executing turns...
                  </div>
                )}

                {simObservation.done && (
                  (() => {
                    const scores = simState?.cumulative_scores || {};
                    const sortedPlayers = Object.entries(scores)
                      .map(([pKey, score]) => ({
                        pKey,
                        score: score as number,
                        name: pKey === "0" ? "You (Player 0)" : `AI Agent ${pKey}`
                      }))
                      .sort((a, b) => b.score - a.score);

                    const highestScore = sortedPlayers[0]?.score;

                    return (
                      <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: theme.colors.accent, textAlign: "center", letterSpacing: "1px" }}>
                          Game Complete.
                        </div>
                        <div style={{ background: theme.colors.paper, padding: "16px 24px", borderRadius: 16, border: `1px solid ${theme.colors.border}`, width: "100%", maxWidth: 400 }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: theme.colors.text, marginBottom: 12, textAlign: "center" }}>
                            Final Scoreboard
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {sortedPlayers.map((p) => {
                              const isWinner = p.score === highestScore;
                              return (
                                <div
                                  key={p.pKey}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "8px 12px",
                                    background: isWinner ? "rgba(177, 122, 75, 0.08)" : "transparent",
                                    borderRadius: 10,
                                    border: isWinner ? `1px solid ${theme.colors.accentSoft}` : "1px solid transparent",
                                    fontWeight: isWinner ? "bold" : "normal"
                                  }}
                                >
                                  <span>
                                    {p.name}
                                  </span>
                                  <span style={{ fontWeight: 800 }}>{p.score} pts</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <button
                          onClick={() => handlePlayGame(activeSimulationGame!, activeRoundIndices, turnSelectionMode)}
                          style={{
                            background: theme.colors.accent,
                            color: "#ffffff",
                            border: "none",
                            borderRadius: 12,
                            padding: "10px 32px",
                            cursor: "pointer",
                            fontWeight: "bold",
                            fontSize: 14,
                            boxShadow: "0 4px 12px rgba(177, 122, 75, 0.2)"
                          }}
                        >
                          Replay Preview
                        </button>
                      </div>
                    );
                  })()
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </main>
  );
}
