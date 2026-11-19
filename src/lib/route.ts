import { useSyncExternalStore } from 'react';

/** 5 つの画面。URL は #/ , #/tasks のようなハッシュ形式（GitHub Pages で再読み込みしても 404 にならない） */
export const ROUTES = ['timer', 'tasks', 'records', 'stats', 'settings'] as const;
export type Route = (typeof ROUTES)[number];

export function parseHash(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'timer';
}

export function routeHref(route: Route): string {
  return route === 'timer' ? '#/' : `#/${route}`;
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => parseHash(window.location.hash), () => 'timer');
}
