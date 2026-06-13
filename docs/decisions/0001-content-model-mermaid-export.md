# ADR 0001 — Content model as a Mermaid class diagram

**Status:** accepted

> **Provenance.** This decision (and the next, [0002](0002-content-model-plugin-architecture.md)) originated as ADRs in the monorepo where this code began life as a CLI; they've been adapted and renumbered as this repo's own decision log. This plugin is now the sole implementation — its own test suite is authoritative.

## Context

A Sanity Studio schema defines two genuinely different kinds of thing:

- **documents** — entities with their own identity and a top-level URL, and
- **objects** — compositional value-objects, always embedded in something else.

A useful visual model of that schema should distinguish the two, show references and composition between them, and surface field-level types with cardinality — and it should render in the tools people already use (GitHub markdown, mermaid.live, etc.).

An earlier attempt exported the schema as **OWL/RDFS** (for Protégé). It was abandoned: RDFS makes everything an `owl:Class` and **flattens the document/object distinction**. The RDF/OWL vocabulary has no first-class way to separate persistent entities from embedded-only compositions — a paradigm mismatch, not a tooling gap.

## Decision

**Render the content model as a Mermaid `classDiagram`.** Mermaid's class diagram is purpose-built for exactly this structural picture:

- **stereotypes** (`<<document>>` / `<<object>>`) mark the document/object distinction,
- **composition diamonds** (`*--`) mark embedded objects,
- **association arrows** (`-->`) mark references,
- **cardinality** sits on the connecting lines, and
- **`classDef`** styles each stereotype.

The emitted Mermaid is also designed to be **portable** — to render in any Mermaid host without app-specific config (no `themeVariables`/`base`-theme tricks; box palettes are plain `classDef` lines).

### The mapping contract

The full Sanity→Mermaid vocabulary mapping (stereotypes & styling, fields & relationships, the cardinality table, type-name skips, validation handling, Portable Text) is the living specification and is maintained in **[../architecture.md](../architecture.md)** — kept in one place so it has a single home as the model evolves. The rules below are the parts of that contract that were load-bearing to *this decision*:

- **Document** → `<<document>>` + `:::document` (blue). **Object** → `<<object>>` + `:::object` (slate). Both the annotation (visible label) and the `:::stereotype` (colour) are required, applied **at the class declaration**.
- **Composition vs. reference:** a named/inline object field emits a field line **plus** a `Parent *-- Child` edge; a reference field emits a field line **plus** a `Parent --> Target` edge.
- **Cardinality is information design, not a runtime constraint surface** — derived from `Rule.required()` + array status, refined by array `Rule.min/max`. A `[…, custom]` marker flags validation the diagram can't fully render.
- **Two emitter traps** that cost real debugging time, recorded so they aren't rediscovered: (1) a standalone `class Name stereotype` line *without* `:::` parses as a *new* phantom class (`Methoddocument`) — declare each class once with `:::stereotype` at the declaration site, never as a separate style line; (2) some viewers drop fills when `classDef` precedes the classes that use it — emit `classDef` lines **last**.

### Why introspect TypeScript validation rather than `sanity schema extract`

The diagram's cardinality precision (`[1]`, `[2..5]`, `[…, custom]`) depends on reading `Rule.*` calls. `sanity schema extract`'s JSON **does not capture** `Rule.required()`, `Rule.min/max`, or `Rule.custom()` — every user-authored field comes through as `optional: true`. So the pipeline introspects the live `validation` functions instead (`probe.ts`, via a `Proxy` that records `Rule.*` calls without importing Sanity's `Rule` class). Where that schema source comes from inside Studio — and why — is [ADR 0002](0002-content-model-plugin-architecture.md).

## Consequences

- Sanity schema edits require re-deriving the diagram to stay faithful; the tool reads the live schema, so in-Studio it's always current.
- **Field-name collisions across types** (e.g. `documentation.body` as Portable Text vs. `newsletter.body` as a plain string) carry no structural risk — Mermaid never unifies fields across classes, so each class shows its own field. The walker still emits a `model.warnings` entry when a name is reused with differing types, as a modeling smell worth a human glance.

## Deliberately out of scope

- **OWL/RDFS / SHACL export** — superseded by this decision (paradigm mismatch above). Mermaid is visualization, not a queryable vocabulary; bridging to a curated ontology is a different problem.
