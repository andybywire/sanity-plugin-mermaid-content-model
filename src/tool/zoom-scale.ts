// Pan/zoom scale bounds for the Content Model viewport (react-zoom-pan-pinch).
//
// `scale` is relative to the diagram's natural (1x) size; the viewport fits the
// whole diagram on first render via `zoomToElement`, so a large diagram starts
// well below 1x. The bounds here cap how far the user can then zoom.

/** Lower bound — the diagram never zooms out past its natural (1x) size. */
export const MIN_SCALE = 1

// maxScale curve, tuned by eyeball. Linear in class count, anchored so a
// ~12-class diagram maxes near the previous fixed 15x, clamped to [FLOOR,
// CEILING]. See issue #24.
const FACTOR = 1.25
const FLOOR = 6
const CEILING = 40

/**
 * Maximum zoom-in for a diagram of `visibleClassCount` classes (counted AFTER
 * the Elements filters apply). It grows with class count so a large diagram —
 * which fits at a small initial zoom — can still be zoomed in far enough to
 * read a single class, while a small diagram can't zoom in to an absurd,
 * useless closeness (issue #24).
 */
export function maxScaleFor(visibleClassCount: number): number {
  const scaled = Math.round(visibleClassCount * FACTOR)
  return Math.min(CEILING, Math.max(FLOOR, scaled))
}
