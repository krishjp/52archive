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

# Web Graph Editor

## Overview
This skill details Next.js frontend visuals, pointer-event zoom/pan canvas gestures, custom hierarchical layouts, and SVG path connection rendering mechanics.

## When to Use
Use when:
- Editing canvas interaction hooks or state elements in `app/editor/page.tsx`.
- Modifying SVG path layout coordinates, pyramid branching styles, or node dragging events.
- Creating sidebar controls for node additions or properties.

## Instructions
1. **Handle Zoom/Pan Coordinates**:
   - Update `panOffset` state on pointer move if pointer is down.
   - Scale canvas zoom factor using wheel listener intercepting `ctrlKey`.
2. **Reposition Dragged Nodes**:
   - On node drag start, register global document event listeners to track screen delta movements.
   - Adjust `node.x` and `node.y` offset states.
3. **Render Connector Path Geometry**:
   - Generate SVG Bézier curves from source node to target node centers.
   - Scale curves horizontally depending on separation delta.

## Output Format
- UI elements: Rendered React/JSX elements inside SVGs.
- Graph models: Exported RuleGraph JSON objects.

## Examples
### Connection Path Calculation
```typescript
const d = `M ${x1},${y1} C ${x1 + 50},${y1} ${x2 - 50},${y2} ${x2},${y2}`;
```

## Notes
- Rely on pointer events instead of mouse events for native mobile/tablet touch gesture compatibility.
