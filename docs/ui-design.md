# UI design direction

Evergreen design direction, architectural guardrails, and deliberately-deferred decisions for the in-Studio Content Model tool. Implemented behavior lives in the code (and its history in the commit log) — this document is **context for future development**: the intent behind the tool, the guardrails that keep new work cheap, and the choices we've postponed until they can be judged against real use.

## Design direction

- **Top-nav tool, Vision-like.** Maximise the space Studio affords plugins: controls across the top, the bulk of the screen devoted to the diagram work area. Diagram zoom/pan at the Mermaid defaults.
- **Portable emitted Mermaid.** A goal is that `Copy Code` output renders well in other Mermaid apps (mermaid.live, GitHub, etc.) **without app-specific config**. This constrains theming: box palettes are emitted as standard `classDef` lines; avoid `themeVariables` / `base`-theme tricks that only render in-app. (See the deferred theming decision.)
- **Follow Studio's colour scheme; no in-plugin theme controls.** The tool reads `useRootTheme().scheme` and re-renders live on light/dark switch — it doesn't introduce its own theme UI.
- **Dependent objects follow their parent.** Inline and Portable Text objects are inherently part of whatever contains them, so they have no independent visibility toggle — they show only when reachable from a visible document. (Named objects toggle individually; this asymmetry is intentional.)

## Architecture guardrails (so later phases stay cheap)

These keep future work from painting us into a corner:

1. **Filtering is a pure transform of the `CanonicalModel`, applied _between_ `walk` and `emit`.** Do not bake filtering into the walker or the emitter. A `filterModel(model, selection)` pure function is the seam; `buildDiagram` gains an options argument.
2. **"Attributes" (show/hide field rows) and theme colors are `emit` options, not component logic.** Parameterise `emit-mermaid` (keep it pure) rather than post-processing strings or hardcoding colours in React.
3. **Elements selection is a resolvable model, not hardcoded "all visible."** Represent it so a future per-item _default_ layer can sit in front of the user's explicit choices (e.g. `{defaults, overrides}` resolved to an effective selection) without reworking the state shape.
4. **The React component stays a thin renderer.** All testable logic (filter, emit options, PNG-blob construction) lives in pure modules unit-tested without a DOM; the component wires them to Studio (`useSchema`, theme, clipboard, toasts) and is covered by a few jsdom interaction tests with browser APIs mocked.
5. **SVG is canonical for display; PNG is derived from the live SVG.** Keep the rendered SVG self-contained/serializable so canvas export stays clean.

## Deferred decisions

Choices consciously postponed until the relevant feature is functional, so we judge them against real diagrams rather than speculatively. This is a grooming backlog — promote items to GitHub issues as they become actionable.

- **Per-item default element visibility — deferred.** e.g. Portable Text Blocks unchecked by default. The selection model (`defaultSelection`) is the single seam for this; not yet built.

- **Re-showing a document should bring its connected objects back (derived object visibility) — deferred.** _Today's behavior:_ per-object switches are sticky booleans. Hiding a document leaves its named objects floating as orphans (the "Hide Orphan Objects" button cleans them up); re-showing a document does **not** bring previously-hidden objects back — their switch stays off. The "objects follow the documents I'm inspecting" direction feels more natural, but it's deliberately not rushed: by the time the plugin is in real use, the desired direction may have shifted. Two ways to integrate it, with tradeoffs:
  - **Option A — derived visibility with overrides (the "right" model).** A non-document class is visible _by default_ iff reachable from a visible document; the per-object switch becomes an explicit override (force-show / force-hide). Re-showing a document re-derives, so its objects return automatically, and it cleanly distinguishes a _deliberate_ hide from an _orphan_. **Cost:** a refactor of the core selection model (`classes` boolean map → overrides), `defaultSelection` / `resolveElements` / `orphanObjects`, the switch-toggle logic, and the tests — and it largely **retires the explicit "Hide Orphan Objects" button** (orphans just auto-hide). A revised architectural direction. The already-implemented "dependent objects follow their parent" behavior is a stepping stone toward this model.
  - **Option B — cascade-on-show (small, interim).** Keep today's model; when a document is switched on (or "show all documents"), also switch its newly-reachable objects on. Keeps the orphan button. **Cost/caveat:** booleans can't distinguish an orphan-hide from a deliberate hide, so re-showing a document re-shows _all_ its connected objects — even one you'd deliberately hidden. Likely partly reworked when/if Option A lands.
  - **Recommendation:** take this up as a dedicated iteration once the direction firms up under real use.

- **Deeper mermaid theming (edge-label background, etc.) — deferred, gated on a portability decision.** The named `default`/`dark` themes ignore most `themeVariables`, so finer control (e.g. the edge-label background chip) requires mermaid's `base` theme with an explicit variable set. We backed that out: it widens the styling surface and risks the **portability of the emitted Mermaid code** (see Design direction). Before doing this, decide _where_ theming lives: baked into the code (portable but fixed) vs. applied at render time only (flexible but app-specific). Until then, theming stays minimal: `classDef` box palettes (light/dark) + mermaid's named base theme. (Related rough edge: Copy PNG uses a fixed white background, so a dark-mode diagram pastes as light text on white — tied to this same "where does theming live" decision.)

- **Image export — PNG vs SVG — deferred (currently PNG only).** Copy PNG works (rendered SVG → `<canvas>` → PNG, 2× scale, white background; `htmlLabels: false` avoids the foreignObject canvas-taint). Its limitation: **text pixelates on large diagrams** (it's a raster at a fixed scale). SVG would be crisp (vector) and _simpler_ to implement — we already have the SVG string, so it's no canvas at all. **But browsers don't reliably allow SVG on the clipboard as a pasteable _image_** — `clipboard.write` broadly supports only `text/plain`, `text/html`, `image/png` (SVG can carry scripts). So a "Copy SVG" copies the SVG _source_: it pastes as crisp vector into design tools (Figma/Illustrator) and code/files, but as plain _text_ into Docs/Slides/Word (which accept PNG-as-image, not SVG). Options when revisited — choose by target paste destination:
  - **(A)** Higher-res PNG (3–4× or target a minimum width): keeps the docs/slides paste-as-image flow; mitigates pixelation; larger files.
  - **(B)** Copy SVG source: crisp and simplest; good for vector tools / saving files; _not_ a docs image-paste.
  - **(C)** Both PNG and SVG controls (`[Copy Code] [Copy PNG] [Copy SVG] [Elements]`).
  - **(D)** Download SVG file: crisp vector file, sidesteps all clipboard limits.

- **Drag-to-rearrange class boxes — deferred.** Mermaid renders static SVG with no native box dragging; it'd need a different rendering approach or post-render SVG manipulation. Scoped separately if pursued.
