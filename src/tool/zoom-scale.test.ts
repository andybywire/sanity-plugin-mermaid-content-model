import {describe, expect, it} from 'vitest'

import {maxScaleFor, MIN_SCALE} from './zoom-scale'

describe('maxScaleFor', () => {
  it('floors small diagrams so they cannot zoom in to unreasonable closeness (issue #24)', () => {
    expect(maxScaleFor(0)).toBe(6)
    expect(maxScaleFor(3)).toBe(6)
    expect(maxScaleFor(4)).toBe(6) // 4 * 1.25 = 5, floored to 6
  })

  it('scales with class count through the mid-range (≈ the previous fixed 15x near 12 classes)', () => {
    expect(maxScaleFor(12)).toBe(15)
    expect(maxScaleFor(20)).toBe(25)
    expect(maxScaleFor(30)).toBe(38) // round(37.5)
  })

  it('caps very large diagrams so zoom stays bounded', () => {
    expect(maxScaleFor(40)).toBe(40) // 50 capped to 40
    expect(maxScaleFor(200)).toBe(40)
  })

  it('is non-decreasing in class count', () => {
    for (let n = 1; n < 60; n++) {
      expect(maxScaleFor(n + 1)).toBeGreaterThanOrEqual(maxScaleFor(n))
    }
  })

  it('never returns below the minimum scale', () => {
    expect(maxScaleFor(0)).toBeGreaterThanOrEqual(MIN_SCALE)
  })
})
