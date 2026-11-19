import { useEffect, type ComponentType } from 'react';
import { useRoute, type Route } from './lib/route';
import { Nav, ROUTE_LABEL } from './components/Nav';
import { InstallHint } from './components/InstallHint';
import { TimerScreen } from './screens/TimerScreen';
import { TasksScreen } from './screens/TasksScreen';
import { RecordsScreen } from './screens/RecordsScreen';
import { StatsScreen } from './screens/StatsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

const SCREENS: Record<Route, ComponentType> = {
  timer: TimerScreen,
  tasks: TasksScreen,
  records: RecordsScreen,
  stats: StatsScreen,
  settings: SettingsScreen,
};

export default function App() {
  const route = useRoute();
  const Screen = SCREENS[route];

  useEffect(() => {
    document.title = route === 'timer' ? '作業記録タイマー' : `${ROUTE_LABEL[route]} | 作業記録タイマー`;
    window.scrollTo(0, 0);
  }, [route]);

  return (
    <div className="app">
      <Nav current={route} />
      <main className="content">
        <InstallHint />
        <Screen />
      </main>
    </div>
  );
}
