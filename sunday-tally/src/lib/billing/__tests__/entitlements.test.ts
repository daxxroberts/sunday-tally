import { describe, it, expect } from 'vitest'
import { widgetCapForTier, ceilingCentsForTier } from '../entitlements'

describe('widgetCapForTier', () => {
  it('caps each tier per the pricing plan', () => {
    expect(widgetCapForTier('none')).toBe(0)
    expect(widgetCapForTier('starter')).toBe(15)
    expect(widgetCapForTier('plus')).toBe(40)
    expect(widgetCapForTier('pro')).toBe(120)
  })
})

describe('ceilingCentsForTier', () => {
  it('is a flat 15% of the plan price, independent of location count', () => {
    expect(ceilingCentsForTier('starter', 1)).toBe(435) // $29 × 15%
    expect(ceilingCentsForTier('starter', 3)).toBe(435) // same regardless of campuses
  })

  it('treats zero/garbage location counts the same (location-independent)', () => {
    expect(ceilingCentsForTier('starter', 0)).toBe(435)
  })

  it('plus and pro are flat 15%-of-plan org-wide pools', () => {
    expect(ceilingCentsForTier('plus', 5)).toBe(885)  // $59 × 15%
    expect(ceilingCentsForTier('pro', 5)).toBe(1485)  // $99 × 15%
  })

  it('base (no add-on) keeps the $3 pool for onboarding imports', () => {
    expect(ceilingCentsForTier('none', 4)).toBe(300)
  })
})
