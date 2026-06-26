import {defineArrayMember, defineField, defineType, type SchemaTypeDefinition} from 'sanity'

/**
 * Editorial / blog archetype (issue #19) — the canonical, *clean* CMS shape.
 *
 * Where the bonkers archetype deliberately courts every modeling smell, this one
 * is what good modeling looks like: documents + Portable Text + references +
 * author/category, rendering a legible diagram with **zero** Potential-Issues
 * warnings. The contrast between the two is itself part of the gallery's value.
 *
 * Shapes it exercises (breadth, not depth — the unit fixtures pin the details):
 * - documents with a required single reference (`post.author`) and an
 *   array-of-references (`post.categories`)
 * - Portable Text with an inline *annotation* (`link`, in the block's `marks`)
 *   and a block-level named object (`pullQuote`) — the two-hop promotion
 *   `Post *-- Body *-- PullQuote` that keeps embeds connected (issue #2)
 * - block-only Portable Text as a scalar label (`author.bio`)
 * - an inline image promoted to a class by its own sub-fields (`post.mainImage`)
 *   and bare image leaves (`author.avatar`, `seo.ogImage`)
 * - a reused named object (`seo`) and a `datetime` field
 *
 * This array is the single source of truth shared by the editorial workspace
 * (see `archetypes/index.ts`) and the editorial golden-Mermaid test.
 */

const author = defineType({
  name: 'author',
  title: 'Author',
  type: 'document',
  fields: [
    defineField({name: 'name', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'slug', type: 'slug', options: {source: 'name'}}),
    // Block-only Portable Text → a scalar `PortableText` label, no class/edge.
    defineField({name: 'bio', type: 'array', of: [defineArrayMember({type: 'block'})]}),
    // Bare image field → a scalar `image` leaf (holds an asset, not an object).
    defineField({name: 'avatar', type: 'image'}),
  ],
})

const category = defineType({
  name: 'category',
  title: 'Category',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'description', type: 'text'}),
  ],
})

const pullQuote = defineType({
  name: 'pullQuote',
  title: 'Pull Quote',
  type: 'object',
  fields: [
    defineField({name: 'quote', type: 'text', validation: (rule) => rule.required()}),
    defineField({name: 'attribution', type: 'string'}),
  ],
})

const seo = defineType({
  name: 'seo',
  title: 'SEO',
  type: 'object',
  fields: [
    defineField({name: 'metaTitle', type: 'string'}),
    defineField({name: 'metaDescription', type: 'text'}),
    defineField({name: 'ogImage', type: 'image'}),
  ],
})

const post = defineType({
  name: 'post',
  title: 'Post',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'slug', type: 'slug', options: {source: 'title'}}),
    defineField({name: 'publishedAt', type: 'datetime'}),
    // Required single reference → an association edge to Author.
    defineField({
      name: 'author',
      type: 'reference',
      to: [{type: 'author'}],
      validation: (rule) => rule.required(),
    }),
    // Array of references → one association edge to Category.
    defineField({
      name: 'categories',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'category'}]})],
    }),
    // Inline image carrying its own sub-fields → promoted to a MainImage class.
    defineField({
      name: 'mainImage',
      type: 'image',
      fields: [
        defineField({name: 'alt', type: 'string', validation: (rule) => rule.required()}),
        defineField({name: 'caption', type: 'string'}),
      ],
    }),
    defineField({name: 'excerpt', type: 'text'}),
    // Structural Portable Text: a block carrying an inline `link` annotation,
    // plus a block-level `pullQuote`. Promotes to a Body class with the two
    // embeds composed in (Post *-- Body *-- {Link, PullQuote}).
    defineField({
      name: 'body',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'block',
          marks: {
            annotations: [
              defineArrayMember({
                name: 'link',
                type: 'object',
                title: 'Link',
                fields: [
                  defineField({name: 'href', type: 'url', validation: (rule) => rule.required()}),
                  defineField({name: 'openInNewTab', type: 'boolean'}),
                ],
              }),
            ],
          },
        }),
        defineArrayMember({type: 'pullQuote'}),
      ],
    }),
    defineField({name: 'seo', type: 'seo'}),
  ],
})

export const editorial: SchemaTypeDefinition[] = [post, author, category, pullQuote, seo]
