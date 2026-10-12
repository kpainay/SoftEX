import { useEffect, useState, useSyncExternalStore } from 'react';
import { savingNow } from '../api';

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
  return <div className={`save-bar ${shown ? 'on' : ''}`} role="progressbar" aria-label="Saving" aria-hidden={!shown} />;
}
