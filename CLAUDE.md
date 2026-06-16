# sanity-plugin-mermaid-content-model

Orientation for working in this repo (human or AI-assisted). User-facing install/usage lives in the [README](README.md); deeper design lives in [docs/](docs/). This file is the "how we work here" summary.

## What this plugin is

A Sanity Studio plugin that renders the Studio's content model as a [Mermaid](https://mermaid.js.org/) `classDiagram`, **in-Studio** (a top-nav **Content Model** tool). It reads the **fully-composed** workspace schema via `useSchema()`, so types contributed by *other* plugins (e.g. `skosConcept` from `sanity-plugin-taxonomy-manager`) are included. It began as a CLI (in a monorepo, since retired), so **this plugin is now the sole, canonical implementation** — its own test suite is authoritative. The decisions behind the design are recorded in [docs/decisions/](docs/decisions/).

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
- **Full pipeline + the Sanity→Mermaid mapping contract:** [docs/architecture.md](docs/architecture.md). **Design direction + guardrails:** [docs/ui-design.md](docs/ui-design.md).

## Development

- **`pnpm dev`** — runs the bundled dev Studio (`studio/`); log in to the dev project (`e0a474c4`) and open the **Content Model** tool. The plugin is served from `src` live (via `vite-tsconfig-paths`) with HMR.
- **The gate before every commit:** `pnpm test && pnpm typecheck && pnpm build && pnpm lint` — all green. Visual / behind-auth checks are the author's (eyeball in the dev Studio).
- **TDD is the default cadence:** write the test, see red, write the implementation, see green — for every behavior change. The one escape hatch: when the implementation is genuinely obvious (a one-line pure transform), you may skip the see-red step, but **say so explicitly** rather than drifting into test-after. Principles that keep this cheap:
  - **Pure logic carries the weight.** Most tests are plain input→output with hand-built fixtures and no mocks (the pipeline is pure by design); type fixtures with the contract type (`CanonicalModel`) so an invalid one fails to compile, not at runtime.
  - **One integration test per impure seam.** Each module that touches the outside world (e.g. `schema-adapter`) gets at least one end-to-end test against a realistic fixture.
  - **Strict `toEqual` on the contract shape.** Pin `CanonicalModel` exactly — this catches drift as the model grows, at the accepted cost of touching old tests when you add a field.
  - **DOM tests are for interaction wiring** (a click calls the right handler, a toggle re-renders, a warning shows) — not visual correctness, which stays the author's eyeball check. Don't over-test the thin renderer; its logic already lives in (tested) pure modules.
  - Full rationale + dev-loop/CI lessons: [docs/plugin-development.md](docs/plugin-development.md).
- **Tests:** Vitest + jsdom. Pure logic is tested without a DOM; a few component-interaction tests mock browser APIs. Gotchas (already handled in `src/test-setup.ts`): jsdom needs `window.matchMedia` and `ResizeObserver` stubs; `asyncUtilTimeout` is raised for slow CI; `afterEach(cleanup)` per component test (Vitest `globals: false`).
- Scripts table: see the [README](README.md#scripts).

## Commits & releases (important — read before committing)

- **Conventional Commits**, enforced by **commitlint** (a `commit-msg` hook installed by husky on `pnpm install`). `pre-commit` runs lint-staged (eslint + a `tsc --noEmit` pass).
- **The commit type drives the release:** `fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING CHANGE:` → major; `chore:`/`docs:`/`test:`/`ci:`/`refactor:` → **no release**. Name commits accordingly.
- **Use `git commit -F <file>`, not `-m`,** for messages containing backticks (zsh eats backtick-quoted spans).
- **Releases are fully automated — never `npm publish` by hand.** Merging to `main` triggers **semantic-release** over OIDC trusted publishing: version bump, `CHANGELOG.md`, npm publish, GitHub release. `CHANGELOG.md` is **generated — never hand-edit it.** `main` is branch-protected (a PR with green checks is required; admins have an escape hatch).
- **Feature/fix flow:** branch → PR → green CI → **merge commit** (not squash/rebase). Every commit lands on `main`, so **each commit message must be a clean Conventional Commit** — semantic-release reads them all to build the changelog and decide the release. (This is deliberate: it keeps individual changes legible for collaborators and makes conventional commits a shared habit. Never rebase or force-push `main` — that's what orphans the version tag.)

## Working on issues

- **GitHub Issues are the active work queue** — one discrete issue per bug/feature, not evergreen "collector" issues. Start with `gh issue list` / `gh issue view N` (fall back to `gh api repos/<owner>/<repo>/issues/N` if `gh issue view` errors on projects-classic), then plan and implement against that issue.
- **Default loop:** issue → branch → implement (TDD-first) → PR with **`Closes #N` in the body** → merge commit → the issue auto-closes. Branch naming: `<type>/<issue#>-<slug>` (e.g. `fix/2-pt-inline-embeds`), or `<type>/<slug>` when there's no issue (e.g. `ci/release-pat-bypass`). Not ironclad — incidental maintenance can be a direct PR with no issue.
- **`Closes #N` in the PR body is what closes the issue** — the branch name (and GitHub's "create a branch for this issue" link) is traceability only; it doesn't auto-close. The keyword closes the issue when the PR merges to `main`, regardless of merge strategy. (The changelog's "closes #N" wording is cosmetic — conventional-changelog rendering — and independent of GitHub's actual close.)
- Plugin-development methodology (TDD cadence, the dev-loop, CI/release lessons) lives in [docs/plugin-development.md](docs/plugin-development.md).

## Layout

- **`src/`** — plugin: pure modules (`probe`, `walker`, `emit-mermaid`), `schema-adapter`, `build-diagram`, `filter-model`, `elements`, and `tool/` (React components).
- **`studio/`** — bundled dev Studio (a pnpm workspace member).
- **`docs/`** — [`architecture.md`](docs/architecture.md) (pipeline + the Sanity→Mermaid mapping contract), [`ui-design.md`](docs/ui-design.md) (UI design direction, guardrails), [`plugin-development.md`](docs/plugin-development.md) (dev-loop, TDD, CI/release methodology), and [`decisions/`](docs/decisions/) — ADRs: [0001](docs/decisions/0001-content-model-mermaid-export.md) (the Mermaid export contract), [0002](docs/decisions/0002-content-model-plugin-architecture.md) (in-Studio plugin form + the `@internal` `_original` schema source), and [0003](docs/decisions/0003-v1-release-criteria.md) (the v1.0 release criteria).
