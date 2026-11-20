import { useEffect, useRef } from 'react';
import { useTasks } from '../db/hooks';
import { useStore } from '../lib/store';
import { formatClock, formatDuration } from '../lib/time';
import type { Route } from '../lib/route';
import { ROUTE_LABEL } from '../components/Nav';
import { Dialog } from '../components/Dialog';
import * as actions from './actions';
import { checkpointSec, currentBlock, elapsedMs, getStatus, isCheckDue, isRecording, remainingMs } from './engine';
import { playAlarm, showNotification } from './alarm';
import { checkPromptStore, handleResult, showToast, useNow } from './ui';
import { BLOCK_LABEL } from './presets';
import { useTimerState } from './useTimerState';

/** どの画面にいても動く、タイマーの見張り役。
 * - 時間になったブロックを終わらせて記録する（閉じている間に終わった分も、開いたときに記録する）
 * - ストップウォッチの止め忘れ確認を出す
 * - ブラウザのタブ名に残り時間を出す
 * - タイマー中は画面が消えないようにする */
export function TimerRunner({ route }: { route: Route }) {
  const { timer, settings, plan } = useTimerState();
  const tasks = useTasks();
  const status = timer ? getStatus(timer) : 'idle';
  const now = useNow(status === 'running', 500);
  const busy = useRef(false);
  const checkOpen = useStore(checkPromptStore);

  // 時間になったら次のブロックへ（記録・アラーム）
  useEffect(() => {
    if (!timer || status !== 'running' || busy.current) return;
    if (timer.mode === 'timer' && remainingMs(timer, now, plan) <= 0) {
      busy.current = true;
      actions
        .advance()
        .then(r => handleResult(r, settings))
        .finally(() => {
          busy.current = false;
        });
    }
    if (!checkPromptStore.get() && isCheckDue(timer, now, settings)) {
      checkPromptStore.set(true);
      // 確認時点から時間がたっていなければ（その場で気づいたなら）音と通知で知らせる
      if (elapsedMs(timer, now) - checkpointSec(timer, settings) * 1000 < 60_000) {
        if (settings.sound) playAlarm(settings.alarmSound);
        if (settings.notification) void showNotification('まだ作業中ですか？', 'ストップウォッチが動き続けています');
      }
    }
  }, [timer, status, now, settings, plan]);

  // タブ名
  const taskTitle = timer?.taskId ? tasks?.find(t => t.id === timer.taskId)?.title : undefined;
  useEffect(() => {
    let title = route === 'timer' ? '作業記録タイマー' : `${ROUTE_LABEL[route]} | 作業記録タイマー`;
    if (timer && status !== 'idle') {
      const block = currentBlock(timer, plan);
      const clock = timer.mode === 'timer' ? formatClock(remainingMs(timer, now, plan), true) : formatClock(elapsedMs(timer, now));
      const label = block ? BLOCK_LABEL[block.kind] : taskTitle ?? '未分類';
      title = `${status === 'paused' ? '⏸ ' : ''}${clock} ${label} | 作業記録タイマー`;
    }
    if (document.title !== title) document.title = title;
  }, [route, timer, status, now, plan, taskTitle]);

  // 画面を消さない（対応ブラウザのみ）
  useEffect(() => {
    if (status !== 'running' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const l = await navigator.wakeLock.request('screen');
        if (cancelled) void l.release();
        else lock = l;
      } catch {
        /* 省電力モードなどで断られることがある */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!lock || lock.released)) void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [status]);

  // 止め忘れ確認：もう該当しなくなったら閉じる（別のタブで答えた場合など）
  const stillDue = !!timer && isCheckDue(timer, now, settings);
  useEffect(() => {
    if (checkOpen && timer && !stillDue) checkPromptStore.set(false);
  }, [checkOpen, timer, stillDue]);

  if (!checkOpen || !timer || !stillDue || !isRecording(timer, plan)) return null;

  const answer = async (choice: 'continue' | 'checkpoint' | 'now') => {
    checkPromptStore.set(false);
    if (choice === 'continue') {
      await actions.continueAfterCheck();
      showToast('計測を続けます');
      return;
    }
    const r = choice === 'checkpoint' ? await actions.stopAtCheckpoint() : await actions.stop(true);
    handleResult(r, settings);
  };

  const checkMin = settings.stopwatchCheckMin;
  return (
    <Dialog title="まだ作業中ですか？" onClose={() => void answer('continue')}>
      <p className="dialog-text">
        ストップウォッチが {formatDuration(elapsedMs(timer, now) / 1000)} 動いています。止め忘れていたら、
        確認した時点（{formatDuration(checkpointSec(timer, settings))}）までを記録できます。
      </p>
      <div className="stack-actions">
        <button className="btn primary" onClick={() => void answer('continue')}>
          続ける（あと {formatDuration(checkMin * 60)} 後にまた確認）
        </button>
        <button className="btn" onClick={() => void answer('checkpoint')}>
          確認した時点で止めて記録
        </button>
        <button className="btn" onClick={() => void answer('now')}>
          今止めて記録
        </button>
      </div>
    </Dialog>
  );
}
