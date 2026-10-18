import { useEffect, useState } from 'react';
import { api } from '../api';
import { useApi, useRealtime } from '../hooks';
import { enablePush, pushState, type PushState } from '../pwa';
import { Icon } from './Icon';
import { useToast } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

const KEY = 'kuu:push-prompt';
/** After "Not now", ask again only once this long has passed… */
const QUIET_FOR = 3 * 86_400_000;
/** …and this many notifications have arrived since, so it's clear they'd be useful. */
const AFTER_NOTIFICATIONS = 3;

interface Memory {
  dismissedAt: number;
  missed: number;
}

const recall = (): Memory | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
};
const remember = (m: Memory) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* private mode: the prompt just shows again next time */
  }
};

/**
 * Asks to turn on notifications for this device: once soon after signing in on it, and again after a
 * "Not now" when a few days have passed and notifications keep arriving while they're off.
 */
export function PushPrompt() {
  const toast = useToast();
  const { data: config } = useApi<{ enabled: boolean; publicKey?: string }>('/push/config');
  const [state, setState] = useState<PushState | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!config) return;
    // The service worker registers after the page loads; wait for it (briefly) so "off" isn't mistaken for "unavailable".
    const ready = 'serviceWorker' in navigator ? Promise.race([navigator.serviceWorker.ready, new Promise((r) => window.setTimeout(r, 5000))]) : Promise.resolve();
    void ready.then(() => pushState(config.enabled)).then(setState);
  }, [config]);

  // First time on this device: ask shortly after the app has loaded.
  useEffect(() => {
    if (state !== 'off' || recall()) return;
    const t = window.setTimeout(() => setOpen(true), 2500);
    return () => window.clearTimeout(t);
  }, [state]);

  // Off for a while and notifications keep coming: ask again.
  useRealtime((e) => {
    if (e.type !== 'notification' || state !== 'off' || open) return;
    const memory = recall();
    if (!memory) return;
    const missed = memory.missed + 1;
    remember({ ...memory, missed });
    if (missed >= AFTER_NOTIFICATIONS && Date.now() - memory.dismissedAt >= QUIET_FOR) setOpen(true);
  });

  if (!open || state !== 'off' || !config?.publicKey) return null;

  const later = () => {
    remember({ dismissedAt: Date.now(), missed: 0 });
    setOpen(false);
  };
  const turnOn = async () => {
    setBusy(true);
    try {
      const ok = await enablePush(config.publicKey!, (sub) => api.post('/me/push', sub));
      const next = await pushState(true);
      setState(next);
      if (ok) {
        toast('Notifications are on for this device');
        setOpen(false);
      } else if (next === 'denied') {
        toast('Notifications are blocked for this site. You can allow them in your browser’s site settings.', 'error');
        later();
      }
    } catch (e) {
      toast((e as Error).message || 'Could not turn on notifications', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      size="sm"
      className="fixed right-4 bottom-20 z-40 w-[min(24rem,calc(100vw-2rem))] shadow-lg md:bottom-4"
      role="dialog"
      aria-labelledby="push-prompt-title"
      aria-describedby="push-prompt-text"
    >
      <CardHeader>
        <CardTitle id="push-prompt-title" className="flex items-center gap-2">
          <Icon name="bell" size={18} className="text-primary" /> Turn on notifications?
        </CardTitle>
        <CardDescription id="push-prompt-text">
          Get mentions, direct messages and assignments on this device, even when Küü isn’t open. Quiet hours and focus time still apply.
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-xs" onClick={later} aria-label="Close">
            <Icon name="x" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardFooter className="gap-2">
        <Button size="sm" onClick={turnOn} disabled={busy}>
          {busy && <Spinner data-icon="inline-start" />}
          {busy ? 'Turning on…' : 'Turn on'}
        </Button>
        <Button variant="outline" size="sm" onClick={later} disabled={busy}>
          Not now
        </Button>
      </CardFooter>
    </Card>
  );
}
