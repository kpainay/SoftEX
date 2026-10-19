import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { api } from '../api';
import { Icon } from './Icon';
import { IconButton, useAction } from '@/components/kit';
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

export type FavoriteKind = 'page' | 'project' | 'channel' | 'goal' | 'dashboard' | 'board';
export interface Favorite {
  kind: FavoriteKind;
  id: string;
  title: string;
  icon: string | null;
  color?: string;
  link: string;
}

// One shared list for every star button and the sidebar, refreshed on change.
let cache: Favorite[] | null = null;
let pending: Promise<Favorite[]> | null = null;
const listeners = new Set<(f: Favorite[]) => void>();

async function load(force = false) {
  if (cache && !force) return cache;
  pending ??= api.get<Favorite[]>('/favorites').finally(() => (pending = null));
  cache = await pending;
  listeners.forEach((l) => l(cache!));
  return cache;
}

export function useFavorites() {
  const [items, setItems] = useState<Favorite[]>(cache ?? []);
  useEffect(() => {
    listeners.add(setItems);
    load().then(setItems, () => {});
    return () => void listeners.delete(setItems);
  }, []);
  return items;
}

/** Star toggle shown next to a page, project, channel or goal title. */
export function FavoriteButton({ kind, id }: { kind: FavoriteKind; id: string }) {
  const act = useAction();
  const items = useFavorites();
  const on = items.some((f) => f.kind === kind && f.id === id);
  return (
    <IconButton
      label={on ? 'Remove from favorites' : 'Add to favorites'}
      size="icon-sm"
      aria-pressed={on}
      className={cn('align-middle', on ? 'text-warning [&_svg]:fill-current' : 'text-muted-foreground')}
      onClick={async () => {
        const ok = await act(() => api.put('/favorites', { kind, id, on: !on }));
        if (ok) await load(true);
      }}
    >
      <Icon name="star" />
    </IconButton>
  );
}

const KIND_ICON: Record<FavoriteKind, string> = { page: 'book', project: 'folder', channel: 'hash', goal: 'target', dashboard: 'chart', board: 'whiteboard' };

/** Sidebar section listing the person's favorites. */
export function FavoritesNav() {
  const items = useFavorites();
  const location = useLocation();
  if (!items.length) return null;
  return (
    <SidebarGroup aria-label="Favorites" className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Favorites</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((f) => (
            <SidebarMenuItem key={`${f.kind}:${f.id}`}>
              <SidebarMenuButton size="sm" isActive={location.pathname === f.link} render={<NavLink to={f.link} />}>
                {f.icon ? <span className="w-4 text-center">{f.icon}</span> : f.color ? <span className="size-2.5 rounded-full" style={{ background: `var(--c-${f.color})` }} /> : <Icon name={KIND_ICON[f.kind]} />}
                <span>{f.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
