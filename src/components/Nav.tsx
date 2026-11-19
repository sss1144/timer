import { ROUTES, routeHref, type Route } from '../lib/route';
import { RouteIcon } from './Icon';

export const ROUTE_LABEL: Record<Route, string> = {
  timer: 'タイマー',
  tasks: 'タスク',
  records: '記録',
  stats: '統計',
  settings: '設定',
};

/** PC では左のサイドバー、スマホ・iPad 縦向きでは下部タブとして表示される（切り替えは CSS） */
export function Nav({ current }: { current: Route }) {
  return (
    <nav className="nav" aria-label="画面の切り替え">
      <div className="nav-brand">
        <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width="28" height="28" />
        <span>作業記録タイマー</span>
      </div>
      <ul className="nav-list">
        {ROUTES.map(r => (
          <li key={r}>
            <a href={routeHref(r)} className="nav-item" aria-current={r === current ? 'page' : undefined}>
              <RouteIcon route={r} />
              <span>{ROUTE_LABEL[r]}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
