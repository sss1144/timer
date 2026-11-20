import { useStore } from '../lib/store';
import { audioRunningStore, unlockAudio } from '../timer/alarm';
import { getStatus } from '../timer/engine';
import { useTimerState } from '../timer/useTimerState';

/** 再読み込みのあとなど、ブラウザの仕組みで音を予約できないときに知らせる（どこかをクリックすれば鳴るようになる） */
export function SoundUnlockBanner() {
  const { timer, settings } = useTimerState();
  const audioRunning = useStore(audioRunningStore);
  if (!timer || !settings.sound || audioRunning || timer.mode !== 'timer' || getStatus(timer) !== 'running') return null;
  return (
    <button type="button" className="banner sound-banner" onClick={() => unlockAudio()}>
      <strong>🔔 クリックすると音が鳴るようになります</strong>
      <span className="muted">ブラウザの仕組みで、クリックやキー操作の前は音を予約できません</span>
    </button>
  );
}
