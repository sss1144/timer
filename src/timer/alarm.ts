/* アラーム音（音源ファイルを使わずブラウザで鳴らす）と通知 */

import type { AlarmSound } from '../db/types';

export const ALARM_LABEL: Record<AlarmSound, string> = {
  chime: 'チャイム',
  bell: 'ベル',
  beep: '電子音',
};

let ctx: AudioContext | null = null;

/** ボタンを押したときに呼ぶ（iPhone・iPad は操作をきっかけにしないと音を出せないため） */
export function unlockAudio(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, volume: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

export function playAlarm(kind: AlarmSound): void {
  unlockAudio();
  const c = ctx;
  if (!c) return;
  const t0 = c.currentTime + 0.05;
  for (let rep = 0; rep < 2; rep++) {
    if (kind === 'chime') {
      const base = t0 + rep * 1.2;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, base + i * 0.16, 0.7, 'sine', 0.22));
    } else if (kind === 'bell') {
      const base = t0 + rep * 1.6;
      tone(c, 880, base, 1.5, 'sine', 0.25);
      tone(c, 2217, base, 0.9, 'sine', 0.08);
      tone(c, 1320, base + 0.02, 1.2, 'triangle', 0.06);
    } else {
      const base = t0 + rep * 0.9;
      for (let i = 0; i < 3; i++) tone(c, 1000, base + i * 0.17, 0.11, 'square', 0.08);
    }
  }
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
