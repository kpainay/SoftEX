import { describe, expect, it } from 'vitest';
import { scheduleLabel } from './TeamCheckins';

describe('check-in schedule label', () => {
  it('names the days plainly', () => {
    const at = (days: number[]) => scheduleLabel({ days, time: '09:30', enabled: true }).replace(/ at .*/, '');
    expect(at([1, 2, 3, 4, 5])).toBe('Weekdays');
    expect(at([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(at([3])).toBe('Every Wed');
    // Monday first, Sunday last.
    expect(at([0, 5, 1])).toBe('Mon, Fri and Sun');
  });
});
