# Plugin development notes

The deeper "how and why" behind this repo's development practices. [CLAUDE.md](../CLAUDE.md) is the working summary; this is the reference it points to. (Architecture lives in [architecture.md](architecture.md); the decisions behind it in [decisions/](decisions/).)

## Internal shape

- **`@sanity/pkg-utils` build** (`package.config.ts`) → `dist/` with types; an `exports` map with a `source` condition (`./src/index.tsx`) and a `default` condition (`./dist/index.js`).
- **Three-tsconfig split:** `tsconfig.settings.json` (shared, strict — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), `tsconfig.json` (dev/typecheck: src + configs), `tsconfig.dist.json` (build: src minus tests).
- **Pure core + thin component shell.** All logic lives in pure, framework-free modules composed through one canonical type (`CanonicalModel`). React components only wire Studio context (`useSchema`, theme, clipboard, toasts) to those pure functions, so most code is testable without a DOM. Host coupling is isolated to one adapter (`schema-adapter.ts`) — see [ADR 0002](decisions/0002-content-model-plugin-architecture.md).

## The dev loop

`pnpm dev` runs the bundled `studio/` and serves the plugin's `src/` live with HMR via [`vite-tsconfig-paths`](https://www.npmjs.com/package/vite-tsconfig-paths). **Why this is needed (the gotcha):** `sanity dev`/`sanity build` use Vite, which ignores the package's `source` export condition and resolves to the stale built `dist/index.js` — so without the tsconfig-paths alias, `src/` edits don't show up. Full rationale (and why `source` can't just be added to Vite's global `resolve.conditions`) is in [ADR 0002 § Dev loop](decisions/0002-content-model-plugin-architecture.md).

## TDD practices

- **Test-first, tight cycles.** Write the test, see red, write the implementation, see green. The one escape hatch: when the implementation is genuinely obvious (a one-line pure transform), you may skip the see-red step — but **say so explicitly** rather than drifting into test-after.
- **Pure logic carries the weight.** Most tests are plain input→output with hand-built fixtures and no mocks; the pipeline is pure by design.
- **Type fixtures with the contract type.** A fixture typed `CanonicalModel` that doesn't represent a valid model fails to *compile*, not at runtime.
- **One integration test per impure seam.** Each module touching the outside world (e.g. `schema-adapter`) gets at least one end-to-end test against a realistic fixture — these catch structural bugs unit tests miss.
- **Strict `toEqual` on the contract shape.** Pin `CanonicalModel` exactly to catch drift as the model grows (at the accepted cost of touching old tests when you add a field).
- **The gate before every commit:** `pnpm test && pnpm typecheck && pnpm build && pnpm lint`. Test and typecheck are *separate* hard gates — Vitest's esbuild transform does **not** enforce types, so `tsc --noEmit` is its own pass. `exactOptionalPropertyTypes` in particular catches real bugs (e.g. passing `boolean | undefined` to an optional `attributes?: boolean` — resolve to a concrete value first).

## Testing components with jsdom

DOM tests are for **interaction wiring** (a click calls the right handler, a toggle re-renders, a warning shows) — not visual correctness, which stays the author's eyeball check. Don't over-test the thin renderer; its logic already lives in (tested) pure modules. The gotchas, all handled in [`src/test-setup.ts`](../src/test-setup.ts):

- **Stub `window.matchMedia`** — jsdom lacks it and `@sanity/ui`'s responsive hooks call it.
- **Stub `ResizeObserver`** — jsdom lacks it; needed for components like `react-zoom-pan-pinch`.
- **Raise `asyncUtilTimeout`** — CI runners (Linux especially) can be several times slower than local; the 1000ms default for `findBy*`/`waitFor` flakes on async UI (e.g. a toast rendering just past the deadline).
- **With Vitest `globals: false`, Testing Library auto-cleanup does NOT run** — add `afterEach(() => cleanup())` per component test file, or rendered DOM accumulates and queries find "multiple elements."
- **Mock browser-only APIs** jsdom doesn't implement — `mermaid.render`, `navigator.clipboard`, `ClipboardItem`, `<canvas>`/`toBlob` (use `vi.hoisted` to share a spy with a hoisted `vi.mock` factory).
- Transform JSX via Vitest's `esbuild: {jsx: 'automatic'}` — you don't need `@vitejs/plugin-react` (which may pin a conflicting Vite version).

## Sanity / @sanity/ui gotchas

- **Reading the composed schema:** `useSchema()._original.types` — see [ADR 0002](decisions/0002-content-model-plugin-architecture.md) for the full rationale and `@internal` risk analysis.
- **`@sanity/ui` v3 spacing prop is `gap`, not `space`** (on `Stack`/`Flex`).
- **Theme for tests:** `buildTheme()` from `@sanity/ui/theme` (the older `studioTheme` is deprecated).

## Releases — automated, lessons that bite

Releases are fully automated via **semantic-release** over OIDC trusted publishing; merging to `main` cuts the version bump, `CHANGELOG.md`, npm publish, and GitHub release. **Never `npm publish` by hand.** The pieces (commitlint + husky enforce Conventional Commits; `fix:`→patch, `feat:`→minor, breaking→major, `chore:`/`docs:`/`test:`/`ci:`/`refactor:`→no release) are summarised in [CLAUDE.md](../CLAUDE.md). The lessons worth not re-learning:

- **Merge PRs with a merge commit (not squash/rebase).** Every branch commit is preserved on `main`, so semantic-release sees each one — keep them clean Conventional Commits and let each represent one logical change. This is the deliberate choice for this repo: legible per-change history for collaborators, and conventional commits as a shared habit. The hazard to avoid is **rebasing or force-pushing `main`** — *that* rewrites the commit a release tag points at, orphaning it so semantic-release thinks there's no prior release (and jumps to `1.0.0`). A normal merge commit never does this.
- **Pin the package manager** (`"packageManager": "pnpm@x.y.z"`) and let `pnpm/action-setup` read it. A newer pnpm in CI enforces a `minimumReleaseAge` supply-chain policy that **rejects a lockfile pinning packages published in the last 24h** — pinning keeps dev and CI deterministic.
- **OIDC publishing** needs `id-token: write` on the release job, a trusted publisher configured on npmjs.com (repo + workflow filename), and npm ≥ 11.5.1. It **can't publish a package that doesn't exist** — the first publish was manual, with a seeded `v0.1.0` git tag so semantic-release continues from 0.x instead of defaulting to 1.0.0.
- **`main` is branch-protected** (PR + green checks required; admins keep an escape hatch). Don't require the release check itself as a status check — it's skipped on PRs, so requiring it would block every merge.
- **Branch protection blocks `@semantic-release/git`'s commit-back — so the release runs with a PAT.** The release commits `CHANGELOG.md` + the version bump back to `main` via a direct push. Protection (require PR + status checks) rejects that for the default `github-actions[bot]` (`GH006 — protected branch update failed`), and the whole release dies at the `prepare` step — *after* the version is computed but *before* publish, so nothing is half-released. Fix: run semantic-release with a **fine-grained PAT** (the `GH_TOKEN` secret; repo-scoped, Contents / Issues / Pull-requests: Read & write) as **both** `actions/checkout`'s `token` and the step's `GITHUB_TOKEN`, so the commit-back pushes as a repo admin — which only works if **admins are allowed to bypass** protection. npm publishing stays on OIDC (`id-token`). This surfaced on the first *automated* release (0.1.1); 0.1.0 was a manual bootstrap that never exercised the commit-back. If you'd rather not manage a long-lived PAT, a **GitHub App** token (minted per run) is the rotation-free, more-secure alternative.
- **`publishConfig.exports` is a pnpm feature — `npm publish` ignores it.** semantic-release shells out to `npm publish`, so the published `exports` keeps its `source` condition; that's inert for Vite/Node/webpack consumers (none resolve `source`) and is kept only to satisfy the pkg-utils build check.
