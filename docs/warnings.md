# Potential Issues — the warnings the walker detects

The content-model tool is a **diagnostic mirror**: it renders the schema as authored and flags modeling smells as non-blocking **"Potential Issues"** rather than silently correcting them. The strategy and its rationale live in [plugin-development.md](plugin-development.md#diagnostic-strategy-render-as-authored-flag-the-smells); this page is the **catalog** — what each warning detects, why it's worth flagging, and how it's produced — and the reference for adding new ones.

## How a warning flows

`walk()` accumulates plain strings in `model.warnings` (`CanonicalModel.warnings`). `build-diagram` passes them through untouched, and [`tool/WarningsMenu.tsx`](../src/tool/WarningsMenu.tsx) renders them under a ⚠ "Potential issues" popover (the button hides itself when there are none). These warnings are **non-blocking** — they annotate a rendered diagram; they never replace it.

One warning is different in kind: the schema-adapter's **read guard**. If `useSchema()._original.types` can't be read, `readSchemaSource` returns a single **blocking** warning paired with `mermaid: null`, and the tool shows that message instead of a diagram. That's a degrade-gracefully guard (see [ADR 0002](decisions/0002-content-model-plugin-architecture.md)), not a modeling smell — it isn't part of the catalog below.

## Detected today

### 1. A field-derived object collides with a named type

- **Detects** — an inline object, inline image/file, or structural Portable Text field whose bare `pascalCase` name equals a named top-level type's class name.
- **Why** — they're distinct things sharing a name; left alone they'd merge in Mermaid. The derived one is disambiguated base-first (e.g. `Metadata_Method`) and the clash is flagged.
- **How** — `maybeEmitCollisionWarning` (walker), `collidesWithNamed` branch.
- **Message** — _"An object derived from 'X' shares the name of the named type 'Y'. The derived one is qualified by an underscore and its parent to keep them distinct — consider renaming one."_

### 2. Multiple field-derived objects derive the same name

- **Detects** — ≥2 inline objects / inline images / structural PT fields across the schema whose bare names collide (e.g. two `bodyText` fields → `BodyText`).
- **Why** — distinct objects with one name would merge into a single misleading box. Each is qualified by its parent (`Body_Article` / `Body_Page`).
- **How** — `maybeEmitCollisionWarning`, `multipleInlines` branch; counts come from `buildInlineCounts`.
- **Message** — _"More than one object is derived from the name 'X'. Each is qualified by an underscore and its parent to keep them distinct in the diagram — consider giving them unique names."_

### 3. An edge was dropped (unresolvable target)

- **Detects** — a composition/reference edge whose target isn't an emitted class: a skip-pattern type (`sanity.*`, `assist.*`, `geopoint`) or a type that was never declared.
- **Why** — keeps the diagram honest about what's filtered or missing versus what was authored.
- **How** — `walk()` post-pass over `ctx.edges` against the emitted class names.
- **Message** — _"Edge for field 'X' on Source dropped — target type 'Y' is filtered or not declared."_

### 4. A field name is reused with different shapes

- **Detects** — the same field name across classes with structurally different characterisations (e.g. `code` is a `Code` object in one class and a `string` in another).
- **Why** — the "one concept, one shape" smell: ambiguous for humans and AI agents alike. (Suppressed when a name-collision warning already covers the same bare name, to avoid double-reporting.)
- **How** — `walk()` post-pass building per-name field signatures.
- **Message** — _"Field 'X' has differing types across classes (…); the diagram shows each class's own field but the name reuse may be worth reviewing."_

## Under consideration

Tracked as issues, not yet implemented (each links the analysis and the risk/nuance):

- **Multi-target references render only the first target** — [#27](https://github.com/andybywire/sanity-plugin-mermaid-content-model/issues/27). A faithfulness fix (render an edge per `to` target), not a warning.
- **Named types colliding under `pascalCase` silently merge** — [#28](https://github.com/andybywire/sanity-plugin-mermaid-content-model/issues/28). Disambiguate + warn, like #2; also closes a `namedClassNames` completeness gap (`file` types, PT aliases).
- **Duplicated inline-object shapes** — [#29](https://github.com/andybywire/sanity-plugin-mermaid-content-model/issues/29). Advisory: suggest extracting a shared named type (the "prefer named/reusable types" lever).
- **Unreferenced named object types** — [#30](https://github.com/andybywire/sanity-plugin-mermaid-content-model/issues/30). Advisory: a named object that nothing references.

## Adding a new warning

1. Push a string to `ctx.warnings` where the smell is detected. It surfaces in the WarningsMenu automatically — no UI wiring needed.
2. Keep the copy **type-agnostic and actionable** — name the smell and suggest the fix ("consider giving them unique names"); avoid implementation jargon.
3. **Dedupe per occurrence-group** so the menu stays readable (see the `collisionWarningsEmitted` guard) — one warning per group, not per instance.
4. Add a row to *Detected today* above, and a unit test asserting the warning fires (and doesn't, on a clean model). The walker tests use `model.warnings.some(...)` substring checks.
