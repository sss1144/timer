import type { Route } from '../lib/route';

const PATHS: Record<Route, string> = {
  timer: 'M9 2h6M12 9v4l2.5 2.5M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  tasks: 'M10 6h10M10 12h10M10 18h10M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2L7.5 11M4 18l1.2 1.2L7.5 17',
  records: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM7 13h4M7 17h7',
  stats: 'M3 20h18M6 20v-6M11 20V6M16 20v-9M21 20v-4',
  settings: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 6a2 2 0 1 0 0 .01M9 12a2 2 0 1 0 0 .01M17 18a2 2 0 1 0 0 .01',
};

export function RouteIcon({ route }: { route: Route }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d={PATHS[route]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
