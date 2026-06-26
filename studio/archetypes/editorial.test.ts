import {createSchema} from 'sanity'
import {describe, expect, it} from 'vitest'

import {modelFor, renderDiagram} from '../../src/build-diagram'
import {LIGHT_THEME} from '../../src/emit-mermaid'
import {editorial} from './editorial'

/**
 * Editorial archetype — golden-Mermaid test over a real compiled schema.
 *
 * Same real-compile path as the bonkers test (createSchema → readSchemaSource,
 * exercising the @internal `_original.types` seam), but no plugins: editorial is
 * self-contained. Its distinctive property is that it models *cleanly* — the
 * assertion below pins zero Potential-Issues warnings, the deliberate foil to
 * the bonkers archetype.
 */
const compiled = createSchema({name: 'editorial', types: editorial})
const {model, warnings} = modelFor(compiled)

if (!model) {
  throw new Error(`editorial schema failed to read back via _original.types: ${warnings.join('; ')}`)
}

describe('editorial archetype (real compiled schema)', () => {
  it('reads real types back through the _original.types seam', () => {
    expect(model.classes.length).toBeGreaterThan(0)
  })

  it('models cleanly — no Potential-Issues warnings (the bonkers foil)', () => {
    expect(warnings).toEqual([])
  })

  it('connects post references (required author, categories)', () => {
    expect(model.edges).toContainEqual(
      expect.objectContaining({source: 'Post', target: 'Author', relation: 'reference'}),
    )
    expect(model.edges).toContainEqual(
      expect.objectContaining({source: 'Post', target: 'Category', relation: 'reference'}),
    )
  })

  it('promotes Portable Text with a two-hop embed (Post *-- Body *-- PullQuote)', () => {
    expect(model.edges).toContainEqual(
      expect.objectContaining({source: 'Post', target: 'Body', relation: 'composition'}),
    )
    expect(model.edges).toContainEqual(
      expect.objectContaining({source: 'Body', target: 'PullQuote', relation: 'composition'}),
    )
  })

  it('matches the golden Mermaid diagram (light theme, attributes on)', async () => {
    const mermaid = renderDiagram(model, {theme: LIGHT_THEME, attributes: true})
    await expect(mermaid).toMatchFileSnapshot('./__golden__/editorial.mermaid')
  })
})
