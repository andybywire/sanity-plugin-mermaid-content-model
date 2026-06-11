# sanity-plugin-mermaid-content-model

Orientation for working in this repo (human or AI-assisted). User-facing install/usage lives in the [README](README.md); deeper design lives in [docs/](docs/). This file is the "how we work here" summary.

## What this plugin is

A Sanity Studio plugin that renders the Studio's content model as a [Mermaid](https://mermaid.js.org/) `classDiagram`, **in-Studio** (a top-nav **Content Model** tool). It reads the **fully-composed** workspace schema via `useSchema()`, so types contributed by *other* plugins (e.g. `skosConcept` from `sanity-plugin-taxonomy-manager`) are included. It began as a CLI in the [UX Methods](https://github.com/andybywire/ux-methods) monorepo; that CLI has been retired, so **this plugin is now the sole, canonical implementation** — its own test suite is authoritative.

## Architecture (preserve this shape)

Pure transform pipeline with thin impure seams at each end:

```
useSchema() → readSchemaSource → walk → filterModel → emit → MermaidView
              (schema-adapter)   (walker) (filter)    (emit-mermaid)  (render)
                                    └── probe (validation → cardinality)
```

- **`CanonicalModel` is the seam** — everything upstream produces it, everything downstream consumes it. Extend the model or its pure transforms; don't thread schema details into the React layer.
- **Guardrails:** filtering is a pure transform applied *between* `walk` and `emit` (never inside either); "attributes" toggle + theme are `emit` *options*; the Elements selection is a resolvable model (room for future per-item defaults); the React component stays a thin renderer; SVG is canonical, PNG derived from it.
- Host coupling is isolated to one file (`src/schema-adapter.ts`, which reads the `@internal` `_original.types`, guarded).
- **Full pipeline + the Sanity→Mermaid mapping contract:** [docs/architecture.md](docs/architecture.md). **Design direction + guardrails + deferred decisions:** [docs/ui-design.md](docs/ui-design.md).

## Development

- **`pnpm dev`** — runs the bundled dev Studio (`studio/`); log in to the dev project (`e0a474c4`) and open the **Content Model** tool. The plugin is served from `src` live (via `vite-tsconfig-paths`) with HMR.
- **The gate before every commit:** `pnpm test && pnpm typecheck && pnpm build && pnpm lint` — all green. Visual / behind-auth checks are the author's (eyeball in the dev Studio).
- **Tests:** Vitest + jsdom. Pure logic is tested without a DOM; a few component-interaction tests mock browser APIs. Gotchas (already handled in `src/test-setup.ts`): jsdom needs `window.matchMedia` and `ResizeObserver` stubs; `asyncUtilTimeout` is raised for slow CI; `afterEach(cleanup)` per component test (Vitest `globals: false`).
- Scripts table: see the [README](README.md#scripts).

## Commits & releases (important — read before committing)

- **Conventional Commits**, enforced by **commitlint** (a `commit-msg` hook installed by husky on `pnpm install`). `pre-commit` runs lint-staged (eslint + a `tsc --noEmit` pass).
- **The commit type drives the release:** `fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING CHANGE:` → major; `chore:`/`docs:`/`test:`/`ci:`/`refactor:` → **no release**. Name commits accordingly.
- **Use `git commit -F <file>`, not `-m`,** for messages containing backticks (zsh eats backtick-quoted spans).
- **Releases are fully automated — never `npm publish` by hand.** Merging to `main` triggers **semantic-release** over OIDC trusted publishing: version bump, `CHANGELOG.md`, npm publish, GitHub release. `main` is branch-protected (a PR with green checks is required; admins have an escape hatch).
- **Feature/fix flow:** branch → PR → green CI → **squash-merge with a Conventional-Commit title** (that title becomes the changelog entry and decides the release).

## Working on issues

- **GitHub Issues are the active work queue.** Start with `gh issue list` / `gh issue view N`, then plan and implement against that issue.
- The **"Deferred decisions"** in [docs/ui-design.md](docs/ui-design.md) are the grooming backlog — promote them to issues as they become actionable.
- Reusable plugin-development methodology (TDD cadence, the dev-loop, CI/release lessons) lives in UX Methods' [plugin-development-best-practices.md](https://github.com/andybywire/ux-methods/blob/main/docs/plugin-development-best-practices.md).

## Layout

- **`src/`** — plugin: pure modules (`probe`, `walker`, `emit-mermaid`), `schema-adapter`, `build-diagram`, `filter-model`, `elements`, and `tool/` (React components).
- **`studio/`** — bundled dev Studio (a pnpm workspace member).
- **`docs/`** — `architecture.md`, `ui-design.md`.
