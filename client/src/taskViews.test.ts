import { describe, expect, it } from 'vitest';
import { cleanFilters, describeFilters, filtersToQuery, hasFilters, sameFilters } from './taskViews';

describe('task view filters', () => {
  it('drops empty values', () => {
    expect(cleanFilters({ ownerId: '', statuses: [], priorities: ['high'], q: '  ' })).toEqual({ priorities: ['high'] });
    expect(hasFilters({ statuses: [], q: ' ' })).toBe(false);
    expect(hasFilters({ due: 'today' })).toBe(true);
  });

  it('turns filters into the task list query', () => {
    expect(filtersToQuery({})).toBe('');
    expect(filtersToQuery({ ownerId: 'me', priorities: ['urgent', 'high'], due: 'overdue', q: 'launch deck' })).toBe(
      '?ownerId=me&priorities=urgent%2Chigh&due=overdue&q=launch+deck',
    );
  });

  it('compares regardless of order and empty fields', () => {
    expect(sameFilters({ priorities: ['high', 'urgent'], statuses: [] }, { priorities: ['urgent', 'high'] })).toBe(true);
    expect(sameFilters({ priorities: ['high'] }, { priorities: ['high'], due: 'today' })).toBe(false);
  });

  it('reads as a short sentence', () => {
    const people = new Map([['u1', 'Maya Singh']]);
    const projects = new Map([['p1', 'Brand refresh']]);
    expect(describeFilters({})).toBe('All tasks');
    expect(describeFilters({ ownerId: 'me', priorities: ['urgent', 'high'], due: 'overdue' })).toBe('Mine · Urgent or High · Overdue');
    expect(describeFilters({ ownerId: 'u1', statuses: ['blocked'], projectId: 'p1', q: 'logo' }, { people, projects })).toBe('Maya Singh · Blocked · Brand refresh · “logo”');
    expect(describeFilters({ ownerId: 'none' })).toBe('Unassigned');
  });
});
