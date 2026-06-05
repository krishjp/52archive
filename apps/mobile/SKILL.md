---
name: mobile-shell
description: React Native mobile application companion Expo shell viewports and styled templates.
version: 1.0.0
author: krish-patel
tags:
  - react-native
  - expo
  - mobile
  - ios
---

# Mobile Expo Shell

## Overview
This skill outlines the companion app layout styled using React Native primitives and Expo configurations.

## When to Use
Use when:
- Editing the main navigation structure or UI elements in `App.tsx`.
- Configuring styled templates or font interfaces matching the visual theme of the editor.
- Integrating backend api syncing routes.

## Instructions
1. **Apply Style Primitives**:
   Implement standard styling tokens using `StyleSheet.create()`. Incorporate warm paper editorial colors and Georgia font families.
2. **Build Webview Interfaces**:
   Wrap pointer-gesture rule editors inside Mobile WebView components to support mobile-tablet editing layouts.

## Output Format
- Mobile screens: Structured JSX style containers.

## Examples
### Custom Viewport Style
```typescript
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f7f1e7",
    padding: 24,
  },
});
```

## Notes
- Ensure touch interactions are pointer-compatible to maintain uniformity with web browser behaviors.
