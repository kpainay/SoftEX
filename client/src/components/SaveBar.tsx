import { useEffect, useState, useSyncExternalStore } from 'react';
import { savingNow } from '../api';
import { cn } from '@/lib/utils';

/**
 * A thin bar along the top of the app while something is being saved. It only appears when a save takes more
 * than a moment, so quick actions stay calm, and slower ones show that something is happening.
 */
export function SaveBar() {
  const busy = useSyncExternalStore(savingNow.subscribe, () => savingNow.get() > 0);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!busy) {
      setShown(false);
      return;
    }
    const t = window.setTimeout(() => setShown(true), 200);
    return () => window.clearTimeout(t);
  }, [busy]);
  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-primary opacity-0 transition-opacity',
        shown && 'animate-pulse opacity-100',
      )}
      role="progressbar"
      aria-label="Saving"
      aria-hidden={!shown}
    />
  );
}
