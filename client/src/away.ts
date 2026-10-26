/** Out of office: someone's dates (inclusive, YYYY-MM-DD) and the note colleagues get meanwhile. */
export interface AwayFields {
  ooo_from?: string | null;
  ooo_until?: string | null;
  ooo_message?: string | null;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Out of office today (or on `day`). */
export function isAway(p: AwayFields | null | undefined, day = iso(new Date())) {
  if (!p?.ooo_until) return false;
  return (!p.ooo_from || p.ooo_from <= day) && day <= p.ooo_until;
}

/** Has dates set that haven't started yet. */
export function awayLater(p: AwayFields | null | undefined, day = iso(new Date())) {
  return !!p?.ooo_until && !!p.ooo_from && p.ooo_from > day;
}

/** "Fri, Nov 20" */
export function awayDay(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Out of office until Fri, Nov 20" */
export const awayLabel = (p: AwayFields) => `Out of office until ${awayDay(p.ooo_until!)}`;
