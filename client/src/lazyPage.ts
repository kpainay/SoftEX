import { lazy, type ComponentType } from 'react';

/** React.lazy for a module's named export: `lazyPage(() => import('./pages/Home'), 'Home')`. */
export function lazyPage<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(async () => ({ default: (await load())[name] as ComponentType }));
}
