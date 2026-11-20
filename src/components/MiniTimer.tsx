import { useTasks } from '../db/hooks';
import { formatClock } from '../lib/time';
import * as actions from '../timer/actions';
import { currentBlock, elapsedMs, getStatus, remainingMs } from '../timer/engine';
import { BLOCK_LABEL } from '../timer/presets';
import { useNow } from '../timer/ui';
import { useTimerState } from '../timer/useTimerState';

/** タイマー以外の画面で、動いているタイマーを小さく表示する */
export function MiniTimer() {
  const { timer, plan } = useTimerState();
  const tasks = useTasks();
  const status = timer ? getStatus(timer) : 'idle';
  const now = useNow(status === 'running', 500);
  if (!timer || status === 'idle') return null;

  const block = currentBlock(timer, plan);
  const clock = timer.mode === 'timer' ? formatClock(remainingMs(timer, now, plan), true) : formatClock(elapsedMs(timer, now));
  const label = block ? BLOCK_LABEL[block.kind] : 'ストップウォッチ';
  const task = timer.taskId ? tasks?.find(t => t.id === timer.taskId)?.title : '未分類';
  const kind = block?.kind ?? 'work';

  return (
    <div className={`mini-timer kind-${kind}${status === 'paused' ? ' is-paused' : ''}`}>
      <a href="#/" className="mini-main" aria-label="タイマー画面を開く">
        <span className="mini-dot" aria-hidden="true" />
        <span className="mini-clock">{clock}</span>
        <span className="mini-label">
          {label}
          {status === 'paused' ? '（一時停止中）' : ''}
          {task && kind === 'work' ? ` ・ ${task}` : ''}
        </span>
      </a>
      <button className="btn sm" onClick={() => void (status === 'running' ? actions.pause() : actions.resume())}>
        {status === 'running' ? '一時停止' : '再開'}
      </button>
    </div>
  );
}
