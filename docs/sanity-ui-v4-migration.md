# Sanity UI v3 → v4 migration notes

Working notes from migrating this plugin (issue #48), kept because the same migration is due for other Studio plugins — notably [sanity-plugin-taxonomy-manager](https://github.com/andybywire/sanity-plugin-taxonomy-manager). This records **what actually broke and how it was diagnosed**, not a restatement of the [upstream guide](https://github.com/sanity-io/ui/blob/main/MIGRATION.md#sanityui-from-v3-to-v4) — read that too.

Findings verified against `@sanity/ui@4.0.4` and `sanity@6.10.1` on 2026-08-19.

## The core problem: two copies of `@sanity/ui`

**Studio 6.10.0** is where `sanity` moved to `@sanity/ui ^4` (6.9.x still resolves `^3.5.1`). Because npm's `latest` tag for `sanity` is 6.10.x while `stable` lags behind, a Studio created today gets v4.

If a plugin declares `@sanity/ui` as a **regular dependency** with a `^3` range, that range can never resolve to 4.x — so the package manager installs a **second copy**, nested under the plugin. The plugin's components then consume v3 while the host Studio renders v4's providers, and v3's context lookups fail:

```
useRootTheme(): missing context value
useToast(): missing context value
```

It is not limited to hooks. A bare `<Card><Text>` throws too, because those call `useRootTheme()` internally — so effectively every component in the plugin fails.

**`npm install` reports no warnings whatsoever** — nothing alerts the user that two majors are installed.

**Vite does not deduplicate them in a consumer install — it bundles both majors.** Verified 2026-08-19 by building a real consumer Studio (`npm install sanity@6.10.1` + the published plugin) with `sanity build --source-maps` and reading the sourcemap `sources`:

```
30 refs  ../../node_modules/@sanity/ui                                         (v4 — Studio's)
 4 refs  ../../node_modules/<plugin>/node_modules/@sanity/ui                   (v3 — the plugin's)
```

The plugin's `dist/index.js` lands in the same chunk as its nested v3 `index.js`, `_chunks/getScopedTheme.js`, and `_chunks/portalProvider.js` — v3's theme-context machinery — while Studio's v4 sits in separate chunks. Two theme contexts, so the plugin's `useRootTheme()` has no matching provider and throws.

So for consumers this is a real crash, not a theoretical risk. **But it will very likely look fine in your own dev Studio** — see [Why your dev Studio may not reproduce it](#why-your-dev-studio-may-not-reproduce-it), which is the trap that makes this bug easy to dismiss.

Sourcemaps are the cheapest reliable audit. Two majors in this list means two React contexts:

```bash
find dist -name '*.map' -print0 \
  | xargs -0 grep -hoE "[^\"]*node_modules/@sanity/ui/dist/" | sort -u
```

### The fix

`@sanity/ui` must be a **`peerDependency`**, not a dependency, so the host Studio's single copy is authoritative. Keep it in `devDependencies` too, for local dev and tests.

### Diagnosing it quickly

Compare what the *host runtime* loads against what the *plugin source* loads. If these differ, the plugin is broken regardless of what any peer warning says:

```js
node -e "
const {createRequire}=require('module');
const r=createRequire('./studio/sanity.config.ts');           // any file in the app
const rs=createRequire(r.resolve('sanity/package.json'));
console.log('Studio runtime @sanity/ui ->', rs('@sanity/ui/package.json').version);
const rp=createRequire('./src/tool/ContentModelTool.tsx');    // any file in the plugin
console.log('Plugin source  @sanity/ui ->', rp('@sanity/ui/package.json').version);
"
```

Resolve from a file *inside* the package you care about — resolving from the app's own root can walk up to a hoisted copy and mislead you.

## Why your dev Studio may not reproduce it

**Expect the bug to be invisible in your own dev Studio.** Verified here on 2026-08-19: with `studio/` on `sanity@6.10.1` and `@sanity/ui@^4` declared, the Content Model tool rendered perfectly — menus, tooltips, and toasts all working — because the whole Studio was quietly running **UI v3**.

Vite's dependency optimizer resolves a bare specifier **once** and shares a single prebundled copy app-wide. In a pnpm workspace the plugin's source sits in the *root* package, so the root's `@sanity/ui` declaration wins that resolution — and Studio's own 861 bare `@sanity/ui` imports get redirected to the same module. Everything ends up self-consistent on the plugin's major, so nothing clashes. A plugin dev Studio is therefore **not** a faithful model of a consumer install: it feeds the plugin whatever the workspace root declares, which is exactly the version the plugin was built against.

Two ways to see which major is really being served:

```bash
# 1. What the optimizer picked
node -e "const m=require('./studio/node_modules/.sanity/vite/deps/_metadata.json');
for (const [k,v] of Object.entries(m.optimized||{})) if (k.startsWith('@sanity/ui'))
  console.log(k, '->', (v.src||'').match(/@sanity\+ui@([^_/]+)/)?.[1])"

# 2. What the running dev server actually serves — v3 exports these at the root, v4 doesn't
curl -s "http://localhost:3333/node_modules/.sanity/vite/deps/@sanity_ui.js?v=<hash>" \
  | grep -oE "export \{[^}]*" | grep -oE "Popover|Tooltip|useToast"
```

If the second command prints those names, the plugin is being served **v3** no matter what the Studio's `package.json` says.

**Corollary:** don't use "it works in my dev Studio" as evidence the migration is unnecessary, and don't expect a pre-migration "watch it break" demo from a workspace dev Studio. The consumer shape is a plain `npm install` of the *published* package alongside `sanity@6.10.x` — that's where the nested second copy appears. And note the migration fixes dev fidelity as a side effect: once the plugin's `@sanity/ui` is a `^4` peer with no `^3` dependency left, there's no v3 for the optimizer to pick.

Worth checking beyond the happy path, since a mixed tree only fails where contexts are actually crossed: exercise every `Popover`, `Tooltip`, and `useToast` surface (menus opened, toasts fired), not just the components that render on load.

### Clear the optimizer cache after changing UI majors

Vite's prebundle cache **survives dependency changes**, and it re-optimizes *incrementally* — so switching majors mid-session leaves a mixed tree that looks like a passing test. Observed here immediately after moving the imports to subpaths:

```
@sanity/ui          -> 3.2.0     <- stale entry, kept from the previous optimize run
@sanity/ui/popover  -> 4.0.4     <- newly discovered
@sanity/ui/toast    -> 4.0.4
@sanity/ui/tooltip  -> 4.0.4
```

The optimizer added the newly-discovered subpath entries but never re-resolved the existing bare one, so a single component was pulling `Card`/`Text`/`useRootTheme` from v3 and `Popover`/`Tooltip`/`useToast` from v4. It didn't crash, which is precisely the problem — it's not the state the code declares, and no conclusion drawn from it is valid.

```bash
rm -rf studio/node_modules/.sanity/vite && pnpm dev
```

Do this after **any** change to which `@sanity/ui` major resolves, and confirm with the metadata check above before trusting what you see. Restarting the dev server alone is not enough — the cache lives on disk and is reused across restarts.

## Symbols that moved to subpath entry points

v4 moved components with heavy dependencies out of the root entry, so importing `@sanity/ui` no longer pulls in `@floating-ui/react-dom`, `motion`, or `react-refractor`.

**Still at the root** (verified in 4.0.4): `Box`, `Card`, `Flex`, `Stack`, `Text`, `Button`, `Switch`, `TextArea`, `ThemeProvider`, `LayerProvider`, `useRootTheme`, `useClickOutsideEvent`.

**Moved:**

| symbol(s) | v4 specifier |
| --- | --- |
| `Popover` | `@sanity/ui/popover` |
| `Tooltip`, `TooltipDelayGroupProvider`, `useTooltipDelayGroup` | `@sanity/ui/tooltip` |
| `Toast`, `ToastProvider`, `useToast` | `@sanity/ui/toast` |
| `Menu`, `MenuButton`, `MenuDivider`, `MenuGroup`, `MenuItem` | `@sanity/ui/menu` |
| `Code` | `@sanity/ui/code` |
| `Autocomplete` | `@sanity/ui/autocomplete` |
| `Breadcrumbs` | `@sanity/ui/breadcrumbs` |

Audit a codebase with:

```bash
grep -rnE "\b(Popover|Tooltip|TooltipDelayGroupProvider|useTooltipDelayGroup|Toast|ToastProvider|useToast|Menu|MenuButton|MenuDivider|MenuGroup|MenuItem|Autocomplete|Breadcrumbs)\b" src/
```

**Also removed in v4:** the `space` prop (→ `gap`), Grid `columns`/`rows` (→ `gridTemplateColumns`/`gridTemplateRows`), Menu `focusFirst`/`focusLast` (→ `shouldFocus`), and the hooks `useClickOutside` (→ `useClickOutsideEvent`), `useElementRect`, and `useArrayProp`. Removed hooks are still *exported* but throw when called, so TypeScript is the earlier warning.

**Crucially, v3 has no subpath exports at all** — its export map is only `.`, `./_visual-editing`, and `./theme`. So there is no import shape that works on both majors, and no single release can support v3 and v4 hosts. The migration is necessarily a breaking change for the plugin.

## Version floors and packaging

- **Node ≥ 22.12**, **React ≥ 19.2**, **styled-components ≥ 6.1** — v4's own engines/peers.
- v4 is **ESM-only** (CommonJS consumers can still `require()` on supported Node).
- The **application** must `import '@sanity/ui/styles.css'` once, beside where it renders `<ThemeProvider>`. A plugin should *not* import it — but a plugin's **test harness** that renders its own `ThemeProvider` may need it for components like `Spinner` and `SrOnly`. (Low stakes under jsdom, which doesn't apply CSS to assertions.)

## Behaviour change that breaks tests

Closed Popovers and Tooltips stay **DOM-mounted** in v4 (React `<Activity>`), preserving internal state. Existence assertions must become visibility assertions:

```diff
- expect(screen.queryByText('...')).not.toBeInTheDocument()
+ expect(screen.queryByText('...')).not.toBeVisible()
```

## pnpm traps

**`sanity@6.10.1` drags a `@sanity/ui@5.0.0-alpha.4` into the tree**, via `@sanity/workbench@0.1.0-alpha.42`. If a plugin's `@sanity/ui` peer range is unsatisfiable (e.g. `^3` in a v4 tree), pnpm may satisfy it with that **v5 alpha**, producing errors that point at the wrong problem:

```
The requested module '@sanity/ui' does not provide an export named 'TextArea'
```

`TextArea` is present in v3 *and* v4 — it was dropped in the v5 alpha. Declaring `@sanity/ui: ^4` explicitly in the Studio app pins peer resolution to 4.x and lets the real error surface.

**Read the peer warnings as a migration checklist.** `unmet peer @sanity/ui@^3: found 4.0.4` is pnpm telling you exactly which plugin hasn't migrated yet.

## Two different-looking failures, one root cause

Worth internalising before diagnosing, because the symptom depends on how the plugin declares `@sanity/ui`:

| declaration | resolves to | fails | symptom |
| --- | --- | --- | --- |
| `dependency: ^3` | its own nested v3 | **runtime** | `useRootTheme(): missing context value` |
| `peerDependency: ^3` | the host's v4 | **import time** | `does not provide an export named 'Tooltip'` |

A static import of a symbol the host's v4 no longer exports at the root fails immediately and loudly. A private v3 copy imports fine and dies when the component mounts. The second is easier to debug; the first is the one that ships silently.

## Taxonomy Manager: what's due

Status on 2026-08-19 — `latest` is **5.0.0**, which does **not** work on Studio 6.10+.

**The structural work is already done there:** 5.0.0 declares `@sanity/ui` as a `peerDependency` (unlike 4.7.2, which carries `@sanity/ui ^2.8.9` as a regular dependency). It needs the range moved from `^3` to `^4`.

**Import surface to migrate**, from 5.0.0's shipped `src` — narrower than it sounds, since there's no `Popover`, `Menu`, `Autocomplete`, or `Breadcrumbs` usage at all:

| symbol | approx. refs | new specifier |
| --- | --- | --- |
| `Tooltip` | 15 | `@sanity/ui/tooltip` |
| `useToast` | 12 | `@sanity/ui/toast` |
| `ToastProvider` | 3 | `@sanity/ui/toast` |

**Files importing `@sanity/ui`:** `src/components/Concepts.tsx`, `TreeStructure.tsx`, `Children.tsx`, `Hierarchy.tsx`, `TreeView.tsx`, `TopConcepts.tsx`, `src/components/interactions/{ConceptEditAction,ConceptSelectLink,ConceptDetailLink}.tsx`, plus `src/test-setup.ts` and `src/test/renderWithUi.tsx`.

Because its `@sanity/ui` is a peer, TM v5 fails at **import time** on a v4 Studio (`does not provide an export named 'Tooltip'`) rather than at runtime — see the table above.

### Pinning v3 as a dependency is not a fix

The tempting shortcut — revert `@sanity/ui` from a peer back to a regular dependency pinned to `^3`, as 4.7.2 does with v2 — **does not work**, and is worth ruling out explicitly because it looks like the cheap option.

It resolves the import-time error, since the plugin then gets a v3 copy that really does export `Tooltip` at the root. But it recreates the two-copy situation at the top of this document: on a v4 Studio the plugin's components render against a v3 theme context that nothing provides, so it crashes at runtime instead. That's strictly worse — a loud, immediate, obvious failure traded for a silent one that only fires when a component mounts.

The peer declaration in TM v5 is the right structure. It needs the *range* moved to `^4`, plus the three subpath import changes above — not a reversion.

Also worth doing in the same pass: `engines.node` is `>=20` and will need `>=22.12`; the `sanity: ^5 || ^6` peer is already fine.

## Dev Studio note for this repo

`studio/` holds `sanity-plugin-taxonomy-manager` at **`^4.7.2`**, not 5.0.0, until TM ships v4 support. 4.7.2 bundles its own `@sanity/ui` v2 as a regular dependency, so it *imports* cleanly under a v4 Studio and still registers `skosConcept` — which is all the archetype tests need from it (they compile schemas, they don't render). Its own inputs will misbehave in the running dev Studio (v2 components under v4 providers); that's an accepted trade, since what we want from it is the plugin-contributed type, not its UI.

`studio/` also declares `@sanity/ui: ^4` explicitly. A plain Studio app doesn't need to, but here it pins plugin peer resolution to 4.x instead of the stray v5 alpha described above, and makes the UI major under test explicit.

Revisit both when a v4-compatible Taxonomy Manager ships.
