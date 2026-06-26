import {Box, Card, Flex, Stack, Text, useRootTheme} from '@sanity/ui'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {type ReactZoomPanPinchRef, TransformComponent, TransformWrapper} from 'react-zoom-pan-pinch'
import {useSchema} from 'sanity'

import {modelFor, renderDiagram} from '../build-diagram'
import {
  defaultSelection,
  elementGroups,
  type ElementsSelection,
  orphanObjects,
  resolveElements,
} from '../elements'
import {DARK_THEME, LIGHT_THEME} from '../emit-mermaid'
import {CopyCodeButton} from './CopyCodeButton'
import {CopyPngButton} from './CopyPngButton'
import {ElementsMenu} from './ElementsMenu'
import {MermaidView} from './MermaidView'
import {WarningsMenu} from './WarningsMenu'
import {maxScaleFor, MIN_SCALE} from './zoom-scale'
import {ZoomControls} from './ZoomControls'

/**
 * The top-nav tool. Reads the fully-composed Studio schema via `useSchema()`,
 * walks it once into the unfiltered model, and renders it in a Vision-like
 * full-height layout: a top control bar over a scrollable work area. The
 * Elements menu drives an in-memory selection; each toggle re-resolves and
 * re-renders the diagram live.
 *
 * Deliberately thin — the model, filtering, selection resolution, and rendering
 * are all pure modules (unit-tested without a DOM). This component only wires
 * Studio context (schema, theme) to those pieces, so it's covered by the live
 * eyeball check rather than DOM tests. See docs/ui-design.md.
 */
export function ContentModelTool(): React.JSX.Element {
  const schema = useSchema()
  // Follow Studio's resolved colour scheme: light/dark drives the diagram's
  // palette (classDef colours) and mermaid's base theme (bg/edges/labels).
  const {scheme} = useRootTheme()
  const diagramTheme = scheme === 'dark' ? DARK_THEME : LIGHT_THEME

  const {model, warnings} = useMemo(() => modelFor(schema), [schema])
  const groups = useMemo(() => (model ? elementGroups(model) : null), [model])
  // Schema is stable within a session, so initialise the selection once.
  const [selection, setSelection] = useState<ElementsSelection | null>(() =>
    model ? defaultSelection(model) : null,
  )
  // The currently-rendered SVG, lifted from MermaidView so "Copy PNG" rasterizes
  // exactly what's displayed.
  const [renderedSvg, setRenderedSvg] = useState<string | null>(null)

  // Pan/zoom: fit the diagram to the viewport on first render, on Reset, and
  // whenever the Elements selection changes its size (issue #33).
  const transformRef = useRef<ReactZoomPanPinchRef>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  // True when a fit is owed — armed on first render and on each selection change,
  // consumed once the resulting SVG has rendered.
  const refitPendingRef = useRef(true)

  const fitView = useCallback(() => {
    const api = transformRef.current
    const viewport = viewportRef.current
    if (!api || !viewport) return
    // Target the *displayed* SVG (not the off-flow measurement container).
    const svg = viewport.querySelector('[data-diagram] svg')
    if (!svg) return
    // zoomToElement measures the element's actual box and scales+centers it to
    // fit the wrapper — no assumptions about the SVG's rendered size. (0 = no
    // animation; the cast bridges SVGElement → the HTMLElement the type expects,
    // both support getBoundingClientRect.)
    api.zoomToElement(svg as HTMLElement, undefined, 0)
  }, [])

  // Arm a re-fit whenever the Elements selection changes the diagram, so the
  // user doesn't have to hit Reset after every adjustment (issue #33). The new
  // diagram renders asynchronously, so we only set the flag here and perform the
  // fit once its SVG has landed (below).
  useEffect(() => {
    refitPendingRef.current = true
  }, [selection])

  // Fit when a pending re-fit's new SVG has rendered (a frame later, so the
  // viewport is laid out): the first render and every selection change. Theme
  // toggles and user pan/zoom don't arm the flag, so they keep the current view;
  // Reset re-fits on demand.
  useEffect(() => {
    if (!renderedSvg || !refitPendingRef.current) return undefined
    refitPendingRef.current = false
    const id = requestAnimationFrame(fitView)
    return () => cancelAnimationFrame(id)
  }, [renderedSvg, fitView])

  const resolved = model && selection ? resolveElements(model, selection) : null
  const mermaid =
    model && resolved ? renderDiagram(model, {...resolved, theme: diagramTheme}) : null
  const orphans = model && selection ? orphanObjects(model, selection) : []

  // maxScale grows with how many classes are actually rendered (post-filter), so
  // large diagrams keep enough zoom-in headroom to read a class while small ones
  // don't zoom in to unreasonable closeness (issue #24).
  const visibleClassCount =
    model && resolved ? model.classes.filter((c) => !resolved.hidden.has(c.name)).length : 0
  const maxScale = maxScaleFor(visibleClassCount)

  return (
    <Flex direction="column" height="fill">
      <Card paddingX={4} paddingY={3} borderBottom>
        <Flex align="center" justify="space-between" gap={3}>
          <Text size={1} weight="semibold">
            Content Model
          </Text>
          {model && selection && groups && (
            // Controls, floated right: [Warnings] [Copy Code] [Copy PNG] [Elements].
            // Warnings renders only when there are warnings (it returns null otherwise).
            <Flex gap={2}>
              <WarningsMenu warnings={warnings} />
              <CopyCodeButton code={mermaid} />
              <CopyPngButton svg={renderedSvg} />
              <ElementsMenu
                selection={selection}
                groups={groups}
                onChange={setSelection}
                orphans={orphans}
              />
            </Flex>
          )}
        </Flex>
      </Card>

      <Flex direction="column" flex={1} style={{minHeight: 0}}>
        {mermaid === null ? (
          <Box padding={4}>
            <Card tone="caution" padding={4} radius={2} shadow={1}>
              <Stack gap={3}>
                {warnings.map((warning, i) => (
                  <Text key={i} size={1}>
                    {warning}
                  </Text>
                ))}
              </Stack>
            </Card>
          </Box>
        ) : (
          <>
            {/* Non-blocking modeling warnings live behind the top-bar Warnings
                button (WarningsMenu), not in the work area — see issue #4. */}
            {/* Bounded, overflow-hidden viewport: pan/zoom operates within it. */}
            <Box
              ref={viewportRef}
              flex={1}
              style={{position: 'relative', overflow: 'hidden', minHeight: 0}}
            >
              <TransformWrapper ref={transformRef} minScale={MIN_SCALE} maxScale={maxScale}>
                {({zoomIn, zoomOut}) => (
                  <>
                    <ZoomControls
                      onZoomIn={() => zoomIn()}
                      onZoomOut={() => zoomOut()}
                      onReset={fitView}
                    />
                    <TransformComponent wrapperStyle={{width: '100%', height: '100%'}}>
                      <MermaidView code={mermaid} colorScheme={scheme} onSvg={setRenderedSvg} />
                    </TransformComponent>
                  </>
                )}
              </TransformWrapper>
            </Box>
          </>
        )}
      </Flex>
    </Flex>
  )
}
