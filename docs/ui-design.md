# UI design direction

Evergreen design direction and architectural guardrails for the in-Studio Content Model tool. Implemented behavior lives in the code (and its history in the commit log) — this document is **context for future development**: the intent behind the tool and the guardrails that keep new work cheap.

## Design direction

- **Top-nav tool, Vision-like.** Maximise the space Studio affords plugins: controls across the top, the bulk of the screen devoted to the diagram work area. Diagram zoom/pan at the Mermaid defaults.
- **Portable emitted Mermaid.** A goal is that `Copy Code` output renders well in other Mermaid apps (mermaid.live, GitHub, etc.) **without app-specific config**. This constrains theming: box palettes are emitted as standard `classDef` lines; avoid `themeVariables` / `base`-theme tricks that only render in-app.
- **Follow Studio's colour scheme; no in-plugin theme controls.** The tool reads `useRootTheme().scheme` and re-renders live on light/dark switch — it doesn't introduce its own theme UI.
- **Dependent objects follow their parent.** Inline and Portable Text objects are inherently part of whatever contains them, so they have no independent visibility toggle — they show only when reachable from a visible document. (Named objects toggle individually; this asymmetry is intentional.)

## Architecture guardrails (so later phases stay cheap)

These keep future work from painting us into a corner:

1. **Filtering is a pure transform of the `CanonicalModel`, applied _between_ `walk` and `emit`.** Do not bake filtering into the walker or the emitter. A `filterModel(model, selection)` pure function is the seam; `buildDiagram` gains an options argument.
2. **"Attributes" (show/hide field rows) and theme colors are `emit` options, not component logic.** Parameterise `emit-mermaid` (keep it pure) rather than post-processing strings or hardcoding colours in React.
3. **Elements selection is a resolvable model, not hardcoded "all visible."** Represent it so a future per-item _default_ layer can sit in front of the user's explicit choices (e.g. `{defaults, overrides}` resolved to an effective selection) without reworking the state shape.
4. **The React component stays a thin renderer.** All testable logic (filter, emit options, PNG-blob construction) lives in pure modules unit-tested without a DOM; the component wires them to Studio (`useSchema`, theme, clipboard, toasts) and is covered by a few jsdom interaction tests with browser APIs mocked.
5. **SVG is canonical for display; PNG is derived from the live SVG.** Keep the rendered SVG self-contained/serializable so canvas export stays clean.
