import { describe, it, expect } from 'vitest'
import { widgetCapForTier, ceilingCentsForTier } from '../entitlements'

describe('widgetCapForTier', () => {
  it('caps each tier per the pricing plan', () => {
    expect(widgetCapForTier('none')).toBe(0)
    expect(widgetCapForTier('starter')).toBe(15)
    expect(widgetCapForTier('plus')).toBe(40)
    expect(widgetCapForTier('pro')).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('ceilingCentsForTier', () => {
  it('starter scales $5 per active location', () => {
    expect(ceilingCentsForTier('starter', 1)).toBe(500)
    expect(ceilingCentsForTier('starter', 3)).toBe(1500)
  })

  it('treats zero/garbage location counts as at least one', () => {
    expect(ceilingCentsForTier('starter', 0)).toBe(500)
  })

  it('plus and pro are flat org-wide pools', () => {
    expect(ceilingCentsForTier('plus', 5)).toBe(1200)
    expect(ceilingCentsForTier('pro', 5)).toBe(2500)
  })

  it('base (no add-on) keeps the $3 pool for onboarding imports', () => {
    expect(ceilingCentsForTier('none', 4)).toBe(300)
  })
})
