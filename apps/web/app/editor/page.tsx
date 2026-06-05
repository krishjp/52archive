"use client";

import React, { useState, useEffect } from "react";
import { theme } from "@52archive/ui";
import { toast } from "sonner";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Define TypeScript interfaces for the YAML schema configuration
interface GameConfig {
  name: string;
  subtitle: string;
  summary: string;
  deck_size: number;
  player_count_min: number;
  player_count_max: number | null; // null represents "+" (no limit)
  team_structure: "singles" | "fixed_partnerships" | "dynamic_partnerships";
  distribution_mode: "static" | "dynamic_sequence";
  cards_per_player: number;
  deal_sequence: number[];
  kitty_size: number;
  trump_mode: "none" | "fixed_rotation" | "top_card_reveal" | "highest_bidder_decides";
  rotation_sequence: string[];
  fallback_suit: string;
  bidding_required: boolean;
  bidding_order: "sequential_clockwise" | "simultaneous";
  bid_min: number;
  bid_max: string;
  hook_rule: boolean;
  lead_restrictions: "any" | "no_trump_until_broken" | "no_hearts_first";
  follow_suit_constraint: string;
  trump_play_policy: "optional" | "must_trump_if_void" | "must_overtrump";
  scoring_rule: "tricks_only" | "card_points" | "bid_matching_bonus" | "exact_bid_only" | "penalty_for_undertricks" | "penalty_for_overtricks";
  base_points_per_trick: number;
  success_bonus: number;
  failure_penalty: number;
  terminal_condition: "rounds_completed" | "score_threshold_reached";
  terminal_threshold: number;
  passing: boolean;
  passing_count: number;
  passing_sequence: string[];
  scoring_goal: "maximize" | "minimize";
  card_point_rules: { suit?: string; rank?: number | string; points: number; special?: string }[];
  turn_selection_mode?: string;
}

// Session Lock helpers
function getSessionId() {
  if (typeof window === "undefined") return "";
  let sid = localStorage.getItem("52archive_session_id");
  if (!sid) {
    sid = `sess-${Math.random().toString(36).substring(2, 11)}-${Date.now()}`;
    localStorage.setItem("52archive_session_id", sid);
  }
  return sid;
}

// Presets mapping
const PRESETS: Record<string, GameConfig & { desc: string; color: string }> = {
  spades: {
    name: "Spades",
    subtitle: "Strategic Partnership Bid Game",
    summary: "Bid tricks with a partner, play with Spades always as trump.",
    desc: "A strategic partnership game where Spades are always trump. Make your bid or face the penalty of bag accumulations.",
    color: "#4f46e5",
    deck_size: 52,
    player_count_min: 4,
    player_count_max: 4,
    team_structure: "fixed_partnerships",
    distribution_mode: "static",
    cards_per_player: 13,
    deal_sequence: [],
    kitty_size: 0,
    trump_mode: "none",
    rotation_sequence: [],
    fallback_suit: "spades",
    bidding_required: true,
    bidding_order: "sequential_clockwise",
    bid_min: 0,
    bid_max: "hand_size",
    hook_rule: false,
    lead_restrictions: "no_trump_until_broken",
    follow_suit_constraint: "strict",
    trump_play_policy: "optional",
    scoring_rule: "penalty_for_overtricks",
    base_points_per_trick: 10,
    success_bonus: 0,
    failure_penalty: -10,
    terminal_condition: "score_threshold_reached",
    terminal_threshold: 500,
    passing: false,
    passing_count: 3,
    passing_sequence: [],
    scoring_goal: "maximize",
    card_point_rules: [],
  },
  hearts: {
    name: "Hearts",
    subtitle: "Avoid Hearts & Queen of Spades",
    summary: "Avoid taking point cards (Hearts and Q♠) unless you try to shoot the moon.",
    desc: "An evasion game where you try to avoid taking tricks containing hearts or the Queen of Spades.",
    color: "#dc2626",
    deck_size: 52,
    player_count_min: 4,
    player_count_max: 4,
    team_structure: "singles",
    distribution_mode: "static",
    cards_per_player: 13,
    deal_sequence: [],
    kitty_size: 0,
    trump_mode: "none",
    rotation_sequence: [],
    fallback_suit: "no_trump",
    bidding_required: false,
    bidding_order: "sequential_clockwise",
    bid_min: 0,
    bid_max: "0",
    hook_rule: false,
    lead_restrictions: "no_hearts_first",
    follow_suit_constraint: "strict",
    trump_play_policy: "optional",
    scoring_rule: "card_points",
    base_points_per_trick: 0,
    success_bonus: 0,
    failure_penalty: 0,
    terminal_condition: "score_threshold_reached",
    terminal_threshold: 100,
    passing: true,
    passing_count: 3,
    passing_sequence: ["1", "-1", "2", "0"],
    scoring_goal: "minimize",
    card_point_rules: [
      { suit: "Hearts", points: 1 },
      { suit: "Spades", rank: 12, points: 13 },
      { special: "shoot_the_moon", points: 26 }
    ],
  },
  judgement: {
    name: "Judgement",
    subtitle: "Exact Prediction Bidding",
    summary: "Bid your hand exactly. Shifting hand sizes each round.",
    desc: "An exact-prediction trick game with a shifting hand size.",
    color: "#7c3aed",
    deck_size: 52,
    player_count_min: 3,
    player_count_max: 7,
    team_structure: "singles",
    distribution_mode: "dynamic_sequence",
    cards_per_player: 10,
    deal_sequence: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    kitty_size: 0,
    trump_mode: "fixed_rotation",
    rotation_sequence: ["Spades", "Diamonds", "Clubs", "Hearts"],
    fallback_suit: "no_trump",
    bidding_required: true,
    bidding_order: "sequential_clockwise",
    bid_min: 0,
    bid_max: "hand_size",
    hook_rule: true,
    lead_restrictions: "any",
    follow_suit_constraint: "strict",
    trump_play_policy: "optional",
    scoring_rule: "exact_bid_only",
    base_points_per_trick: 1,
    success_bonus: 10,
    failure_penalty: 0,
    terminal_condition: "rounds_completed",
    terminal_threshold: 19,
    passing: false,
    passing_count: 3,
    passing_sequence: ["left", "right", "across", "none"],
    scoring_goal: "maximize",
    card_point_rules: [],
  },
};

export default function StructuredEditorPage() {
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [gameVersion, setGameVersion] = useState<number>(1);
  const [selectedPreset, setSelectedPreset] = useState<string>("spades");
  const [config, setConfig] = useState<GameConfig>(PRESETS.spades);
  const [gameStatus, setGameStatus] = useState<string>("draft");
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [lockExpiresAt, setLockExpiresAt] = useState<string | null>(null);
  const [lockTimeLeft, setLockTimeLeft] = useState<string>("");
  const [cardRulesText, setCardRulesText] = useState<string>("");
  const [passingSeqText, setPassingSeqText] = useState<string>("");

  useEffect(() => {
    setCardRulesText(JSON.stringify(config.card_point_rules || [], null, 2));
  }, [config.card_point_rules]);

  useEffect(() => {
    const seq = config.passing_sequence || [];
    setPassingSeqText(seq.join(", "));
  }, [config.passing_sequence]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

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

  // Load existing game if ID parameter is provided
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
          if (data.isTextBased) {
            window.location.href = `/add?id=${gameId}`;
            return;
          }
          setActiveGameId(data.id);
          setGameVersion(data.version || 1);
          setGameStatus(data.status || "draft");
          setLockedBy(data.lockedBy || null);
          setLockExpiresAt(data.lockExpiresAt || null);

          if (data.graph?.structuredConfig) {
            setConfig(data.graph.structuredConfig);
            setSelectedPreset("custom");
          } else {
            // Reconstruct config from flat DB fields or default
            setConfig({
              name: data.title || "Custom Game",
              subtitle: data.subtitle || "",
              summary: data.summary || "",
              deck_size: data.deckCount === 2 ? 104 : 52,
              player_count_min: data.minPlayers || 2,
              player_count_max: data.maxPlayers || null,
              team_structure: "singles",
              distribution_mode: "static",
              cards_per_player: 13,
              deal_sequence: [],
              kitty_size: 0,
              trump_mode: "none",
              rotation_sequence: [],
              fallback_suit: "no_trump",
              bidding_required: false,
              bidding_order: "sequential_clockwise",
              bid_min: 0,
              bid_max: "0",
              hook_rule: false,
              lead_restrictions: "any",
              follow_suit_constraint: "strict",
              trump_play_policy: "optional",
              scoring_rule: "tricks_only",
              base_points_per_trick: 1,
              success_bonus: 0,
              failure_penalty: 0,
              terminal_condition: "rounds_completed",
              terminal_threshold: 10,
              passing: false,
              passing_count: 3,
              passing_sequence: ["left", "right", "across", "none"],
              scoring_goal: "maximize",
              card_point_rules: [],
            });
          }
        })
        .catch((err) => {
          console.error(err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  const handlePresetSelect = (presetKey: string) => {
    setSelectedPreset(presetKey);
    setConfig(PRESETS[presetKey] || PRESETS.spades);
    if (gameStatus === "ready_for_training") {
      setGameStatus("draft");
      toast.info("Status reverted to Draft.");
    }
  };

  const handleInputChange = (field: keyof GameConfig, value: any) => {
    setSelectedPreset("custom");
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (gameStatus === "ready_for_training") {
      setGameStatus("draft");
      toast.info("Rules edited. Status reverted to Draft.");
    }
  };

  // Voluntarily unlock when tab is closed or window is navigated away
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
        keepalive: true
      }).catch(() => { });
    };

    window.addEventListener("pagehide", releaseLockOnClose);
    window.addEventListener("beforeunload", releaseLockOnClose);

    return () => {
      window.removeEventListener("pagehide", releaseLockOnClose);
      window.removeEventListener("beforeunload", releaseLockOnClose);
    };
  }, [activeGameId]);

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

  // Build the graph.nodes & graph.edges list dynamically from editor inputs
  const buildGraphPayload = (targetConfig: GameConfig) => {
    const minP = targetConfig.player_count_min;
    const maxP = targetConfig.player_count_max;
    const playerRangeStr = maxP && maxP !== minP ? `${minP}-${maxP}` : maxP === minP ? `${minP}` : `${minP}+`;

    const nodes = [
      {
        id: "deck-init",
        kind: "setup",
        title: "Deck Initialization",
        body: `Cards: ${targetConfig.deck_size}. Players: ${playerRangeStr}. Teams: ${targetConfig.team_structure}.`,
        x: 50,
        y: 50,
      },
      {
        id: "deal-phase",
        kind: "setup",
        title: "Deal Phase",
        body: `Mode: ${targetConfig.distribution_mode}. Kitty: ${targetConfig.kitty_size}. Cards: ${targetConfig.distribution_mode === "static" ? targetConfig.cards_per_player : targetConfig.deal_sequence.join(",")
          }.`,
        x: 350,
        y: 50,
      },
      {
        id: "trump-select",
        kind: "setup",
        title: "Trump Selection",
        body: `Mode: ${targetConfig.trump_mode}. Default: ${targetConfig.fallback_suit}.`,
        x: 650,
        y: 50,
      },
      {
        id: "bidding-phase",
        kind: "decision",
        title: "Bidding Phase",
        body: targetConfig.bidding_required
          ? `Required. Range: ${targetConfig.bid_min} to ${targetConfig.bid_max}. Hook: ${targetConfig.hook_rule ? "On" : "Off"}.`
          : "Not Required.",
        x: 950,
        y: 50,
      },
      {
        id: "trick-loop",
        kind: "turn",
        title: "Trick Loop",
        body: `Leads: ${targetConfig.lead_restrictions}. Trump policy: ${targetConfig.trump_play_policy}. Constraint: Strict.`,
        x: 1250,
        y: 50,
      },
      {
        id: "scoring-phase",
        kind: "score",
        title: "Scoring Phase",
        body: `Rule: ${targetConfig.scoring_rule}. Trick pts: ${targetConfig.base_points_per_trick}. Bonus: ${targetConfig.success_bonus}. Penalty: ${targetConfig.failure_penalty}.`,
        x: 1550,
        y: 50,
      },
      {
        id: "terminal-cond",
        kind: "game-end",
        title: "Terminal Condition",
        body: `Condition: ${targetConfig.terminal_condition}. Target threshold: ${targetConfig.terminal_threshold}.`,
        x: 1850,
        y: 50,
      },
    ];

    const edges = [
      { id: "e1", from: "deck-init", to: "deal-phase" },
      { id: "e2", from: "deal-phase", to: "trump-select" },
      { id: "e3", from: "trump-select", to: "bidding-phase" },
      { id: "e4", from: "bidding-phase", to: "trick-loop" },
      { id: "e5", from: "trick-loop", to: "scoring-phase" },
      { id: "e6", from: "scoring-phase", to: "terminal-cond" },
    ];

    return { nodes, edges, structuredConfig: targetConfig };
  };

  // Generate RL-compatible YAML
  const generateYaml = () => {
    const formatList = (arr: any[]) => {
      if (!arr || arr.length === 0) return "[]";
      return `[${arr.join(", ")}]`;
    };

    const formatStringList = (arr: string[]) => {
      if (!arr || arr.length === 0) return "[]";
      return `[${arr.map((s) => `"${s}"`).join(", ")}]`;
    };

    const formatCardPointRules = (rules: any[]) => {
      if (!rules || rules.length === 0) return "[]";
      return "\n" + rules.map(r => `          - suit: "${r.suit}"\n            points: ${r.points}${r.rank !== undefined && r.rank !== null ? `\n            rank: ${r.rank}` : ""}`).join("\n");
    };

    const pMaxStr = config.player_count_max ? config.player_count_max.toString() : "null";

    return `schema_version: "2.0.0"
description: "Block-Based Graph Definition Schema for ${config.name} (RL Environment Serialization)"

graph_architecture:
  blocks:
    - type: "Deck_Initialization"
      description: "Initializes the card deck and players."
      parameters:
        deck_size: ${config.deck_size}
        player_count:
          min: ${config.player_count_min}
          max: ${pMaxStr}
        team_structure: "${config.team_structure}"
      notes: "Base card count and partnerships for the RL agent structure."

    - type: "Deal_Phase"
      description: "Distributes cards to player hand zones."
      parameters:
        distribution_mode: "${config.distribution_mode}"
        cards_per_player: ${config.cards_per_player}
        deal_sequence: ${formatList(config.deal_sequence)}
        kitty_size: ${config.kitty_size}
        turn_selection_mode: "${config.turn_selection_mode || "rotating"}"
      notes: "Configures observations state for initial cards."

    - type: "Passing_Phase"
      description: "Handles card passing before tricks start."
      parameters:
        enabled: ${config.passing}
        passing_count: ${config.passing_count}
        passing_sequence: ${formatStringList(config.passing_sequence)}
      notes: "Rotates cards between players."

    - type: "Trump_Selection"
      description: "Determines trump suit mechanics."
      parameters:
        mode: "${config.trump_mode}"
        rotation_sequence: ${formatStringList(config.rotation_sequence)}
        fallback_suit: "${config.fallback_suit}"
      notes: "Alters action-value evaluation ranks for card play."

    - type: "Bidding_Phase"
      description: "Collects trick predictions."
      parameters:
        required: ${config.bidding_required}
        bidding_order: "${config.bidding_order}"
        bid_limits:
          min: ${config.bid_min}
          max: "${config.bid_max}"
        restrictions:
          hook_rule: ${config.hook_rule}
      notes: "Directly maps predictions to RL value reward alignment."

    - type: "Trick_Loop"
      description: "Main gameplay round state machine loops."
      sub_stages:
        - stage: "Lead_Play"
          rules:
            lead_restrictions: "${config.lead_restrictions}"
        - stage: "Follow_Play"
          rules:
            follow_suit_constraint: "${config.follow_suit_constraint}"
            trump_play_policy: "${config.trump_play_policy}"
        - stage: "Trick_Resolution"
          rules:
            eval_logic: "highest_rank_lead_or_trump"
            winner_leads_next: true
      notes: "Action space masks are defined here."

    - type: "Scoring_Phase"
      description: "Calculates mathematical reward values."
      parameters:
        scoring_rule: "${config.scoring_rule}"
        base_points_per_trick: ${config.base_points_per_trick}
        success_bonus: ${config.success_bonus}
        failure_penalty: ${config.failure_penalty}
        scoring_goal: "${config.scoring_goal}"
        card_point_rules: ${formatCardPointRules(config.card_point_rules)}
      notes: "The foundational feedback reward signal for training."

    - type: "Terminal_Condition"
      description: "Evaluates terminal episode triggers."
      parameters:
        condition_type: "${config.terminal_condition}"
        threshold: ${config.terminal_threshold}
      notes: "Triggers terminal signals."
`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateYaml());
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Perform HTTP save (PUT or POST)
  const handleSave = async (trainingStatus: string = "draft") => {
    setIsSaving(true);
    const sessionId = getSessionId();
    const graphPayload = buildGraphPayload(config);
    const newlyGeneratedYaml = generateYaml();

    try {
      // Fetch existing games to check for duplicates
      const listRes = await fetch(`${API}/api/games`);
      if (listRes.ok) {
        const existingGames = await listRes.json();
        const duplicate = existingGames.find(
          (g: any) => g.rulesYaml === newlyGeneratedYaml && g.id !== activeGameId
        );
        if (duplicate) {
          toast.warning("Exact game exists", {
            description: `A game with this identical configuration already exists: "${duplicate.title}" (ID: ${duplicate.id}).`,
            duration: 6000
          });
          setIsSaving(false);
          return;
        }
      }

      if (activeGameId) {
        // PUT updates existing game
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
            playTimeMinutes: 30,
            needsPaperScorekeeping: false,
            status: trainingStatus,
            rulesYaml: newlyGeneratedYaml,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          toast.error("Save failed", { description: data.error });
          return;
        }
        setGameVersion(data.version);
        setGameStatus(trainingStatus);
        if (data.lockExpiresAt) {
          setLockExpiresAt(data.lockExpiresAt);
        }

        if (trainingStatus === "ready_for_training") {
          toast.success("Ready for training!", {
            description: "Rules saved & status changed to 'Ready for Training'! An admin will pull this configuration to train the agent model."
          });
        } else {
          toast.success("Saved Draft", {
            description: "Rules successfully saved!"
          });
        }
      } else {
        // POST creates new custom game
        const cleanId = `custom-${config.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;
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
            playTimeMinutes: 30,
            difficulty: "moderate",
            needsPaperScorekeeping: false,
            deckCount: config.deck_size > 52 ? 2 : 1,
            tags: ["custom", "structured-editor"],
            isTextBased: false,
            graph: graphPayload,
            rulesYaml: newlyGeneratedYaml,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          toast.error("Creation failed", { description: data.error });
          return;
        }
        setActiveGameId(cleanId);
        setGameVersion(1);
        setGameStatus("draft");
        window.history.pushState({}, "", `/editor?id=${cleanId}`);
        toast.success("Game Created", {
          description: `New game entry "${config.name}" successfully created!`
        });
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Network Error", {
        description: "Network error occurred while trying to save."
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#fbf7ef", fontFamily: "sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: theme.colors.muted, marginBottom: 8 }}>Loading Game Rules Config...</div>
          <div style={{ fontSize: 14, color: theme.colors.muted }}>Connecting to database</div>
        </div>
      </div>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top right, rgba(214, 176, 138, 0.15), transparent 45%), linear-gradient(180deg, #FAF6EE 0%, #F1E9DD 100%)",
        color: theme.colors.text,
        padding: "32px 24px",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <style dangerouslySetInnerHTML={{
        __html: `
        .editor-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 32px;
          margin-top: 24px;
        }
        .preset-card {
          border: 1px solid rgba(35, 27, 21, 0.08);
          background: #ffffff;
          padding: 18px;
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 12px rgba(35, 27, 21, 0.02);
          box-sizing: border-box;
        }
        .preset-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px rgba(35, 27, 21, 0.06);
          border-color: #b17a4b;
        }
        .preset-card.active {
          border-color: #b17a4b;
          background: #fffefb;
          box-shadow: 0 12px 28px rgba(177, 122, 75, 0.12);
        }
        .preset-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
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
        .form-switch {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          user-select: none;
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
        .yaml-preview {
          background: #1e1b18;
          color: #f4eadc;
          padding: 20px;
          border-radius: 18px;
          font-family: 'Courier New', Courier, monospace;
          font-size: 13px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-all;
          overflow-wrap: break-word;
          max-height: 520px;
          overflow-y: auto;
          border: 1px solid rgba(255, 255, 255, 0.05);
          box-sizing: border-box;
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
        .help-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(35, 27, 21, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
          padding: 16px;
        }
        .help-modal-content {
          background: #fffdfa;
          border-radius: 28px;
          padding: 32px;
          max-width: 680px;
          width: 100%;
          max-height: 85vh;
          overflow-y: auto;
          box-shadow: 0 20px 50px rgba(0,0,0,0.3);
          border: 1px solid rgba(35, 27, 21, 0.1);
        }
        @media (max-width: 1024px) {
          .editor-grid {
            grid-template-columns: 1fr;
          }
        }
      `}} />

      {/* HELP MODAL */}
      {showHelpModal && (
        <div className="help-modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div className="help-modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Config Parameter Guide</h2>
              <button className="btn btn-secondary" onClick={() => setShowHelpModal(false)}>Close</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18, lineHeight: 1.6, fontSize: 14 }}>
              <div>
                <strong style={{ color: "#b17a4b" }}>Deck Size:</strong>
                <p style={{ margin: "4px 0 0 0", color: theme.colors.muted }}>Defines the total number of playing cards. Standard deck uses 52, short decks like Skat use 32, and Euchre uses 24.</p>
              </div>
              <div>
                <strong style={{ color: "#b17a4b" }}>Variable Player Range:</strong>
                <p style={{ margin: "4px 0 0 0", color: theme.colors.muted }}>Set minimum and maximum players. To represent open-ended numbers (e.g. 2 or more players), leave the maximum empty (2+).</p>
              </div>
              <div>
                <strong style={{ color: "#b17a4b" }}>Distribution Mode:</strong>
                <p style={{ margin: "4px 0 0 0", color: theme.colors.muted }}>Choose "Static" for equal hands every deal, or "Dynamic Sequence" for variable hand size structures like in Oh Hell (e.g. 10, 9, 8... cards).</p>
              </div>
              <div>
                <strong style={{ color: "#b17a4b" }}>Trump Mode:</strong>
                <p style={{ margin: "4px 0 0 0", color: theme.colors.muted }}>Specify how trump is determined: "None" (No Trump/Fixed suit), "Top Card Reveal" (last card flipped), or "Highest Bidder Decides".</p>
              </div>
              <div>
                <strong style={{ color: "#b17a4b" }}>Dealer Hook Rule:</strong>
                <p style={{ margin: "4px 0 0 0", color: theme.colors.muted }}>An Oh Hell rule where the sum of all player bids cannot equal the cards dealt, forcing someone to lose or gain points.</p>
              </div>
              <div>
                <strong style={{ color: "#b17a4b" }}>Scoring Rule:</strong>
                <p style={{ margin: "4px 0 0 0", color: theme.colors.muted }}>Maps mathematical reward functions. Options: "Exact Bid Only" (scores only come from matched tricks, e.g. Oh Hell), "Bid Matching Bonus", "Tricks Only", or penalties for undertricks/overtricks.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <section style={{ maxWidth: 1440, margin: "0 auto" }}>
        {/* Header Block */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(35,27,21,0.08)", paddingBottom: 20 }}>
          <div>
            <a href="/games" onClick={handleBackToCatalog} style={{ color: "#b17a4b", textDecoration: "none", fontSize: 13, fontWeight: 700 }}>← Back to Catalog</a>
            <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 800, margin: "6px 0 0 0", letterSpacing: "-1px" }}>
              Choose Your Trick
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a href="/editor/guide" target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              Parameters Guide ↗
            </a>
            <button className="btn btn-primary" onClick={() => handleSave("draft")} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Draft"}
            </button>
            {activeGameId && (
              gameStatus === "ready_for_training" ? (
                <button className="btn btn-secondary" onClick={() => handleSave("draft")} disabled={isSaving}>
                  Return to Draft
                </button>
              ) : (
                <button className="btn btn-success" onClick={() => handleSave("ready_for_training")} disabled={isSaving}>
                  Mark Ready for Training
                </button>
              )
            )}
          </div>
        </div>

        {/* Status indicator bar */}
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
            <span style={{ fontSize: 12, textTransform: "uppercase", padding: "4px 10px", borderRadius: 8, fontWeight: 800, background: gameStatus === "ready_for_training" ? "#10b981" : "#d97706", color: "#ffffff" }}>
              Status: {gameStatus.replace(/_/g, " ")}
            </span>
          </div>
        )}

        {/* Preset Selector */}
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: theme.colors.text }}>
            Load Rules Template
          </h2>
          <div className="preset-grid">
            {Object.entries(PRESETS).map(([key, item]) => (
              <div
                key={key}
                className={`preset-card ${selectedPreset === key ? "active" : ""}`}
                onClick={() => handlePresetSelect(key)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: item.color }}></span>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{item.name}</span>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: theme.colors.muted, lineHeight: 1.4 }}>
                  {item.desc}
                </p>
              </div>
            ))}
            <div
              className={`preset-card ${selectedPreset === "custom" ? "active" : ""}`}
              onClick={() => handlePresetSelect("custom")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: theme.colors.muted }}></span>
                <span style={{ fontWeight: 800, fontSize: 15 }}>Custom Game</span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: theme.colors.muted, lineHeight: 1.4 }}>
                Assemble custom parameters manually using the rule options below.
              </p>
            </div>
          </div>
        </div>

        {/* Structured Layout Split */}
        <div className="editor-grid">
          {/* Form Options */}
          <div className="card-container" style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* META-INFO DESCRIPTION */}
            <div>
              <h3 style={{ fontSize: 14, borderBottom: "1.5px solid rgba(35,27,21,0.06)", paddingBottom: 6, marginBottom: 14, fontWeight: 700, letterSpacing: 0.5 }}>
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
                <label className="form-label">Summary / Description</label>
                <textarea
                  rows={2}
                  className="form-textarea"
                  value={config.summary}
                  onChange={(e) => handleInputChange("summary", e.target.value)}
                />
              </div>
            </div>

            {/* SECTION 1: DECK & PARTNERSHIPS */}
            <div>
              <h3 style={{ fontSize: 14, borderBottom: "1.5px solid rgba(35,27,21,0.06)", paddingBottom: 6, marginBottom: 14, fontWeight: 700, letterSpacing: 0.5 }}>
                1. Deck & Partnerships
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Deck Size</label>
                  <select
                    className="form-select"
                    value={config.deck_size}
                    onChange={(e) => handleInputChange("deck_size", parseInt(e.target.value))}
                  >
                    {[24, 32, 36, 40, 48, 52, 104].map((size) => (
                      <option key={size} value={size}>{size} Cards</option>
                    ))}
                  </select>
                </div>
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
                  <span style={{ fontSize: 11, color: theme.colors.muted, marginTop: 4, display: "block" }}>
                    Configured Range: {
                      config.player_count_max && config.player_count_max !== config.player_count_min
                        ? `${config.player_count_min}–${config.player_count_max}`
                        : config.player_count_max === config.player_count_min
                        ? `${config.player_count_min}`
                        : `${config.player_count_min}+`
                    } players
                  </span>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Team Structure</label>
                <select
                  className="form-select"
                  value={config.team_structure}
                  onChange={(e) => handleInputChange("team_structure", e.target.value)}
                >
                  <option value="singles">Singles (Free-for-all)</option>
                  <option value="fixed_partnerships">Fixed Partnerships</option>
                  <option value="dynamic_partnerships">Dynamic Partnerships</option>
                </select>
              </div>
            </div>

            {/* SECTION 2: CARD DEALING */}
            <div>
              <h3 style={{ fontSize: 14, borderBottom: "1.5px solid rgba(35,27,21,0.06)", paddingBottom: 6, marginBottom: 14, fontWeight: 700, letterSpacing: 0.5 }}>
                2. Deal Phase
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Distribution Mode</label>
                  <select
                    className="form-select"
                    value={config.distribution_mode}
                    onChange={(e) => handleInputChange("distribution_mode", e.target.value)}
                  >
                    <option value="static">Static (Always equal)</option>
                    <option value="dynamic_sequence">Dynamic Sequence</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Kitty Size</label>
                  <input
                    type="number"
                    min={0}
                    className="form-input"
                    value={config.kitty_size}
                    onChange={(e) => handleInputChange("kitty_size", parseInt(e.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Starting Player Rotation</label>
                  <select
                    className="form-select"
                    value={config.turn_selection_mode || "rotating"}
                    onChange={(e) => handleInputChange("turn_selection_mode", e.target.value)}
                  >
                    <option value="rotating">Rotating Dealer</option>
                    <option value="most_points">Player with Most Points</option>
                    <option value="least_points">Player with Least Points</option>
                  </select>
                </div>
              </div>

              {config.distribution_mode === "static" ? (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Cards Dealt Per Player</label>
                  <input
                    type="number"
                    min={1}
                    max={26}
                    className="form-input"
                    value={config.cards_per_player}
                    onChange={(e) => handleInputChange("cards_per_player", parseInt(e.target.value))}
                  />
                </div>
              ) : (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Deal Sequence (Comma Separated)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 10,9,8,7,6"
                    value={config.deal_sequence.join(",")}
                    onChange={(e) => {
                      const nums = e.target.value
                        .split(",")
                        .map((n) => parseInt(n.trim()))
                        .filter((n) => !isNaN(n));
                      handleInputChange("deal_sequence", nums);
                    }}
                  />
                </div>
              )}

              <div style={{ marginTop: 16, borderTop: "1px dashed rgba(35,27,21,0.06)", paddingTop: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "center" }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={config.passing}
                        onChange={(e) => handleInputChange("passing", e.target.checked)}
                      />
                      Enable Card Passing
                    </label>
                  </div>
                  {config.passing && (
                    <>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Passing Card Count</label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          className="form-input"
                          value={config.passing_count}
                          onChange={(e) => handleInputChange("passing_count", parseInt(e.target.value))}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Passing Sequence</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. 1, -1, 2, 0"
                          value={passingSeqText}
                          onChange={(e) => {
                            const rawVal = e.target.value;
                            // Block any character that is not a digit, minus sign, comma, or space
                            const clean = rawVal.replace(/[^0-9\-\,\s]/g, "");

                            // Extract numbers
                            const numMatches = clean.match(/\-?\d+/g) || [];

                            // Check if the user is in the middle of typing a separator or minus at the end
                            let suffix = "";
                            const cleanEndsWithMinus = clean.endsWith("-");
                            const cleanEndsWithComma = clean.endsWith(",");
                            const cleanEndsWithSpace = clean.endsWith(" ");

                            if (cleanEndsWithMinus) {
                              suffix = "-";
                            } else if (cleanEndsWithComma) {
                              suffix = ", ";
                            } else if (cleanEndsWithSpace && clean.trim().length > 0) {
                              suffix = ", ";
                            }

                            // Format into X, X, X
                            let formatted = "";
                            if (numMatches.length > 0) {
                              formatted = `${numMatches.join(", ")}${suffix}`;
                            } else if (suffix === "-") {
                              formatted = "-";
                            } else {
                              formatted = "";
                            }

                            setPassingSeqText(formatted);

                            // Parse the actual array of strings to update config
                            const seq = numMatches;
                            const isDifferent = seq.length !== config.passing_sequence.length ||
                              seq.some((val, idx) => val !== config.passing_sequence[idx]);
                            if (isDifferent) {
                              handleInputChange("passing_sequence", seq);
                            }
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 3: TRUMP SELECTION */}
            <div>
              <h3 style={{ fontSize: 14, borderBottom: "1.5px solid rgba(35,27,21,0.06)", paddingBottom: 6, marginBottom: 14, fontWeight: 700, letterSpacing: 0.5 }}>
                3. Trump Selection
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Trump Mode</label>
                  <select
                    className="form-select"
                    value={config.trump_mode}
                    onChange={(e) => handleInputChange("trump_mode", e.target.value)}
                  >
                    <option value="none">No Selection (Fixed/No Trump)</option>
                    <option value="fixed_rotation">Fixed Rotation</option>
                    <option value="top_card_reveal">Top Card Reveal</option>
                    <option value="highest_bidder_decides">Highest Bidder Decides</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Fallback/Fixed Suit</label>
                  <select
                    className="form-select"
                    value={config.fallback_suit}
                    onChange={(e) => handleInputChange("fallback_suit", e.target.value)}
                  >
                    <option value="no_trump">No Trump</option>
                    <option value="spades">Spades (♠)</option>
                    <option value="hearts">Hearts (♥)</option>
                    <option value="diamonds">Diamonds (♦)</option>
                    <option value="clubs">Clubs (♣)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION 4: BIDDING MECHANICS */}
            <div>
              <h3 style={{ fontSize: 14, borderBottom: "1.5px solid rgba(35,27,21,0.06)", paddingBottom: 6, marginBottom: 14, fontWeight: 700, letterSpacing: 0.5 }}>
                4. Bidding Phase
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "center" }}>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-switch">
                    <input
                      type="checkbox"
                      checked={config.bidding_required}
                      onChange={(e) => handleInputChange("bidding_required", e.target.checked)}
                    />
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Bidding Required</span>
                  </label>
                </div>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-switch">
                    <input
                      type="checkbox"
                      checked={config.hook_rule}
                      onChange={(e) => handleInputChange("hook_rule", e.target.checked)}
                    />
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Dealer Hook Rule</span>
                  </label>
                </div>
              </div>

              {config.bidding_required && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 10 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Min Bid</label>
                    <input
                      type="number"
                      className="form-input"
                      value={config.bid_min}
                      onChange={(e) => handleInputChange("bid_min", parseInt(e.target.value))}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Max Bid</label>
                    <input
                      type="text"
                      className="form-input"
                      value={config.bid_max}
                      onChange={(e) => handleInputChange("bid_max", e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Order</label>
                    <select
                      className="form-select"
                      value={config.bidding_order}
                      onChange={(e) => handleInputChange("bidding_order", e.target.value)}
                    >
                      <option value="sequential_clockwise">Sequential</option>
                      <option value="simultaneous">Simultaneous</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 5: PLAY CONSTRAINTS */}
            <div>
              <h3 style={{ fontSize: 14, borderBottom: "1.5px solid rgba(35,27,21,0.06)", paddingBottom: 6, marginBottom: 14, fontWeight: 700, letterSpacing: 0.5 }}>
                5. Trick Loop & Play Constraints
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Lead Restrictions</label>
                  <select
                    className="form-select"
                    value={config.lead_restrictions}
                    onChange={(e) => handleInputChange("lead_restrictions", e.target.value)}
                  >
                    <option value="any">Any Card</option>
                    <option value="no_trump_until_broken">No Trump Until Broken</option>
                    <option value="no_hearts_first">No Hearts on First Trick</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Trump Play Policy</label>
                  <select
                    className="form-select"
                    value={config.trump_play_policy}
                    onChange={(e) => handleInputChange("trump_play_policy", e.target.value)}
                  >
                    <option value="optional">Optional</option>
                    <option value="must_trump_if_void">Must Trump If Void</option>
                    <option value="must_overtrump">Must Overtrump</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION 6: SCORING & TERMINAL CONDITIONS */}
            <div>
              <h3 style={{ fontSize: 14, borderBottom: "1.5px solid rgba(35,27,21,0.06)", paddingBottom: 6, marginBottom: 14, fontWeight: 700, letterSpacing: 0.5 }}>
                6. Scoring & Terminal Condition
              </h3>
              <div className="form-group">
                <label className="form-label">Scoring Rule</label>
                <select
                  className="form-select"
                  value={config.scoring_rule}
                  onChange={(e) => handleInputChange("scoring_rule", e.target.value)}
                >
                  <option value="tricks_only">Tricks Only (points for every trick won)</option>
                  <option value="card_points">Card Points (score point value of captured cards, e.g. Hearts)</option>
                  <option value="bid_matching_bonus">Bid Matching Bonus (points for won tricks + bonus if matched)</option>
                  <option value="exact_bid_only">Exact Bid Only (points only if bid is matched exactly, e.g. Oh Hell)</option>
                  <option value="penalty_for_undertricks">Penalty for Undertricks (bonus if matched, penalty per trick short)</option>
                  <option value="penalty_for_overtricks">Penalty for Overtricks (bonus if matched, penalty per trick over)</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Base Points / Trick</label>
                  <input
                    type="number"
                    className="form-input"
                    value={config.base_points_per_trick}
                    onChange={(e) => handleInputChange("base_points_per_trick", parseInt(e.target.value))}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Success Bonus</label>
                  <input
                    type="number"
                    className="form-input"
                    value={config.success_bonus}
                    onChange={(e) => handleInputChange("success_bonus", parseInt(e.target.value))}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Failure Penalty</label>
                  <input
                    type="number"
                    className="form-input"
                    value={config.failure_penalty}
                    onChange={(e) => handleInputChange("failure_penalty", parseInt(e.target.value))}
                  />
                </div>
              </div>

              <div style={{ marginTop: 16, borderTop: "1px dashed rgba(35,27,21,0.06)", paddingTop: 16, marginBottom: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Scoring Goal</label>
                    <select
                      className="form-select"
                      value={config.scoring_goal}
                      onChange={(e) => handleInputChange("scoring_goal", e.target.value)}
                    >
                      <option value="maximize">Maximize (Accumulate high points)</option>
                      <option value="minimize">Minimize (Avoid points, e.g. Hearts)</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Card Point Rules (JSON Array)</label>
                    <textarea
                      rows={3}
                      className="form-input"
                      style={{ fontFamily: "monospace", fontSize: 12 }}
                      placeholder='[{"suit": "Hearts", "points": 1}, {"suit": "Spades", "rank": 12, "points": 13}]'
                      value={cardRulesText}
                      onChange={(e) => {
                        setCardRulesText(e.target.value);
                        try {
                          const parsed = JSON.parse(e.target.value);
                          if (Array.isArray(parsed)) {
                            handleInputChange("card_point_rules", parsed);
                          }
                        } catch (err) {
                          // Allow invalid json momentarily while typing
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Terminal Condition Type</label>
                  <select
                    className="form-select"
                    value={config.terminal_condition}
                    onChange={(e) => handleInputChange("terminal_condition", e.target.value)}
                  >
                    <option value="rounds_completed">Rounds Completed</option>
                    <option value="score_threshold_reached">Score Threshold Reached</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Threshold Value</label>
                  <input
                    type="number"
                    className="form-input"
                    value={config.terminal_threshold}
                    onChange={(e) => handleInputChange("terminal_threshold", parseInt(e.target.value))}
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Live Preview Console */}
          <div style={{ position: "sticky", top: 24, height: "fit-content" }}>
            <div className="card-container" style={{ background: "#1e1b18", color: "#f4eadc" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#10b981" }}></span>
                  <span style={{ fontFamily: "monospace", fontSize: 13, letterSpacing: 0.5, fontWeight: 700, color: "rgba(244, 234, 220, 0.6)" }}>
                    {config.name.toUpperCase().replace(/\s+/g, "_")}.YAML
                  </span>
                </div>
                <button
                  onClick={copyToClipboard}
                  style={{
                    background: "rgba(244, 234, 220, 0.08)",
                    border: "1px solid rgba(244, 234, 220, 0.15)",
                    padding: "6px 12px",
                    borderRadius: 8,
                    color: "#f4eadc",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(244, 234, 220, 0.15)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(244, 234, 220, 0.08)")}
                >
                  {copySuccess ? "Copied" : "Copy YAML"}
                </button>
              </div>
              <pre className="yaml-preview">
                {generateYaml()}
              </pre>
              <div style={{ marginTop: 16, fontSize: 12, color: "rgba(244, 234, 220, 0.45)", fontStyle: "italic", lineHeight: 1.45 }}>
                <strong>Admin training integration</strong>: Copy this config YAML to construct a training environment. Once training is completed locally, upload the serialized checkpoint model back to the DB to make this game live for users.
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
