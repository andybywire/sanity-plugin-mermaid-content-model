# sanity-plugin-mermaid-content-model

A Sanity Studio plugin that renders the Studio's content model as a [Mermaid](https://mermaid.js.org/) class diagram, inside Studio.

> Extracted from the [UX Methods](https://github.com/andybywire/ux-methods) monorepo, where it was developed in-place first. The design rationale (in-monorepo-first, schema source, the `_original.types` decision) is recorded in [ADR 0007](https://github.com/andybywire/ux-methods/blob/main/docs/decisions/0007-content-model-plugin-architecture.md). The plugin's own feature spec and deferred decisions live in [docs/ui-design.md](docs/ui-design.md).

## Usage

Add the plugin to your Studio config and open the **Content Model** tool from the top navigation:

```ts
// sanity.config.ts
import {defineConfig} from 'sanity'
import {mermaidContentModel} from 'sanity-plugin-mermaid-content-model'

export default defineConfig({
  // ...
  plugins: [mermaidContentModel()],
})
```

## How it works

The plugin reuses the same pipeline as the [`content-model/`](https://github.com/andybywire/ux-methods/tree/main/content-model) CLI:

- **`probe`** — introspects a field's `validation` function to recover cardinality and constraint markers.
- **`walker`** — turns a Sanity schema into a `CanonicalModel` (classes, edges, warnings).
- **`emit-mermaid`** — renders a `CanonicalModel` as a Mermaid `classDiagram` string.

These three modules are **copied** from the CLI (which remains the reference implementation) and pinned by the same test suites. The contract they satisfy is documented in [ADR 0006](https://github.com/andybywire/ux-methods/blob/main/docs/decisions/0006-content-model-mermaid-export.md).

Where the CLI loads schema types from `studio/schemaTypes/index.ts` via `tsx`, the plugin reads the **fully-composed** workspace schema via Studio's `useSchema()` (`src/schema-adapter.ts`) — which includes plugin-contributed types (e.g. `skosConcept`) the CLI can't see. From there it walks → filters (Elements menu) → emits, and renders the Mermaid SVG in a top-nav tool.

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm test` | Run the Vitest suite once. |
| `pnpm test:watch` | Watch mode. |
| `pnpm typecheck` | `tsc --noEmit` against `src` + configs. |
| `pnpm build` | Build `dist/` with `@sanity/pkg-utils`. |

## Development

This repo bundles a dev Studio as a workspace member (`studio/`). Run it and open the **Content Model** tool:

```
pnpm dev
```

The Studio serves the plugin from its **TypeScript source** (`src/`), not from `dist/`, so edits hot-reload live with no rebuild. This works via [`vite-tsconfig-paths`](https://www.npmjs.com/package/vite-tsconfig-paths) plus a `paths` mapping in `studio/tsconfig.json` — necessary because Vite doesn't honor the package's `source` export condition on its own, and a global `source` condition would also pull `@sanity/ui` from source.

See the [plugin-development best-practices](https://github.com/andybywire/ux-methods/blob/main/docs/plugin-development-best-practices.md) for the full methodology (architecture, TDD, this dev-loop gotcha, and CI/CD).
