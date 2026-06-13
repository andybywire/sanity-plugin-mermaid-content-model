# ADR 0002 — In-Studio plugin form and schema source

**Status:** accepted

**Builds on:** [0001](0001-content-model-mermaid-export.md) — the Mermaid export contract and the `probe` / `walker` / `emit-mermaid` pipeline this plugin runs.

## Context

[ADR 0001](0001-content-model-mermaid-export.md) established the Mermaid `classDiagram` export. It first ran as a CLI that loaded the schema by importing `schemaTypes/index.ts` directly. That path has one hard limitation: **it is blind to types contributed by other Studio plugins.** A plugin like `sanity-plugin-taxonomy-manager` registers its types (`skosConcept`, `skosConceptScheme`) at plugin-initialisation time, not in `schemaTypes/index.ts`. So a field referencing `skosConcept` renders its type label but its **edge drops** (with a warning) — the diagram is silently incomplete versus the real, composed schema.

The fix the architecture always anticipated: run the same pipeline **inside Studio**, against the **fully-composed** workspace schema, which includes every plugin-contributed type.

## Decision

**Ship the export as a Sanity Studio plugin** (a top-nav **Content Model** tool) that reads the composed schema from `useSchema()`. The pure `probe` / `walker` / `emit-mermaid` modules from [ADR 0001](0001-content-model-mermaid-export.md) run unchanged; only the schema-reading seam is new.

### Schema source: `useSchema()._original.types`

`useSchema()` returns the **compiled** `Schema`. The adapter ([`src/schema-adapter.ts`](../../src/schema-adapter.ts), `readSchemaSource`) reads **`schema._original.types`** — the raw, authored `defineType` array, merged from Studio config **and every plugin**, with `validation` **functions still intact**. That combination — raw + validation-preserving + plugin-aware — is what lets the probe recover full cardinality *and* see plugin-contributed types.

Two alternatives were evaluated and rejected:

- **Compiled `get()` / `getTypeNames()` (the public API).** Sees all plugin types, but validation is already resolved to specs — the probe can't introspect it, so cardinality degrades to the `sanity schema extract` level, defeating [ADR 0001](0001-content-model-mermaid-export.md)'s precision goal.
- **Importing `schemaTypes/index.ts` directly (the CLI's path).** Raw + validation intact, but blind to plugin-contributed types — the exact limitation the plugin exists to fix.

`_original.types` is the only source combining all three properties in one place.

#### What `_original.types` is — and isn't

`_original` is set by the schema compiler as its build *input*, not its output: in `@sanity/schema`, the `Schema` constructor does `this._original = schemaDef` and never reassigns it. Crucially, the compiler **builds new objects** for the compiled registry rather than mutating the authored definitions — e.g. `BlockType.extend` destructures the authored block member and applies Sanity's default block marks (`DEFAULT_ANNOTATIONS`/the default `link`, `DEFAULT_DECORATORS`) **only to the compiled type**. So those defaults are **not** present in `_original.types`. The walker therefore sees a bare `{type: 'block'}` as bare — which is why Portable Text promotion (see architecture's mapping contract) fires only on **explicitly authored** inline objects/annotations, not on every block. *(Verified against `@sanity/schema` through v6.)*

### The `@internal` risk — accepted knowingly

`_original` is tagged `@internal` in `@sanity/types`: it is **not** part of Sanity's public API contract, so it could in principle change or disappear **without a semver-major bump or changelog note** — a *silent* break on upgrade. The risk is accepted because:

- `_original` is **structurally central** to the schema compiler (it's the compile input, read across multiple call sites in `sanity` / `@sanity/schema`) — removing it would break Sanity itself, not just this plugin.
- It has been **stable across major versions** (v3 → v6, re-verified) with no public replacement that preserves `validation` functions; Sanity would need to ship such an alternative before removing it.

Mitigations bound the downside:

- The dependency is **isolated to one ~4-line function** (`readSchemaSource`); if `_original` ever changes shape, that file is the only thing to update.
- `readSchemaSource` **guards** the access: a missing or non-array `_original.types` yields an empty result **plus a human-readable warning** the tool surfaces — graceful, visible degradation, never a silent blank diagram or a crash.
- A documented **fallback** exists: the compiled `get()` path still renders structure, edges, and plugin types (losing only cardinality precision), so the worst case is *degraded*, not *dead*.
- **Re-verify the access (and the `_original` shape) when widening the `sanity` peer range.** Current state: the published peer range is `^5`, while the bundled dev studio runs `^6` — a known gap. Reconciling it (widening the peer range to `^6`, re-verifying `_original`) is the **planned pivot to a v1.0 release**, taken once the active bug/feature work settles rather than piecemeal.

### Dev loop: serve the plugin from source

`sanity dev` / `sanity build` use Vite, which does **not** honour the package's `source` export condition — it resolves the plugin to the built `dist/index.js`, so `src/` edits don't appear live. Adding `source` to Vite's global `resolve.conditions` isn't viable (`@sanity/ui` and other pkg-utils packages also ship a `source` condition pointing at untranspiled TS, which would break en masse).

The solution here is [`vite-tsconfig-paths`](https://www.npmjs.com/package/vite-tsconfig-paths): the bundled `studio/` lists the plugin in its `tsconfig` `paths` (→ `../src`) and enables `tsconfigPaths()` in `studio/sanity.cli.ts`, so the studio serves the plugin's **`src/` live with HMR**. The plugin's own `dist/` is then only for the published package and the `pnpm build` self-check.

## Consequences

- The **adapter — not the walker — is the single Sanity-coupled seam.** The pure pipeline stays host-agnostic and unit-testable without a DOM.
- The reliance on `@internal` `_original` is documented here, with guard + fallback, so a future Sanity change degrades visibly rather than catastrophically.
- Studio target is **Sanity v5+ / React 19**.
