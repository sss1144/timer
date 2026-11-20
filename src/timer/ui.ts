import { useEffect, useState } from 'react';
import { createStore } from '../lib/store';
import { formatDuration } from '../lib/time';
import type { Session, Settings } from '../db/types';
import type { ActionResult } from './actions';
import { showNotification } from './alarm';
import { describeBlock } from './presets';

/* ---------- 画面下に少しだけ出すお知らせ ---------- */

export const toastStore = createStore<{ id: number; text: string } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(text: string): void {
  toastStore.set({ id: Date.now(), text });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastStore.set(null), 3500);
}

/* ---------- 直前に保存した記録（タイマー画面でメモを入力するため） ---------- */

export const recentRecordStore = createStore<Session | null>(null);

/* ---------- ストップウォッチの止め忘れ確認を表示中か ---------- */

export const checkPromptStore = createStore(false);

/** タイマー操作の結果を画面に伝える（記録のお知らせ、ブラウザ通知）。
 * 音はここでは鳴らさない（ブロックの開始時に予約した音が終了時刻に鳴る。TimerRunner） */
export function handleResult(result: ActionResult, settings: Settings): void {
  const last = result.sessions.at(-1);
  if (last) recentRecordStore.set(last);

  const liveEvent = result.events.filter(e => e.live).at(-1);
  if (liveEvent) {
    const title = liveEvent.kind === 'work' ? '作業ブロック終了' : '休憩終了';
    const next = nextText(result);
    showToast(`${title}！${last ? `${formatDuration(last.durationSec)}を記録しました。` : ''}${next}`);
    if (settings.notification) void showNotification(title, next);
    return;
  }

  if (result.events.length > 0 && result.sessions.length > 0) {
    showToast('アプリを閉じている間に終わった作業を記録しました');
  } else if (last) {
    showToast(`${formatDuration(last.durationSec)}を記録しました`);
  }
}

/** ブロックが終わったあとの案内（次のブロック、または終わり） */
function nextText(result: ActionResult): string {
  const { timer, plan } = result;
  if (!plan || timer.mode !== 'timer') return '';
  // 1 回だけのプリセットが最後まで終わって、最初の開始前に戻った
  if (!plan.repeat && !timer.startedAt && timer.blockIndex === 0) return 'プリセットが最後まで終わりました';
  const block = plan.blocks[timer.blockIndex];
  if (!block) return '';
  return timer.startedAt ? `${describeBlock(block)}が始まりました` : `次は${describeBlock(block)}です`;
}

/** 一定間隔で現在時刻を返す（active のときだけ再描画する） */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return active ? now : Date.now();
}
