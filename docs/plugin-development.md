# Plugin development notes

The deeper "how and why" behind this repo's development practices. [CLAUDE.md](../CLAUDE.md) is the working summary; this is the reference it points to. (Architecture lives in [architecture.md](architecture.md); the decisions behind it in [decisions/](decisions/).)

## Internal shape

- **`@sanity/pkg-utils` build** (`package.config.ts`) → `dist/` with types; an `exports` map with a `source` condition (`./src/index.tsx`) and a `default` condition (`./dist/index.js`).
- **Three-tsconfig split:** `tsconfig.settings.json` (shared, strict — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), `tsconfig.json` (dev/typecheck: src + configs), `tsconfig.dist.json` (build: src minus tests).
- **Pure core + thin component shell.** All logic lives in pure, framework-free modules composed through one canonical type (`CanonicalModel`). React components only wire Studio context (`useSchema`, theme, clipboard, toasts) to those pure functions, so most code is testable without a DOM. Host coupling is isolated to one adapter (`schema-adapter.ts`) — see [ADR 0002](decisions/0002-content-model-plugin-architecture.md).

## Diagnostic strategy: render as-authored, flag the smells

The plugin is a **faithful mirror with a diagnostic layer** — not a linter that rewrites the schema. Both halves are load-bearing, and new work should preserve them:

- **Render the model as it was authored.** Don't silently "fix" or hide a modeling misstep: a model that's confusing in the diagram is usually confusing in the Studio too, and papering over it helps no one. When a rendering constraint _forces_ a deviation — e.g. Mermaid merges two same-named `class` blocks into one box — keep the result faithful and traceable rather than lossy: disambiguate visibly (the base-first `Body_Article` qualifier) instead of merging the distinction away.
- **Flag the smells as non-blocking "Potential Issues."** Anything the walker notices but can't call _wrong_ — a name collision, a field name reused with different shapes across types, an edge dropped because its target is filtered or undeclared — is pushed to `model.warnings` and surfaced by the `WarningsMenu`. Warnings annotate the diagram; they never block it. The catalog of what's detected today (and how), plus the smells tracked for later, lives in [warnings.md](warnings.md).

**Why this is a core value-add, not a nicety:** users (and the types other plugins contribute) will make modeling missteps, and the not-technically-wrong ones are exactly what no other tool flags. Surfacing them helps the next teammate — and, increasingly, the AI agents asked to reason about or act on a schema on the user's behalf — navigate the model with less ambiguity. Silent auto-correction would hide the very information worth knowing.

**How to apply it when adding features:** any new walker behavior that meets an imperfect or ambiguous schema should prefer _faithful render + a clear, actionable warning_ over silent normalization. Keep warning copy type-agnostic and suggest the fix ("consider giving them unique names"), and emit one warning per collision/occurrence group so the menu stays readable. This is the development-side counterpart to the design direction in [ui-design.md](ui-design.md); where warnings sit in the pipeline is documented in [architecture.md](architecture.md).

## The dev loop

`pnpm dev` runs the bundled `studio/` and serves the plugin's `src/` live with HMR via [`vite-tsconfig-paths`](https://www.npmjs.com/package/vite-tsconfig-paths). **Why this is needed (the gotcha):** `sanity dev`/`sanity build` use Vite, which ignores the package's `source` export condition and resolves to the stale built `dist/index.js` — so without the tsconfig-paths alias, `src/` edits don't show up. Full rationale (and why `source` can't just be added to Vite's global `resolve.conditions`) is in [ADR 0002 § Dev loop](decisions/0002-content-model-plugin-architecture.md).

- **The bundled `studio/` carries archetype schemas** as a `pnpm dev` workspace gallery (issue #19) under `studio/archetypes/` — see [The archetype harness](#the-archetype-harness) below. The **"bonkers" archetype** (`studio/archetypes/bonkers.ts`) is the synthetic kitchen-sink that exercises every shape the diagram cares about — documents, named/inline objects, references, images, the Portable Text variants, an orphan, validation — so a change that introduces a **new diagram shape** should add a representative case there to be eyeballed (`pnpm dev` → Content Model).
- **Reproduce plugin-contributed shapes as _synthetic stand-ins_ — don't install the plugin.** When a third-party plugin exercises a structural pattern the walker must handle — e.g. the rich-table plugin's named-type _alias_ (`richTableBlock` aliasing the `richTable` object, issue #32) — add a minimal synthetic equivalent (`dataTableBlock` → `dataTable`) to the schema rather than taking on the real dependency. Two reasons, both deliberate: it **validates the _pattern_** — an alias / type-extension shape that recurs across plugins, not a one-off — and it keeps the dev studio **self-contained and stable**, so the eyeball case can't drift or break as a plugin we don't control evolves. Mirror the real shape closely enough to be recognisable, but name it generically (`dataTable`, not `richTable`) so it never masquerades as the real plugin. (Gotcha: a `defineType` _type alias_ infers `options: unknown`, which trips `exactOptionalPropertyTypes` when assigned to `SchemaTypeDefinition[]` — write the alias as a plain typed literal, or cast.)
- **The gate's `pnpm typecheck` covers `src/` only — `studio/` is _not_ checked** (it has its own `tsconfig.json`). Verify studio edits (e.g. the synthetic schema) with `tsc -p studio/tsconfig.json` or `pnpm dev` + eyeball. Since the 0.3.0 peer-range widening to `^5 || ^6` (see [ADR 0002](decisions/0002-content-model-plugin-architecture.md)) the studio typechecks **clean** — so a `tsc -p studio/tsconfig.json` error is _your_ edit, not a pre-existing artifact. (Two `@sanity/types` majors still resolve in the store, but they no longer surface as a `sanity.config.ts` type error.)

## The archetype harness

The bundled `studio/` carries a small set of **archetype schemas** (issue #19) that do double duty: a `pnpm dev` **workspace gallery** for eyeballing how the diagram renders across real-world shapes, and the fixtures behind **golden-Mermaid regression tests**. Each archetype is one exported type array under [`studio/archetypes/`](../studio/archetypes/), registered into a workspace by [`archetypes/index.ts`](../studio/archetypes/index.ts) — and the *same* array is what its test imports, so the gallery and the fixtures **cannot drift**.

The set is kept to ~4 (breadth + integration — _not_ the depth the unit fixtures already pin):

- **`editorial`** — the clean canonical CMS (documents + Portable Text + references/author/category); renders **zero** Potential-Issues warnings, the deliberate foil to bonkers.
- **`ecommerce`** — relational breadth: arrays-of-objects, multi-level nested composition, a *shared* object (`price`, composed by two parents), self-referential hierarchies.
- **`knowledgeBase`** — a taxonomy-driven knowledge base / LMS where the real plugin `skosConcept` is the connective **hub** (glossary, tutorials, and resources all tag against it) and the real plugin `code` is reused; the focused demonstration of plugin-aware composition.
- **`bonkers`** — the kitchen sink that deliberately hits every walker branch (collisions, an orphan, all three Portable Text embed positions, a named-type alias, self- and mutual-reference cycles, every primitive, the custom-validator marker). **New diagram shapes go here.**

### Golden tests over a *real* compile

Each archetype has a co-located `*.test.ts` that (1) compiles its array through Sanity's **real `createSchema`** — the same compile a Studio workspace performs — then reads it back via `readSchemaSource` (through `modelFor`); (2) asserts a few **targeted structural facts** (the seam delivered a model, key edges, a shared object, the tag hub, …); and (3) pins the emitted Mermaid to a checked-in golden under [`__golden__/`](../studio/archetypes/__golden__/) via `toMatchFileSnapshot` (light theme, attributes on, for determinism). After an intended change, regenerate with `pnpm test -u` and **eyeball the golden diff** — the snapshot is a characterisation net, so the review is the real check.

The real compile is the whole point. The unit suites cast a `fakeSchema` (see [`schema-adapter.test.ts`](../src/schema-adapter.test.ts)), which structurally **cannot** catch a change to the `@internal` `Schema._original.types` seam the adapter reads — the blind spot [ADR 0002](decisions/0002-content-model-plugin-architecture.md) knowingly accepts, and the reason the 0.3.0 peer-range widening needed a manual render-verify. These tests close it: if a Sanity upgrade changes `_original.types`, `modelFor` returns `null`, the test's top-level guard throws, and **CI fails here** instead of the diagram silently degrading. That automates ADR 0002's "re-verify `_original` on the next Sanity major" ritual, and is [ADR 0003](decisions/0003-v1-release-criteria.md)'s gate 1.

### Why the tests live in `studio/`, not `src/`

The `knowledgeBase` and `bonkers` tests compose the **real** dev plugins (`sanity-plugin-taxonomy-manager`, `@sanity/code-input`) — reading each plugin's `schema.types` and feeding them to `createSchema` exactly as the workspace does (plugin-aware composition is the whole reason this tool runs in-Studio). That's distinct from the synthetic stand-ins above, which reproduce patterns from plugins we deliberately _don't_ take on as deps. The tests are co-located with the archetype arrays under `studio/archetypes/` — the arrays have to live there (the workspaces register them), and co-location keeps the single source of truth. Consequences worth knowing:

- `vitest.config.ts`'s `include` is widened to `studio/archetypes/**/*.test.ts`, so the archetype tests **do** run in the `pnpm test` gate.
- They import the pure pipeline by a relative `../../src/...` path — not the bare package specifier, which Vite resolves to the stale `dist/`.
- **The real plugins are declared as root `devDependencies`, not only studio deps.** CI installs with `pnpm install --frozen-lockfile --filter=!studio`, so `studio/node_modules` doesn't exist there — the plugins must resolve from the **root** `node_modules` where `vitest` runs. Without the root devDep, the plugin-composing tests pass locally (where `studio/node_modules` is populated) but fail to load in CI. Keep the root devDep version in lockstep with the studio dep so the test composes the same plugin the gallery shows.
- They are typechecked by `tsc -p studio/tsconfig.json` (studio's own gate) and, like all of `studio/`, are **ignored by eslint**.

## TDD practices

- **Test-first, tight cycles.** Write the test, see red, write the implementation, see green. The one escape hatch: when the implementation is genuinely obvious (a one-line pure transform), you may skip the see-red step — but **say so explicitly** rather than drifting into test-after.
- **Pure logic carries the weight.** Most tests are plain input→output with hand-built fixtures and no mocks; the pipeline is pure by design.
- **Type fixtures with the contract type.** A fixture typed `CanonicalModel` that doesn't represent a valid model fails to *compile*, not at runtime.
- **One integration test per impure seam.** Each module touching the outside world (e.g. `schema-adapter`) gets at least one end-to-end test against a realistic fixture — these catch structural bugs unit tests miss. (The archetype golden tests extend this seam coverage to a real `createSchema` compile — see [The archetype harness](#the-archetype-harness).)
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
- **Verify `@internal` behavior against the installed source, not memory.** The `_original.types` guarantees (e.g. that no default block marks are injected — load-bearing for Portable Text promotion) were confirmed by reading `node_modules/.pnpm/@sanity+schema@*/…/Schema.js`. `@internal` internals aren't in the public docs and can shift between majors — read the resolved package when a behavior is load-bearing.
- **`@sanity/ui` v3 spacing prop is `gap`, not `space`** (on `Stack`/`Flex`).
- **Theme for tests:** `buildTheme()` from `@sanity/ui/theme` (the older `studioTheme` is deprecated).

## Releases — automated, lessons that bite

Releases are fully automated via **semantic-release** over OIDC trusted publishing; merging to `main` cuts the version bump, `CHANGELOG.md`, npm publish, and GitHub release. **Never `npm publish` by hand.** The pieces (commitlint + husky enforce Conventional Commits; `fix:`→patch, `feat:`→minor, breaking→major, `chore:`/`docs:`/`test:`/`ci:`/`refactor:`→no release) are summarised in [CLAUDE.md](../CLAUDE.md). The lessons worth not re-learning:

- **Merge PRs with a merge commit (not squash/rebase).** Every branch commit is preserved on `main`, so semantic-release sees each one — keep them clean Conventional Commits and let each represent one logical change. This is the deliberate choice for this repo: legible per-change history for collaborators, and conventional commits as a shared habit. The hazard to avoid is **rebasing or force-pushing `main`** — *that* rewrites the commit a release tag points at, orphaning it so semantic-release thinks there's no prior release (and jumps to `1.0.0`). A normal merge commit never does this.
- **Pin the package manager** (`"packageManager": "pnpm@x.y.z"`) and let `pnpm/action-setup` read it. A newer pnpm in CI enforces a `minimumReleaseAge` supply-chain policy that **rejects a lockfile pinning packages published in the last 24h** — pinning keeps dev and CI deterministic.
- **OIDC publishing** needs `id-token: write` on the release job, a trusted publisher configured on npmjs.com (repo + workflow filename), and npm ≥ 11.5.1. It **can't publish a package that doesn't exist** — the first publish was manual, with a seeded `v0.1.0` git tag so semantic-release continues from 0.x instead of defaulting to 1.0.0.
- **`main` is branch-protected** (PR + green checks required; admins keep an escape hatch). Don't require the release check itself as a status check — it's skipped on PRs, so requiring it would block every merge.
- **Branch protection blocks `@semantic-release/git`'s commit-back — so the release runs with a PAT.** The release commits `CHANGELOG.md` + the version bump back to `main` via a direct push. Protection (require PR + status checks) rejects that for the default `github-actions[bot]` (`GH006 — protected branch update failed`), and the whole release dies at the `prepare` step — *after* the version is computed but *before* publish, so nothing is half-released. Fix: run semantic-release with a **fine-grained PAT** (the `GH_TOKEN` secret; repo-scoped, Contents / Issues / Pull-requests: Read & write) as **both** `actions/checkout`'s `token` and the step's `GITHUB_TOKEN`, so the commit-back pushes as a repo admin — which only works if **admins are allowed to bypass** protection. npm publishing stays on OIDC (`id-token`). This surfaced on the first *automated* release (0.1.1); 0.1.0 was a manual bootstrap that never exercised the commit-back. If you'd rather not manage a long-lived PAT, a **GitHub App** token (minted per run) is the rotation-free, more-secure alternative.
- **A failed release stops at different steps — verify what actually shipped before re-triggering.** The `@semantic-release/git` failure above dies in `prepare`, *before* `publish`, so npm, tags, and the GitHub Release stay untouched. Confirm with `npm view <pkg> version`, `git ls-remote --tags origin`, `gh release list`, and whether the `chore(release)` commit reached `main` — then fix the config and let the next push to `main` re-run it.
- **`publishConfig.exports` is a pnpm feature — `npm publish` ignores it.** semantic-release shells out to `npm publish`, so the published `exports` keeps its `source` condition; that's inert for Vite/Node/webpack consumers (none resolve `source`) and is kept only to satisfy the pkg-utils build check.
