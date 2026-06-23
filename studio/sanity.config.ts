import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {codeInput} from '@sanity/code-input'
import {taxonomyManager} from 'sanity-plugin-taxonomy-manager'
import {mermaidContentModel} from 'sanity-plugin-mermaid-content-model'

import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: 'default',
  title: 'Mermaid Content Model — Dev',

  projectId: 'e0a474c4',
  dataset: 'production',

  plugins: [
    structureTool(),
    visionTool(),
    // Contributes skosConcept / skosConceptScheme to the composed schema, so
    // the diagram can show plugin-contributed types (the feature this plugin
    // exists for — the CLI can't see them).
    taxonomyManager({baseUri: 'https://example.com/'}),
    // Contributes the `code` object type — embedded in article.body as a named
    // PT member (`{name: 'pre', type: 'code'}`) to exercise issue #23: a
    // plugin-contributed type embedded in Portable Text under its own name.
    codeInput(),
    mermaidContentModel(),
  ],

  schema: {
    types: schemaTypes,
  },
})
