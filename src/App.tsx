import { useEffect, type ComponentType } from 'react';
import { useRoute, type Route } from './lib/route';
import { Nav } from './components/Nav';
import { InstallHint } from './components/InstallHint';
import { MiniTimer } from './components/MiniTimer';
import { SoundUnlockBanner } from './components/SoundUnlockBanner';
import { BackupBanners } from './components/BackupBanners';
import { useAutoBackup } from './backup/auto';
import { useAppearance } from './lib/useAppearance';
import { Toast } from './components/Toast';
import { TimerRunner } from './timer/TimerRunner';
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
  useAutoBackup();
  useAppearance();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  return (
    <div className="app">
      <Nav current={route} />
      <main className="content">
        <InstallHint />
        <SoundUnlockBanner />
        <BackupBanners />
        {route !== 'timer' && <MiniTimer />}
        <Screen />
      </main>
      <TimerRunner route={route} />
      <Toast />
    </div>
  );
}
