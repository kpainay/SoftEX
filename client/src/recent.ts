import { useSyncExternalStore } from 'react';

/** A place you opened recently, for "jump back" in the command palette. Kept on this device only. */
export interface RecentPlace {
  path: string;
  label: string;
  kind: string;
  at: number;
}

const KEY = 'softex.recent';
const MAX = 8;
const listeners = new Set<() => void>();
let cache: RecentPlace[] | null = null;

function read(): RecentPlace[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(parsed) ? parsed.filter((p) => typeof p?.path === 'string' && typeof p?.label === 'string').slice(0, MAX) : [];
  } catch {
    cache = [];
  }
  return cache;
}

/** What kind of place a path is, for its icon. */
export function placeKind(path: string) {
  const first = path.split(/[/?]/)[1] ?? '';
  return ({ channels: 'channel', projects: 'project', tasks: 'task', knowledge: 'page', files: 'file', meetings: 'meeting', people: 'person', teams: 'team', goals: 'goal', boards: 'board', dashboards: 'dashboard' } as Record<string, string>)[first] ?? 'page-view';
}

export function recordVisit(path: string, label: string) {
  if (!label.trim() || path === '/') return;
  const next = [{ path, label: label.trim().slice(0, 80), kind: placeKind(path), at: Date.now() }, ...read().filter((p) => p.path !== path)].slice(0, MAX);
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private window or full storage: recent places just aren't remembered */
  }
  listeners.forEach((l) => l());
}

export function useRecentPlaces() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    read,
  );
}
