import { useEffect, useState } from 'react';
import { createStore } from '../lib/store';
import { formatDuration } from '../lib/time';
import type { Session, Settings } from '../db/types';
import type { ActionResult } from './actions';
import type { Phase } from './engine';
import { playAlarm, showNotification } from './alarm';

export const PHASE_LABEL: Record<Phase, string> = {
  work: '作業',
  shortBreak: '短い休憩',
  longBreak: '長い休憩',
};

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

/** タイマー操作の結果を画面に伝える（記録の通知、アラーム音、デスクトップ通知） */
export function handleResult(result: ActionResult, settings: Settings): void {
  const last = result.sessions.at(-1);
  if (last) recentRecordStore.set(last);

  const liveEvent = result.events.filter(e => e.live).at(-1);
  if (liveEvent) {
    if (settings.sound) playAlarm(settings.alarmSound);
    const next = result.timer.phase;
    if (liveEvent.kind === 'workDone') {
      const body = `${PHASE_LABEL[next]}に入りましょう`;
      showToast(`ポモドーロ完了！${last ? `${formatDuration(last.durationSec)}を記録しました。` : ''}`);
      if (settings.notification) void showNotification('ポモドーロ完了', body);
    } else {
      showToast('休憩終了。次の作業を始めましょう');
      if (settings.notification) void showNotification('休憩終了', '次の作業を始めましょう');
    }
    return;
  }

  if (result.events.length > 0 && result.sessions.length > 0) {
    showToast('アプリを閉じている間に終わった作業を記録しました');
  } else if (last) {
    showToast(`${formatDuration(last.durationSec)}を記録しました`);
  }
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
