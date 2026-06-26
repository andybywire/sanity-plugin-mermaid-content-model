import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {mermaidContentModel} from 'sanity-plugin-mermaid-content-model'

import {archetypes} from './archetypes'

// A `pnpm dev` gallery: one workspace per archetype (issue #19), all sharing
// the dev project/dataset. Each workspace renders the Content Model tool against
// that archetype's schema, so they can be eyeballed side by side via the
// workspace switcher. The schema arrays live in `archetypes/` and are the same
// ones the golden-Mermaid tests import — gallery and fixtures can't drift.
const projectId = 'e0a474c4'
const dataset = 'production'

export default defineConfig(
  archetypes.map((archetype) => ({
    name: archetype.name,
    title: archetype.title,
    basePath: `/${archetype.name}`,
    projectId,
    dataset,
    plugins: [
      mermaidContentModel(),
      structureTool(),
      visionTool(),
      ...(archetype.plugins ?? []),
    ],
    schema: {
      types: archetype.types,
    },
  })),
)
