import { useActiveTimer, useSettings, useTasks } from '../db/hooks';
import { formatClock } from '../lib/time';
import * as actions from '../timer/actions';
import { elapsedMs, getStatus, remainingMs } from '../timer/engine';
import { PHASE_LABEL, useNow } from '../timer/ui';

/** タイマー以外の画面で、動いているタイマーを小さく表示する */
export function MiniTimer() {
  const timer = useActiveTimer();
  const settings = useSettings();
  const tasks = useTasks();
  const status = timer ? getStatus(timer) : 'idle';
  const now = useNow(status === 'running', 500);
  if (!timer || status === 'idle') return null;

  const clock = timer.mode === 'pomodoro' ? formatClock(remainingMs(timer, now, settings), true) : formatClock(elapsedMs(timer, now));
  const label = timer.mode === 'pomodoro' ? PHASE_LABEL[timer.phase] : 'ストップウォッチ';
  const task = timer.taskId ? tasks?.find(t => t.id === timer.taskId)?.title : '未分類';

  return (
    <div className={`mini-timer phase-${timer.phase}${status === 'paused' ? ' is-paused' : ''}`}>
      <a href="#/" className="mini-main" aria-label="タイマー画面を開く">
        <span className="mini-dot" aria-hidden="true" />
        <span className="mini-clock">{clock}</span>
        <span className="mini-label">
          {label}
          {status === 'paused' ? '（一時停止中）' : ''}
          {task && timer.phase === 'work' ? ` ・ ${task}` : ''}
        </span>
      </a>
      <button className="btn sm" onClick={() => void (status === 'running' ? actions.pause() : actions.resume())}>
        {status === 'running' ? '一時停止' : '再開'}
      </button>
    </div>
  );
}
