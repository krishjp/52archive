"use client";

import React, { useState, useEffect } from "react";
import { theme } from "@52archive/ui";
import { toast } from "sonner";
import MarkdownIt from "markdown-it";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

interface TextGameConfig {
  name: string;
  subtitle: string;
  summary: string;
  player_count_min: number;
  player_count_max: number | null;
  playTimeMinutes: number;
  needsPaperScorekeeping: boolean;
  textRules: string;
}

function getSessionId() {
  if (typeof window === "undefined") return "";
  let sid = localStorage.getItem("52archive_session_id");
  if (!sid) {
    sid = `sess-${Math.random().toString(36).substring(2, 11)}-${Date.now()}`;
    localStorage.setItem("52archive_session_id", sid);
  }
  return sid;
}

export default function TextGameAddPage() {
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [gameVersion, setGameVersion] = useState<number>(1);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [lockExpiresAt, setLockExpiresAt] = useState<string | null>(null);
  const [lockTimeLeft, setLockTimeLeft] = useState<string>("");

  const [creationMode, setCreationMode] = useState<"choose" | "text">("choose");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [config, setConfig] = useState<TextGameConfig>({
    name: "",
    subtitle: "",
    summary: "",
    player_count_min: 2,
    player_count_max: null,
    playTimeMinutes: 30,
    needsPaperScorekeeping: false,
    textRules: "",
  });

  // Lock remaining countdown timer
  useEffect(() => {
    if (!lockExpiresAt) {
      setLockTimeLeft("");
      return;
    }

    const updateTimeLeft = () => {
      const ms = new Date(lockExpiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setLockTimeLeft("Expired");
      } else {
        const totalSecs = Math.floor(ms / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        setLockTimeLeft(`${mins}m ${secs}s`);
      }
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [lockExpiresAt]);

  // Load existing game if editing
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get("id");

    if (gameId) {
      setIsLoading(true);
      fetch(`${API}/api/games/${gameId}`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch game rules.");
          return res.json();
        })
        .then((data) => {
          // If it's a structured game, redirect to editor
          if (!data.isTextBased) {
            window.location.href = `/editor?id=${gameId}`;
            return;
          }

          setActiveGameId(data.id);
          setGameVersion(data.version || 1);
          setLockedBy(data.lockedBy || null);
          setLockExpiresAt(data.lockExpiresAt || null);
          setCreationMode("text");

          setConfig({
            name: data.title || "",
            subtitle: data.subtitle || "",
            summary: data.summary || "",
            player_count_min: data.minPlayers || 2,
            player_count_max: data.maxPlayers || null,
            playTimeMinutes: data.playTimeMinutes || 30,
            needsPaperScorekeeping: data.needsPaperScorekeeping || false,
            textRules: data.textRules || "",
          });
        })
        .catch((err) => {
          console.error(err);
          toast.error("Error loading rules catalog entry");
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  // Unload release locks
  useEffect(() => {
    if (!activeGameId) return;

    const releaseLockOnClose = () => {
      const sessionId = getSessionId();
      const url = `${API}/api/games/${activeGameId}/lock`;
      const payload = JSON.stringify({ sessionId });

      fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    };

    window.addEventListener("pagehide", releaseLockOnClose);
    window.addEventListener("beforeunload", releaseLockOnClose);

    return () => {
      window.removeEventListener("pagehide", releaseLockOnClose);
      window.removeEventListener("beforeunload", releaseLockOnClose);
    };
  }, [activeGameId]);

  const handleInputChange = (field: keyof TextGameConfig, value: any) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleBackToCatalog = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (activeGameId) {
      const sessionId = getSessionId();
      try {
        await fetch(`${API}/api/games/${activeGameId}/lock`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
      } catch (err) {
        console.error("Failed to release lock on navigate away:", err);
      }
    }
    window.location.href = "/games";
  };

  const handleSave = async () => {
    setIsSaving(true);
    const sessionId = getSessionId();
    // Graph payload contains textRules for plaintext guides
    const graphPayload = {
      nodes: [],
      edges: [],
      textRules: config.textRules,
    };

    try {
      if (activeGameId) {
        // PUT update text based game
        const res = await fetch(`${API}/api/games/${activeGameId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            version: gameVersion,
            graph: graphPayload,
            title: config.name,
            subtitle: config.subtitle,
            summary: config.summary,
            minPlayers: config.player_count_min,
            maxPlayers: config.player_count_max,
            playTimeMinutes: config.playTimeMinutes,
            needsPaperScorekeeping: config.needsPaperScorekeeping,
            status: "active",
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          toast.error("Save failed", { description: data.error });
          return;
        }

        setGameVersion(data.version);
        if (data.lockExpiresAt) {
          setLockExpiresAt(data.lockExpiresAt);
        }

        toast.success("Catalog rules saved successfully.");
      } else {
        // POST create text based game
        const cleanId = `custom-text-${config.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;
        const res = await fetch(`${API}/api/games`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: cleanId,
            title: config.name,
            subtitle: config.subtitle,
            summary: config.summary,
            minPlayers: config.player_count_min,
            maxPlayers: config.player_count_max,
            playTimeMinutes: config.playTimeMinutes,
            difficulty: "moderate",
            needsPaperScorekeeping: config.needsPaperScorekeeping,
            deckCount: 1,
            tags: ["custom", "text-based"],
            isTextBased: true,
            textRules: config.textRules,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          toast.error("Creation failed", { description: data.error });
          return;
        }

        setActiveGameId(cleanId);
        setGameVersion(1);
        window.history.pushState({}, "", `/add?id=${cleanId}`);
        toast.success("Plain text catalog entry created successfully.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Network error while trying to save entry.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#fbf7ef", fontFamily: "sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: theme.colors.muted, marginBottom: 8 }}>Loading Game Details...</div>
          <div style={{ fontSize: 14, color: theme.colors.muted }}>Connecting to database</div>
        </div>
      </div>
    );
  }

  // ── Choice Mode ──────────────────────────────────────────────────────────
  if (creationMode === "choose") {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "radial-gradient(circle at top right, rgba(214, 176, 138, 0.12), transparent 45%), linear-gradient(180deg, #FAF6EE 0%, #F1E9DD 100%)",
          color: theme.colors.text,
          padding: "64px 24px",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div style={{ maxWidth: 800, width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h1 style={{ fontSize: 40, fontWeight: 800, margin: 0, letterSpacing: "-1px" }}>Add a Game Entry</h1>
            <p style={{ color: theme.colors.muted, marginTop: 10, fontSize: 16 }}>Select the rules format you would like to describe for this catalog entry.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div
              onClick={() => {
                window.location.href = "/editor";
              }}
              style={{
                background: "#ffffff",
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 24,
                padding: 32,
                cursor: "pointer",
                transition: "all 0.2s",
                boxShadow: "0 10px 30px rgba(35, 27, 21, 0.04)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.borderColor = "#b17a4b";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.borderColor = "rgba(35, 27, 21, 0.1)";
              }}
            >
              <h2 style={{ fontSize: 20, margin: "0 0 10px 0", fontWeight: 800 }}>Structured Rules Config</h2>
              <p style={{ margin: 0, color: theme.colors.muted, fontSize: 14, lineHeight: 1.5 }}>
                Configure deck details, trumps, loops, and bidding criteria. Recommended for trick-taking games heading to Reinforcement Learning agent training.
              </p>
            </div>

            <div
              onClick={() => setCreationMode("text")}
              style={{
                background: "#ffffff",
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 24,
                padding: 32,
                cursor: "pointer",
                transition: "all 0.2s",
                boxShadow: "0 10px 30px rgba(35, 27, 21, 0.04)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.borderColor = "#b17a4b";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.borderColor = "rgba(35, 27, 21, 0.1)";
              }}
            >
              <h2 style={{ fontSize: 20, margin: "0 0 10px 0", fontWeight: 800 }}>Plain Text Catalog Entry</h2>
              <p style={{ margin: 0, color: theme.colors.muted, fontSize: 14, lineHeight: 1.5 }}>
                Write plain rules, explanations, setup directions, and variants in Markdown formatting. Perfect for traditional, non-simulation catalog listings.
              </p>
            </div>
          </div>

          <div style={{ textAlign: "center", marginTop: 32 }}>
            <a href="/games" style={{ color: theme.colors.muted, textDecoration: "none", fontSize: 14 }}>← Return to Catalog</a>
          </div>
        </div>
      </main>
    );
  }



  // ── Text Rules Mode ──────────────────────────────────────────────────────
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top right, rgba(214, 176, 138, 0.15), transparent 45%), linear-gradient(180deg, #FAF6EE 0%, #F1E9DD 100%)",
        color: theme.colors.text,
        padding: "32px 24px",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .text-editor-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
          margin-top: 24px;
        }
        .form-group {
          margin-bottom: 18px;
          box-sizing: border-box;
        }
        .form-label {
          display: block;
          font-size: 12px;
          font-weight: 700;
          color: #7e6d5b;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .form-input, .form-select, .form-textarea {
          width: 100%;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1.5px solid rgba(35, 27, 21, 0.1);
          background: #ffffff;
          color: #231b15;
          font-size: 14px;
          box-sizing: border-box;
          outline: none;
          transition: border-color 0.15s ease;
        }
        .form-input:focus, .form-select:focus, .form-textarea:focus {
          border-color: #b17a4b;
        }
        .card-container {
          background: #ffffff;
          border-radius: 24px;
          border: 1px solid rgba(35, 27, 21, 0.08);
          box-shadow: 0 10px 30px rgba(35, 27, 21, 0.04);
          padding: 28px;
          box-sizing: border-box;
          max-width: 100%;
          overflow: hidden;
        }
        .btn {
          padding: 10px 20px;
          border-radius: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          font-size: 14px;
        }
        .btn-primary {
          background: #b17a4b;
          color: #ffffff;
        }
        .btn-primary:hover {
          background: #966136;
        }
        .btn-secondary {
          background: rgba(35, 27, 21, 0.06);
          color: #231b15;
          border: 1px solid rgba(35, 27, 21, 0.1);
        }
        .btn-secondary:hover {
          background: rgba(35, 27, 21, 0.1);
        }
        .btn-success {
          background: #10b981;
          color: #ffffff;
        }
        .btn-success:hover {
          background: #059669;
        }
        .rules-preview {
          background: #fffdfb;
          border: 1.5px solid rgba(35, 27, 21, 0.08);
          padding: 24px;
          border-radius: 20px;
          min-height: 480px;
          overflow-y: auto;
          box-sizing: border-box;
        }
        .rules-preview h1, .rules-preview h2, .rules-preview h3, .rules-preview h4 {
          color: #b17a4b;
          margin-top: 20px;
          margin-bottom: 8px;
          font-weight: 800;
        }
        .rules-preview h1 { font-size: 20px; }
        .rules-preview h2 { font-size: 18px; }
        .rules-preview h3, .rules-preview h4 { font-size: 16px; }
        .rules-preview p {
          margin: 0 0 12px 0;
          line-height: 1.65;
          color: #231b15;
        }
        .rules-preview ul, .rules-preview ol {
          padding-left: 20px;
          margin-bottom: 12px;
        }
        .rules-preview li {
          margin-bottom: 4px;
          line-height: 1.5;
        }
        .rules-preview strong {
          font-weight: 700;
          color: #231b15;
        }
        .rules-preview table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 16px;
          font-size: 13.5px;
        }
        .rules-preview th, .rules-preview td {
          border: 1px solid rgba(35, 27, 21, 0.12);
          padding: 8px 12px;
          text-align: left;
        }
        .rules-preview th {
          background: rgba(35, 27, 21, 0.04);
          font-weight: 700;
        }
        .rules-preview blockquote {
          border-left: 4px solid #b17a4b;
          padding: 6px 16px;
          margin: 0 0 16px 0;
          background: rgba(177, 122, 75, 0.05);
          font-style: italic;
          color: #7e6d5b;
        }
        .rules-preview pre {
          background: #1e1b18;
          color: #f4eadc;
          padding: 14px;
          border-radius: 10px;
          overflow-x: auto;
          margin-bottom: 16px;
        }
        .rules-preview code {
          font-family: 'Courier New', Courier, monospace;
          background: rgba(35, 27, 21, 0.06);
          padding: 2px 5px;
          border-radius: 4px;
          font-size: 13px;
        }
        .rules-preview pre code {
          background: transparent;
          padding: 0;
          font-size: 12.5px;
          color: inherit;
        }
        .rules-preview hr {
          border: 0;
          border-top: 1.5px solid rgba(35, 27, 21, 0.08);
          margin: 20px 0;
        }
        @media (max-width: 1024px) {
          .text-editor-grid {
            grid-template-columns: 1fr;
          }
        }
      `}} />

      <section style={{ maxWidth: 1440, margin: "0 auto" }}>
        {/* Header Block */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(35,27,21,0.08)", paddingBottom: 20 }}>
          <div>
            <a href="/games" onClick={handleBackToCatalog} style={{ color: "#b17a4b", textDecoration: "none", fontSize: 13, fontWeight: 700 }}>← Back to Catalog</a>
            <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 800, margin: "6px 0 0 0", letterSpacing: "-1px" }}>
              Catalog Rules Editor
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={() => handleSave()} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Rules"}
            </button>
          </div>
        </div>

        {/* Lock indicators */}
        {activeGameId && (
          <div style={{ marginTop: 16, background: "rgba(177, 122, 75, 0.08)", borderRadius: 12, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <span style={{ fontSize: 14 }}>
              Editing entry: <strong style={{ textTransform: "uppercase" }}>{config.name}</strong> (v{gameVersion})
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, color: theme.colors.muted }}>
              {lockedBy === getSessionId() ? (
                <span>
                  Lock held by you (expires in: <strong style={{ color: "#b17a4b" }}>{lockTimeLeft}</strong>)
                </span>
              ) : lockedBy ? (
                <span style={{ color: "#dc2626" }}>
                  Read-only: Lock held by another session (…{lockedBy.slice(-6)})
                </span>
              ) : (
                <span style={{ color: "#d97706" }}>No active edit lock</span>
              )}
            </span>
          </div>
        )}

        <div className="text-editor-grid">
          {/* Form options */}
          <div className="card-container" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <h3 style={{ fontSize: 14, borderBottom: "1.5px solid rgba(35,27,21,0.06)", paddingBottom: 6, marginBottom: 14, fontWeight: 700 }}>
                Catalog Listing Information
              </h3>
              <div className="form-group">
                <label className="form-label">Game Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={config.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Subtitle</label>
                <input
                  type="text"
                  className="form-input"
                  value={config.subtitle}
                  onChange={(e) => handleInputChange("subtitle", e.target.value)}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Summary / Brief Description</label>
                <textarea
                  rows={2}
                  className="form-textarea"
                  value={config.summary}
                  onChange={(e) => handleInputChange("summary", e.target.value)}
                />
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: 14, borderBottom: "1.5px solid rgba(35,27,21,0.06)", paddingBottom: 6, marginBottom: 14, fontWeight: 700 }}>
                Setup & Metadata
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Player Count Range</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="number"
                      min={2}
                      className="form-input"
                      style={{ flex: 1 }}
                      placeholder="Min"
                      value={config.player_count_min}
                      onChange={(e) => handleInputChange("player_count_min", parseInt(e.target.value))}
                    />
                    <span style={{ color: theme.colors.muted }}>to</span>
                    <input
                      type="number"
                      min={config.player_count_min}
                      className="form-input"
                      style={{ flex: 1 }}
                      placeholder="Max (leave empty for +)"
                      value={config.player_count_max || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        handleInputChange("player_count_max", val === "" ? null : parseInt(val));
                      }}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Est. Play Time (mins)</label>
                  <input
                    type="number"
                    min={5}
                    className="form-input"
                    value={config.playTimeMinutes}
                    onChange={(e) => handleInputChange("playTimeMinutes", parseInt(e.target.value))}
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-switch">
                  <input
                    type="checkbox"
                    checked={config.needsPaperScorekeeping}
                    onChange={(e) => handleInputChange("needsPaperScorekeeping", e.target.checked)}
                  />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Needs Paper Scorekeeping</span>
                </label>
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: 14, borderBottom: "1.5px solid rgba(35,27,21,0.06)", paddingBottom: 6, marginBottom: 14, fontWeight: 700 }}>
                Plain Text Rules Guide (Supports Markdown)
              </h3>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <textarea
                  rows={14}
                  className="form-textarea"
                  style={{ fontFamily: "monospace" }}
                  placeholder="### Setup&#10;Deal 13 cards to each player...&#10;&#10;### Gameplay&#10;Lead a card. Play clockwise..."
                  value={config.textRules}
                  onChange={(e) => handleInputChange("textRules", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div style={{ position: "sticky", top: 24, height: "fit-content" }}>
            <div className="card-container" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1.5px solid rgba(35,27,21,0.06)", paddingBottom: 10 }}>
                <h3 style={{ fontSize: 15, margin: 0, fontWeight: 800 }}>Live Guide Preview</h3>
                <span style={{ fontSize: 11, textTransform: "uppercase", background: "rgba(35,27,21,0.05)", padding: "4px 8px", borderRadius: 6, fontWeight: 700 }}>
                  Plain-Text Listing
                </span>
              </div>
              <div className="rules-preview">
                <h2 style={{ margin: "0 0 4px 0", fontSize: 24 }}>{config.name || "Untitled Game"}</h2>
                <p style={{ margin: "0 0 16px 0", fontStyle: "italic", color: theme.colors.muted }}>{config.subtitle || "No subtitle provided."}</p>
                <div style={{ display: "flex", gap: 16, background: theme.colors.background, padding: 14, borderRadius: 12, marginBottom: 20 }}>
                  <div>
                    <span style={{ fontSize: 10, textTransform: "uppercase", color: theme.colors.muted }}>Players</span>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {config.player_count_min}
                      {config.player_count_max ? `-${config.player_count_max}` : "+"}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 10, textTransform: "uppercase", color: theme.colors.muted }}>Play Time</span>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{config.playTimeMinutes} min</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 10, textTransform: "uppercase", color: theme.colors.muted }}>Scorekeeping</span>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{config.needsPaperScorekeeping ? "Paper" : "Mental"}</div>
                  </div>
                </div>

                <div style={{ fontSize: 14, color: theme.colors.text }}>
                  {config.textRules ? (
                    <div dangerouslySetInnerHTML={{ __html: md.render(config.textRules) }} />
                  ) : (
                    <p style={{ color: theme.colors.muted, fontSize: 14 }}>Start writing in the editor to see your live preview here.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
