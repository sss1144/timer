/* 音（Web Audio API）と通知
 * 音は「ブロックの開始・再開の時点で、終了時刻に鳴るよう予約する」。画面が隠れているとページのタイマーは
 * 間引かれる（最大 1 分に 1 回）が、AudioContext の時刻で予約した音は時間どおりに鳴る。 */

import { createStore } from '../lib/store';
import { findSound } from './sounds';

let ctx: AudioContext | null = null;

/** 音を鳴らせる状態か（ブラウザの仕組みで、クリックやキー操作の前は止まっていることがある） */
export const audioRunningStore = createStore(false);

function updateState() {
  audioRunningStore.set(ctx?.state === 'running');
}

/** クリック・キー操作のときに呼ぶ。AudioContext を作り、止まっていれば動かす */
export function unlockAudio(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      ctx.addEventListener('statechange', updateState);
    }
    if (ctx.state !== 'running') void ctx.resume().then(updateState, updateState);
    updateState();
  } catch {
    ctx = null;
    updateState();
  }
}

/** 音量（0〜100）。70% で以前と同じ大きさ */
const gainOf = (volume: number) => Math.max(0, Math.min(100, volume)) / 70;

export type ScheduledSound = { cancel: () => void };

/** atMs（Date.now() の時刻）に鳴るよう予約する。鳴らせない・もう過ぎている場合は null */
export function scheduleSound(soundId: string, volume: number, atMs: number): ScheduledSound | null {
  const c = ctx;
  if (!c || c.state !== 'running' || volume <= 0) return null;
  const when = c.currentTime + (atMs - Date.now()) / 1000;
  if (when < c.currentTime - 0.5) return null;
  const out = c.createGain();
  out.gain.value = gainOf(volume);
  out.connect(c.destination);
  const sound = findSound(soundId);
  const startAt = Math.max(when, c.currentTime + 0.02);
  const nodes = sound.schedule(c, out, startAt);
  return {
    cancel: () => {
      // もう鳴り始めた音は最後まで鳴らす（ブロックが終わった直後に予約し直しても途中で切れないように）
      if (c.currentTime >= startAt - 0.01) return;
      for (const n of nodes) {
        try {
          n.stop();
        } catch {
          /* もう止まっている */
        }
      }
      out.disconnect();
    },
  };
}

/** すぐに鳴らす（試聴、止め忘れ確認） */
export async function playSoundNow(soundId: string, volume: number): Promise<void> {
  unlockAudio();
  if (ctx && ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  scheduleSound(soundId, volume, Date.now() + 50);
}

export function notificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationSupported()) return false;
  if (Notification.permission === 'granted') return true;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** 通知を出す（許可されていなければ何もしない） */
export async function showNotification(title: string, body: string): Promise<void> {
  if (!notificationSupported() || Notification.permission !== 'granted') return;
  const options: NotificationOptions = { body, icon: `${import.meta.env.BASE_URL}icons/icon-192.png`, tag: 'work-timer' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    /* 下の方法で試す */
  }
  try {
    new Notification(title, options);
  } catch {
    /* 通知を出せない環境 */
  }
}
