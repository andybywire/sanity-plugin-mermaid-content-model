import {describe, expect, it} from 'vitest'

import {walk} from './walker'

describe('walker', () => {
  it('produces a document-stereotype class for a `type: "document"` definition', () => {
    const types = [{name: 'discipline', type: 'document', fields: []}]
    const model = walk(types)
    expect(model.classes).toHaveLength(1)
    expect(model.classes[0]?.name).toBe('Discipline')
    expect(model.classes[0]?.stereotype).toBe('document')
  })

  it('produces an object-stereotype class for a `type: "object"` definition', () => {
    const types = [{name: 'heroImage', type: 'object', fields: []}]
    const model = walk(types)
    expect(model.classes).toHaveLength(1)
    expect(model.classes[0]?.name).toBe('HeroImage')
    expect(model.classes[0]?.stereotype).toBe('object')
  })

  it('skips types whose names match the skip patterns', () => {
    const types = [
      {name: 'sanity.imageAsset', type: 'document', fields: []},
      {name: 'assist.instruction', type: 'document', fields: []},
      {name: 'geopoint', type: 'object', fields: []},
      {name: 'discipline', type: 'document', fields: []},
    ]
    const model = walk(types)
    expect(model.classes).toHaveLength(1)
    expect(model.classes[0]?.name).toBe('Discipline')
  })

  it('walks primitive string fields with no validation as [0..1]', () => {
    const types = [
      {name: 'discipline', type: 'document', fields: [{name: 'title', type: 'string'}]},
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields).toHaveLength(1)
    expect(model.classes[0]?.fields[0]).toMatchObject({
      name: 'title',
      char: {kind: 'primitive', prim: 'string', array: false},
      cardinality: {min: 0, max: 1},
    })
  })

  it('reads Rule.required() through the probe and tightens cardinality to [1]', () => {
    const types = [
      {
        name: 'discipline',
        type: 'document',
        fields: [{name: 'title', type: 'string', validation: (R: any) => R.required()}],
      },
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.cardinality).toEqual({min: 1, max: 1})
  })

  it('skips platform metadata fields (_id, _type, _createdAt, _updatedAt, _rev)', () => {
    const types = [
      {
        name: 'discipline',
        type: 'document',
        fields: [
          {name: '_id', type: 'string'},
          {name: '_type', type: 'string'},
          {name: '_createdAt', type: 'datetime'},
          {name: '_updatedAt', type: 'datetime'},
          {name: '_rev', type: 'string'},
          {name: 'title', type: 'string'},
        ],
      },
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields.map((f) => f.name)).toEqual(['title'])
  })

  it('marks array fields as array: true in the characterization', () => {
    const types = [
      {
        name: 'discipline',
        type: 'document',
        fields: [{name: 'tags', type: 'array', of: [{type: 'string'}]}],
      },
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.char).toMatchObject({
      kind: 'primitive',
      prim: 'string',
      array: true,
    })
  })

  it('produces [0..*] cardinality for an array of primitives with no validation', () => {
    const types = [
      {
        name: 'discipline',
        type: 'document',
        fields: [{name: 'tags', type: 'array', of: [{type: 'string'}]}],
      },
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.cardinality).toEqual({min: 0, max: '*'})
  })

  it('produces [1..*] cardinality for a required array', () => {
    const types = [
      {
        name: 'discipline',
        type: 'document',
        fields: [
          {
            name: 'tags',
            type: 'array',
            of: [{type: 'string'}],
            validation: (R: any) => R.required(),
          },
        ],
      },
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.cardinality).toEqual({min: 1, max: '*'})
  })

  it('tightens array cardinality using Rule.min/Rule.max from the probe', () => {
    const types = [
      {
        name: 'discipline',
        type: 'document',
        fields: [
          {
            name: 'tags',
            type: 'array',
            of: [{type: 'string'}],
            validation: (R: any) => R.required().min(2).max(5),
          },
        ],
      },
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.cardinality).toEqual({min: 2, max: 5})
  })

  it('characterises a reference field as kind: object, relation: reference', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'discipline', type: 'reference', to: [{type: 'discipline'}]}],
      },
      {name: 'discipline', type: 'document', fields: []},
    ]
    const model = walk(types)
    const methodClass = model.classes.find((c) => c.name === 'Method')
    expect(methodClass?.fields[0]?.char).toEqual({
      kind: 'object',
      relation: 'reference',
      targets: ['Discipline'],
      array: false,
    })
  })

  it('emits an association edge for a reference field', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'discipline', type: 'reference', to: [{type: 'discipline'}]}],
      },
      {name: 'discipline', type: 'document', fields: []},
    ]
    const model = walk(types)
    expect(model.edges).toContainEqual({
      source: 'Method',
      target: 'Discipline',
      relation: 'reference',
      fieldName: 'discipline',
    })
  })

  it('handles an array of references as kind: object, array: true', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [
          {
            name: 'disciplines',
            type: 'array',
            of: [{type: 'reference', to: [{type: 'discipline'}]}],
          },
        ],
      },
      {name: 'discipline', type: 'document', fields: []},
    ]
    const model = walk(types)
    const methodClass = model.classes.find((c) => c.name === 'Method')
    expect(methodClass?.fields[0]?.char).toEqual({
      kind: 'object',
      relation: 'reference',
      targets: ['Discipline'],
      array: true,
    })
    expect(model.edges).toContainEqual({
      source: 'Method',
      target: 'Discipline',
      relation: 'reference',
      fieldName: 'disciplines',
    })
  })

  // Multi-target (polymorphic) references: `to: [{type: 'a'}, {type: 'b'}]`.
  // A reference char carries ALL targets and emits one edge per target, so the
  // diagram renders the model as authored instead of dropping all but the
  // first (issue #27).
  it('characterises a multi-target reference with all targets (issue #27)', () => {
    const types = [
      {
        name: 'page',
        type: 'document',
        fields: [{name: 'related', type: 'reference', to: [{type: 'article'}, {type: 'event'}]}],
      },
      {name: 'article', type: 'document', fields: []},
      {name: 'event', type: 'document', fields: []},
    ]
    const model = walk(types)
    const page = model.classes.find((c) => c.name === 'Page')
    expect(page?.fields[0]?.char).toEqual({
      kind: 'object',
      relation: 'reference',
      targets: ['Article', 'Event'],
      array: false,
    })
  })

  it('emits one association edge per target for a multi-target reference, sorted (issue #27)', () => {
    const types = [
      {
        name: 'page',
        type: 'document',
        // authored event-first to prove the edge sort is deterministic
        fields: [{name: 'related', type: 'reference', to: [{type: 'event'}, {type: 'article'}]}],
      },
      {name: 'article', type: 'document', fields: []},
      {name: 'event', type: 'document', fields: []},
    ]
    const model = walk(types)
    expect(model.edges).toEqual([
      {source: 'Page', target: 'Article', relation: 'reference', fieldName: 'related'},
      {source: 'Page', target: 'Event', relation: 'reference', fieldName: 'related'},
    ])
  })

  it('emits an edge per target for an array of multi-target references (issue #27)', () => {
    const types = [
      {
        name: 'page',
        type: 'document',
        fields: [
          {
            name: 'items',
            type: 'array',
            of: [{type: 'reference', to: [{type: 'article'}, {type: 'event'}]}],
          },
        ],
      },
      {name: 'article', type: 'document', fields: []},
      {name: 'event', type: 'document', fields: []},
    ]
    const model = walk(types)
    const page = model.classes.find((c) => c.name === 'Page')
    expect(page?.fields[0]?.char).toEqual({
      kind: 'object',
      relation: 'reference',
      targets: ['Article', 'Event'],
      array: true,
    })
    expect(model.edges.filter((e) => e.source === 'Page').map((e) => e.target)).toEqual([
      'Article',
      'Event',
    ])
  })

  it('follows a reference alias with multiple targets to all of them (issue #27)', () => {
    const types = [
      {name: 'page', type: 'document', fields: [{name: 'related', type: 'relatedRef'}]},
      {name: 'relatedRef', type: 'reference', to: [{type: 'article'}, {type: 'event'}]},
      {name: 'article', type: 'document', fields: []},
      {name: 'event', type: 'document', fields: []},
    ]
    const model = walk(types)
    const page = model.classes.find((c) => c.name === 'Page')
    expect(page?.fields[0]?.char).toEqual({
      kind: 'object',
      relation: 'reference',
      targets: ['Article', 'Event'],
      array: false,
    })
    expect(model.edges.filter((e) => e.source === 'Page').map((e) => e.target)).toEqual([
      'Article',
      'Event',
    ])
  })

  it('emits an edge per target for a multi-target reference embedded in portable text (issue #27)', () => {
    const types = [
      {
        name: 'page',
        type: 'document',
        fields: [
          {
            name: 'body',
            type: 'array',
            of: [
              {type: 'block'},
              {name: 'related', type: 'reference', to: [{type: 'article'}, {type: 'event'}]},
            ],
          },
        ],
      },
      {name: 'article', type: 'document', fields: []},
      {name: 'event', type: 'document', fields: []},
    ]
    const model = walk(types)
    const pt = model.classes.find((c) => c.origin === 'portableText')
    expect(pt).toBeDefined()
    const refTargets = model.edges
      .filter((e) => e.source === pt?.name && e.relation === 'reference')
      .map((e) => e.target)
    expect(refTargets).toEqual(['Article', 'Event'])
  })

  it('deduplicates repeated reference targets (issue #27)', () => {
    const types = [
      {
        name: 'page',
        type: 'document',
        fields: [{name: 'related', type: 'reference', to: [{type: 'article'}, {type: 'article'}]}],
      },
      {name: 'article', type: 'document', fields: []},
    ]
    const model = walk(types)
    const page = model.classes.find((c) => c.name === 'Page')
    expect(page?.fields[0]?.char).toEqual({
      kind: 'object',
      relation: 'reference',
      targets: ['Article'],
      array: false,
    })
    expect(model.edges.filter((e) => e.source === 'Page')).toHaveLength(1)
  })

  it('resolves named object types referenced as fields to composition edges', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'heroImage', type: 'heroImage'}],
      },
      {name: 'heroImage', type: 'object', fields: []},
    ]
    const model = walk(types)
    const methodClass = model.classes.find((c) => c.name === 'Method')
    expect(methodClass?.fields[0]?.char).toEqual({
      kind: 'object',
      target: 'HeroImage',
      relation: 'composition',
      array: false,
    })
    expect(model.edges).toContainEqual({
      source: 'Method',
      target: 'HeroImage',
      relation: 'composition',
      fieldName: 'heroImage',
    })
  })

  it('resolves named object types inside arrays', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'sources', type: 'array', of: [{type: 'source'}]}],
      },
      {name: 'source', type: 'object', fields: []},
    ]
    const model = walk(types)
    const methodClass = model.classes.find((c) => c.name === 'Method')
    expect(methodClass?.fields[0]?.char).toMatchObject({
      kind: 'object',
      target: 'Source',
      relation: 'composition',
      array: true,
    })
  })

  it('drops fields whose type is unknown (not primitive, not reference, not in typeMap)', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [
          {name: 'mystery', type: 'somethingUnknown'},
          {name: 'title', type: 'string'},
        ],
      },
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields.map((f) => f.name)).toEqual(['title'])
  })

  it('resolves an inline-alias reference type through to its target', () => {
    // referencedDiscipline is a named alias whose underlying type is a
    // reference to discipline. A field of type referencedDiscipline should
    // resolve to a reference edge pointing at Discipline directly.
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'discipline', type: 'referencedDiscipline'}],
      },
      {name: 'referencedDiscipline', type: 'reference', to: [{type: 'discipline'}]},
      {name: 'discipline', type: 'document', fields: []},
    ]
    const model = walk(types)
    const methodClass = model.classes.find((c) => c.name === 'Method')
    expect(methodClass?.fields[0]?.char).toEqual({
      kind: 'object',
      relation: 'reference',
      targets: ['Discipline'],
      array: false,
    })
    expect(model.edges).toContainEqual({
      source: 'Method',
      target: 'Discipline',
      relation: 'reference',
      fieldName: 'discipline',
    })
  })

  it('does not emit the alias itself as a class', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'discipline', type: 'referencedDiscipline'}],
      },
      {name: 'referencedDiscipline', type: 'reference', to: [{type: 'discipline'}]},
      {name: 'discipline', type: 'document', fields: []},
    ]
    const model = walk(types)
    expect(model.classes.map((c) => c.name).sort()).toEqual(['Discipline', 'Method'])
  })

  it('resolves an alias used inside an array of references', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'disciplines', type: 'array', of: [{type: 'referencedDiscipline'}]}],
      },
      {name: 'referencedDiscipline', type: 'reference', to: [{type: 'discipline'}]},
      {name: 'discipline', type: 'document', fields: []},
    ]
    const model = walk(types)
    const methodClass = model.classes.find((c) => c.name === 'Method')
    expect(methodClass?.fields[0]?.char).toEqual({
      kind: 'object',
      relation: 'reference',
      targets: ['Discipline'],
      array: true,
    })
  })

  // Named-type aliases (Sanity "type extension"): a top-level type whose
  // `type` is the NAME of another registered type, e.g. the rich-table
  // plugin's `{name: 'richTableBlock', type: 'richTable'}`. The walker must
  // follow the alias to the underlying definition so the field connects to
  // the class `walk()` actually emits — rather than dropping it silently and
  // stranding that class as an orphan (issue #32).
  it('resolves a field whose type is a named alias to a class as a composition edge (issue #32)', () => {
    const types = [
      {name: 'doc', type: 'document', fields: [{name: 'table', type: 'richTableBlock'}]},
      {name: 'richTableBlock', type: 'richTable'},
      {name: 'richTable', type: 'object', fields: [{name: 'caption', type: 'string'}]},
    ]
    const model = walk(types)
    const doc = model.classes.find((c) => c.name === 'Doc')
    expect(doc?.fields[0]?.char).toEqual({
      kind: 'object',
      target: 'RichTable',
      relation: 'composition',
      array: false,
    })
    expect(model.edges).toContainEqual({
      source: 'Doc',
      target: 'RichTable',
      relation: 'composition',
      fieldName: 'table',
    })
    // the alias itself is never emitted as its own class
    expect(model.classes.map((c) => c.name)).not.toContain('RichTableBlock')
  })

  it('resolves a named-alias-to-class used inside an array as a composition edge (issue #32)', () => {
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [{name: 'tables', type: 'array', of: [{type: 'richTableBlock'}]}],
      },
      {name: 'richTableBlock', type: 'richTable'},
      {name: 'richTable', type: 'object', fields: [{name: 'caption', type: 'string'}]},
    ]
    const model = walk(types)
    const doc = model.classes.find((c) => c.name === 'Doc')
    expect(doc?.fields[0]?.char).toEqual({
      kind: 'object',
      target: 'RichTable',
      relation: 'composition',
      array: true,
    })
  })

  it('connects a portable-text embed whose type is a named alias to a class (issue #32)', () => {
    // The reported case: a PT array member references `richTableBlock`, which
    // aliases the `richTable` object. The body must promote to a class and the
    // embed must compose to RichTable (named by the member), not be dropped.
    const types = [
      {
        name: 'bodyPortableText',
        type: 'array',
        of: [{type: 'block'}, {name: 'richTableBlock', type: 'richTableBlock'}],
      },
      {name: 'richTableBlock', type: 'richTable'},
      {name: 'richTable', type: 'object', fields: [{name: 'caption', type: 'string'}]},
    ]
    const model = walk(types)
    const body = model.classes.find((c) => c.name === 'BodyPortableText')
    expect(body?.fields).toContainEqual({
      name: 'richTableBlock',
      char: {kind: 'object', target: 'RichTable', relation: 'composition', array: true},
      cardinality: {min: 0, max: '*'},
      hasCustomMarker: false,
    })
    expect(model.edges).toContainEqual({
      source: 'BodyPortableText',
      target: 'RichTable',
      relation: 'composition',
      fieldName: 'richTableBlock',
    })
    expect(model.classes.map((c) => c.name)).not.toContain('RichTableBlock')
  })

  it('follows a multi-hop alias chain to the underlying class (issue #32)', () => {
    const types = [
      {name: 'doc', type: 'document', fields: [{name: 'thing', type: 'aliasA'}]},
      {name: 'aliasA', type: 'aliasB'},
      {name: 'aliasB', type: 'widget'},
      {name: 'widget', type: 'object', fields: [{name: 'label', type: 'string'}]},
    ]
    const model = walk(types)
    const doc = model.classes.find((c) => c.name === 'Doc')
    expect(doc?.fields[0]?.char).toEqual({
      kind: 'object',
      target: 'Widget',
      relation: 'composition',
      array: false,
    })
  })

  it('resolves a field whose type is a named alias to a primitive as that primitive (issue #32)', () => {
    const types = [
      {name: 'doc', type: 'document', fields: [{name: 'subtitle', type: 'brandedString'}]},
      {name: 'brandedString', type: 'string'},
    ]
    const model = walk(types)
    const doc = model.classes.find((c) => c.name === 'Doc')
    expect(doc?.fields[0]?.char).toEqual({kind: 'primitive', prim: 'string', array: false})
    // no spurious edge, and the primitive alias is not emitted as a class
    expect(model.edges).toEqual([])
    expect(model.classes.map((c) => c.name)).toEqual(['Doc'])
  })

  it('resolves a field referencing a named top-level file type as a composition edge', () => {
    // A named `file` type is emitted as a class by walk(); a field referencing
    // it by name should compose in, like a named `image` type does.
    const types = [
      {name: 'doc', type: 'document', fields: [{name: 'download', type: 'assetFile'}]},
      {name: 'assetFile', type: 'file', fields: [{name: 'label', type: 'string'}]},
    ]
    const model = walk(types)
    const doc = model.classes.find((c) => c.name === 'Doc')
    expect(doc?.fields[0]?.char).toEqual({
      kind: 'object',
      target: 'AssetFile',
      relation: 'composition',
      array: false,
    })
    expect(model.edges).toContainEqual({
      source: 'Doc',
      target: 'AssetFile',
      relation: 'composition',
      fieldName: 'download',
    })
  })

  it('does not infinite-loop on a self-referential alias; drops the field', () => {
    const types = [
      {name: 'doc', type: 'document', fields: [{name: 'x', type: 'loop'}]},
      {name: 'loop', type: 'loop'},
    ]
    const model = walk(types)
    const doc = model.classes.find((c) => c.name === 'Doc')
    expect(doc?.fields).toEqual([])
  })

  it('sets hasCustomMarker: false for a field with only required validation', () => {
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [{name: 'title', type: 'string', validation: (R: any) => R.required()}],
      },
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.hasCustomMarker).toBe(false)
  })

  it('sets hasCustomMarker: true when the field has a custom validator', () => {
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [{name: 'title', type: 'string', validation: (R: any) => R.custom(() => true)}],
      },
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.hasCustomMarker).toBe(true)
  })

  it('sets hasCustomMarker: true when the field has other constraints (regex, email, …)', () => {
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [{name: 'slug', type: 'string', validation: (R: any) => R.regex(/^x/)}],
      },
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.hasCustomMarker).toBe(true)
  })

  it('treats Rule.min/max on a non-array as constraints (hasCustomMarker: true)', () => {
    // On a string field, min/max bound the length — that's a value constraint
    // the diagram can't render in detail. Bucket into the custom marker.
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [{name: 'title', type: 'string', validation: (R: any) => R.min(2).max(10)}],
      },
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.hasCustomMarker).toBe(true)
  })

  it('does NOT set hasCustomMarker for Rule.min/max on an array (those are cardinality)', () => {
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [
          {
            name: 'tags',
            type: 'array',
            of: [{type: 'string'}],
            validation: (R: any) => R.min(2).max(5),
          },
        ],
      },
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.hasCustomMarker).toBe(false)
  })

  it('characterises a portable text field (array of blocks) as kind: portableText', () => {
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [{name: 'overview', type: 'array', of: [{type: 'block'}]}],
      },
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.char).toEqual({kind: 'portableText'})
  })

  it('does not emit an edge or a PortableText class for portable text fields', () => {
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [{name: 'overview', type: 'array', of: [{type: 'block'}]}],
      },
    ]
    const model = walk(types)
    expect(model.edges).toEqual([])
    expect(model.classes.map((c) => c.name)).not.toContain('PortableText')
  })

  it('treats portable text cardinality as scalar — [0..1] by default', () => {
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [{name: 'overview', type: 'array', of: [{type: 'block'}]}],
      },
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.cardinality).toEqual({min: 0, max: 1})
  })

  it('treats required portable text as [1]', () => {
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [
          {
            name: 'overview',
            type: 'array',
            of: [{type: 'block'}],
            validation: (R: any) => R.required(),
          },
        ],
      },
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.cardinality).toEqual({min: 1, max: 1})
  })

  it('characterises a slug field as a primitive string', () => {
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [{name: 'slug', type: 'slug'}],
      },
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.char).toEqual({
      kind: 'primitive',
      prim: 'string',
      array: false,
    })
  })

  it('emits a `type: "image"` top-level type as an object-stereotype class', () => {
    const types = [{name: 'heroImage', type: 'image', fields: [{name: 'caption', type: 'string'}]}]
    const model = walk(types)
    const cls = model.classes.find((c) => c.name === 'HeroImage')
    expect(cls?.stereotype).toBe('object')
  })

  it('synthesises an `asset: url` field on image-like classes', () => {
    const types = [{name: 'heroImage', type: 'image', fields: [{name: 'caption', type: 'string'}]}]
    const model = walk(types)
    const cls = model.classes.find((c) => c.name === 'HeroImage')
    const asset = cls?.fields.find((f) => f.name === 'asset')
    expect(asset?.char).toEqual({kind: 'primitive', prim: 'url', array: false})
    expect(asset?.cardinality).toEqual({min: 1, max: 1})
  })

  it('keeps user-added fields on image-like classes alongside the synthesised asset', () => {
    const types = [
      {
        name: 'heroImage',
        type: 'image',
        fields: [
          {name: 'caption', type: 'string'},
          {name: 'alt', type: 'string'},
        ],
      },
    ]
    const model = walk(types)
    const cls = model.classes.find((c) => c.name === 'HeroImage')
    expect(cls?.fields.map((f) => f.name)).toEqual(['asset', 'caption', 'alt'])
  })

  it('skips hotspot/crop/media fields if a schema actually declares them on an image type', () => {
    const types = [
      {
        name: 'heroImage',
        type: 'image',
        fields: [
          {name: 'caption', type: 'string'},
          {name: 'hotspot', type: 'object', fields: []},
          {name: 'crop', type: 'object', fields: []},
          {name: 'media', type: 'reference', to: [{type: 'sanity.imageAsset'}]},
        ],
      },
    ]
    const model = walk(types)
    const cls = model.classes.find((c) => c.name === 'HeroImage')
    expect(cls?.fields.map((f) => f.name)).toEqual(['asset', 'caption'])
  })

  it('emits an inline anonymous object as its own class with a composition edge', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [
          {
            name: 'metadata',
            type: 'object',
            fields: [
              {name: 'createdAt', type: 'string'},
              {name: 'updatedAt', type: 'string'},
            ],
          },
        ],
      },
    ]
    const model = walk(types)
    expect(model.classes.map((c) => c.name).sort()).toEqual(['Metadata', 'Method'])
    const metadataClass = model.classes.find((c) => c.name === 'Metadata')
    expect(metadataClass?.stereotype).toBe('object')
    expect(metadataClass?.fields.map((f) => f.name)).toEqual(['createdAt', 'updatedAt'])
    expect(model.edges).toContainEqual({
      source: 'Method',
      target: 'Metadata',
      relation: 'composition',
      fieldName: 'metadata',
    })
  })

  it('emits an inline anonymous object inside an array as its own class', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [
          {
            name: 'sources',
            type: 'array',
            of: [
              {
                type: 'object',
                fields: [
                  {name: 'name', type: 'string'},
                  {name: 'url', type: 'url'},
                ],
              },
            ],
          },
        ],
      },
    ]
    const model = walk(types)
    expect(model.classes.map((c) => c.name).sort()).toEqual(['Method', 'Sources'])
    const sourcesClass = model.classes.find((c) => c.name === 'Sources')
    expect(sourcesClass?.fields.map((f) => f.name)).toEqual(['name', 'url'])
  })

  it('disambiguates two inline objects sharing a field name by qualifying both with their parent', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [
          {
            name: 'metadata',
            type: 'object',
            fields: [{name: 'createdAt', type: 'string'}],
          },
        ],
      },
      {
        name: 'discipline',
        type: 'document',
        fields: [
          {
            name: 'metadata',
            type: 'object',
            fields: [{name: 'reviewedAt', type: 'string'}],
          },
        ],
      },
    ]
    const model = walk(types)
    const classNames = model.classes.map((c) => c.name).sort()
    expect(classNames).toEqual(['Discipline', 'Metadata_Discipline', 'Metadata_Method', 'Method'])
    // Each parent links to its own parent-qualified inline class.
    expect(model.edges).toContainEqual({
      source: 'Method',
      target: 'Metadata_Method',
      relation: 'composition',
      fieldName: 'metadata',
    })
    expect(model.edges).toContainEqual({
      source: 'Discipline',
      target: 'Metadata_Discipline',
      relation: 'composition',
      fieldName: 'metadata',
    })
  })

  it('warns when inline-object names collide', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'metadata', type: 'object', fields: [{name: 'createdAt', type: 'string'}]}],
      },
      {
        name: 'discipline',
        type: 'document',
        fields: [
          {name: 'metadata', type: 'object', fields: [{name: 'reviewedAt', type: 'string'}]},
        ],
      },
    ]
    const model = walk(types)
    expect(model.warnings.some((w) => w.includes("'metadata'"))).toBe(true)
  })

  it('qualifies an inline object by its parent when its bare name collides with a named class', () => {
    const types = [
      {name: 'metadata', type: 'object', fields: [{name: 'global', type: 'string'}]},
      {
        name: 'method',
        type: 'document',
        fields: [
          {
            name: 'metadata',
            type: 'object',
            fields: [{name: 'local', type: 'string'}],
          },
        ],
      },
    ]
    const model = walk(types)
    // The named Metadata keeps its bare name; the inline gets a parent qualifier.
    expect(model.classes.find((c) => c.name === 'Metadata')?.fields.map((f) => f.name)).toEqual([
      'global',
    ])
    expect(
      model.classes.find((c) => c.name === 'Metadata_Method')?.fields.map((f) => f.name),
    ).toEqual(['local'])
  })

  // Two distinct top-level type names that pascalCase to the same class name
  // (`blogPost` + `blog_post` → `BlogPost`) would otherwise emit two classes
  // with the same name and merge into one Mermaid box. Disambiguate base-first
  // by source name and warn, mirroring the field-derived collision fix (#23).
  it('disambiguates two top-level types that pascalCase to the same name, with a warning (issue #28)', () => {
    const types = [
      {name: 'blogPost', type: 'document', fields: []},
      {name: 'blog_post', type: 'document', fields: []},
    ]
    const model = walk(types)
    expect(model.classes.map((c) => c.name).sort()).toEqual([
      'BlogPost_blogPost',
      'BlogPost_blog_post',
    ])
    expect(
      model.warnings.some(
        (w) => w.includes('BlogPost') && w.includes('blogPost') && w.includes('blog_post'),
      ),
    ).toBe(true)
  })

  it('retargets reference edges to the correct disambiguated class for colliding types (issue #28)', () => {
    const types = [
      {
        name: 'page',
        type: 'document',
        fields: [
          {name: 'featured', type: 'reference', to: [{type: 'blogPost'}]},
          {name: 'legacy', type: 'reference', to: [{type: 'blog_post'}]},
        ],
      },
      {name: 'blogPost', type: 'document', fields: []},
      {name: 'blog_post', type: 'document', fields: []},
    ]
    const model = walk(types)
    expect(model.edges).toContainEqual({
      source: 'Page',
      target: 'BlogPost_blogPost',
      relation: 'reference',
      fieldName: 'featured',
    })
    expect(model.edges).toContainEqual({
      source: 'Page',
      target: 'BlogPost_blog_post',
      relation: 'reference',
      fieldName: 'legacy',
    })
  })

  it('does not qualify or warn for a single (non-colliding) top-level type (issue #28)', () => {
    const types = [{name: 'blogPost', type: 'document', fields: []}]
    const model = walk(types)
    expect(model.classes.map((c) => c.name)).toEqual(['BlogPost'])
    expect(model.warnings).toEqual([])
  })

  it('disambiguates an inline object colliding with a named file type (issue #28 completeness)', () => {
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [{name: 'cover', type: 'object', fields: [{name: 'label', type: 'string'}]}],
      },
      {name: 'cover', type: 'file', fields: [{name: 'alt', type: 'string'}]},
    ]
    const model = walk(types)
    const names = model.classes.map((c) => c.name)
    // the file type keeps the bare name; the inline object is qualified by its parent
    expect(names).toContain('Cover')
    expect(names).toContain('Cover_Doc')
    expect(model.warnings.some((w) => w.toLowerCase().includes('cover'))).toBe(true)
  })

  it('disambiguates an inline object colliding with a named portable-text alias (issue #28 completeness)', () => {
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [{name: 'body', type: 'object', fields: [{name: 'x', type: 'string'}]}],
      },
      {name: 'body', type: 'array', of: [{type: 'block'}, {type: 'callout'}]},
      {name: 'callout', type: 'object', fields: [{name: 'text', type: 'string'}]},
    ]
    const model = walk(types)
    const names = model.classes.map((c) => c.name)
    expect(names).toContain('Body') // the portable-text alias class
    expect(names).toContain('Body_Doc') // the inline object, qualified by its parent
    expect(model.warnings.some((w) => w.toLowerCase().includes('body'))).toBe(true)
  })

  it('drops edges whose target is a skipped type', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'preview', type: 'reference', to: [{type: 'sanity.imageAsset'}]}],
      },
    ]
    const model = walk(types)
    expect(model.edges).toEqual([])
  })

  it('warns when an edge target is filtered', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'preview', type: 'reference', to: [{type: 'sanity.imageAsset'}]}],
      },
    ]
    const model = walk(types)
    expect(model.warnings.some((w) => w.includes("'preview'"))).toBe(true)
  })

  it('warns when the same field name has different types across classes', () => {
    // documentation.body is PortableText; newsletter.body is a plain string.
    // Mermaid emits both classes with their own field, so there's no structural
    // collision — but the name reuse is a modeling smell worth surfacing.
    const types = [
      {
        name: 'documentation',
        type: 'document',
        fields: [{name: 'body', type: 'array', of: [{type: 'block'}]}],
      },
      {
        name: 'newsletter',
        type: 'document',
        fields: [{name: 'body', type: 'string'}],
      },
    ]
    const model = walk(types)
    expect(model.warnings.some((w) => w.includes("'body'"))).toBe(true)
  })

  it('does NOT warn when the same field name has the same type across classes', () => {
    // `title` as a plain string on every document is the normal, expected
    // case. No warning should be emitted.
    const types = [
      {name: 'method', type: 'document', fields: [{name: 'title', type: 'string'}]},
      {name: 'discipline', type: 'document', fields: [{name: 'title', type: 'string'}]},
    ]
    const model = walk(types)
    expect(model.warnings.some((w) => w.includes("'title'"))).toBe(false)
  })

  // Advisory smell (issue #29): two or more inline anonymous objects with an
  // identical shape likely want to be one shared NAMED type (queryable,
  // referenceable, reusable). Shape = sorted field name:type, ignoring
  // cardinality; only inline-origin classes are considered.
  it('warns when two inline objects share an identical shape (issue #29)', () => {
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [
          {
            name: 'home',
            type: 'object',
            fields: [
              {name: 'street', type: 'string'},
              {name: 'city', type: 'string'},
            ],
          },
          {
            name: 'work',
            type: 'object',
            fields: [
              {name: 'street', type: 'string'},
              {name: 'city', type: 'string'},
            ],
          },
        ],
      },
    ]
    const model = walk(types)
    expect(
      model.warnings.some(
        (w) => w.includes("'Home'") && w.includes("'Work'") && /identical shape/i.test(w),
      ),
    ).toBe(true)
  })

  it('does not warn when inline objects have different shapes (issue #29)', () => {
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [
          {name: 'home', type: 'object', fields: [{name: 'street', type: 'string'}]},
          {name: 'work', type: 'object', fields: [{name: 'phone', type: 'string'}]},
        ],
      },
    ]
    const model = walk(types)
    expect(model.warnings.some((w) => /identical shape/i.test(w))).toBe(false)
  })

  it('detects duplicate shapes structurally, ignoring cardinality (issue #29)', () => {
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [
          {
            name: 'home',
            type: 'object',
            // street required here, optional in `work` — same shape regardless
            fields: [{name: 'street', type: 'string', validation: (R: any) => R.required()}],
          },
          {name: 'work', type: 'object', fields: [{name: 'street', type: 'string'}]},
        ],
      },
    ]
    const model = walk(types)
    expect(
      model.warnings.some(
        (w) => w.includes("'Home'") && w.includes("'Work'") && /identical shape/i.test(w),
      ),
    ).toBe(true)
  })

  it('does not flag a named object that merely shares a shape with an inline object (issue #29)', () => {
    const types = [
      {name: 'address', type: 'object', fields: [{name: 'street', type: 'string'}]},
      {
        name: 'doc',
        type: 'document',
        fields: [{name: 'home', type: 'object', fields: [{name: 'street', type: 'string'}]}],
      },
    ]
    const model = walk(types)
    // only one inline object (Home); the named Address is excluded from the check
    expect(model.warnings.some((w) => /identical shape/i.test(w))).toBe(false)
  })

  it('emits a single warning naming every member of a duplicate-shape group (issue #29)', () => {
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [
          {name: 'home', type: 'object', fields: [{name: 'street', type: 'string'}]},
          {name: 'work', type: 'object', fields: [{name: 'street', type: 'string'}]},
          {name: 'billing', type: 'object', fields: [{name: 'street', type: 'string'}]},
        ],
      },
    ]
    const model = walk(types)
    const shapeWarnings = model.warnings.filter((w) => /identical shape/i.test(w))
    expect(shapeWarnings).toHaveLength(1)
    expect(shapeWarnings[0]).toContain("'Billing'")
    expect(shapeWarnings[0]).toContain("'Home'")
    expect(shapeWarnings[0]).toContain("'Work'")
  })

  it('sorts classes with documents alphabetical first, then objects alphabetical', () => {
    // Declaration order is deliberately scrambled to prove sorting is real.
    const types = [
      {name: 'heroImage', type: 'object', fields: []},
      {name: 'method', type: 'document', fields: []},
      {name: 'source', type: 'object', fields: []},
      {name: 'discipline', type: 'document', fields: []},
    ]
    const model = walk(types)
    expect(model.classes.map((c) => c.name)).toEqual([
      'Discipline',
      'Method',
      'HeroImage',
      'Source',
    ])
  })

  it('sorts edges by (source, fieldName, target)', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [
          {name: 'output', type: 'reference', to: [{type: 'discipline'}]},
          {name: 'input', type: 'reference', to: [{type: 'discipline'}]},
        ],
      },
      {
        name: 'discipline',
        type: 'document',
        fields: [{name: 'parent', type: 'reference', to: [{type: 'method'}]}],
      },
    ]
    const model = walk(types)
    // Discipline.parent comes before Method.input (sorted by source first).
    // Method.input comes before Method.output (sorted by fieldName within same source).
    expect(model.edges.map((e) => `${e.source}.${e.fieldName}->${e.target}`)).toEqual([
      'Discipline.parent->Method',
      'Method.input->Discipline',
      'Method.output->Discipline',
    ])
  })

  it('preserves field declaration order within a class (does not sort fields)', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [
          {name: 'zeta', type: 'string'},
          {name: 'alpha', type: 'string'},
          {name: 'middle', type: 'string'},
        ],
      },
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields.map((f) => f.name)).toEqual(['zeta', 'alpha', 'middle'])
  })

  it('marks document classes with origin: "document"', () => {
    const types = [{name: 'method', type: 'document', fields: []}]
    const model = walk(types)
    expect(model.classes[0]?.origin).toBe('document')
  })

  it('marks named top-level object types with origin: "object"', () => {
    const types = [{name: 'credit', type: 'object', fields: []}]
    const model = walk(types)
    expect(model.classes[0]?.origin).toBe('object')
  })

  it('marks image-typed top-level types with origin: "image"', () => {
    const types = [{name: 'heroImage', type: 'image', fields: []}]
    const model = walk(types)
    expect(model.classes[0]?.origin).toBe('image')
  })

  it('marks inline anonymous object classes with origin: "inline"', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'metadata', type: 'object', fields: []}],
      },
    ]
    const model = walk(types)
    const inlineClass = model.classes.find((c) => c.name === 'Metadata')
    expect(inlineClass?.origin).toBe('inline')
  })

  it('characterises a date field as primitive datetime', () => {
    const types = [{name: 'doc', type: 'document', fields: [{name: 'when', type: 'date'}]}]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.char).toEqual({
      kind: 'primitive',
      prim: 'datetime',
      array: false,
    })
  })

  it('characterises a datetime field as primitive datetime', () => {
    const types = [{name: 'doc', type: 'document', fields: [{name: 'when', type: 'datetime'}]}]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.char).toEqual({
      kind: 'primitive',
      prim: 'datetime',
      array: false,
    })
  })

  it('characterises a text field as primitive string', () => {
    const types = [{name: 'doc', type: 'document', fields: [{name: 'body', type: 'text'}]}]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.char).toEqual({
      kind: 'primitive',
      prim: 'string',
      array: false,
    })
  })

  it('characterises an email field as primitive string', () => {
    const types = [{name: 'doc', type: 'document', fields: [{name: 'contact', type: 'email'}]}]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.char).toEqual({
      kind: 'primitive',
      prim: 'string',
      array: false,
    })
  })

  it('characterises a geopoint field as primitive geopoint', () => {
    const types = [{name: 'doc', type: 'document', fields: [{name: 'location', type: 'geopoint'}]}]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.char).toEqual({
      kind: 'primitive',
      prim: 'geopoint',
      array: false,
    })
  })

  it('handles crossDatasetReference like a reference', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'shared', type: 'crossDatasetReference', to: [{type: 'discipline'}]}],
      },
      {name: 'discipline', type: 'document', fields: []},
    ]
    const model = walk(types)
    const method = model.classes.find((c) => c.name === 'Method')
    expect(method?.fields[0]?.char).toEqual({
      kind: 'object',
      relation: 'reference',
      targets: ['Discipline'],
      array: false,
    })
    expect(model.edges).toContainEqual({
      source: 'Method',
      target: 'Discipline',
      relation: 'reference',
      fieldName: 'shared',
    })
  })

  it('handles globalDocumentReference like a reference', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'external', type: 'globalDocumentReference', to: [{type: 'discipline'}]}],
      },
      {name: 'discipline', type: 'document', fields: []},
    ]
    const model = walk(types)
    expect(model.edges).toContainEqual({
      source: 'Method',
      target: 'Discipline',
      relation: 'reference',
      fieldName: 'external',
    })
  })

  it('emits a `type: "file"` top-level type as an object-stereotype class', () => {
    const types = [{name: 'attachment', type: 'file', fields: []}]
    const model = walk(types)
    const cls = model.classes.find((c) => c.name === 'Attachment')
    expect(cls?.stereotype).toBe('object')
  })

  it('synthesises an `asset: url` field on file-typed top-level classes', () => {
    const types = [{name: 'attachment', type: 'file', fields: []}]
    const model = walk(types)
    const cls = model.classes.find((c) => c.name === 'Attachment')
    const asset = cls?.fields.find((f) => f.name === 'asset')
    expect(asset?.char).toEqual({kind: 'primitive', prim: 'url', array: false})
    expect(asset?.cardinality).toEqual({min: 1, max: 1})
  })

  it('marks file-typed top-level types with origin: "file"', () => {
    const types = [{name: 'attachment', type: 'file', fields: []}]
    const model = walk(types)
    expect(model.classes[0]?.origin).toBe('file')
  })

  it('keeps user-added fields on file-typed top-level classes alongside the synthesised asset', () => {
    const types = [
      {
        name: 'attachment',
        type: 'file',
        fields: [{name: 'description', type: 'string'}],
      },
    ]
    const model = walk(types)
    const cls = model.classes.find((c) => c.name === 'Attachment')
    expect(cls?.fields.map((f) => f.name)).toEqual(['asset', 'description'])
  })

  it('handles `to: {type: "X"}` (single-object form) on a top-level reference', () => {
    // Sanity accepts `to` as either an array `[{type: 'X'}]` or a single
    // object `{type: 'X'}` when there's only one target. The walker
    // should normalise either shape to an edge.
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'discipline', type: 'reference', to: {type: 'discipline'}}],
      },
      {name: 'discipline', type: 'document', fields: []},
    ]
    const model = walk(types)
    const method = model.classes.find((c) => c.name === 'Method')
    expect(method?.fields[0]?.char).toEqual({
      kind: 'object',
      relation: 'reference',
      targets: ['Discipline'],
      array: false,
    })
  })

  it('handles `to: {type: "X"}` (single-object form) on an array-member reference', () => {
    // The case the real studio hit: `defineField({type: 'array', of: [
    //   {type: 'reference', to: {type: 'skosConcept'}}]})`. Object form
    // for `to` inside an array member silently dropped fields before this
    // fix.
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [
          {
            name: 'disciplines',
            type: 'array',
            of: [{type: 'reference', to: {type: 'discipline'}}],
          },
        ],
      },
      {name: 'discipline', type: 'document', fields: []},
    ]
    const model = walk(types)
    const method = model.classes.find((c) => c.name === 'Method')
    expect(method?.fields[0]?.char).toEqual({
      kind: 'object',
      relation: 'reference',
      targets: ['Discipline'],
      array: true,
    })
  })

  it('handles `to: {type: "X"}` on an inline-alias type', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'discipline', type: 'referencedDiscipline'}],
      },
      // Alias type using single-object `to` form.
      {name: 'referencedDiscipline', type: 'reference', to: {type: 'discipline'}},
      {name: 'discipline', type: 'document', fields: []},
    ]
    const model = walk(types)
    const method = model.classes.find((c) => c.name === 'Method')
    expect(method?.fields[0]?.char).toEqual({
      kind: 'object',
      relation: 'reference',
      targets: ['Discipline'],
      array: false,
    })
  })

  it('resolves a named alias to portable text (array-of-block) as kind: portableText', () => {
    // The pattern hit by method.overview in the real studio: a field
    // references bodyPortableText, which is a top-level
    // `defineType({type: 'array', of: [{type: 'block'}, ...]})`.
    // Before this support the field was silently dropped.
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'overview', type: 'bodyPortableText'}],
      },
      {name: 'bodyPortableText', type: 'array', of: [{type: 'block'}]},
    ]
    const model = walk(types)
    const method = model.classes.find((c) => c.name === 'Method')
    expect(method?.fields[0]?.char).toEqual({kind: 'portableText'})
  })

  it('does not emit a class or edge for a portable-text alias field', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'overview', type: 'bodyPortableText'}],
      },
      {name: 'bodyPortableText', type: 'array', of: [{type: 'block'}]},
    ]
    const model = walk(types)
    expect(model.classes.map((c) => c.name)).not.toContain('BodyPortableText')
    expect(model.edges).toEqual([])
  })

  it('resolves a named alias to an array of primitives as an array primitive', () => {
    const types = [
      {
        name: 'doc',
        type: 'document',
        fields: [{name: 'urls', type: 'urlList'}],
      },
      {name: 'urlList', type: 'array', of: [{type: 'url'}]},
    ]
    const model = walk(types)
    expect(model.classes[0]?.fields[0]?.char).toEqual({
      kind: 'primitive',
      prim: 'url',
      array: true,
    })
  })

  it('resolves a named alias to an array of references as an array reference edge', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'tags', type: 'tagList'}],
      },
      {name: 'tagList', type: 'array', of: [{type: 'reference', to: [{type: 'tag'}]}]},
      {name: 'tag', type: 'document', fields: []},
    ]
    const model = walk(types)
    const method = model.classes.find((c) => c.name === 'Method')
    expect(method?.fields[0]?.char).toEqual({
      kind: 'object',
      relation: 'reference',
      targets: ['Tag'],
      array: true,
    })
    expect(model.edges).toContainEqual({
      source: 'Method',
      target: 'Tag',
      relation: 'reference',
      fieldName: 'tags',
    })
  })

  // --- Structural portable text ---
  // Portable text whose `of` contains `block` plus at least one class-able
  // type (named class, reference) is promoted to its own class. The
  // synthetic `+block: PortableText [0..*]` field represents the prose
  // content; each non-block embed becomes a field with a composition or
  // reference edge. See ADR 0001.

  it('promotes a named portable-text alias with structural embeds to a class', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'body', type: 'bodyPortableText'}],
      },
      {name: 'bodyPortableText', type: 'array', of: [{type: 'block'}, {type: 'bodyImage'}]},
      {name: 'bodyImage', type: 'object', fields: [{name: 'caption', type: 'string'}]},
    ]
    const model = walk(types)
    expect(model.classes.map((c) => c.name)).toContain('BodyPortableText')
    const bpt = model.classes.find((c) => c.name === 'BodyPortableText')
    expect(bpt?.stereotype).toBe('object')
    expect(bpt?.origin).toBe('portableText')
  })

  it('gives a structural-portable-text class a synthetic `+block: PortableText [0..*]` field first', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'body', type: 'bodyPortableText'}],
      },
      {name: 'bodyPortableText', type: 'array', of: [{type: 'block'}, {type: 'bodyImage'}]},
      {name: 'bodyImage', type: 'object', fields: []},
    ]
    const model = walk(types)
    const bpt = model.classes.find((c) => c.name === 'BodyPortableText')
    expect(bpt?.fields[0]).toEqual({
      name: 'block',
      char: {kind: 'portableText'},
      cardinality: {min: 0, max: '*'},
      hasCustomMarker: false,
    })
  })

  it('gives a structural-portable-text class a field per non-block class-able embed', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'body', type: 'bodyPortableText'}],
      },
      {name: 'bodyPortableText', type: 'array', of: [{type: 'block'}, {type: 'bodyImage'}]},
      {name: 'bodyImage', type: 'object', fields: []},
    ]
    const model = walk(types)
    const bpt = model.classes.find((c) => c.name === 'BodyPortableText')
    expect(bpt?.fields.map((f) => f.name)).toEqual(['block', 'bodyImage'])
    const bodyImageField = bpt?.fields.find((f) => f.name === 'bodyImage')
    expect(bodyImageField?.char).toEqual({
      kind: 'object',
      target: 'BodyImage',
      relation: 'composition',
      array: true,
    })
  })

  it('emits a composition edge from a field referencing a structural portable text alias to the alias class', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'body', type: 'bodyPortableText'}],
      },
      {name: 'bodyPortableText', type: 'array', of: [{type: 'block'}, {type: 'bodyImage'}]},
      {name: 'bodyImage', type: 'object', fields: []},
    ]
    const model = walk(types)
    const method = model.classes.find((c) => c.name === 'Method')
    expect(method?.fields[0]?.char).toEqual({
      kind: 'object',
      target: 'BodyPortableText',
      relation: 'composition',
      array: false,
    })
    expect(model.edges).toContainEqual({
      source: 'Method',
      target: 'BodyPortableText',
      relation: 'composition',
      fieldName: 'body',
    })
  })

  it('emits a composition edge from the structural portable text class to each structural embed', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'body', type: 'bodyPortableText'}],
      },
      {name: 'bodyPortableText', type: 'array', of: [{type: 'block'}, {type: 'bodyImage'}]},
      {name: 'bodyImage', type: 'object', fields: []},
    ]
    const model = walk(types)
    expect(model.edges).toContainEqual({
      source: 'BodyPortableText',
      target: 'BodyImage',
      relation: 'composition',
      fieldName: 'bodyImage',
    })
  })

  it('does NOT promote block-only portable text aliases to a class', () => {
    // A named alias with `of: [{type: 'block'}]` only has no structural
    // content to surface — it stays as a scalar PortableText label on
    // fields that reference it.
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'overview', type: 'pureBody'}],
      },
      {name: 'pureBody', type: 'array', of: [{type: 'block'}]},
    ]
    const model = walk(types)
    expect(model.classes.map((c) => c.name)).not.toContain('PureBody')
    const method = model.classes.find((c) => c.name === 'Method')
    expect(method?.fields[0]?.char).toEqual({kind: 'portableText'})
  })

  it('promotes inline portable text with structural embeds to an anonymous class', () => {
    // Inline `{type: 'array', of: [{type: 'block'}, {type: 'bodyImage'}]}`
    // gets the inline-class naming policy: bare pascalCase of the field
    // name unless it collides.
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'notes', type: 'array', of: [{type: 'block'}, {type: 'bodyImage'}]}],
      },
      {name: 'bodyImage', type: 'object', fields: []},
    ]
    const model = walk(types)
    expect(model.classes.map((c) => c.name)).toContain('Notes')
    const notes = model.classes.find((c) => c.name === 'Notes')
    expect(notes?.origin).toBe('portableText')
    expect(notes?.fields.map((f) => f.name)).toEqual(['block', 'bodyImage'])
  })

  it('disambiguates two structural portable-text fields sharing a name, with a warning', () => {
    // Two documents each declaring a `body` structural PT field both derive the
    // class name `Body`; left alone they would silently merge into one box in
    // Mermaid. They are distinct objects, so each is qualified by its parent
    // (`Body_Article` / `Body_Page`) and the collision is flagged as a
    // potential issue (issue #23 — display as-created, then call it out).
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [{name: 'body', type: 'array', of: [{type: 'block'}, {type: 'calloutBox'}]}],
      },
      {
        name: 'page',
        type: 'document',
        fields: [{name: 'body', type: 'array', of: [{type: 'block'}, {type: 'calloutBox'}]}],
      },
      {name: 'calloutBox', type: 'object', fields: [{name: 'tone', type: 'string'}]},
    ]
    const model = walk(types)
    const ptClasses = model.classes
      .filter((c) => c.origin === 'portableText')
      .map((c) => c.name)
      .sort()
    expect(ptClasses).toEqual(['Body_Article', 'Body_Page'])
    expect(model.edges).toContainEqual({
      source: 'Article',
      target: 'Body_Article',
      relation: 'composition',
      fieldName: 'body',
    })
    expect(model.edges).toContainEqual({
      source: 'Page',
      target: 'Body_Page',
      relation: 'composition',
      fieldName: 'body',
    })
    expect(model.warnings.some((w) => w.includes("'body'"))).toBe(true)
  })

  it('keeps inline block-only portable text as scalar PortableText, no class', () => {
    const types = [
      {
        name: 'method',
        type: 'document',
        fields: [{name: 'overview', type: 'array', of: [{type: 'block'}]}],
      },
    ]
    const model = walk(types)
    expect(model.classes.map((c) => c.name)).toEqual(['Method'])
    const method = model.classes[0]
    expect(method?.fields[0]?.char).toEqual({kind: 'portableText'})
  })

  // --- Portable Text inline embeds (block.of + marks.annotations) ---
  // An embed of a Portable Text array can live in three places: a top-level
  // non-block member (block-level inserts), a `block` member's own `of`
  // (inline objects within the text), or a `block` member's
  // `marks.annotations` (span annotations). All three connect to the
  // portable-text class identically — composition for objects, association
  // for references — and inline-declared objects/annotations get their own
  // `origin: 'inline'` class under the inline naming policy. See issue #2.

  it('edges a named inline object nested in a block `of` to the portable-text class', () => {
    // The reported bug: inlineHighlight lives in the block's `of`, alongside a
    // block-level calloutBox. Previously the block was skipped wholesale, so
    // inlineHighlight rendered as an orphan class with no edge.
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [
          {
            name: 'body',
            type: 'array',
            of: [{type: 'block', of: [{type: 'inlineHighlight'}]}, {type: 'calloutBox'}],
          },
        ],
      },
      {name: 'inlineHighlight', type: 'object', fields: [{name: 'text', type: 'string'}]},
      {name: 'calloutBox', type: 'object', fields: [{name: 'tone', type: 'string'}]},
    ]
    const model = walk(types)
    const body = model.classes.find((c) => c.name === 'Body')
    expect(body?.origin).toBe('portableText')
    expect(body?.fields.map((f) => f.name)).toEqual(['block', 'inlineHighlight', 'calloutBox'])
    expect(model.edges).toContainEqual({
      source: 'Body',
      target: 'InlineHighlight',
      relation: 'composition',
      fieldName: 'inlineHighlight',
    })
    // The two-hop relationship from the document still holds.
    expect(model.edges).toContainEqual({
      source: 'Article',
      target: 'Body',
      relation: 'composition',
      fieldName: 'body',
    })
  })

  it('promotes a block-only PT field to a class when its block `of` has an inline object', () => {
    // No top-level embed, only an inline object in the block — still enough to
    // promote, otherwise the inline object would orphan.
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [
          {name: 'body', type: 'array', of: [{type: 'block', of: [{type: 'inlineHighlight'}]}]},
        ],
      },
      {name: 'inlineHighlight', type: 'object', fields: [{name: 'text', type: 'string'}]},
    ]
    const model = walk(types)
    const body = model.classes.find((c) => c.name === 'Body')
    expect(body?.origin).toBe('portableText')
    expect(model.edges).toContainEqual({
      source: 'Body',
      target: 'InlineHighlight',
      relation: 'composition',
      fieldName: 'inlineHighlight',
    })
  })

  it('handles a reference nested in a block `of` as an association edge', () => {
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [
          {
            name: 'body',
            type: 'array',
            of: [{type: 'block', of: [{type: 'reference', to: [{type: 'author'}]}]}],
          },
        ],
      },
      {name: 'author', type: 'document', fields: [{name: 'name', type: 'string'}]},
    ]
    const model = walk(types)
    expect(model.edges).toContainEqual({
      source: 'Body',
      target: 'Author',
      relation: 'reference',
      fieldName: 'author',
    })
  })

  it('edges a named annotation object to the portable-text class', () => {
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [
          {
            name: 'body',
            type: 'array',
            of: [{type: 'block', marks: {annotations: [{type: 'footnote'}]}}],
          },
        ],
      },
      {name: 'footnote', type: 'object', fields: [{name: 'text', type: 'string'}]},
    ]
    const model = walk(types)
    expect(model.edges).toContainEqual({
      source: 'Body',
      target: 'Footnote',
      relation: 'composition',
      fieldName: 'footnote',
    })
  })

  it('names a named-type embed field by its member name, not its type', () => {
    // A named type embedded under a member name of its own (`{name: 'pre',
    // type: 'code'}` — the @sanity/code-input case) should surface as a field
    // named `pre` (the author's chosen name), not `code` (the type name). The
    // edge still targets the type's class (`Code`). Without a member name the
    // field falls back to the type, so `{type: 'bodyImage'}` stays `bodyImage`.
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [{name: 'body', type: 'array', of: [{type: 'block'}, {name: 'pre', type: 'code'}]}],
      },
      {name: 'code', type: 'object', fields: [{name: 'language', type: 'string'}]},
    ]
    const model = walk(types)
    const body = model.classes.find((c) => c.name === 'Body')
    expect(body?.fields.map((f) => f.name)).toEqual(['block', 'pre'])
    expect(body?.fields.find((f) => f.name === 'pre')?.char).toEqual({
      kind: 'object',
      target: 'Code',
      relation: 'composition',
      array: true,
    })
    expect(model.edges).toContainEqual({
      source: 'Body',
      target: 'Code',
      relation: 'composition',
      fieldName: 'pre',
    })
  })

  it('emits an inline-declared annotation as an origin:"inline" class with a composition edge', () => {
    // The canonical real-world case: a `link` annotation declared inline.
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [
          {
            name: 'body',
            type: 'array',
            of: [
              {
                type: 'block',
                marks: {
                  annotations: [
                    {name: 'link', type: 'object', fields: [{name: 'href', type: 'url'}]},
                  ],
                },
              },
            ],
          },
        ],
      },
    ]
    const model = walk(types)
    const link = model.classes.find((c) => c.name === 'Link')
    expect(link?.origin).toBe('inline')
    expect(link?.fields.map((f) => f.name)).toEqual(['href'])
    expect(model.edges).toContainEqual({
      source: 'Body',
      target: 'Link',
      relation: 'composition',
      fieldName: 'link',
    })
  })

  it('emits an inline-declared object nested in block `of` as an origin:"inline" class', () => {
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [
          {
            name: 'body',
            type: 'array',
            of: [
              {
                type: 'block',
                of: [{name: 'mention', type: 'object', fields: [{name: 'handle', type: 'string'}]}],
              },
            ],
          },
        ],
      },
    ]
    const model = walk(types)
    const mention = model.classes.find((c) => c.name === 'Mention')
    expect(mention?.origin).toBe('inline')
    expect(model.edges).toContainEqual({
      source: 'Body',
      target: 'Mention',
      relation: 'composition',
      fieldName: 'mention',
    })
  })

  it('emits a top-level inline-declared object in a PT `of` as an origin:"inline" class', () => {
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [
          {
            name: 'body',
            type: 'array',
            of: [
              {type: 'block'},
              {name: 'pullQuote', type: 'object', fields: [{name: 'quote', type: 'string'}]},
            ],
          },
        ],
      },
    ]
    const model = walk(types)
    const pq = model.classes.find((c) => c.name === 'PullQuote')
    expect(pq?.origin).toBe('inline')
    expect(model.edges).toContainEqual({
      source: 'Body',
      target: 'PullQuote',
      relation: 'composition',
      fieldName: 'pullQuote',
    })
  })

  it('promotes an inline image embed with its own fields to an origin:"inline" class', () => {
    // An inline image declared in a PT array with authored sub-fields is
    // class-able, exactly like an inline image *field* (issue #9). It must be
    // promoted — not silently dropped just because `image` is an intrinsic
    // primitive type (the issue #23 bug). Synthetic `asset` leads, then the
    // authored sub-fields; the relationship is two-hop (Article *-- Body *-- it).
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [
          {
            name: 'body',
            type: 'array',
            of: [
              {type: 'block'},
              {name: 'bodyImage', type: 'image', fields: [{name: 'altText', type: 'string'}]},
            ],
          },
        ],
      },
    ]
    const model = walk(types)
    const bodyImage = model.classes.find((c) => c.name === 'BodyImage')
    expect(bodyImage?.origin).toBe('inline')
    expect(bodyImage?.fields.map((f) => f.name)).toEqual(['asset', 'altText'])
    expect(bodyImage?.fields[0]?.char).toEqual({kind: 'primitive', prim: 'url', array: false})
    expect(model.edges).toContainEqual({
      source: 'Body',
      target: 'BodyImage',
      relation: 'composition',
      fieldName: 'bodyImage',
    })
    expect(model.edges).toContainEqual({
      source: 'Article',
      target: 'Body',
      relation: 'composition',
      fieldName: 'body',
    })
  })

  it('names a nameless inline image embed by its type (the issue #23 shape)', () => {
    // A nameless `{type: 'image', fields: [...]}` member has no member name, so
    // both the field and class fall back to the type name `image` → `Image`.
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [
          {
            name: 'body',
            type: 'array',
            of: [{type: 'block'}, {type: 'image', fields: [{name: 'altText', type: 'string'}]}],
          },
        ],
      },
    ]
    const model = walk(types)
    expect(model.classes.find((c) => c.name === 'Image')?.origin).toBe('inline')
    const body = model.classes.find((c) => c.name === 'Body')
    expect(body?.fields.map((f) => f.name)).toEqual(['block', 'image'])
    expect(model.edges).toContainEqual({
      source: 'Body',
      target: 'Image',
      relation: 'composition',
      fieldName: 'image',
    })
  })

  it('promotes an inline file embed with its own fields to an origin:"inline" class', () => {
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [
          {
            name: 'body',
            type: 'array',
            of: [
              {type: 'block'},
              {name: 'attachment', type: 'file', fields: [{name: 'label', type: 'string'}]},
            ],
          },
        ],
      },
    ]
    const model = walk(types)
    const attachment = model.classes.find((c) => c.name === 'Attachment')
    expect(attachment?.origin).toBe('inline')
    expect(attachment?.fields.map((f) => f.name)).toEqual(['asset', 'label'])
  })

  it('promotes a PT with a bare inline image embed, showing it as a scalar leaf field', () => {
    // A fields-less inline image isn't class-able, but it's authored content the
    // body can hold, so it makes the PT structural and surfaces as a scalar
    // `image` leaf field (no class, no edge) — like a bare image field elsewhere.
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [{name: 'body', type: 'array', of: [{type: 'block'}, {type: 'image'}]}],
      },
    ]
    const model = walk(types)
    const body = model.classes.find((c) => c.name === 'Body')
    expect(body?.origin).toBe('portableText')
    expect(body?.fields.map((f) => f.name)).toEqual(['block', 'image'])
    expect(body?.fields.find((f) => f.name === 'image')?.char).toEqual({
      kind: 'primitive',
      prim: 'image',
      array: true,
    })
    // The bare image is a leaf — no composition/reference edge for it.
    expect(model.edges.some((e) => e.source === 'Body' && e.fieldName === 'image')).toBe(false)
    // The body itself still composes in from its document.
    expect(model.edges).toContainEqual({
      source: 'Article',
      target: 'Body',
      relation: 'composition',
      fieldName: 'body',
    })
  })

  it('shows a bare inline image embed as a leaf field alongside class-able embeds', () => {
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [
          {
            name: 'body',
            type: 'array',
            of: [
              {type: 'block'},
              {type: 'calloutBox'},
              {name: 'minimalInlineImage', type: 'image'},
            ],
          },
        ],
      },
      {name: 'calloutBox', type: 'object', fields: [{name: 'tone', type: 'string'}]},
    ]
    const model = walk(types)
    const body = model.classes.find((c) => c.name === 'Body')
    expect(body?.fields.map((f) => f.name)).toEqual(['block', 'calloutBox', 'minimalInlineImage'])
    expect(body?.fields.find((f) => f.name === 'minimalInlineImage')?.char).toEqual({
      kind: 'primitive',
      prim: 'image',
      array: true,
    })
    // calloutBox composes in; the bare image leaf gets no edge.
    expect(model.edges).toContainEqual({
      source: 'Body',
      target: 'CalloutBox',
      relation: 'composition',
      fieldName: 'calloutBox',
    })
    expect(model.edges.some((e) => e.fieldName === 'minimalInlineImage')).toBe(false)
  })

  it('collects embeds from all three positions into one portable-text class', () => {
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [
          {
            name: 'body',
            type: 'array',
            of: [
              {
                type: 'block',
                of: [{type: 'inlineHighlight'}],
                marks: {
                  annotations: [
                    {name: 'link', type: 'object', fields: [{name: 'href', type: 'url'}]},
                  ],
                },
              },
              {type: 'calloutBox'},
            ],
          },
        ],
      },
      {name: 'inlineHighlight', type: 'object', fields: [{name: 'text', type: 'string'}]},
      {name: 'calloutBox', type: 'object', fields: [{name: 'tone', type: 'string'}]},
    ]
    const model = walk(types)
    const body = model.classes.find((c) => c.name === 'Body')
    // block (synthetic) first; then embeds in `of` order: block's inline `of`,
    // then its annotations, then the top-level calloutBox.
    expect(body?.fields.map((f) => f.name)).toEqual([
      'block',
      'inlineHighlight',
      'link',
      'calloutBox',
    ])
    const targets = model.edges.filter((e) => e.source === 'Body').map((e) => e.target)
    expect(targets).toEqual(expect.arrayContaining(['InlineHighlight', 'Link', 'CalloutBox']))
  })

  it('dedupes a type embedded under multiple block members', () => {
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [
          {
            name: 'body',
            type: 'array',
            of: [
              {type: 'block', of: [{type: 'inlineHighlight'}]},
              {type: 'block', of: [{type: 'inlineHighlight'}]},
            ],
          },
        ],
      },
      {name: 'inlineHighlight', type: 'object', fields: [{name: 'text', type: 'string'}]},
    ]
    const model = walk(types)
    const body = model.classes.find((c) => c.name === 'Body')
    expect(body?.fields.filter((f) => f.name === 'inlineHighlight')).toHaveLength(1)
    expect(
      model.edges.filter((e) => e.source === 'Body' && e.target === 'InlineHighlight'),
    ).toHaveLength(1)
  })

  it('disambiguates inline-declared PT objects sharing a name across documents', () => {
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [
          {
            name: 'body',
            type: 'array',
            of: [
              {
                type: 'block',
                of: [{name: 'footnote', type: 'object', fields: [{name: 'text', type: 'string'}]}],
              },
            ],
          },
        ],
      },
      {
        name: 'note',
        type: 'document',
        fields: [
          {
            name: 'content',
            type: 'array',
            of: [
              {
                type: 'block',
                of: [{name: 'footnote', type: 'object', fields: [{name: 'text', type: 'string'}]}],
              },
            ],
          },
        ],
      },
    ]
    const model = walk(types)
    const names = model.classes.map((c) => c.name)
    expect(names).toContain('Footnote_Body')
    expect(names).toContain('Footnote_Content')
    expect(names).not.toContain('Footnote')
    expect(model.warnings.some((w) => /footnote/i.test(w))).toBe(true)
  })

  it('leaves bare block-only portable text as a scalar even with empty marks/of', () => {
    // A plain block with no authored inline objects or annotations must not
    // promote — guards against accidentally treating Sanity default marks
    // (which live only in the compiled schema, not _original) as embeds.
    const types = [
      {
        name: 'article',
        type: 'document',
        fields: [{name: 'body', type: 'array', of: [{type: 'block'}]}],
      },
    ]
    const model = walk(types)
    expect(model.classes.map((c) => c.name)).toEqual(['Article'])
    expect(model.classes[0]?.fields[0]?.char).toEqual({kind: 'portableText'})
  })

  // Inline image/file fields use the intrinsic `image`/`file` type directly
  // (`{name: 'avatar', type: 'image'}`) rather than referencing a named
  // top-level type. A *bare* one is a scalar leaf — the field holds an asset,
  // not an object the author defined — so it renders as `avatar: image [0..1]`
  // with no class and no edge. Only an inline image/file carrying its OWN
  // authored sub-fields (alt/caption) is promoted to an `origin: 'inline'`
  // class (with the synthetic `asset: url` lead + those fields) and a
  // composition edge. A *named* image/file type stays a class regardless. See
  // issue #9.
  describe('inline image and file fields', () => {
    it('characterises a bare inline image field as a scalar `image` leaf', () => {
      const types = [{name: 'author', type: 'document', fields: [{name: 'avatar', type: 'image'}]}]
      const model = walk(types)
      // No class is emitted for the image itself.
      expect(model.classes.map((c) => c.name)).toEqual(['Author'])
      const avatar = model.classes[0]?.fields.find((f) => f.name === 'avatar')
      expect(avatar?.char).toEqual({kind: 'primitive', prim: 'image', array: false})
      expect(avatar?.cardinality).toEqual({min: 0, max: 1})
    })

    it('characterises a bare inline file field as a scalar `file` leaf', () => {
      const types = [
        {name: 'release', type: 'document', fields: [{name: 'download', type: 'file'}]},
      ]
      const model = walk(types)
      expect(model.classes.map((c) => c.name)).toEqual(['Release'])
      const download = model.classes[0]?.fields.find((f) => f.name === 'download')
      expect(download?.char).toEqual({kind: 'primitive', prim: 'file', array: false})
      expect(download?.cardinality).toEqual({min: 0, max: 1})
    })

    it('emits no class or edge for a bare inline image', () => {
      const types = [{name: 'author', type: 'document', fields: [{name: 'avatar', type: 'image'}]}]
      const model = walk(types)
      expect(model.classes).toHaveLength(1)
      expect(model.edges).toEqual([])
    })

    it('characterises an array of bare inline images as a scalar `image` leaf with array cardinality', () => {
      const types = [
        {
          name: 'article',
          type: 'document',
          fields: [{name: 'gallery', type: 'array', of: [{type: 'image'}]}],
        },
      ]
      const model = walk(types)
      expect(model.classes.map((c) => c.name)).toEqual(['Article'])
      const gallery = model.classes[0]?.fields.find((f) => f.name === 'gallery')
      expect(gallery?.char).toEqual({kind: 'primitive', prim: 'image', array: true})
      expect(gallery?.cardinality).toEqual({min: 0, max: '*'})
    })

    it('honours required validation on a bare inline image leaf', () => {
      const types = [
        {
          name: 'author',
          type: 'document',
          fields: [{name: 'avatar', type: 'image', validation: (rule: any) => rule.required()}],
        },
      ]
      const model = walk(types)
      const avatar = model.classes[0]?.fields.find((f) => f.name === 'avatar')
      expect(avatar?.cardinality).toEqual({min: 1, max: 1})
    })

    it('ignores image-internal hotspot/crop/media when deciding a bare image stays scalar', () => {
      const types = [
        {
          name: 'author',
          type: 'document',
          fields: [
            {
              name: 'avatar',
              type: 'image',
              fields: [
                {name: 'hotspot', type: 'object', fields: []},
                {name: 'crop', type: 'object', fields: []},
                {name: 'media', type: 'reference', to: [{type: 'sanity.imageAsset'}]},
              ],
            },
          ],
        },
      ]
      const model = walk(types)
      // Only internals declared → no authored fields → still a scalar leaf.
      expect(model.classes.map((c) => c.name)).toEqual(['Author'])
      const avatar = model.classes[0]?.fields.find((f) => f.name === 'avatar')
      expect(avatar?.char).toEqual({kind: 'primitive', prim: 'image', array: false})
    })

    it('promotes an inline image with authored sub-fields to an origin:"inline" class', () => {
      const types = [
        {
          name: 'author',
          type: 'document',
          fields: [
            {
              name: 'avatar',
              type: 'image',
              fields: [
                {name: 'alt', type: 'string'},
                {name: 'caption', type: 'string'},
              ],
            },
          ],
        },
      ]
      const model = walk(types)
      const avatar = model.classes.find((c) => c.name === 'Avatar')
      expect(avatar?.stereotype).toBe('object')
      expect(avatar?.origin).toBe('inline')
      // Synthetic asset leads, then authored fields in declaration order.
      expect(avatar?.fields.map((f) => f.name)).toEqual(['asset', 'alt', 'caption'])
      expect(avatar?.fields[0]?.char).toEqual({kind: 'primitive', prim: 'url', array: false})
      // The parent's field is a composition to the promoted class.
      const field = model.classes
        .find((c) => c.name === 'Author')
        ?.fields.find((f) => f.name === 'avatar')
      expect(field?.char).toEqual({
        kind: 'object',
        target: 'Avatar',
        relation: 'composition',
        array: false,
      })
      expect(model.edges).toContainEqual({
        source: 'Author',
        target: 'Avatar',
        relation: 'composition',
        fieldName: 'avatar',
      })
    })

    it('skips hotspot/crop/media on a promoted inline image, keeping authored fields', () => {
      const types = [
        {
          name: 'author',
          type: 'document',
          fields: [
            {
              name: 'avatar',
              type: 'image',
              fields: [
                {name: 'alt', type: 'string'},
                {name: 'hotspot', type: 'object', fields: []},
                {name: 'crop', type: 'object', fields: []},
                {name: 'media', type: 'reference', to: [{type: 'sanity.imageAsset'}]},
              ],
            },
          ],
        },
      ]
      const model = walk(types)
      const avatar = model.classes.find((c) => c.name === 'Avatar')
      expect(avatar?.fields.map((f) => f.name)).toEqual(['asset', 'alt'])
    })

    it('promotes an array of inline images with sub-fields to a class with array cardinality', () => {
      const types = [
        {
          name: 'article',
          type: 'document',
          fields: [
            {
              name: 'gallery',
              type: 'array',
              of: [{type: 'image', fields: [{name: 'alt', type: 'string'}]}],
            },
          ],
        },
      ]
      const model = walk(types)
      const gallery = model.classes.find((c) => c.name === 'Gallery')
      expect(gallery?.origin).toBe('inline')
      expect(gallery?.fields.map((f) => f.name)).toEqual(['asset', 'alt'])
      const field = model.classes
        .find((c) => c.name === 'Article')
        ?.fields.find((f) => f.name === 'gallery')
      expect(field?.char).toEqual({
        kind: 'object',
        target: 'Gallery',
        relation: 'composition',
        array: true,
      })
      expect(field?.cardinality).toEqual({min: 0, max: '*'})
    })

    it('promotes an inline file with authored sub-fields to an origin:"inline" class', () => {
      const types = [
        {
          name: 'release',
          type: 'document',
          fields: [{name: 'download', type: 'file', fields: [{name: 'label', type: 'string'}]}],
        },
      ]
      const model = walk(types)
      const download = model.classes.find((c) => c.name === 'Download')
      expect(download?.origin).toBe('inline')
      expect(download?.fields.map((f) => f.name)).toEqual(['asset', 'label'])
      expect(model.edges).toContainEqual({
        source: 'Release',
        target: 'Download',
        relation: 'composition',
        fieldName: 'download',
      })
    })

    it('disambiguates two promoted inline images sharing a field name by qualifying both with their parent', () => {
      const types = [
        {
          name: 'author',
          type: 'document',
          fields: [{name: 'image', type: 'image', fields: [{name: 'alt', type: 'string'}]}],
        },
        {
          name: 'article',
          type: 'document',
          fields: [{name: 'image', type: 'image', fields: [{name: 'caption', type: 'string'}]}],
        },
      ]
      const model = walk(types)
      const classNames = model.classes.map((c) => c.name).sort()
      expect(classNames).toEqual(['Article', 'Author', 'Image_Article', 'Image_Author'])
      expect(model.edges).toContainEqual({
        source: 'Author',
        target: 'Image_Author',
        relation: 'composition',
        fieldName: 'image',
      })
      expect(model.edges).toContainEqual({
        source: 'Article',
        target: 'Image_Article',
        relation: 'composition',
        fieldName: 'image',
      })
    })

    it('keeps a named image type used as a field as a composition to its own class', () => {
      const types = [
        {
          name: 'article',
          type: 'document',
          fields: [{name: 'hero', type: 'heroImage'}],
        },
        {name: 'heroImage', type: 'image', fields: [{name: 'alt', type: 'string'}]},
      ]
      const model = walk(types)
      const heroImage = model.classes.find((c) => c.name === 'HeroImage')
      expect(heroImage?.origin).toBe('image')
      const field = model.classes
        .find((c) => c.name === 'Article')
        ?.fields.find((f) => f.name === 'hero')
      expect(field?.char).toEqual({
        kind: 'object',
        target: 'HeroImage',
        relation: 'composition',
        array: false,
      })
      expect(model.edges).toContainEqual({
        source: 'Article',
        target: 'HeroImage',
        relation: 'composition',
        fieldName: 'hero',
      })
    })
  })
})
