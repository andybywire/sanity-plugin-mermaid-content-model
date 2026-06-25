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
 * - a multi-target (polymorphic) reference (issue #27): `page.related` points at
 *   `article` OR `author`, so it renders one edge per target and a pipe-joined
 *   field label (`+related: Article|Author`) rather than dropping all but the first
 * - the range of image shapes (issue #9): a bare inline image as a scalar leaf
 *   (`author.avatar`), an array of bare images as a scalar leaf
 *   (`article.gallery`), an inline image promoted to a class by its own
 *   sub-fields (`article.coverImage`), and a named image type used as a field
 *   (`heroImage`, the "Hero Image block" case)
 * - Portable Text embeds from issue #23, all living in `article.body`: a named
 *   image type embedded in PT (`figure`), an inline image carrying its own
 *   sub-fields embedded in PT (promoted to its own class), a bare/minimal inline
 *   image (`minimalInlineImage`) that surfaces as a scalar `image` leaf field on
 *   the body class, and a plugin-contributed `code` type embedded under its own
 *   member name (`{name: 'pre', type: 'code'}`, which surfaces as a `pre` field → `Code`)
 * - a named-type *alias* embedded in Portable Text (issue #32): `dataTableBlock`
 *   is a thin alias (`type: 'dataTable'`) over the `dataTable` object — the shape
 *   plugins use to attach custom components to a shared object (e.g.
 *   sanity-plugin-rich-table's `richTableBlock` → `richTable`). The walker follows
 *   the alias so the embed composes to `DataTable` (and its `tableRow` subtree)
 *   rather than stranding it as an orphan.
 * - a deliberate name collision (issue #23): `page.body` is a second structural
 *   PT field also named `body`, so it and `article.body` both derive the class
 *   name `Body`. The walker disambiguates them (`Body_Article` / `Body_Page`)
 *   and flags the collision in Potential Issues — a modeling misstep shown
 *   as-created, then called out rather than silently merged.
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

// A second named image type — embedded in `article.body` as a Portable Text
// member (`{type: 'figure'}`), the issue #23 "figure in bodyText" case. Like
// any named class it composes into the PT class; reachable only through the
// body, so hiding Portable Text strands it as an orphan.
const figure = defineType({
  name: 'figure',
  title: 'Figure',
  type: 'image',
  fields: [
    defineField({name: 'caption', type: 'text', rows: 2}),
    defineField({name: 'altText', type: 'string'}),
    defineField({name: 'outline', type: 'boolean', initialValue: false}),
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

// A named object type with its own nested structure (rows → cells), embedded in
// `article.body` through the `dataTableBlock` alias below.
const dataTable = defineType({
  name: 'dataTable',
  title: 'Data Table',
  type: 'object',
  fields: [
    defineField({name: 'caption', type: 'string'}),
    defineField({name: 'rows', type: 'array', of: [defineArrayMember({type: 'tableRow'})]}),
  ],
})

const tableRow = defineType({
  name: 'tableRow',
  title: 'Table Row',
  type: 'object',
  fields: [defineField({name: 'cells', type: 'array', of: [defineArrayMember({type: 'string'})]})],
})

// A named-type ALIAS (Sanity type extension): its `type` is another named type
// (`dataTable`), not an intrinsic. Plugins use this to attach custom components
// to a shared object — e.g. sanity-plugin-rich-table's `richTableBlock` aliases
// `richTable`. The walker must follow the alias to `DataTable` so an embed of it
// connects rather than orphaning the table (issue #32).
//
// Written as a plain typed literal rather than via `defineType`: for a type
// alias `defineType` infers `options: unknown`, which trips the studio's
// `exactOptionalPropertyTypes` when assigned to `SchemaTypeDefinition[]`.
const dataTableBlock: SchemaTypeDefinition = {
  name: 'dataTableBlock',
  title: 'Data Table Block',
  type: 'dataTable',
}

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
        // Named image type embedded in PT (issue #23) → composes to the Figure
        // class; reachable only through the body.
        defineArrayMember({type: 'figure'}),
        // Inline image carrying its own sub-fields, embedded in PT (issue #23).
        // Should be promoted to its own «object» class (synthetic asset + these
        // fields) — not silently dropped, and not flattened onto the body.
        defineArrayMember({
          name: 'inlineImage',
          type: 'image',
          title: 'Inline Image',
          fields: [
            defineField({name: 'altText', type: 'string'}),
            defineField({name: 'floatLeft', type: 'boolean', initialValue: false}),
          ],
        }),
        // Bare/minimal inline image — no sub-fields. Not great practice, but
        // possible: it makes the PT structural and surfaces as a scalar `image`
        // leaf field on the body class (no class, no edge) — issue #23.
        defineArrayMember({
          name: 'minimalInlineImage',
          type: 'image',
        }),
        // Plugin-contributed `code` type under its own member name (issue #23).
        // Surfaces as a `pre` field whose type is the `Code` class.
        defineArrayMember({name: 'pre', title: 'Pre', type: 'code'}),
        // Named-type alias embedded in PT (issue #32): dataTableBlock aliases
        // the dataTable object (like rich-table's richTableBlock → richTable).
        // The walker follows the alias so this composes to DataTable.
        defineArrayMember({
          name: 'dataTableBlock',
          title: 'Data Table Block',
          type: 'dataTableBlock',
        }),
      ],
    }),
  ],
})

// A second document whose Portable Text field is also named `body` — the
// deliberate issue #23 collision. `article.body` and `page.body` both derive
// `Body`; the walker keeps them distinct (`Body_Article` / `Body_Page`) and
// warns, rather than letting Mermaid merge them into one misleading box.
const page = defineType({
  name: 'page',
  title: 'Page',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'array',
      of: [defineArrayMember({type: 'block'}), defineArrayMember({type: 'calloutBox'})],
    }),
    // A multi-target (polymorphic) reference (issue #27): one field with two
    // possible target types → one edge per target, field label pipe-joined
    // (`+related: Article|Author`), rather than dropping all but the first.
    defineField({
      name: 'related',
      title: 'Related',
      type: 'reference',
      to: [{type: 'article'}, {type: 'author'}],
    }),
  ],
})

export const schemaTypes: SchemaTypeDefinition[] = [
  article,
  page,
  author,
  seo,
  heroImage,
  figure,
  inlineHighlight,
  calloutBox,
  orphanWidget,
  dataTable,
  tableRow,
  dataTableBlock,
]
