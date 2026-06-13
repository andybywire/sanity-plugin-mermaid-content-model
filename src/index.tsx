import {SchemaIcon} from '@sanity/icons'
import {definePlugin} from 'sanity'

import {ContentModelTool} from './tool/ContentModelTool'

/**
 * Sanity Studio plugin that renders the Studio's content model as a Mermaid
 * class diagram, inside Studio.
 *
 * Registers a top-nav tool. The diagram is built from the fully-composed
 * workspace schema (`useSchema()`), so plugin-contributed types are included —
 * unlike the `content-model/` CLI. The pure `probe` / `walker` / `emit`
 * pipeline is reused (copied from the CLI) and re-exported here for independent
 * use.
 *
 * See ../docs/decisions/0002-content-model-plugin-architecture.md and
 * ../docs/decisions/0001-content-model-mermaid-export.md.
 */
export const mermaidContentModel = definePlugin(() => ({
  name: 'sanity-plugin-mermaid-content-model',
  tools: [
    {
      name: 'mermaid-content-model',
      title: 'Content Model',
      icon: SchemaIcon,
      component: ContentModelTool,
    },
  ],
}))

export type {DiagramResult} from './build-diagram'
export {buildDiagram} from './build-diagram'
export {emit} from './emit-mermaid'
export {probe} from './probe'
export type {SchemaSource} from './schema-adapter'
export {readSchemaSource} from './schema-adapter'
export type {
  CanonicalClass,
  CanonicalField,
  CanonicalModel,
  Cardinality,
  ClassOrigin,
  Edge,
  FieldChar,
  Stereotype,
} from './walker'
export {walk} from './walker'
