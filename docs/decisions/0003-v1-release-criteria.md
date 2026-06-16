# ADR 0003 — Criteria for the v1.0 release

**Status:** accepted (criteria); execution deliberately open-ended (see below)

**Relates to:** [0002](0002-content-model-plugin-architecture.md) — the `@internal` `_original` seam that one of these gates also hardens; [issue #19](https://github.com/andybywire/sanity-plugin-mermaid-content-model/issues/19) — the archetype-schema test harness.

## Context

The plugin is on the `0.x` line. For a while, the 1.0 cut was informally pegged to **widening the `sanity` peer range to `^6`** (an earlier wording in [ADR 0002](0002-content-model-plugin-architecture.md)). That peg has been **decoupled**: widening the peer range is additive, so it shipped as a normal `feat:` (0.3.0, [#3](https://github.com/andybywire/sanity-plugin-mermaid-content-model/issues/3)) rather than as the 1.0 milestone. So 1.0 needs its own, intentional criteria.

The tool's risk profile shapes what 1.0 should *mean*. This is a **read-only visualizer**: its worst-case failure is a visibly wrong or incomplete diagram (surfaced with a warning), not data loss. So the honest 1.0 promise is **"stable public API + validated breadth + responsible semver,"** not "exhaustively bug-free." Pitching 1.0 higher would overstate the case; pitching it lower (e.g. on a version bump alone) would understate the confidence users are entitled to read into a 1.0.

## Decision

**1.0 is a feature-freeze + correctness-confidence milestone, not a version-bump trigger.** Three gates, all of which must hold:

1. **Correctness breadth, automated.** The archetype-schema test harness ([#19](https://github.com/andybywire/sanity-plugin-mermaid-content-model/issues/19)) is in place and green: a small set of representative schemas (realistic archetypes + one deliberately pathological "kitchen-sink") rendered as **golden-Mermaid snapshot tests**, with at least one running over a **real compiled schema** through `readSchemaSource`. Beyond proving breadth to users, that real-compiled path hardens the `@internal` `_original.types` seam ([ADR 0002](0002-content-model-plugin-architecture.md)) the unit suite structurally cannot cover.

2. **Feature freeze + API stability.** The `mermaidContentModel()` options surface is **frozen** — settled enough to commit to semver-major discipline (no renaming options next month). Open feature [issues](https://github.com/andybywire/sanity-plugin-mermaid-content-model/issues) (the active work queue) are triaged into *1.0-blocking* vs *post-1.0*, and the 1.0-blocking subset is cleared. 1.0 ships when the *blocking* set is empty — not when the tracker is empty.

3. **Real-world validation before the freeze.** Feature completeness is judged against real use, not speculation. Dogfood the plugin on the author's own Studio projects, and solicit feedback from other Studio maintainers, to surface blind-spot features *before* freezing the surface. This makes 1.0 **timing deliberately open-ended** — a waiting game gated on feedback, not a date.

### What 1.0 does *not* require

- **Exhaustive bug-freedom.** See the risk profile above — degradation is visible, not catastrophic.
- **An empty backlog.** Only the 1.0-blocking subset must be cleared; post-1.0 items are legitimate.
- **A specific version-bump event.** 1.0 is declared when the gates hold, then cut deliberately — it is not the side effect of any one change.

## Consequences

- This ADR is the single, citable **"1.0 bar."** Both the archetype harness ([#19](https://github.com/andybywire/sanity-plugin-mermaid-content-model/issues/19)) and the 1.0-blocking feature issues flow *into* it; neither is a separate, standalone "release" task.
- Until the gates hold, the line **stays `0.x`.** Peer-range, fix, and feature work release as normal patches/minors via semantic-release — nothing is held back waiting for 1.0.
- Because gate 3 is feedback-gated, **there is no committed 1.0 date**, and that is intentional — a "non-issue" tracking ticket would only invite a false deadline.
- Revisit this ADR if the value proposition shifts (e.g. the tool gains a data-mutating capability, which would raise the correctness bar materially).
