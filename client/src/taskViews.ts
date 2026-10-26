/**
 * Saved task views: a named set of filters ("Urgent design work, overdue") kept per person and shown as tabs
 * on My work. The same keys go to GET /api/tasks as a query string.
 */

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type DueFilter = 'overdue' | 'today' | 'week' | 'later' | 'none';

export interface TaskFilters {
  /** A person's id, "me", or "none" for unassigned. */
  ownerId?: string;
  statuses?: TaskStatus[];
  priorities?: TaskPriority[];
  due?: DueFilter;
  projectId?: string;
  teamId?: string;
  labelId?: string;
  q?: string;
}

export interface SavedView {
  id: string;
  name: string;
  filters: TaskFilters;
  position: number;
  created_at: string;
}

export const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'review', label: 'In review' },
  { value: 'done', label: 'Done' },
];
export const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];
export const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'later', label: 'Later' },
  { value: 'none', label: 'No date' },
];

/** The filters without empty values, so "nothing chosen" and "chosen then cleared" compare equal. */
export function cleanFilters(f: TaskFilters): TaskFilters {
  const out: TaskFilters = {};
  if (f.ownerId) out.ownerId = f.ownerId;
  if (f.statuses?.length) out.statuses = [...f.statuses];
  if (f.priorities?.length) out.priorities = [...f.priorities];
  if (f.due) out.due = f.due;
  if (f.projectId) out.projectId = f.projectId;
  if (f.teamId) out.teamId = f.teamId;
  if (f.labelId) out.labelId = f.labelId;
  if (f.q?.trim()) out.q = f.q.trim();
  return out;
}

export const hasFilters = (f: TaskFilters) => Object.keys(cleanFilters(f)).length > 0;

export function sameFilters(a: TaskFilters, b: TaskFilters) {
  const norm = (f: TaskFilters) => {
    const c = cleanFilters(f);
    return JSON.stringify({ ...c, statuses: c.statuses?.slice().sort(), priorities: c.priorities?.slice().sort() }, Object.keys(c).sort());
  };
  return norm(a) === norm(b);
}

/** The query string for GET /api/tasks (lists become comma-separated). */
export function filtersToQuery(f: TaskFilters) {
  const c = cleanFilters(f);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(c)) params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** A short reading of the filters, e.g. "Mine · Urgent or High · Overdue", for naming and describing views. */
export function describeFilters(f: TaskFilters, names: { people?: Map<string, string>; projects?: Map<string, string>; teams?: Map<string, string> } = {}) {
  const c = cleanFilters(f);
  const parts: string[] = [];
  if (c.ownerId) parts.push(c.ownerId === 'me' ? 'Mine' : c.ownerId === 'none' ? 'Unassigned' : names.people?.get(c.ownerId) ?? 'Someone else’s');
  if (c.statuses) parts.push(c.statuses.map((s) => STATUS_OPTIONS.find((o) => o.value === s)!.label).join(' or '));
  if (c.priorities) parts.push(c.priorities.map((p) => PRIORITY_OPTIONS.find((o) => o.value === p)!.label).join(' or '));
  if (c.due) parts.push(DUE_OPTIONS.find((o) => o.value === c.due)!.label);
  if (c.projectId) parts.push(names.projects?.get(c.projectId) ?? 'A project');
  if (c.teamId) parts.push(names.teams?.get(c.teamId) ?? 'A team');
  if (c.q) parts.push(`“${c.q}”`);
  return parts.join(' · ') || 'All tasks';
}
