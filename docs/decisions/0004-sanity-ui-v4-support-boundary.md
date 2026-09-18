# 0004 — Sanity UI v4 and the 2.0 support boundary

**Status:** accepted · 2026-09-17
**Context:** issue #48 · supersedes the peer ranges set in [ADR 0003](0003-v1-release-criteria.md)

## Context

`sanity@6.9.2` moved the Studio's own `@sanity/ui` dependency from v3 to v4 (6.9.1 pulls `^3.5.1`, 6.9.2 pulls `^4.0.1`). Sanity depends on `@sanity/ui`; it does not peer it.

Through 1.x this plugin declared `@sanity/ui` as a **regular dependency** on `^3`. A `^3` range can never resolve to 4.x, so on any Studio from 6.9.2 onward a package manager installs a **second copy** nested under the plugin. `@sanity/ui` carries React context — `ThemeProvider`, `LayerProvider`, `ToastProvider` — so the Studio renders v4's providers while the plugin reads v3's, and every context lookup fails:

```
useRootTheme(): missing context value
```

Not just hooks: a bare `<Card><Text>` throws too, because those call `useRootTheme()` internally.

Three properties make this bad out of proportion to its size:

- **`npm install` reports nothing.** No warning, no error. It fails at runtime, when a component mounts.
- **A plugin dev Studio cannot reproduce it.** Vite's dep-optimizer resolves a bare specifier once and shares it app-wide; in a pnpm workspace the plugin's own declaration wins, so the whole Studio quietly runs the plugin's major and nothing clashes. We watched a dev Studio on `sanity@6.10.1` run entirely on UI **v3** and behave perfectly.
- **A real consumer build bundles both majors.** Confirmed by building a consumer Studio with `--source-maps`: the plugin's `dist/index.js` shares a chunk with its own nested v3 theme machinery while the Studio's v4 sits elsewhere.

Full diagnosis and the reusable version: [sanity-ui-v4-migration.md](../sanity-ui-v4-migration.md).

## Decision

**`@sanity/ui` is a peer dependency (`^4`), provided by the host Studio**, and kept as a devDependency for local dev and tests.

**The support boundary moves to Sanity 6.9.2**, with React 19.2 and Node 22.12 floors that Sanity UI v4 itself requires:

| | 1.x | 2.0 |
| --- | --- | --- |
| `sanity` (peer) | `^5 \|\| ^6` | `^6.9.2` |
| `@sanity/ui` | dependency `^3` | **peer** `^4` |
| `react` / `react-dom` (peer) | `^18 \|\| ^19` | `^19.2` |
| `engines.node` | `>=18` | `>=22.12` |
| `@sanity/icons` | dependency `^3` | dependency `^5.2.2` |

Sanity v5 and Studio 6.0–6.9.1 ship UI v3 and are served by the **1.x** line, which continues to work for them. This is a hard cut, not a deprecation: v3 has no subpath exports at all (its export map is `.`, `./_visual-editing`, `./theme`), while v4 requires subpaths for `Popover`, `Tooltip`, and `useToast` — so no single source tree can serve both.

## Alternatives considered

**Keep `@sanity/ui` on v3 and stay compatible with older Studios.** Rejected on evidence: it does not work on 6.9.2+, which is where new installs land. The dev Studio suggested otherwise, and that turned out to be an artifact of workspace resolution rather than a property of the plugin.

**Declare `@sanity/ui` as a dependency on `^4`, as `@sanity/pkg-utils` recommends.** This does dedupe against a compatible host today — verified. It was rejected for what happens next: a plugin pinned `^4` against a future v5 host silently reacquires two copies, which is precisely this bug. As a peer, that mismatch surfaces as an unmet-peer warning. We disable the single `noSanityUiPeerDependency` rule in `package.config.ts` rather than the whole check, and back the invariant with a test (below).

**Maintain 1.x alongside 2.0.** Rejected as unjustified maintenance for the size of this plugin. 1.0.1 keeps working for older Studios; it simply won't gain features.

**Pin `@sanity/ui` v3 as a dependency to keep older Studios working.** Rejected: it trades a loud import-time failure for a silent runtime one, and still leaves two copies.

## Consequences

- 2.0.0 is a breaking release. Consumers on Sanity v5 or Studio 6.0–6.9.1 stay on `@^1`.
- `@sanity/icons` moves to `^5.2.2` with per-icon subpath imports. v5 still exports icons from its root, but that entry is a `lazy()` map of every icon behind `Suspense`; subpaths are direct and synchronous.
- The `@internal` `_original.types` seam ([ADR 0002](0002-content-model-plugin-architecture.md)) must be re-verified whenever the `sanity` range moves in either direction. The archetype tests are that verification, since they compile real schemas through `createSchema`. Verified at **6.15.0**.
- **The boundary is enforced by a test, not by intent.** `pnpm test:studio-install` packs the plugin, installs it into throwaway Studios at the declared floor (`6.9.2`) and at newest 6.x (`^6.9.2`), and asserts the plugin and the Studio resolve the *same* `@sanity/ui` and `@sanity/icons` with no private copy nested under the plugin. It runs as its own CI job and gates releases. The `^6.9.2` leg is deliberately open-ended: the day Sanity ships a Studio on a UI major we don't range over, it goes red on its own.
- The dev Studio becomes representative as a side effect — with no `^3` left anywhere, there is no v3 for Vite's optimizer to pick.
