import mermaid from 'mermaid'
import {useEffect, useId, useRef, useState} from 'react'

// Mermaid is initialised inside the render effect (not at module load) so its
// base theme can follow Studio's colour scheme: light vs dark drives the
// background, edges, and label colours. The document/object box colours come
// separately from the `classDef` lines the emitter writes (see DiagramTheme),
// already baked into `code`.

// Off-flow container that mermaid.render() uses for text measurement. Without
// it, mermaid appends a temporary node to document.body on every render, which
// briefly grows the page and flickers the *window* scrollbar (shifting the
// whole Studio a few px on each Elements toggle). `position: fixed` + zero size
// keeps it out of document flow; `opacity: 0` (not display:none/visibility) so
// the SVG text is still laid out and measurable.
const MEASURE_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: 0,
  height: 0,
  overflow: 'hidden',
  opacity: 0,
  pointerEvents: 'none',
}

export interface MermaidViewProps {
  /** Mermaid `classDiagram` source to render. */
  code: string
  /**
   * Studio colour scheme — selects mermaid's named base theme (`default`/`dark`)
   * for background, edges, and labels. Box colours come from the `classDef`
   * lines already in `code`. Default 'light'.
   */
  colorScheme?: 'light' | 'dark'
  /**
   * Called with the rendered SVG string when it changes (or `null` on render
   * error). Lets the tool feed the *displayed* SVG to "Copy PNG".
   */
  onSvg?: (svg: string | null) => void
}

/**
 * Render a Mermaid diagram string to inline SVG. Browser-only (mermaid needs a
 * DOM); kept deliberately thin so it can be unit-tested with mermaid mocked.
 * The injected SVG is also the source for the future "Copy PNG" feature, so it
 * stays self-contained.
 */
export function MermaidView({
  code,
  colorScheme = 'light',
  onSvg,
}: MermaidViewProps): React.JSX.Element {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // mermaid.render needs a unique, selector-safe id; useId() includes colons.
  const renderId = `mcm-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const measureRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    // Re-initialise per render so the base theme tracks the current colour
    // scheme (cheap; it's just config). `startOnLoad: false` — we render imperatively.
    // `htmlLabels: false` renders labels as SVG <text> rather than HTML in a
    // <foreignObject> — an SVG with foreignObject taints a <canvas>, which would
    // block Copy PNG's toBlob(). For our short labels the visual result is the same.
    mermaid.initialize({
      startOnLoad: false,
      theme: colorScheme === 'dark' ? 'dark' : 'default',
      htmlLabels: false,
      class: {
        // Asks for explicit px width/height (from the viewBox) rather than
        // width:100% + max-width, for a stable intrinsic size. NB mermaid
        // currently ignores this for classDiagram — verified identical output
        // with it true and false, on both 11.15 and 11.17 — so the rendered SVG
        // carries width="100%". Kept as a declaration of intent; fit-to-view
        // doesn't depend on it, since zoomToElement measures the laid-out box.
        useMaxWidth: false,
        // The unified (v2) renderer, which mermaid 11.17 made the default for
        // classDiagram. It is pinned rather than inherited because our `mermaid`
        // dependency is a caret range — consumers resolve any 11.x, and the
        // renderer governs how relations are drawn.
        //
        // The legacy 'dagre-d3' renderer draws a self-referential relation (an
        // `article` with `relatedArticles: article`, say) as three separate
        // paths that trail off into empty space rather than looping back to the
        // class, so the diagram shows edges going nowhere. The unified renderer
        // draws a proper self-loop. Everything else is unchanged between the
        // two: identical viewBox, identical classDef fills, and no
        // <foreignObject> either way (which Copy PNG's canvas depends on).
        defaultRenderer: 'dagre-wrapper',
      },
    })
    mermaid
      .render(renderId, code, measureRef.current ?? undefined)
      .then(({svg: rendered}) => {
        if (cancelled) return
        setSvg(rendered)
        setError(null)
        onSvg?.(rendered)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setSvg(null)
        onSvg?.(null)
      })
    return () => {
      cancelled = true
    }
  }, [code, renderId, colorScheme, onSvg])

  return (
    <>
      <div ref={measureRef} aria-hidden="true" style={MEASURE_STYLE} />
      {/* eslint-disable-next-line no-nested-ternary -- idiomatic error / loading / loaded render */}
      {error ? (
        <div role="alert" style={{whiteSpace: 'pre-wrap', fontFamily: 'monospace'}}>
          Failed to render diagram:{'\n'}
          {error}
        </div>
      ) : svg === null ? (
        <div>Rendering diagram…</div>
      ) : (
        // mermaid output is self-contained, sanitised SVG (securityLevel defaults
        // to 'strict'); injecting it directly is how every Mermaid React wrapper works.
        // `data-diagram` lets the tool target the *displayed* SVG (not the
        // off-flow measurement container) for fit-to-view.
        <div data-diagram="" dangerouslySetInnerHTML={{__html: svg}} />
      )}
    </>
  )
}
