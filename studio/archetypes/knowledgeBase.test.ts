import {codeInput} from '@sanity/code-input'
import {createSchema, type PluginOptions, type SchemaTypeDefinition} from 'sanity'
import {taxonomyManager} from 'sanity-plugin-taxonomy-manager'
import {describe, expect, it} from 'vitest'

import {modelFor, renderDiagram} from '../../src/build-diagram'
import {LIGHT_THEME} from '../../src/emit-mermaid'
import {knowledgeBase} from './knowledgeBase'

/**
 * Knowledge Base archetype — golden-Mermaid test over a real compiled schema,
 * composed with the SAME real plugins the workspace uses (taxonomy-manager →
 * skosConcept, code-input → code). Like the bonkers test it exercises the
 * @internal `_original.types` seam; unlike it, plugin-aware composition is the
 * whole point, so the assertions pin the taxonomy hub and the reused plugin
 * `code` object.
 */

// A plugin's `schema.types` may be an array or a composable function; the dev
// plugins provide arrays. Guard so the composable case is handled.
function pluginSchemaTypes(plugin: PluginOptions): SchemaTypeDefinition[] {
  const types = plugin.schema?.types
  return Array.isArray(types) ? types : []
}

const pluginTypes: SchemaTypeDefinition[] = [
  ...pluginSchemaTypes(taxonomyManager({baseUri: 'https://example.com/'})),
  ...pluginSchemaTypes(codeInput()),
]

const compiled = createSchema({name: 'knowledgeBase', types: [...knowledgeBase, ...pluginTypes]})
const {model, warnings} = modelFor(compiled)

if (!model) {
  throw new Error(
    `knowledgeBase schema failed to read back via _original.types: ${warnings.join('; ')}`,
  )
}

describe('knowledgeBase archetype (real compiled schema)', () => {
  it('reads real types back through the _original.types seam', () => {
    expect(model.classes.length).toBeGreaterThan(0)
  })

  it('models cleanly — no Potential-Issues warnings', () => {
    expect(warnings).toEqual([])
  })

  it('composes the real plugin-contributed types (skosConcept, code)', () => {
    const names = model.classes.map((c) => c.name)
    expect(names).toContain('SkosConcept')
    expect(names).toContain('Code')
  })

  it('makes skosConcept the tag hub: three content types converge on it', () => {
    for (const source of ['GlossaryEntry', 'Tutorial', 'ReferenceResource']) {
      expect(model.edges).toContainEqual(
        expect.objectContaining({source, target: 'SkosConcept', relation: 'reference'}),
      )
    }
  })

  it('reuses the plugin `code` object across three parents', () => {
    for (const source of ['GlossaryEntry', 'Tutorial', 'TutorialStep']) {
      expect(model.edges).toContainEqual(
        expect.objectContaining({source, target: 'Code', relation: 'composition'}),
      )
    }
  })

  it('recovers learning-structure self-references', () => {
    expect(model.edges).toContainEqual(
      expect.objectContaining({
        source: 'GlossaryEntry',
        target: 'GlossaryEntry',
        relation: 'reference',
      }),
    )
    expect(model.edges).toContainEqual(
      expect.objectContaining({source: 'Tutorial', target: 'Tutorial', relation: 'reference'}),
    )
  })

  it('matches the golden Mermaid diagram (light theme, attributes on)', async () => {
    const mermaid = renderDiagram(model, {theme: LIGHT_THEME, attributes: true})
    await expect(mermaid).toMatchFileSnapshot('./__golden__/knowledgeBase.mermaid')
  })
})
