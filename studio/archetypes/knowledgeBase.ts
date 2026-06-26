import {defineArrayMember, defineField, defineType, type SchemaTypeDefinition} from 'sanity'

/**
 * Knowledge Base archetype (issue #19), verging on LMS.
 *
 * An underused but high-value Sanity shape: a knowledge base whose connective
 * tissue is a **controlled vocabulary**, not hand-maintained links. Three
 * content types — `glossaryEntry`, `tutorial`, `referenceResource` — all tag
 * themselves against the *real* plugin-contributed `skosConcept` type
 * (sanity-plugin-taxonomy-manager). Relationships between, say, a tutorial and
 * the resources that support it then emerge *programmatically* from shared
 * topics rather than from manual references — so `skosConcept` becomes a hub the
 * diagram makes legible at a glance.
 *
 * It also composes the real `code` type (@sanity/code-input), reused across all
 * three content surfaces. This is the focused counterpart to bonkers' incidental
 * plugin usage: here plugin-aware composition — the whole reason this tool runs
 * in-Studio rather than as the old CLI — is the point, in a clean domain model.
 *
 * Shapes it exercises (breadth, not depth):
 * - plugin document-type references: single-required (`glossaryEntry.concept`)
 *   and array (`tutorial.topics`, `referenceResource.topics`) → the SkosConcept
 *   hub, plus the plugin's own SkosConcept/SkosConceptScheme graph
 * - a plugin object type reused as a shared composition target: `code` on a
 *   document field, in an array, and nested in a user object (Code from three
 *   parents)
 * - document self-references modeling learning structure: `glossaryEntry.seeAlso`
 *   and `tutorial.prerequisites`
 * - a `file` download leaf and a `url` leaf (`referenceResource`)
 *
 * Composed with the same plugins the workspace uses (see `archetypes/index.ts`);
 * the golden test imports this array and those plugins' real `schema.types`.
 */

const tutorialStep = defineType({
  name: 'tutorialStep',
  title: 'Tutorial Step',
  type: 'object',
  fields: [
    defineField({name: 'instruction', type: 'text'}),
    // The real plugin `code` object, nested in a user object → Code reused.
    defineField({name: 'snippet', type: 'code'}),
  ],
})

const glossaryEntry = defineType({
  name: 'glossaryEntry',
  title: 'Glossary Entry',
  type: 'document',
  fields: [
    defineField({name: 'term', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'slug', type: 'slug', options: {source: 'term'}}),
    // The controlled-vocabulary link. The canonical definition/scope notes live
    // on the skosConcept; the glossary entry is the editorial layer over it.
    defineField({
      name: 'concept',
      type: 'reference',
      to: [{type: 'skosConcept'}],
      validation: (rule) => rule.required(),
    }),
    // Editorial usage guidance (block-only Portable Text → scalar label).
    defineField({name: 'usageNotes', type: 'array', of: [defineArrayMember({type: 'block'})]}),
    defineField({name: 'codeExample', type: 'code'}),
    // Document self-reference: cross-linked glossary entries.
    defineField({
      name: 'seeAlso',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'glossaryEntry'}]})],
    }),
  ],
})

const tutorial = defineType({
  name: 'tutorial',
  title: 'Tutorial',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'slug', type: 'slug', options: {source: 'title'}}),
    // Topic tags → the SkosConcept hub (same vocabulary the resources tag against,
    // so tutorial↔resource relationships emerge from shared topics).
    defineField({
      name: 'topics',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'skosConcept'}]})],
    }),
    defineField({name: 'estimatedMinutes', type: 'number'}),
    defineField({name: 'steps', type: 'array', of: [defineArrayMember({type: 'tutorialStep'})]}),
    // Array of the real plugin `code` object → Code reused.
    defineField({name: 'snippets', type: 'array', of: [defineArrayMember({type: 'code'})]}),
    // Document self-reference modeling learning-path prerequisites.
    defineField({
      name: 'prerequisites',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'tutorial'}]})],
    }),
  ],
})

const referenceResource = defineType({
  name: 'referenceResource',
  title: 'Reference Resource',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'slug', type: 'slug', options: {source: 'title'}}),
    defineField({
      name: 'resourceType',
      type: 'string',
      options: {list: ['article', 'video', 'download', 'externalLink', 'apiReference']},
    }),
    defineField({name: 'url', type: 'url'}),
    // A bare `file` download → a scalar `file` leaf.
    defineField({name: 'attachment', type: 'file'}),
    defineField({name: 'summary', type: 'array', of: [defineArrayMember({type: 'block'})]}),
    // Topic tags → the same SkosConcept hub the tutorials tag against.
    defineField({
      name: 'topics',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'skosConcept'}]})],
    }),
  ],
})

export const knowledgeBase: SchemaTypeDefinition[] = [
  glossaryEntry,
  tutorial,
  referenceResource,
  tutorialStep,
]
