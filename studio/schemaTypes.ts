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
 * - the range of image shapes (issue #9): a bare inline image as a scalar leaf
 *   (`author.avatar`), an array of bare images as a scalar leaf
 *   (`article.gallery`), an inline image promoted to a class by its own
 *   sub-fields (`article.coverImage`), and a named image type used as a field
 *   (`heroImage`, the "Hero Image block" case)
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

// A named image type — its own «object» class with the synthetic asset plus
// authored fields. Referenced by `article.heroImage`, so it composes in as a
// class (the "Hero Image block" case from issue #9), distinct from the inline
// image shapes below.
const heroImage = defineType({
  name: 'heroImage',
  title: 'Hero Image',
  type: 'image',
  fields: [
    defineField({name: 'alt', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'caption', type: 'string'}),
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
    // Named image type used as a field → composition edge to the HeroImage class.
    defineField({name: 'heroImage', type: 'heroImage'}),
    // Inline image carrying its own sub-fields → promoted to an inline class
    // (CoverImage) with the synthetic asset plus alt/caption.
    defineField({
      name: 'coverImage',
      type: 'image',
      fields: [
        defineField({name: 'alt', type: 'string'}),
        defineField({name: 'caption', type: 'string'}),
      ],
    }),
    // Array of bare inline images → a scalar leaf `gallery: image [0..*]`,
    // no class (no per-image sub-fields to promote).
    defineField({name: 'gallery', type: 'array', of: [defineArrayMember({type: 'image'})]}),
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
  heroImage,
  inlineHighlight,
  calloutBox,
  orphanWidget,
]
