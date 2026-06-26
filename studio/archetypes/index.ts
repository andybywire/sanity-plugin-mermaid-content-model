import {codeInput} from '@sanity/code-input'
import type {PluginOptions, SchemaTypeDefinition} from 'sanity'
import {taxonomyManager} from 'sanity-plugin-taxonomy-manager'

import {bonkers} from './bonkers'
import {ecommerce} from './ecommerce'
import {editorial} from './editorial'
import {knowledgeBase} from './knowledgeBase'

/**
 * Archetype registry (issue #19).
 *
 * One archetype = one dev-Studio workspace **and** one golden-Mermaid test,
 * both driven from the same `types` array — so the `pnpm dev` gallery and the
 * checked-in fixtures can't drift. `sanity.config.ts` maps these to workspaces;
 * each archetype's golden test imports its `types` directly from its own module.
 */
export interface Archetype {
  /** Workspace name and base-path segment (must be URL-safe). */
  name: string
  /** Human label shown in the dev-Studio workspace switcher. */
  title: string
  /** The authored type array — the single source of truth for this archetype. */
  types: SchemaTypeDefinition[]
  /**
   * Extra plugins this archetype needs composed so its referenced types
   * resolve (e.g. taxonomy-manager contributes `skosConcept`). Studio-only:
   * the golden tests compose these explicitly via each plugin's `schema.types`.
   */
  plugins?: PluginOptions[]
}

// taxonomy-manager contributes skosConcept / skosConceptScheme; code-input
// contributes the `code` object — both are referenced by the bonkers schema.
const taxonomyAndCode: PluginOptions[] = [
  taxonomyManager({baseUri: 'https://example.com/'}),
  codeInput(),
]

export const archetypes: Archetype[] = [
  {
    name: 'editorial',
    title: 'Editorial / Blog',
    types: editorial,
  },
  {
    name: 'ecommerce',
    title: 'Ecommerce',
    types: ecommerce,
  },
  {
    name: 'knowledgeBase',
    title: 'Knowledge Base',
    types: knowledgeBase,
    plugins: taxonomyAndCode,
  },
  {
    name: 'bonkers',
    title: 'Bonkers — Kitchen Sink',
    types: bonkers,
    plugins: taxonomyAndCode,
  },
]
