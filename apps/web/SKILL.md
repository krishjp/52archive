---
name: web-editor
description: Next.js visual rule graph editor client interfaces, canvas pointer gestures, and SVG nodes rendering configurations.
version: 1.0.0
author: krish-patel
tags:
  - nextjs
  - react
  - svg
  - visual-editor
---

# Web Game Editor

## Overview
This skill details Next.js frontend interfaces, rule presets, structured configuration form inputs, and validation mapping to the YAML schema parsed by the backend and Python training environment.

## Preset Configurations
Presets are loaded dynamically and mapped to the `GameConfig` schema. Common presets include:
- Spades
- Oh Hell
- Whist
- Judgement

## Key State Properties
Managed in the editor component:
- `config`: the active `GameConfig` state representing deck size, player counts, bidding constraints, lead restrictions, follow suit policies, trump mechanics, scoring rules, passing policies, and terminal criteria.
- `lockState`: session-based edit locking status.

## When to Use
Use when:
- Modifying game rules schema form inputs, preset objects, or layout elements in [page.tsx](app/editor/page.tsx).
- Updating config state validation logic or parsing for YAML output.
- Adjusting CSS styles or UI elements for the warm paper editorial visual theme.

## Instructions
1. **Manage Game Configurations**:
   Ensure form inputs correctly update corresponding nested values in the state.
2. **Handle Lock Status**:
   Check if the editor is locked by another session before allowing updates or saving.
3. **YAML Schema Consistency**:
   Verify that generated YAML outputs conform to the schema required by the core package.

## Output Format
- UI elements: Interactive React/JSX input controls.
- Rule models: Generated configuration YAML structure.


## Notes
- Rely on pointer events instead of mouse events for native mobile/tablet touch gesture compatibility.

