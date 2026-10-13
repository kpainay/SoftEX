import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, type Me, type Person } from './api';
import { clearOfflineData, disablePush } from './pwa';
import { realtime } from './realtime';

interface Session {
  me: Me | null;
  loading: boolean;
  setMe: (me: Me | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  people: Person[];
  reloadPeople: () => Promise<void>;
  can: (role: 'lead' | 'admin' | 'owner') => boolean;
}

const SessionContext = createContext<Session>(null as unknown as Session);
const RANK = { guest: 0, member: 1, lead: 2, admin: 3, owner: 4 } as const;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<Person[]>([]);

  const retryTimer = useRef<number | undefined>(undefined);
  // Bumped when the session ends, so a /me request already in flight (a slow retry) cannot put a
  // signed-out person back into the app when its answer finally arrives.
  const generation = useRef(0);
  const invalidateRefreshes = useCallback(() => {
    generation.current += 1;
    window.clearTimeout(retryTimer.current);
  }, []);
  const refresh = useCallback(async (attempt = 0): Promise<void> => {
    window.clearTimeout(retryTimer.current);
    const started = generation.current;
    try {
      const fresh = await api.get<Me>('/me');
      if (started !== generation.current) return;
      setMe(fresh);
      setLoading(false);
    } catch (error) {
      if (started !== generation.current) return;
      // Only the server saying "not signed in" means signed out. A dropped connection, a busy
      // server (429) or a proxy error must not throw people out to the website or sign-in page:
      // keep what is on screen and try again shortly.
      if (error instanceof ApiError && error.status === 401) {
        setMe(null);
        setLoading(false);
        return;
      }
      retryTimer.current = window.setTimeout(() => void refresh(attempt + 1), Math.min(30_000, 1000 * 2 ** attempt));
    }
  }, []);
  useEffect(() => () => window.clearTimeout(retryTimer.current), []);

  const reloadPeople = useCallback(async () => {
    try {
      setPeople(await api.get<Person[]>('/people'));
    } catch {
      /* ignored: e.g. MFA setup pending */
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUnauthorized = () => {
      invalidateRefreshes();
      clearOfflineData();
      setMe(null);
      setLoading(false);
    };
    window.addEventListener('softex:unauthorized', onUnauthorized);
    return () => window.removeEventListener('softex:unauthorized', onUnauthorized);
  }, [refresh, invalidateRefreshes]);

  const workspaceId = me?.workspace.id;
  useEffect(() => {
    if (!workspaceId) {
      realtime.stop();
      return;
    }
    realtime.start();
    reloadPeople();
    const off = realtime.subscribe((e) => {
      if (e.type === 'user.updated' || e.type === 'presence') {
        setPeople((ps) => ps.map((p) => (p.id === (e.user?.id ?? e.userId) ? { ...p, ...(e.user ?? {}), online: e.type === 'presence' ? e.online : p.online } : p)));
      }
    });
    return () => {
      off();
      realtime.stop();
    };
  }, [workspaceId, reloadPeople]);

  const logout = useCallback(async () => {
    invalidateRefreshes();
    // Stop push notifications on this device before the session ends.
    const endpoint = await disablePush().catch(() => null);
    if (endpoint) await api.del('/me/push', { endpoint }).catch(() => {});
    await api.post('/auth/logout');
    await clearOfflineData();
    setMe(null);
  }, [invalidateRefreshes]);

  const can = useCallback((role: 'lead' | 'admin' | 'owner') => !!me && RANK[me.role] >= RANK[role], [me]);

  return <SessionContext.Provider value={{ me, loading, setMe, refresh, logout, people, reloadPeople, can }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
