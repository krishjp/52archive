# 52Archive

Deck-only card game archive for web and iOS. A graph-based game design tool and browseable catalog for rule-set authors.

## Structure

| Path | Description |
|---|---|
| `apps/web` | Next.js archive experience, catalog browser, and interactive game editor |
| `apps/mobile` | Expo iOS app (scaffold only) |
| `packages/core` | Shared rule-graph engine, content model, DB client, CLI tools |
| `packages/ui` | Shared design tokens and visual theme |

## Getting Started

```bash
# 1. Start the Postgres database
docker compose up -d db

# 2. Install workspace dependencies
npm install

# 3. Start the web app (http://localhost:3000)
npm run dev:web

# — or — start with a fresh Next.js build cache
npm run dev:clean
```

## Routes

| Route | Purpose |
|---|---|
| `/` | Archive home page |
| `/games` | Full catalog browser — click any card to open the detail panel |
| `/editor` | Interactive game editor (graph or text mode) |
| `/add` | Create a new game entry |
| `/judgement` | Dedicated Judgement game page |

## Editor Features (`/editor`)

The editor at `/editor` supports two authoring modes:

### Graph Mode
Define games as branched flows (setup → turns → scoring → end):

- **Canvas controls**: click/touch-drag to pan · Ctrl/Cmd+scroll (or pinch) to zoom
- **Nodes**: click to select and edit; drag to reposition
- **Connections**: Bézier curves from node-to-node; pyramid-spread for branch layout
- **Stage library**: Setup, Team creation, Player turns, Scoring, Game end, Branch
- **Card actions**: On turn nodes — `place`, `swap`, `discard`, `draw`, `reveal`, `pass`
- **Insert-after flow**: Select a node, then click a stage library button to insert after it (existing nodes shift right)
- **Game title & metadata**: Set the name, player count, and scorekeeping mode before saving

### Text Mode
Write plain-text rules with lightweight markdown:

- Use `### Section Header` for bold section titles
- All other lines render as paragraphs
- Saved alongside the game ID in browser `localStorage`

### Saving Games

Both modes save to `localStorage` under the key `52archive_custom_games`. Saved games appear immediately in the `/games` catalog.

> **Note:** `localStorage` is browser-scoped. Clearing browser data or using a different browser will lose custom games. For persistent storage, use the database CLI tools below.

## Database

The app runs on Postgres (via `docker-compose`).

### Schema

| Table | Purpose |
|---|---|
| `games` | Public-facing game record (title, summary, metadata, moderation status) |
| `game_versions` | Versioned rule graphs, stored as JSONB |

Game lifecycle: `draft` → `pending_review` → `approved` (or `rejected`)

### CLI Tools

All tools run from the project root.

#### Push a YAML game definition to the database

```bash
npm run db:push-yaml -- path/to/game.yaml
```

This validates the YAML against the schema, upserts the game record, and inserts a new versioned graph snapshot.

Example:

```bash
npm run db:push-yaml -- judgement_game.yaml
npm run db:push-yaml -- graph_definition.yaml
```

#### Clear the database (reset to clean state)

```bash
npm run db:clear
```

Deletes **all rows** from `game_versions` and `games`. Use this to wipe test data and start fresh.

> **Browser localStorage** is not affected by this command. To also clear browser-saved custom games, run this in your browser DevTools console:
> ```js
> localStorage.removeItem("52archive_custom_games")
> ```
> Then refresh the page.

## npm Scripts

| Script | Description |
|---|---|
| `npm run dev:web` | Start the Next.js dev server |
| `npm run dev:clean` | Clear `.next` cache, then start dev server |
| `npm run dev:ios` | Start the Expo iOS app |
| `npm run db:push-yaml -- <file>` | Push a YAML game definition to Postgres |
| `npm run db:clear` | Wipe all games and versions from Postgres |
| `npm run typecheck` | Run TypeScript checks across all workspaces |
| `npm run lint` | Run lint across all workspaces |

## YAML Game Definition Format

See [`judgement_game.yaml`](judgement_game.yaml) and [`graph_definition.yaml`](graph_definition.yaml) for full examples.

Required top-level fields:

```yaml
id: my-game-id           # unique slug, no spaces
title: My Game
summary: One-line description
minPlayers: 2
maxPlayers: 6
playTimeMinutes: 30
difficulty: easy | moderate | hard
tags: [classic, strategy]
needsPaperScorekeeping: true
deckCount: 1

graph:
  nodes:
    - id: setup
      kind: setup
      title: Setup the table
      body: Shuffle and deal.
      x: 0
      y: 0
  edges:
    - id: e1
      from: setup
      to: turn
      label: begin
```

## Type Definitions (`packages/core/src/types.ts`)

```typescript
type GraphNode = {
  id: string;
  kind: string;       // setup | turn | score | end | branch | action
  title: string;
  body: string;
  x: number;
  y: number;
  stageKey?: string;
  aiHint?: string;
}

type GraphEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  condition?: string;
}

type Game = {
  id: string;
  title: string;
  subtitle?: string;
  summary: string;
  minPlayers: number;
  maxPlayers: number;
  playTimeMinutes: number;
  difficulty: string;
  tags: string[];
  deckCount: number;
  needsPaperScorekeeping: boolean;
  graph: RuleGraph;
  featured: boolean;
}
```

## Sample Games

| Game | File | Notes |
|---|---|---|
| Candlelit Rummy | `packages/core/src/sampleGames.ts` | Graph-based, built-in |
| Judgement | `packages/core/src/judgement.ts` | Trick-taking + bidding, 2–6 players |

## Known Limitations

- Custom games saved to `localStorage` only — no server-side persistence from the browser editor yet
- No user authentication; all games are unowned
- Mobile app is a scaffold with no game-specific content
- No undo/redo in the graph editor
- No edge or node deletion in the graph editor UI
