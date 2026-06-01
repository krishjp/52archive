# 52Archive

Deck-only card game archive for web and iOS.

## Structure

- `apps/web`: Next.js archive experience with graph-based game editor
- `apps/mobile`: Expo iOS app
- `packages/core`: shared rule-graph engine, content model, and game templates
- `packages/ui`: shared visual primitives and design theme

## Status

This repository contains the core architecture for the archive product:

- warm, coffee-toned visual language
- archive browsing surfaces
- **graph-based game editor** with interactive node/branch layout
- shared TypeScript domain model
- sample game: *Judgement* (a trick-taking bidding game)

## Getting Started

1. Start the database with `docker compose up -d db`.
2. Install workspace dependencies with `npm install` if you have not already.
3. Start the web app with `npm run dev:web` (available at http://localhost:3000).
4. Start the iOS app with `npm run dev:ios` (via Expo).

### Editor Features

The **graph-based game editor** (at `/editor`) lets you define games as branched flows:

- **Canvas controls**: Click or touch-drag to pan • Ctrl/Cmd+scroll (or pinch) to zoom
- **Nodes**: Click to select and edit; drag to reposition
- **Connections**: Nodes connect via Bézier curves; automatic branch spreading for pyramid layout
- **Stage library**: Setup, Team creation, Player turns, Scoring, Game end, Branch
- **Card actions**: On turn nodes, add action nodes for `place`, `swap`, `discard`, `draw`, `reveal`, or `pass`
- **Insert-after flow**: Select a node, then click a stage library button to insert after that node (existing nodes shift right)

## Database

The app is designed around a Postgres-backed archive.

- `games`: public-facing game record and moderation status
- `game_versions`: versioned rule graphs (stored as JSON)
- Game lifecycle: `draft` → `pending_review` → `approved` (or `rejected`)

Suggested workflow:

- `draft`: author is actively editing
- `pending_review`: ready for moderator review
- `approved`: visible in public archive
- `rejected`: hidden until author revises and resubmits

## Example: Judgement

The first concrete editor example is `Judgement` in [packages/core/src/judgement.ts](packages/core/src/judgement.ts). It models:

- Setup (deal, table prep, shuffle, initial state)
- Team creation (optional)
- Per-round dealing, bidding, trick play, and scoring
- Round progression and bidding ramp
- Final win condition (team-based or individual)
