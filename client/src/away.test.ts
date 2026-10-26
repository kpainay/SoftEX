import { describe, expect, it } from 'vitest';
import { awayLater, isAway } from './away';

describe('out of office', () => {
  it('counts both the first and the last day', () => {
    const p = { ooo_from: '2026-11-10', ooo_until: '2026-11-14' };
    expect(isAway(p, '2026-11-09')).toBe(false);
    expect(isAway(p, '2026-11-10')).toBe(true);
    expect(isAway(p, '2026-11-14')).toBe(true);
    expect(isAway(p, '2026-11-15')).toBe(false);
    expect(awayLater(p, '2026-11-09')).toBe(true);
    expect(awayLater(p, '2026-11-10')).toBe(false);
  });

  it('starts now when there is no first day, and is off without a last day', () => {
    expect(isAway({ ooo_until: '2026-11-14' }, '2026-01-01')).toBe(true);
    expect(isAway({ ooo_from: '2026-11-10', ooo_until: null }, '2026-11-11')).toBe(false);
    expect(isAway(null)).toBe(false);
  });
});
