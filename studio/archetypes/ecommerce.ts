import {defineArrayMember, defineField, defineType, type SchemaTypeDefinition} from 'sanity'

/**
 * Ecommerce archetype (issue #19) — relational breadth + nested composition.
 *
 * The structurally densest of the realistic archetypes: arrays-of-objects,
 * multi-level nested composition, a legitimately *shared* object, and
 * self-referential hierarchies — all modeled cleanly (zero Potential-Issues
 * warnings), the relational counterpart to editorial's prose focus.
 *
 * Shapes it exercises (breadth, not depth):
 * - array-of-objects: `product.variants` (Variant) and `variant.options`
 *   (VariantOption) — composition edges carrying array cardinality
 * - multi-level nested composition: `Product *-- Variant *-- VariantOption`
 * - a *shared* object: `price` is composed by BOTH product and variant
 *   (`Product *-- Price` and `Variant *-- Price`) — clean fodder for the
 *   Elements "shared objects" view; the well-modeled counterpart to bonkers'
 *   orphan/duplicate cases
 * - dense + self references: product → brand, product → categories[], product →
 *   relatedProducts[] (document self-reference), and category → parent (a
 *   self-referential hierarchy)
 * - a bare image-leaf array (`product.gallery`) and a bare image leaf
 *   (`brand.logo`)
 *
 * Single source of truth shared by the ecommerce workspace (archetypes/index.ts)
 * and the ecommerce golden-Mermaid test.
 */

const price = defineType({
  name: 'price',
  title: 'Price',
  type: 'object',
  fields: [
    defineField({name: 'amount', type: 'number', validation: (rule) => rule.required()}),
    defineField({name: 'currency', type: 'string'}),
  ],
})

const variantOption = defineType({
  name: 'variantOption',
  title: 'Variant Option',
  type: 'object',
  fields: [
    defineField({name: 'name', type: 'string'}),
    defineField({name: 'value', type: 'string'}),
  ],
})

const variant = defineType({
  name: 'variant',
  title: 'Variant',
  type: 'object',
  fields: [
    defineField({name: 'title', type: 'string'}),
    defineField({name: 'sku', type: 'string'}),
    // The shared `price` object — also composed by `product` below.
    defineField({name: 'price', type: 'price'}),
    // Array-of-objects nested inside an array-of-objects member.
    defineField({name: 'options', type: 'array', of: [defineArrayMember({type: 'variantOption'})]}),
    defineField({name: 'inStock', type: 'boolean'}),
  ],
})

const brand = defineType({
  name: 'brand',
  title: 'Brand',
  type: 'document',
  fields: [
    defineField({name: 'name', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'logo', type: 'image'}),
    defineField({name: 'website', type: 'url'}),
  ],
})

const category = defineType({
  name: 'category',
  title: 'Category',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    // Self-referential hierarchy: a category's parent category.
    defineField({name: 'parent', type: 'reference', to: [{type: 'category'}]}),
  ],
})

const product = defineType({
  name: 'product',
  title: 'Product',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'slug', type: 'slug', options: {source: 'title'}}),
    defineField({name: 'brand', type: 'reference', to: [{type: 'brand'}]}),
    defineField({
      name: 'categories',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'category'}]})],
    }),
    // The shared `price` object — also composed by `variant` above.
    defineField({name: 'price', type: 'price'}),
    // Array-of-objects: each product has many variants.
    defineField({name: 'variants', type: 'array', of: [defineArrayMember({type: 'variant'})]}),
    // Array of bare images → a scalar `image` leaf with array cardinality.
    defineField({name: 'gallery', type: 'array', of: [defineArrayMember({type: 'image'})]}),
    defineField({name: 'description', type: 'text'}),
    // Document self-reference: cross-sell / related products.
    defineField({
      name: 'relatedProducts',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'product'}]})],
    }),
  ],
})

export const ecommerce: SchemaTypeDefinition[] = [
  product,
  variant,
  variantOption,
  price,
  brand,
  category,
]
