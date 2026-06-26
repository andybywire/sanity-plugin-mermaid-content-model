import {createSchema} from 'sanity'
import {describe, expect, it} from 'vitest'

import {modelFor, renderDiagram} from '../../src/build-diagram'
import {LIGHT_THEME} from '../../src/emit-mermaid'
import {ecommerce} from './ecommerce'

/**
 * Ecommerce archetype — golden-Mermaid test over a real compiled schema.
 *
 * Same real-compile path as the other archetype tests (createSchema →
 * readSchemaSource, exercising the @internal `_original.types` seam), no plugins.
 * The targeted assertions pin its distinctive structural features: a shared
 * object composed from two parents, multi-level nested composition, and
 * self-referential relationships — all while modeling cleanly (zero warnings).
 */
const compiled = createSchema({name: 'ecommerce', types: ecommerce})
const {model, warnings} = modelFor(compiled)

if (!model) {
  throw new Error(`ecommerce schema failed to read back via _original.types: ${warnings.join('; ')}`)
}

describe('ecommerce archetype (real compiled schema)', () => {
  it('reads real types back through the _original.types seam', () => {
    expect(model.classes.length).toBeGreaterThan(0)
  })

  it('models cleanly — no Potential-Issues warnings', () => {
    expect(warnings).toEqual([])
  })

  it('composes a SHARED object from two parents (Product/Variant *-- Price)', () => {
    expect(model.edges).toContainEqual(
      expect.objectContaining({source: 'Product', target: 'Price', relation: 'composition'}),
    )
    expect(model.edges).toContainEqual(
      expect.objectContaining({source: 'Variant', target: 'Price', relation: 'composition'}),
    )
  })

  it('nests composition multiple levels (Product *-- Variant *-- VariantOption)', () => {
    expect(model.edges).toContainEqual(
      expect.objectContaining({source: 'Product', target: 'Variant', relation: 'composition'}),
    )
    expect(model.edges).toContainEqual(
      expect.objectContaining({source: 'Variant', target: 'VariantOption', relation: 'composition'}),
    )
  })

  it('recovers self-references on a document and a hierarchy', () => {
    // cross-sell: product → product
    expect(model.edges).toContainEqual(
      expect.objectContaining({source: 'Product', target: 'Product', relation: 'reference'}),
    )
    // category parent hierarchy
    expect(model.edges).toContainEqual(
      expect.objectContaining({source: 'Category', target: 'Category', relation: 'reference'}),
    )
  })

  it('matches the golden Mermaid diagram (light theme, attributes on)', async () => {
    const mermaid = renderDiagram(model, {theme: LIGHT_THEME, attributes: true})
    await expect(mermaid).toMatchFileSnapshot('./__golden__/ecommerce.mermaid')
  })
})
