// Walker: live Sanity schemaTypes → canonical model
//
// Consumes the array of type definitions you'd get by importing
// `studio/schemaTypes/index.ts` directly — live `defineType`-shaped objects,
// not the JSON produced by `sanity schema extract`. The walker resolves
// references, follows inline-alias wrappers, applies skip rules, and
// (eventually) probes each field's validation function to determine
// cardinality with the precision schema-extract can't deliver.
//
// See ../docs/decisions/0001-content-model-mermaid-export.md for the
// contract this walker satisfies.

import {probe} from './probe'

export type Stereotype = 'document' | 'object'
export type PrimitiveKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'url'
  | 'datetime'
  | 'geopoint'
  | 'image'
  | 'file'
export type Relation = 'composition' | 'reference'

/**
 * Editorial origin of a canonical class — preserved separately from
 * `stereotype` (the rendering decision) so downstream consumers can
 * filter on what a class actually came from. The plugin UI's expected
 * use is "let the user hide all inline objects" or "hide all images";
 * those questions can't be answered from `stereotype` alone since
 * `object`, `image`, and `inline` all render with the `<<object>>` tag.
 *
 * `image`/`file` mark *named top-level* asset types (`{name: 'heroImage',
 * type: 'image', …}`), which list individually in the Elements menu. A *bare*
 * inline intrinsic image/file field (`{name: 'avatar', type: 'image'}`) is not
 * a class at all — it's a scalar leaf (`avatar: image [0..1]`). Only an inline
 * image/file carrying its own authored sub-fields (alt/caption) becomes a
 * class, and then it's `inline` like an inline object — a dependent that
 * follows its parent (see issue #9).
 */
export type ClassOrigin = 'document' | 'object' | 'image' | 'file' | 'inline' | 'portableText'

export interface PrimitiveChar {
  kind: 'primitive'
  prim: PrimitiveKind
  array: boolean
}

/**
 * Object-valued field characterisations, discriminated by `relation`.
 *
 * Composition (inline objects, named-class fields, images, portable-text
 * wrappers) is inherently single-target — a field composes into exactly one
 * class — so it carries a single `target`. A reference can point at *several*
 * types (`to: [{type: 'a'}, {type: 'b'}]`), so it carries `targets` and emits
 * one edge per target (issue #27). Splitting the two makes a multi-target
 * composition unrepresentable rather than merely unused.
 */
export interface CompositionChar {
  kind: 'object'
  relation: 'composition'
  /** Class name of the composed-into type, pascal-cased. */
  target: string
  array: boolean
}

export interface ReferenceChar {
  kind: 'object'
  relation: 'reference'
  /**
   * Class names this reference can point at, pascal-cased — one per `to[]`
   * target, deduped and in authored order. Length ≥ 1.
   */
  targets: string[]
  array: boolean
}

export type ObjectChar = CompositionChar | ReferenceChar

/** Every class an object char points at: one for composition, ≥1 for a reference. */
export function objectCharTargets(char: ObjectChar): string[] {
  return char.relation === 'composition' ? [char.target] : char.targets
}

/**
 * Portable Text. Structurally an array of blocks in Sanity, but
 * semantically a single body of content — surfaced as a scalar field with
 * the type label `PortableText`, no edge, no class.
 *
 * Block-only portable text (whether inline or via a named alias) uses
 * this char. Portable text that ALSO contains structural embeds (e.g. a
 * bodyImage alongside block) is promoted to its own class — see the
 * "structural portable text" handling in walker.
 */
export interface PortableTextChar {
  kind: 'portableText'
}

export type FieldChar = PrimitiveChar | ObjectChar | PortableTextChar

/** Whether a field's characterisation represents an array of values. */
export function isArrayChar(char: FieldChar): boolean {
  if (char.kind === 'portableText') return false
  return char.array
}

export interface Edge {
  source: string
  target: string
  relation: Relation
  fieldName: string
}

export interface Cardinality {
  /** Lower bound — 0 or 1 for now; arrays may push this higher via Rule.min. */
  min: number
  /** Upper bound — 1 for scalars, '*' for unbounded arrays, or a number for bounded arrays. */
  max: number | '*'
}

export interface CanonicalField {
  name: string
  char: FieldChar
  cardinality: Cardinality
  /**
   * True when the field has validation the diagram cannot fully render —
   * `Rule.custom(…)`, any other constraint (regex, email, unique, length, …),
   * or `Rule.min/max` on a non-array (where they bound value rather than
   * cardinality). The emitter surfaces this as a `custom` marker in the
   * cardinality bracket, e.g. `+title: string [1, custom]`.
   */
  hasCustomMarker: boolean
}

export interface CanonicalClass {
  name: string
  stereotype: Stereotype
  /**
   * Editorial origin — distinguishes hoisted named object types from
   * anonymous inline objects from image types, even though all three
   * render with the same `<<object>>` stereotype tag.
   */
  origin: ClassOrigin
  fields: CanonicalField[]
}

export interface CanonicalModel {
  classes: CanonicalClass[]
  edges: Edge[]
  warnings: string[]
}

// Loose input shape — we treat the input as a list of objects with at least
// `name` and `type`. Sanity's full SchemaTypeDefinition is much richer; the
// walker reads only what it needs.
interface RawReferenceTarget {
  type: string
}

/**
 * Sanity accepts `to` as either an array `[{type: 'X'}]` or a single
 * object `{type: 'X'}` when there's only one target. Modeling the input
 * union explicitly so we can normalise it in one place.
 */
type RawReferenceTo = RawReferenceTarget | RawReferenceTarget[]

interface RawArrayMember {
  type: string
  /**
   * Present on inline-declared members that carry their own type name —
   * Portable Text inline objects and annotations (`{name, type: 'object',
   * fields}`). Anonymous inline objects declared as array fields are named
   * by their field instead, so they don't set this.
   */
  name?: string
  to?: RawReferenceTo
  /** Present on inline anonymous object members of an array. */
  fields?: RawField[]
  /**
   * Present on `block` members: the inline object types that can appear
   * within the block's text (e.g. an inline highlight or mention).
   */
  of?: RawArrayMember[]
  /**
   * Present on `block` members: the span-level marks. `annotations` holds
   * the object/reference types that decorate a span (e.g. a `link`).
   */
  marks?: {annotations?: RawArrayMember[]}
}

interface RawField {
  name: string
  type: string
  of?: RawArrayMember[]
  to?: RawReferenceTo
  /** Present on inline anonymous objects declared directly as a field (`type: 'object'`). */
  fields?: RawField[]
  validation?: (Rule: unknown) => unknown
}

interface RawType {
  name: string
  type: string
  fields?: RawField[]
  /** Present on inline-alias types like `defineType({name: 'foo', type: 'reference', to: [...]})`. */
  to?: RawReferenceTo
  /** Present on named array-alias types like `defineType({name: 'foo', type: 'array', of: [...]})`. */
  of?: RawArrayMember[]
}

/**
 * Normalise the `to` value to its target type names, accepting either Sanity's
 * array form `[{type: 'X'}, {type: 'Y'}]` or single-object form `{type: 'X'}`.
 * Returns every target — deduped, in authored order — so a multi-target
 * (polymorphic) reference renders an edge per target rather than dropping all
 * but the first (issue #27). Empty when neither form yields a target.
 */
function referenceTargets(to: RawReferenceTo | undefined): string[] {
  if (!to) return []
  const raw = Array.isArray(to) ? to : [to]
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of raw) {
    if (t?.type && !seen.has(t.type)) {
      seen.add(t.type)
      out.push(t.type)
    }
  }
  return out
}

// Platform metadata fields auto-injected by Sanity onto documents — never
// part of the user-authored content model. Mirrors the list in ADR 0001.
const SKIP_FIELD_NAMES = new Set([
  '_id',
  '_type',
  '_createdAt',
  '_updatedAt',
  '_rev',
  '_key',
  '_weak',
])

// Sanity field types we surface as primitives, mapped to the display label
// shown in the diagram. The full set of intrinsic primitive-ish types per
// reference.sanity.io's IntrinsicDefinitions is covered here.
//
// Mapping rationale:
// - `text` collapses to `string` — Sanity's `text` is a multi-line string
//   editor; structurally identical at the data layer.
// - `email` collapses to `string` — string with regex validation.
// - `slug` collapses to `string` per ADR 0001 (the slug `current` is the
//   value that matters; the `_type` wrapper is uninteresting in a content
//   model view).
// - `url` keeps its own label — meaningful semantic distinction, and it's
//   the label we synthesise for image/file asset references.
// - `date` and `datetime` collapse to a shared `datetime` label — same
//   editorial idea ("a moment in time"), different UI affordance.
// - `geopoint` keeps its own label — structurally a `{lat, lng}` object,
//   but at the diagram level it's a leaf value with its own semantic.
// - `image`/`file` keep their own labels — an intrinsic image/file declared
//   inline as a field (`{name: 'avatar', type: 'image'}`) is a leaf value:
//   the field holds an asset, not a nested object the author defined. Only an
//   image/file carrying its OWN authored sub-fields (alt/caption) is promoted
//   to a class (see `inlineCompositeFor`); a *named* top-level image/file type
//   is always a class. See issue #9.
const PRIMITIVE_TYPES: Record<string, PrimitiveKind> = {
  string: 'string',
  text: 'string',
  email: 'string',
  slug: 'string',
  number: 'number',
  boolean: 'boolean',
  url: 'url',
  date: 'datetime',
  datetime: 'datetime',
  geopoint: 'geopoint',
  image: 'image',
  file: 'file',
}

// Sanity reference variants that all behave the same way for diagram
// purposes: pull the target from `to[0].type` and emit an association
// edge. `crossDatasetReference` and `globalDocumentReference` differ in
// runtime resolution (across-dataset / across-project) but the diagram
// just shows the relationship.
const REFERENCE_TYPES = new Set(['reference', 'crossDatasetReference', 'globalDocumentReference'])

// Fields auto-injected by Sanity onto image types — generally absent from
// user-written `defineType` field lists, but skipped defensively if they
// do appear. The `asset` field is treated separately: it's synthesised
// onto every image-like class as a primitive `url` field so the asset
// reference is visible rather than implicit.
const IMAGE_INTERNAL_FIELD_NAMES = new Set(['hotspot', 'crop', 'media'])

// Type-name patterns that are not part of the user-authored content model.
// Mirrors the skip rules in ADR 0001.
const SKIP_TYPE_PATTERNS: RegExp[] = [
  /^sanity\./, // Sanity-internal helpers (imageAsset, hotspot, crop, …)
  /^assist\./, // @sanity/assist plugin documents/types
  /^geopoint$/, // not modelled
]

function shouldSkipTypeName(name: string): boolean {
  return SKIP_TYPE_PATTERNS.some((p) => p.test(name))
}

const pascalCase = (s: string): string =>
  s.replace(/(^|[._-])([a-z])/g, (_, __, c: string) => c.toUpperCase())

/**
 * Decide whether a top-level type, when referenced by name from a field,
 * should resolve to a composition edge to its own class. Documents,
 * objects, image, and file types qualify (all of which are emitted as
 * classes by `walk`); primitive aliases and skipped types do not.
 */
function isClassType(t: RawType): boolean {
  return t.type === 'document' || t.type === 'object' || t.type === 'image' || t.type === 'file'
}

/**
 * Follow a chain of named-type aliases to the definition that actually
 * carries structure. A "type alias" is Sanity's type-extension feature: a
 * top-level type whose `type` is the NAME of another registered type, e.g.
 * the rich-table plugin's `{name: 'richTableBlock', type: 'richTable'}`
 * aliasing the `richTable` object (issue #32).
 *
 * Returns the underlying definition whose `type` is an intrinsic/structural
 * keyword (object, image, file, reference, array, string, …) — i.e. the one
 * `walk()` would key off — so callers resolve to the class `walk()` actually
 * emits rather than the empty alias. Returns the input unchanged when its
 * `type` doesn't name another registered type. Guards against cycles.
 */
function resolveTypeAlias(named: RawType, typeMap: Map<string, RawType>): RawType {
  const seen = new Set<string>()
  let current = named
  while (typeMap.has(current.type) && !seen.has(current.name)) {
    seen.add(current.name)
    const next = typeMap.get(current.type)
    if (!next) break
    current = next
  }
  return current
}

/**
 * Whether a top-level type emits its own class in `walk()` — documents,
 * objects, images, files, and named structural-Portable-Text array aliases.
 * Used to build the emitted-class-name namespace (collision detection +
 * inline-naming), so it must mirror the branches of the main walk loop.
 */
function emitsTopLevelClass(t: RawType, typeMap: Map<string, RawType>): boolean {
  if (isClassType(t)) return true
  return t.type === 'array' && structuralPortableTextEmbeds(t.of, typeMap) !== null
}

/**
 * The class name a top-level type emits. Plain `pascalCase(name)` unless two or
 * more distinct type names collapse to the same pascalCase (`blogPost` +
 * `blog_post` → `BlogPost`), in which case each is qualified base-first by its
 * own source name (`BlogPost_blogPost`, `BlogPost_blog_post`) so they stay
 * distinct rather than merging into one Mermaid box (issue #28). Raw type names
 * are unique, so the qualified names are guaranteed unique within a group.
 *
 * Every site that turns a top-level type name into a class name — the walk loop
 * and every reference/composition target — routes through this, so edges point
 * at the disambiguated class rather than the bare (merged) name.
 */
function resolveTopLevelClassName(
  rawName: string,
  namedClassGroups: Map<string, string[]>,
): string {
  const bare = pascalCase(rawName)
  const group = namedClassGroups.get(bare)
  return group && group.length > 1 ? `${bare}_${rawName}` : bare
}

/**
 * Resolve a named type to a field characterisation appropriate for the
 * given array context. Handles named-type aliases (Sanity type extension —
 * issue #32), class composition, reference aliases
 * (`defineType({type: 'reference', to: ...})`), and array aliases
 * (`defineType({type: 'array', of: [...]})` — including portable text).
 * Returns null if the type isn't something we know how to surface.
 */
function resolveNamedType(
  named: RawType,
  array: boolean,
  typeMap: Map<string, RawType>,
  namedClassGroups: Map<string, string[]>,
): FieldChar | null {
  // Follow named-type aliases to the underlying definition first, so an alias
  // like {name: 'richTableBlock', type: 'richTable'} resolves to whatever
  // richTable is. Every branch below then keys off the resolved base — and the
  // class/PT cases target `base.name`, the type `walk()` actually emits.
  const base = resolveTypeAlias(named, typeMap)
  if (isClassType(base)) {
    return {
      kind: 'object',
      target: resolveTopLevelClassName(base.name, namedClassGroups),
      relation: 'composition',
      array,
    }
  }
  // Alias to an intrinsic primitive (`{name: 'brandedString', type: 'string'}`)
  // → that primitive's leaf. Without this it would fall through to null and the
  // field would be dropped (issue #32).
  const prim = PRIMITIVE_TYPES[base.type]
  if (prim) return {kind: 'primitive', prim, array}
  // Inline-alias to a reference: e.g.
  //   defineType({name: 'referencedDiscipline', type: 'reference', to: [{type: 'discipline'}]})
  if (base.type === 'reference') {
    const targets = referenceTargets(base.to)
    if (targets.length === 0) return null
    return {
      kind: 'object',
      relation: 'reference',
      targets: targets.map((t) => resolveTopLevelClassName(t, namedClassGroups)),
      array,
    }
  }
  // Inline-alias to an array. Three sub-cases:
  //  - Structural portable text (block + class-able embeds) → resolves
  //    to a composition edge to the alias's own class (which walk()
  //    emits separately). Two-hop relationship preserved: parent →
  //    wrapper → embedded type.
  //  - Block-only portable text → scalar PortableText label (no class).
  //  - Any other array shape (primitives, references) → behaves like
  //    an inline array field at the call site.
  if (base.type === 'array' && base.of) {
    if (structuralPortableTextEmbeds(base.of, typeMap)) {
      return {
        kind: 'object',
        target: resolveTopLevelClassName(base.name, namedClassGroups),
        relation: 'composition',
        array,
      }
    }
    return characterizeArrayMembers(base.of, typeMap, namedClassGroups)
  }
  return null
}

/** How an embed member of a portable-text array maps to the diagram. */
type EmbedKind = 'reference' | 'namedClass' | 'inlineComposite'

/**
 * If a portable-text embed member is a class-emitting inline composite — an
 * inline object (`{name, type: 'object', fields}`), or an inline image/file
 * carrying its own authored sub-fields (`{type: 'image', fields}`) — return its
 * asset treatment ('object' | 'image' | 'file'), else null. The array-member
 * analogue of `inlineCompositeFor`, and the reason image/file members aren't
 * dropped by the `PRIMITIVE_TYPES` short-circuit below (issue #23).
 */
function inlineEmbedAssetType(member: RawArrayMember): InlineAssetType | null {
  if (member.type === 'object' && member.fields && member.name) return 'object'
  if (
    (member.type === 'image' || member.type === 'file') &&
    hasAuthoredAssetFields(member.fields)
  ) {
    return member.type
  }
  return null
}

/**
 * Classify a candidate portable-text embed member. Returns null for
 * members that don't surface as a class-able embed (primitives, or a
 * named type that isn't a kept class).
 *
 * - `reference` — a `reference`/cross-/global-reference with a resolvable
 *   target → association edge.
 * - `namedClass` — a member whose `type` names a kept document/object/image/
 *   file class, directly or through a named-type alias (`richTableBlock` →
 *   `richTable`, issue #32) → composition edge to the resolved class.
 * - `inlineComposite` — an inline-declared object (`{name, type: 'object',
 *   fields}`) or an inline image/file with its own authored sub-fields
 *   (`{type: 'image', fields}`) → emits its own `origin: 'inline'` class. The
 *   composite check runs *before* the primitive short-circuit, since `image`/
 *   `file` are in `PRIMITIVE_TYPES` and would otherwise be dropped (issue #23).
 */
function classifyEmbedMember(
  member: RawArrayMember,
  typeMap: Map<string, RawType>,
): EmbedKind | null {
  if (inlineEmbedAssetType(member)) return 'inlineComposite'
  if (PRIMITIVE_TYPES[member.type]) return null
  if (REFERENCE_TYPES.has(member.type)) {
    return referenceTargets(member.to).length > 0 ? 'reference' : null
  }
  const named = typeMap.get(member.type)
  if (named && isClassType(resolveTypeAlias(named, typeMap))) return 'namedClass'
  return null
}

/**
 * If an embed member is a *bare* inline image/file (an intrinsic image/file with
 * no authored sub-fields), return its primitive label. It isn't class-able, but
 * it's authored content the body can hold, so it surfaces as a scalar leaf field
 * on the PT class (no class, no edge) — like a bare image field elsewhere. An
 * image/file *with* fields is class-able (`inlineEmbedAssetType`) and handled
 * there; anything else returns null. See issue #23.
 */
function bareAssetLeaf(member: RawArrayMember): PrimitiveKind | null {
  if (inlineEmbedAssetType(member)) return null
  const prim = PRIMITIVE_TYPES[member.type]
  return prim === 'image' || prim === 'file' ? prim : null
}

/**
 * Collect every candidate embed member of a portable-text `of` array, from
 * the three positions an embed can occupy:
 *  - top-level non-block members (block-level inserts: a bodyImage object,
 *    a callout, a reference between blocks);
 *  - inline objects nested in a `block` member's own `of` (inserted inline
 *    within the block's text);
 *  - annotation members in a `block` member's `marks.annotations` (objects
 *    or references decorating a span of text).
 * Deduped by identity (type + inline name + reference target) so the same
 * type embedded under multiple block members doesn't yield duplicate
 * fields/edges. Classification (class-able or not) is left to callers.
 */
function collectPortableTextEmbedMembers(of: RawArrayMember[]): RawArrayMember[] {
  const candidates: RawArrayMember[] = []
  for (const member of of) {
    if (member.type === 'block') {
      if (member.of) candidates.push(...member.of)
      if (member.marks?.annotations) candidates.push(...member.marks.annotations)
      continue
    }
    candidates.push(member)
  }

  const seen = new Set<string>()
  const unique: RawArrayMember[] = []
  for (const m of candidates) {
    const key = `${m.type} ${m.name ?? ''} ${referenceTargets(m.to).join(',')}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(m)
  }
  return unique
}

/**
 * Detect "structural portable text": an array whose `of` contains `block`
 * AND at least one surfaced non-block member — a class-able embed (named/inline
 * object, reference, image/file with fields) or a bare image/file leaf — from
 * anywhere an embed can live (top-level members, inline objects in a block's
 * `of`, or `marks.annotations`). Returns those members if so, else null when
 * `of` isn't portable text or carries nothing the diagram surfaces.
 *
 * Truly block-only portable text (just `[{type: 'block'}]`) stays a scalar
 * `PortableTextChar` — the common `overview` / `colophon` prose case. Anything
 * the body can also hold promotes it to its own class, so embedded types stay
 * connected via their two-hop relationship (parent → PT wrapper → embed) rather
 * than dropped as orphans, and bare assets stay visible (issue #23).
 */
function structuralPortableTextEmbeds(
  of: RawArrayMember[] | undefined,
  typeMap: Map<string, RawType>,
): RawArrayMember[] | null {
  if (!of || !of.some((m) => m.type === 'block')) return null
  const embeds = collectPortableTextEmbedMembers(of).filter(
    (m) => classifyEmbedMember(m, typeMap) !== null || bareAssetLeaf(m) !== null,
  )
  return embeds.length > 0 ? embeds : null
}

/** The synthetic `+block: PortableText [0..*]` field present on every
 * structural-portable-text class. Mirrors the synthetic asset on
 * image-like classes: makes the inherent content visible rather than
 * leaving it implicit. */
function syntheticBlockField(): CanonicalField {
  return {
    name: 'block',
    char: {kind: 'portableText'},
    cardinality: {min: 0, max: '*'},
    hasCustomMarker: false,
  }
}

/**
 * Build the canonical fields for a structural-portable-text class:
 * synthetic block field first, then one field per class-able embed —
 * collected from all three embed positions (top-level members, a block's
 * inline `of`, and `marks.annotations`). Each embed becomes a composition
 * or reference field with a matching edge pushed to `ctx.edges`.
 * Inline-declared object embeds (`{name, type: 'object', fields}`) also get
 * their own `origin: 'inline'` class emitted, under the inline naming
 * policy (parent = this portable-text class).
 */
function buildPortableTextClassFields(
  of: RawArrayMember[],
  ptClassName: string,
  ctx: WalkContext,
): CanonicalField[] {
  const fields: CanonicalField[] = [syntheticBlockField()]
  for (const member of collectPortableTextEmbedMembers(of)) {
    const kind = classifyEmbedMember(member, ctx.typeMap)
    if (!kind) {
      // A bare image/file member isn't class-able, but it's authored content the
      // body can hold — surface it as a scalar leaf field (no class, no edge),
      // like a bare image field elsewhere. Named by member name, else the type.
      const leafPrim = bareAssetLeaf(member)
      if (leafPrim) {
        fields.push({
          name: member.name ?? member.type,
          char: {kind: 'primitive', prim: leafPrim, array: true},
          cardinality: {min: 0, max: '*'},
          hasCustomMarker: false,
        })
      }
      continue
    }

    let char: ObjectChar
    let fieldName: string

    if (kind === 'reference') {
      const targets = referenceTargets(member.to)
      char = {
        kind: 'object',
        relation: 'reference',
        targets: targets.map((t) => resolveTopLevelClassName(t, ctx.namedClassGroups)),
        array: true,
      }
      // References inside portable text have no field name of their own, so we
      // name them by what they point at — joined for a multi-target reference
      // (issue #27), as elsewhere in the walker.
      fieldName = targets.join('|')
    } else if (kind === 'namedClass') {
      const named = ctx.typeMap.get(member.type) as RawType
      // Follow named-type aliases (`richTableBlock` → `richTable`) so the edge
      // targets the class walk() actually emits, not the empty alias (issue #32).
      const base = resolveTypeAlias(named, ctx.typeMap)
      char = {
        kind: 'object',
        target: resolveTopLevelClassName(base.name, ctx.namedClassGroups),
        relation: 'composition',
        array: true,
      }
      // Name the field by the member's own `name` when it carries one
      // (`{name: 'pre', type: 'code'}` → `pre`), falling back to the type name
      // for a bare `{type: 'bodyImage'}`. The edge still targets the class.
      fieldName = member.name ?? member.type
    } else {
      // Inline-declared composite: an object/annotation, or an inline image/file
      // carrying its own fields. Emit an `origin: 'inline'` class under the
      // disambiguation rule; the asset type drives whether walkFields prepends
      // the synthetic `asset` (image/file do, object doesn't). A nameless
      // image/file member falls back to its type name for naming (issue #23).
      const assetType = inlineEmbedAssetType(member) as InlineAssetType
      const memberName = member.name ?? member.type
      const className = resolveInlineClassName(memberName, ptClassName, ctx)
      maybeEmitCollisionWarning(memberName, ctx)
      ctx.classes.push({
        name: className,
        stereotype: 'object',
        origin: 'inline',
        fields: walkFields(member.fields, className, assetType, ctx),
      })
      char = {kind: 'object', target: className, relation: 'composition', array: true}
      fieldName = memberName
    }

    fields.push({
      name: fieldName,
      char,
      cardinality: {min: 0, max: '*'},
      hasCustomMarker: false,
    })
    for (const target of objectCharTargets(char)) {
      ctx.edges.push({source: ptClassName, target, relation: char.relation, fieldName})
    }
  }
  return fields
}

/**
 * Characterise the contents of an array `of: [...]` declaration. Used
 * by both inline array fields (`{type: 'array', of: [...]}`) and by
 * named array aliases (`defineType({type: 'array', of: [...]})`) — the
 * latter via resolveNamedType.
 *
 * Returns a FieldChar whose `array` flag is true for non-portable-text
 * cases, or a PortableTextChar (always scalar) when the array is
 * block-only portable text. Callers handle structural portable text
 * (block + embeds) separately because it needs to emit a class, not
 * just characterise a field.
 */
function characterizeArrayMembers(
  of: RawArrayMember[],
  typeMap: Map<string, RawType>,
  namedClassGroups: Map<string, string[]>,
): FieldChar | null {
  // Portable Text: any `of` member is `block`. Sanity portable text is
  // structurally an array of blocks (often mixed with inline image or
  // custom inline-block types). The block-only case (the common case
  // for inline portable text fields like `overview`) surfaces as a
  // scalar PortableText label. Portable text that ALSO contains
  // class-able embeds is handled higher up — promoted to its own
  // class so embedded types stay connected.
  if (of.some((m) => m.type === 'block')) {
    return {kind: 'portableText'}
  }

  const inner = of[0]
  if (!inner) return null

  const innerPrim = PRIMITIVE_TYPES[inner.type]
  if (innerPrim) return {kind: 'primitive', prim: innerPrim, array: true}

  if (REFERENCE_TYPES.has(inner.type)) {
    const targets = referenceTargets(inner.to)
    if (targets.length === 0) return null
    return {
      kind: 'object',
      relation: 'reference',
      targets: targets.map((t) => resolveTopLevelClassName(t, namedClassGroups)),
      array: true,
    }
  }

  // Named class or alias as inner type — recurse through typeMap. The
  // resolution honours the same rules as a top-level field, so an
  // array-of-aliased-references resolves to the right target.
  const namedInner = typeMap.get(inner.type)
  if (namedInner) {
    return resolveNamedType(namedInner, true, typeMap, namedClassGroups)
  }

  return null
}

function characterize(
  field: RawField,
  typeMap: Map<string, RawType>,
  namedClassGroups: Map<string, string[]>,
): FieldChar | null {
  // Direct primitive: { name: 'title', type: 'string' }
  const prim = PRIMITIVE_TYPES[field.type]
  if (prim) return {kind: 'primitive', prim, array: false}

  // Reference variants: `reference`, `crossDatasetReference`, `globalDocumentReference`.
  // All three behave the same for diagram purposes — extract every target type
  // and emit one association edge per target (issue #27).
  if (REFERENCE_TYPES.has(field.type)) {
    const targets = referenceTargets(field.to)
    if (targets.length === 0) return null
    return {
      kind: 'object',
      relation: 'reference',
      targets: targets.map((t) => resolveTopLevelClassName(t, namedClassGroups)),
      array: false,
    }
  }

  // Inline array. Characterise the contents via the shared helper —
  // same logic applies to a `defineType({type: 'array', ...})` alias
  // resolved via typeMap.
  if (field.type === 'array' && field.of && field.of.length > 0) {
    return characterizeArrayMembers(field.of, typeMap, namedClassGroups)
  }

  // Named type referenced by name. Could be a kept class (composition),
  // an inline-alias to a reference (resolved through to its target),
  // or an inline-alias to an array — including portable text.
  const named = typeMap.get(field.type)
  if (named) {
    return resolveNamedType(named, false, typeMap, namedClassGroups)
  }

  return null
}

interface FieldValidation {
  cardinality: Cardinality
  hasCustomMarker: boolean
}

function fieldValidation(field: RawField, array: boolean): FieldValidation {
  const result = field.validation ? probe(field.validation) : undefined
  const required = result?.required ?? false

  if (array) {
    // For arrays, Rule.min/Rule.max constrain element count and override
    // the default cardinality bounds. Required only sets the lower bound
    // when probe.min didn't already.
    const min = result?.min ?? (required ? 1 : 0)
    const max: number | '*' = result?.max ?? '*'
    return {
      cardinality: {min, max},
      hasCustomMarker: result?.hasCustom === true || result?.hasOtherConstraints === true,
    }
  }

  // For non-arrays, Rule.min/Rule.max are value constraints (string length,
  // numeric range), not cardinality. They count toward the custom marker.
  const nonArrayValueConstraint = result?.min !== undefined || result?.max !== undefined
  return {
    cardinality: {min: required ? 1 : 0, max: 1},
    hasCustomMarker:
      result?.hasCustom === true || result?.hasOtherConstraints === true || nonArrayValueConstraint,
  }
}

/**
 * Build the synthetic `asset: url` field that we prepend to every
 * image-like class. The asset is required (an image without an asset
 * isn't meaningful) and has no other validation.
 */
function syntheticAssetField(): CanonicalField {
  return {
    name: 'asset',
    char: {kind: 'primitive', prim: 'url', array: false},
    cardinality: {min: 1, max: 1},
    hasCustomMarker: false,
  }
}

/**
 * Mutable context threaded through the recursive walk. Replaces the long
 * positional-argument list `walkFields` would otherwise require — adding
 * collection state (warnings, inline-name counts, named-class set) only
 * matters at the WalkContext layer, not at every call site.
 */
interface WalkContext {
  typeMap: Map<string, RawType>
  classes: CanonicalClass[]
  edges: Edge[]
  warnings: string[]
  /** Bare class name → number of inline-object claims on it across the schema. */
  inlineCounts: Map<string, number>
  /** Bare class names already claimed by top-level emitted classes. */
  namedClassNames: Set<string>
  /**
   * Bare class name → the raw source names of every top-level type that emits a
   * class with that pascalCased name. Groups of >1 are collisions, disambiguated
   * base-first by source name (issue #28). Keys mirror `namedClassNames`.
   */
  namedClassGroups: Map<string, string[]>
  /** Bare names we've already emitted a collision warning for. */
  collisionWarningsEmitted: Set<string>
}

/**
 * The asset treatment a walked inline composite gets. Image and file inline
 * fields lead with a synthetic `asset: url`; inline objects don't.
 */
type InlineAssetType = 'object' | 'image' | 'file'

interface InlineComposite {
  /** Raw fields of the inline composite — absent for a bare image/file. */
  innerFields: RawField[] | undefined
  /** Whether the field holds an array of the composite. */
  array: boolean
  /** Drives the synthetic-asset treatment in walkFields (image/file get one). */
  assetType: InlineAssetType
}

/**
 * Whether an intrinsic image/file declared inline carries authored sub-fields
 * worth surfacing — i.e. any field that survives walkFields' skip rules
 * (platform metadata, the image-internal hotspot/crop/media, and the synthetic
 * `asset`). A bare `{type: 'image'}` (or one with only internals) has none, so
 * it stays a scalar leaf; one with e.g. an `alt` field is promoted to a class.
 */
function hasAuthoredAssetFields(fields: RawField[] | undefined): boolean {
  if (!fields) return false
  return fields.some(
    (f) =>
      !SKIP_FIELD_NAMES.has(f.name) &&
      !IMAGE_INTERNAL_FIELD_NAMES.has(f.name) &&
      f.name !== 'asset',
  )
}

/**
 * Detect an inline composite inside a field: an anonymous object
 * (`type: 'object'` with `fields`) or an intrinsic image/file declared in
 * place that carries its OWN authored sub-fields (`{type: 'image', fields:
 * [...]}`) — either directly or as the inner type of an array
 * (`of: [{type: 'object', fields: [...]}]`). All are anonymous and declared at
 * the field site, so they emit their own `origin: 'inline'` class. Returns the
 * composite's raw fields, array-ness, and which asset treatment applies — or
 * null if none is present.
 *
 * A *bare* intrinsic image/file (no authored sub-fields) is NOT an inline
 * composite: it's a scalar leaf, handled by `characterize` via PRIMITIVE_TYPES.
 * A *named* image/file type (`{name: 'heroImage', type: 'image', …}`) is also
 * not inline: a field referencing one by name resolves through `characterize`
 * to a composition edge against that type's own (origin 'image'/'file') class.
 */
function inlineCompositeFor(field: RawField): InlineComposite | null {
  if (field.type === 'object' && field.fields) {
    return {innerFields: field.fields, array: false, assetType: 'object'}
  }
  if ((field.type === 'image' || field.type === 'file') && hasAuthoredAssetFields(field.fields)) {
    return {innerFields: field.fields, array: false, assetType: field.type}
  }
  if (field.type === 'array' && field.of) {
    for (const inner of field.of) {
      if (inner.type === 'object' && inner.fields) {
        return {innerFields: inner.fields, array: true, assetType: 'object'}
      }
      if (
        (inner.type === 'image' || inner.type === 'file') &&
        hasAuthoredAssetFields(inner.fields)
      ) {
        return {innerFields: inner.fields, array: true, assetType: inner.type}
      }
    }
  }
  return null
}

/**
 * Resolve the class name for a field-derived anonymous object (inline object,
 * inline image/file, or a structural Portable Text field). Uses the bare
 * pascalCase of the field name unless it would collide with another such object
 * (same bare name elsewhere) or a named class — in which case it's qualified by
 * its parent, base-first (`Metadata_Method`, `Body_Article`).
 *
 * Base-first keeps the base name readable; the `_` separator guarantees the
 * qualified name can never clash with a real type's class name, because
 * `pascalCase` strips `_`/`-`/`.` and so never emits an underscore itself.
 */
function resolveInlineClassName(
  fieldName: string,
  parentClassName: string,
  ctx: WalkContext,
): string {
  const bare = pascalCase(fieldName)
  const collidesWithNamed = ctx.namedClassNames.has(bare)
  const multipleInlines = (ctx.inlineCounts.get(bare) ?? 0) > 1
  if (collidesWithNamed || multipleInlines) {
    return `${bare}_${parentClassName}`
  }
  return bare
}

function maybeEmitCollisionWarning(fieldName: string, ctx: WalkContext): void {
  const bare = pascalCase(fieldName)
  if (ctx.collisionWarningsEmitted.has(bare)) return

  const collidesWithNamed = ctx.namedClassNames.has(bare)
  const inlineCount = ctx.inlineCounts.get(bare) ?? 0

  if (collidesWithNamed && inlineCount > 0) {
    ctx.warnings.push(
      `An object derived from '${fieldName}' shares the name of the named type '${bare}'. The derived one is qualified by an underscore and its parent to keep them distinct — consider renaming one.`,
    )
    ctx.collisionWarningsEmitted.add(bare)
  } else if (inlineCount > 1) {
    ctx.warnings.push(
      `More than one object is derived from the name '${fieldName}'. Each is qualified by an underscore and its parent to keep them distinct in the diagram — consider giving them unique names.`,
    )
    ctx.collisionWarningsEmitted.add(bare)
  }
}

/**
 * Count the inline-composite embeds of a portable-text `of` array by bare name
 * (recursing into their own fields), so they share the same collision-
 * disambiguation policy as field-declared inline composites. Covers inline
 * objects/annotations and inline image/file members with their own fields
 * (named by member name, or the type name when nameless). Named-type and
 * reference embeds emit no class, so they aren't counted here.
 */
function countPortableTextInlineEmbeds(
  of: RawArrayMember[],
  typeMap: Map<string, RawType>,
  out: Map<string, number>,
): void {
  for (const member of collectPortableTextEmbedMembers(of)) {
    if (classifyEmbedMember(member, typeMap) !== 'inlineComposite') continue
    const bare = pascalCase(member.name ?? member.type)
    out.set(bare, (out.get(bare) ?? 0) + 1)
    collectInlineCounts(member.fields, typeMap, out)
  }
}

/**
 * Recursively count how often each inline-object bare name appears across
 * the schema. Used by `resolveInlineClassName` to decide which inlines
 * need a parent qualifier. Counts both field-declared inline objects and
 * inline-declared objects/annotations embedded in portable text.
 */
function collectInlineCounts(
  rawFields: RawField[] | undefined,
  typeMap: Map<string, RawType>,
  out: Map<string, number>,
): void {
  if (!rawFields) return
  for (const f of rawFields) {
    if (SKIP_FIELD_NAMES.has(f.name)) continue
    // Portable text takes precedence over the inline-object check (mirrors
    // walkFields), so a PT field's inline embeds are counted by their own
    // member name rather than by the field name.
    if (f.type === 'array' && f.of?.some((m) => m.type === 'block')) {
      // A *structural* PT field promotes to a class named after the field, so
      // count it like an inline composite — two `body` fields must disambiguate
      // rather than silently merge (issue #23). Block-only PT emits no class.
      if (structuralPortableTextEmbeds(f.of, typeMap)) {
        const bare = pascalCase(f.name)
        out.set(bare, (out.get(bare) ?? 0) + 1)
      }
      countPortableTextInlineEmbeds(f.of, typeMap, out)
      continue
    }
    const inline = inlineCompositeFor(f)
    if (inline) {
      const bare = pascalCase(f.name)
      out.set(bare, (out.get(bare) ?? 0) + 1)
      // Recurse — nested inline objects also need to be counted so they
      // can be disambiguated against each other.
      collectInlineCounts(inline.innerFields, typeMap, out)
    }
  }
}

/**
 * Build the per-bare-name inline-object counts across the whole schema.
 * Walks the fields of every emitted top-level class, and counts a named
 * portable-text alias's own inline-declared embeds at its definition site
 * (referencing fields don't re-emit them).
 */
function buildInlineCounts(
  rawTypes: RawType[],
  typeMap: Map<string, RawType>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const t of rawTypes) {
    if (shouldSkipTypeName(t.name)) continue
    if (t.type === 'document' || t.type === 'object' || t.type === 'image') {
      collectInlineCounts(t.fields, typeMap, out)
    } else if (t.type === 'array' && t.of?.some((m) => m.type === 'block')) {
      countPortableTextInlineEmbeds(t.of, typeMap, out)
    }
  }
  return out
}

function walkFields(
  rawFields: RawField[] | undefined,
  sourceClassName: string,
  parentType: string,
  ctx: WalkContext,
): CanonicalField[] {
  const out: CanonicalField[] = []
  // Image and file types share the asset-reference structure — both
  // wrap a Sanity asset and benefit from the same synthetic field
  // treatment. The two are kept distinct at the origin level for
  // filtering, but the field-walking logic is the same.
  const isAssetLike = parentType === 'image' || parentType === 'file'

  // Asset-like classes always start with a synthetic `asset: url` field
  // so the asset reference is explicit in the diagram. User-declared
  // fields follow in their declaration order.
  if (isAssetLike) {
    out.push(syntheticAssetField())
  }

  if (rawFields) {
    for (const f of rawFields) {
      if (SKIP_FIELD_NAMES.has(f.name)) continue
      if (isAssetLike && IMAGE_INTERNAL_FIELD_NAMES.has(f.name)) continue
      // Never re-emit `asset` from raw fields — the synthetic version above
      // is the canonical one; treating a user-declared override as a no-op
      // matches Sanity's own behaviour of always injecting it.
      if (isAssetLike && f.name === 'asset') continue

      // Inline structural portable text:
      //   `{type: 'array', of: [{type: 'block'}, {type: 'someEmbed'}, …]}`
      // emit an anonymous class with synthetic `+block: PortableText [0..*]`
      // plus a field per structural embed. Same inline-naming policy as
      // inline objects (bare pascalCase unless colliding).
      if (f.type === 'array' && f.of && structuralPortableTextEmbeds(f.of, ctx.typeMap)) {
        const className = resolveInlineClassName(f.name, sourceClassName, ctx)
        maybeEmitCollisionWarning(f.name, ctx)
        ctx.classes.push({
          name: className,
          stereotype: 'object',
          origin: 'portableText',
          fields: buildPortableTextClassFields(f.of, className, ctx),
        })
        const char: ObjectChar = {
          kind: 'object',
          target: className,
          relation: 'composition',
          array: false,
        }
        // The parent's field is scalar (one body of content per field);
        // the array-ness lives inside the synthesized class's block.
        const v = fieldValidation(f, false)
        out.push({
          name: f.name,
          char,
          cardinality: v.cardinality,
          hasCustomMarker: v.hasCustomMarker,
        })
        ctx.edges.push({
          source: sourceClassName,
          target: className,
          relation: 'composition',
          fieldName: f.name,
        })
        continue
      }

      // Inline composite — an anonymous object, or an intrinsic image/file
      // declared in place: emit a new class for it, recurse into its fields,
      // and add a composition edge. Resolution of the class name honours the
      // disambiguation rule (bare unless colliding). All inline composites get
      // origin 'inline' (dependent — governed by the Inline Objects toggle, not
      // individually listed); the asset type only drives whether walkFields
      // prepends the synthetic `asset: url` field (image/file do; object doesn't).
      const inline = inlineCompositeFor(f)
      if (inline) {
        const className = resolveInlineClassName(f.name, sourceClassName, ctx)
        maybeEmitCollisionWarning(f.name, ctx)
        ctx.classes.push({
          name: className,
          stereotype: 'object',
          origin: 'inline',
          fields: walkFields(inline.innerFields, className, inline.assetType, ctx),
        })
        const char: ObjectChar = {
          kind: 'object',
          target: className,
          relation: 'composition',
          array: inline.array,
        }
        const v = fieldValidation(f, inline.array)
        out.push({
          name: f.name,
          char,
          cardinality: v.cardinality,
          hasCustomMarker: v.hasCustomMarker,
        })
        ctx.edges.push({
          source: sourceClassName,
          target: className,
          relation: 'composition',
          fieldName: f.name,
        })
        continue
      }

      const char = characterize(f, ctx.typeMap, ctx.namedClassGroups)
      if (!char) continue
      const v = fieldValidation(f, isArrayChar(char))
      out.push({
        name: f.name,
        char,
        cardinality: v.cardinality,
        hasCustomMarker: v.hasCustomMarker,
      })
      if (char.kind === 'object') {
        // One edge per target — a multi-target reference fans out (issue #27);
        // composition always yields exactly one.
        for (const target of objectCharTargets(char)) {
          ctx.edges.push({
            source: sourceClassName,
            target,
            relation: char.relation,
            fieldName: f.name,
          })
        }
      }
    }
  }
  return out
}

export function walk(types: unknown[]): CanonicalModel {
  const rawTypes = types as RawType[]

  // Pre-pass A: index every type by name so field-level characterisation
  // can resolve named class references and follow inline aliases. The
  // typeMap deliberately includes skipped names — we still need to know
  // they exist so we can detect and drop edges that target them.
  const typeMap = new Map<string, RawType>()
  for (const t of rawTypes) typeMap.set(t.name, t)

  // Pre-pass B: group every emitted top-level class by its bare (pascalCased)
  // name. Covers documents, objects, images, files, AND named structural-PT
  // array aliases — every branch the main loop emits — so the inline-naming and
  // collision checks see the full namespace (issue #28 completeness). A group of
  // more than one is a name collision: those types are disambiguated base-first
  // by source name and warned below. `namedClassNames` (the bare keys) still
  // feeds inline naming: a bare name is "claimed" when it's a key here.
  const namedClassGroups = new Map<string, string[]>()
  for (const t of rawTypes) {
    if (shouldSkipTypeName(t.name)) continue
    if (!emitsTopLevelClass(t, typeMap)) continue
    const bare = pascalCase(t.name)
    const group = namedClassGroups.get(bare)
    if (group) group.push(t.name)
    else namedClassGroups.set(bare, [t.name])
  }
  const namedClassNames = new Set(namedClassGroups.keys())
  const inlineCounts = buildInlineCounts(rawTypes, typeMap)

  const ctx: WalkContext = {
    typeMap,
    classes: [],
    edges: [],
    warnings: [],
    inlineCounts,
    namedClassNames,
    namedClassGroups,
    collisionWarningsEmitted: new Set(),
  }

  // Top-level name collisions (issue #28): two or more distinct type names that
  // pascalCase to the same class name (`blogPost` + `blog_post` → `BlogPost`).
  // Warn once per group and mark the bare name so the inline / field-reuse
  // passes don't pile a second warning on the same name.
  for (const [bare, rawNames] of namedClassGroups) {
    if (rawNames.length < 2) continue
    const quoted = [...rawNames]
      .sort()
      .map((n) => `'${n}'`)
      .join(', ')
    ctx.warnings.push(
      `The types ${quoted} all map to the class name '${bare}'. Each is qualified by its source name to keep them distinct in the diagram — consider giving them unique names.`,
    )
    ctx.collisionWarningsEmitted.add(bare)
  }

  for (const t of rawTypes) {
    if (shouldSkipTypeName(t.name)) continue
    const className = resolveTopLevelClassName(t.name, namedClassGroups)
    if (t.type === 'document') {
      ctx.classes.push({
        name: className,
        stereotype: 'document',
        origin: 'document',
        fields: walkFields(t.fields, className, t.type, ctx),
      })
    } else if (t.type === 'object') {
      ctx.classes.push({
        name: className,
        stereotype: 'object',
        origin: 'object',
        fields: walkFields(t.fields, className, t.type, ctx),
      })
    } else if (t.type === 'image') {
      ctx.classes.push({
        name: className,
        stereotype: 'object',
        origin: 'image',
        fields: walkFields(t.fields, className, t.type, ctx),
      })
    } else if (t.type === 'file') {
      // File types are handled like image types — both wrap a Sanity
      // asset reference and benefit from the same synthetic `asset: url`
      // treatment. Origin stays distinct so future filtering can hide
      // one without the other.
      ctx.classes.push({
        name: className,
        stereotype: 'object',
        origin: 'file',
        fields: walkFields(t.fields, className, t.type, ctx),
      })
    } else if (t.type === 'array' && structuralPortableTextEmbeds(t.of, typeMap)) {
      // Named structural portable text alias (e.g. bodyPortableText)
      // becomes an object-stereotype class with a synthetic block field
      // plus a field per structural embed. The embeds' edges are
      // pushed to ctx.edges by buildPortableTextClassFields.
      ctx.classes.push({
        name: className,
        stereotype: 'object',
        origin: 'portableText',
        fields: buildPortableTextClassFields(t.of ?? [], className, ctx),
      })
    }
  }

  // Post-pass: drop edges whose target isn't actually an emitted class. This
  // happens when a reference points at a skipped type (e.g. sanity.imageAsset)
  // or a type that wasn't declared. Warn so the user knows the diagram is
  // incomplete versus the schema.
  const emittedClassNames = new Set(ctx.classes.map((c) => c.name))
  const keptEdges: Edge[] = []
  for (const e of ctx.edges) {
    if (emittedClassNames.has(e.target)) {
      keptEdges.push(e)
    } else {
      ctx.warnings.push(
        `Edge for field '${e.fieldName}' on ${e.source} dropped — target type '${e.target}' is filtered or not declared.`,
      )
    }
  }

  warnUnreferencedObjects(ctx, keptEdges)

  // Post-pass: warn when the same field name appears across classes with
  // structurally different characterisations. Mermaid emits each class's
  // field independently so there's no structural collision — but the name
  // reuse is a modeling smell. Suppress when an inline-object collision
  // was already reported for the same bare name (the char.target differs
  // by construction in that case and we don't want to double-warn).
  const fieldSignatures = new Map<string, Set<string>>()
  for (const cls of ctx.classes) {
    for (const f of cls.fields) {
      let sigs = fieldSignatures.get(f.name)
      if (!sigs) {
        sigs = new Set()
        fieldSignatures.set(f.name, sigs)
      }
      sigs.add(charSignature(f.char))
    }
  }
  for (const [name, sigs] of fieldSignatures) {
    if (sigs.size <= 1) continue
    if (ctx.collisionWarningsEmitted.has(pascalCase(name))) continue
    ctx.warnings.push(
      `Field '${name}' has differing types across classes (${[...sigs].sort().join(', ')}); the diagram shows each class's own field but the name reuse may be worth reviewing.`,
    )
  }

  warnDuplicateInlineShapes(ctx)

  // Deterministic ordering for stable git diffs. Documents alphabetical
  // first, then objects alphabetical; edges by (source, fieldName, target);
  // field order within a class is left as authored, because the schema
  // file's field order conveys deliberate Studio UX choice.
  const sortedClasses = [...ctx.classes].sort((a, b) => {
    if (a.stereotype !== b.stereotype) {
      return a.stereotype === 'document' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
  const sortedEdges = [...keptEdges].sort(
    (a, b) =>
      a.source.localeCompare(b.source) ||
      a.fieldName.localeCompare(b.fieldName) ||
      a.target.localeCompare(b.target),
  )

  return {classes: sortedClasses, edges: sortedEdges, warnings: ctx.warnings}
}

/** Compact textual signature of a char for collision-detection purposes. */
function charSignature(char: FieldChar): string {
  if (char.kind === 'primitive') return `${char.prim}${char.array ? '[]' : ''}`
  if (char.kind === 'portableText') return 'portableText'
  return `${objectCharTargets(char).join('|')}${char.array ? '[]' : ''}`
}

/**
 * Warn when two or more inline anonymous objects share an identical shape —
 * they likely want to be a single named, reusable type (issue #29). Advisory:
 * identical shape is a strong signal but two genuinely-different objects can
 * coincidentally match. Shape = sorted field name:type (cardinality-independent);
 * only inline-origin classes count, since named types are already reusable.
 * Fires independently of the name-collision warnings — a distinct smell (same
 * shape, not same name).
 */
function warnDuplicateInlineShapes(ctx: WalkContext): void {
  const groups = new Map<string, string[]>()
  for (const cls of ctx.classes) {
    if (cls.origin !== 'inline') continue
    const sig = classShapeSignature(cls)
    const group = groups.get(sig)
    if (group) group.push(cls.name)
    else groups.set(sig, [cls.name])
  }
  for (const [, names] of groups) {
    if (names.length < 2) continue
    ctx.warnings.push(
      `Inline objects ${joinClassNames(names)} share an identical shape — consider extracting a shared named type (queryable by _type, referenceable, and reusable).`,
    )
  }
}

/**
 * Warn about each named `object` type that nothing references — an object with
 * zero incoming edges is dead weight, since objects only exist embedded in
 * something (issue #30). Scoped to `origin: 'object'`: documents have their own
 * identity, a defined-but-unused image/file asset type is plausible, and
 * inline/portable-text classes always have a parent edge by construction.
 * Advisory only (a WIP type, or one reached via untracked mechanisms like
 * conditional fields, is a false positive). Distinct from the visibility-
 * dependent "Hide Orphan Objects" button — this is static and schema-level.
 */
function warnUnreferencedObjects(ctx: WalkContext, edges: Edge[]): void {
  const referenced = new Set(edges.map((e) => e.target))
  for (const cls of ctx.classes) {
    if (cls.origin !== 'object') continue
    if (referenced.has(cls.name)) continue
    ctx.warnings.push(
      `Object type '${cls.name}' is defined but never referenced — consider removing it, or referencing it from a type that uses it.`,
    )
  }
}

/**
 * Structural shape signature of a class — its sorted `name:type` field pairs,
 * cardinality-independent. Two inline objects with the same signature are
 * candidates for extraction into one shared named type (issue #29).
 */
function classShapeSignature(cls: CanonicalClass): string {
  return cls.fields
    .map((f) => `${f.name}:${charSignature(f.char)}`)
    .sort()
    .join('|')
}

/** Join class names for a warning: `'A' and 'B'` for two, `'A', 'B', 'C'` for more. */
function joinClassNames(names: string[]): string {
  const quoted = [...names].sort().map((n) => `'${n}'`)
  if (quoted.length === 2) return `${quoted[0]} and ${quoted[1]}`
  return quoted.join(', ')
}
