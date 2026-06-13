import {defineArrayMember, defineField, defineType, type SchemaTypeDefinition} from 'sanity'

/**
 * Synthetic schema for the dev Studio. It is not meant to model anything real —
 * its job is to exercise every shape the Mermaid content-model diagram cares
 * about, so the plugin can be developed and eyeballed against it:
 *
 * - documents (`article`, `author`) and the plugin-contributed `skosConcept`
 *   type (from sanity-plugin-taxonomy-manager) — the headline feature: types
 *   contributed by a plugin show up via useSchema() where the CLI couldn't see
 *   them.
 * - a named object reused by a document (`seo`)
 * - an inline object inside a Portable Text block's `of` (`inlineHighlight`), an
 *   inline-declared annotation in the block's `marks` (`link`), and a block-level
 *   object (`calloutBox`) — the dependent inline/portable-text categories, and
 *   the three positions a PT embed can occupy (see issue #2)
 * - references: document→document (`author`, `relatedArticles`) and
 *   document→concept (`topics` → `skosConcept`)
 * - an intentional orphan object (`orphanWidget`) — defined but referenced by
 *   nothing, so "Hide Orphan Objects" has something to act on
 * - validation rules so the probe has real cardinality to recover
 */

const author = defineType({
  name: 'author',
  title: 'Author',
  type: 'document',
  fields: [
    defineField({name: 'name', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'bio', type: 'array', of: [defineArrayMember({type: 'block'})]}),
    defineField({name: 'avatar', type: 'image'}),
  ],
})

const seo = defineType({
  name: 'seo',
  title: 'SEO',
  type: 'object',
  fields: [
    defineField({name: 'metaTitle', type: 'string', validation: (rule) => rule.max(60)}),
    defineField({name: 'metaDescription', type: 'text', validation: (rule) => rule.max(160)}),
  ],
})

const inlineHighlight = defineType({
  name: 'inlineHighlight',
  title: 'Highlight',
  type: 'object',
  fields: [defineField({name: 'text', type: 'string', validation: (rule) => rule.required()})],
})

const calloutBox = defineType({
  name: 'calloutBox',
  title: 'Callout',
  type: 'object',
  fields: [
    defineField({
      name: 'tone',
      type: 'string',
      options: {list: ['info', 'warning']},
    }),
    defineField({name: 'body', type: 'text', validation: (rule) => rule.required()}),
  ],
})

const orphanWidget = defineType({
  name: 'orphanWidget',
  title: 'Orphan Widget',
  type: 'object',
  fields: [defineField({name: 'label', type: 'string'})],
})

const article = defineType({
  name: 'article',
  title: 'Article',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'slug', type: 'slug', options: {source: 'title'}}),
    defineField({name: 'seo', type: 'seo'}),
    defineField({
      name: 'author',
      type: 'reference',
      to: [{type: 'author'}],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'topics',
      title: 'Topics',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'skosConcept'}]})],
    }),
    defineField({
      name: 'relatedArticles',
      title: 'Related Articles',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'article'}]})],
      validation: (rule) => rule.max(5),
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'block',
          // inline object, lives inside a block's children
          of: [defineArrayMember({type: 'inlineHighlight'})],
          // inline-declared annotation, lives in the block's marks
          marks: {
            annotations: [
              defineArrayMember({
                name: 'link',
                type: 'object',
                title: 'Link',
                fields: [
                  defineField({name: 'href', type: 'url', validation: (rule) => rule.required()}),
                ],
              }),
            ],
          },
        }),
        // block-level (portable-text) object
        defineArrayMember({type: 'calloutBox'}),
      ],
    }),
  ],
})

export const schemaTypes: SchemaTypeDefinition[] = [
  article,
  author,
  seo,
  inlineHighlight,
  calloutBox,
  orphanWidget,
]
