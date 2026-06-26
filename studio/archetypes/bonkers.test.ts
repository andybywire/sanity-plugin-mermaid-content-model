import {codeInput} from '@sanity/code-input'
import {createSchema, type PluginOptions, type SchemaTypeDefinition} from 'sanity'
import {taxonomyManager} from 'sanity-plugin-taxonomy-manager'
import {describe, expect, it} from 'vitest'

import {modelFor, renderDiagram} from '../../src/build-diagram'
import {LIGHT_THEME} from '../../src/emit-mermaid'
import {bonkers} from './bonkers'

/**
 * Bonkers archetype — golden-Mermaid test over a REAL compiled schema.
 *
 * This is the crux of issue #19 / ADR 0003 gate 1: it closes the `@internal`
 * `Schema._original.types` blind spot ADR 0002 documents. The unit suites cast
 * a `fakeSchema`, which structurally cannot catch a change to that seam (it's
 * why the 0.3.0 peer-range widening needed a manual render-verify). Here we run
 * the archetype through Sanity's real `createSchema` — the same compile a Studio
 * workspace performs — then read it back via the adapter (`readSchemaSource`,
 * inside `modelFor`). So a future Sanity change to `_original.types` fails CI
 * here instead of silently degrading the diagram.
 *
 * The schema is composed with the SAME real plugins the bonkers workspace uses
 * (taxonomy-manager → `skosConcept`, code-input → `code`), which the bonkers
 * schema references — not synthetic stand-ins. The `types` array is imported
 * from ./bonkers (the exact array the dev-Studio workspace registers), so the
 * gallery and this fixture can't drift.
 */

// A plugin's `schema.types` may be an array or a composable function; the dev
// plugins we use provide arrays. Guard so the non-array (composable) case is
// handled rather than spread-crashing.
function pluginSchemaTypes(plugin: PluginOptions): SchemaTypeDefinition[] {
  const types = plugin.schema?.types
  return Array.isArray(types) ? types : []
}

const pluginTypes: SchemaTypeDefinition[] = [
  ...pluginSchemaTypes(taxonomyManager({baseUri: 'https://example.com/'})),
  ...pluginSchemaTypes(codeInput()),
]

const compiled = createSchema({name: 'bonkers', types: [...bonkers, ...pluginTypes]})
const {model, warnings} = modelFor(compiled)

// A null model means the @internal seam guard fired — fail loudly and early
// (with the adapter's diagnostic) rather than letting every assertion below
// read as a separate, confusing failure. This throw IS the seam regression net.
if (!model) {
  throw new Error(`bonkers schema failed to read back via _original.types: ${warnings.join('; ')}`)
}

describe('bonkers archetype (real compiled schema)', () => {
  it('reads real types back through the _original.types seam', () => {
    // The compile → adapter round-trip delivered a populated model.
    expect(model.classes.length).toBeGreaterThan(0)
  })

  it('composes the real plugin-contributed types (skosConcept, code)', () => {
    const names = model.classes.map((c) => c.name)
    expect(names).toContain('SkosConcept')
    expect(names).toContain('Code')
  })

  it('recovers reference cycles: self-reference and mutual A↔B', () => {
    // self-reference: article.relatedArticles → article
    expect(model.edges).toContainEqual(
      expect.objectContaining({source: 'Article', target: 'Article', relation: 'reference'}),
    )
    // mutual cycle: article.author → author, author.featuredArticle → article
    expect(model.edges).toContainEqual(
      expect.objectContaining({source: 'Article', target: 'Author', relation: 'reference'}),
    )
    expect(model.edges).toContainEqual(
      expect.objectContaining({source: 'Author', target: 'Article', relation: 'reference'}),
    )
  })

  it('surfaces the custom-validator marker (hasCustom path)', () => {
    const article = model.classes.find((c) => c.name === 'Article')
    expect(article?.fields.find((f) => f.name === 'readingTime')?.hasCustomMarker).toBe(true)
  })

  it('exercises the diagnostic layer (kitchen-sink modeling smells warn)', () => {
    // Collisions (#28), duplicated inline shapes (#29), the orphan (#30) — the
    // archetype deliberately trips non-blocking warnings; assert the path fires.
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('matches the golden Mermaid diagram (light theme, attributes on)', async () => {
    const mermaid = renderDiagram(model, {theme: LIGHT_THEME, attributes: true})
    await expect(mermaid).toMatchFileSnapshot('./__golden__/bonkers.mermaid')
  })
})
