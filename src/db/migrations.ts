/* データベースの移行（requirements.md 13 章） */

import type { Transaction } from 'dexie';
import { toIsoLocal } from '../lib/time';
import { DEFAULT_PRESETS, DEFAULT_SETTINGS, LIMITS, type Settings, type TimerPreset } from './types';

/** 初期のプリセットを作る。並び順（作成順）が 2 時間ブロック → ポモドーロ になるよう作成日時を 1 ミリ秒ずらす */
export function makeDefaultPresets(now = Date.now()): TimerPreset[] {
  return DEFAULT_PRESETS.map((p, i) => {
    const at = toIsoLocal(new Date(now + i));
    return { id: crypto.randomUUID(), ...p, blocks: p.blocks.map(b => ({ ...b })), deleted: false, createdAt: at, updatedAt: at };
  });
}

type V2Settings = Partial<Settings> & { workMin?: number; shortBreakMin?: number; longBreakMin?: number; longBreakEvery?: number };

/** v2 → v3：ポモドーロタイマーをブロック式に変える */
export async function migrateToV3(tx: Transaction): Promise<void> {
  // プリセット：初期の 2 つを入れる
  const presets = makeDefaultPresets();
  await tx.table('presets').bulkAdd(presets);

  const settingsRow = (await tx.table('kv').get('settings')) as { key: 'settings'; value: V2Settings } | undefined;
  const old: V2Settings = settingsRow?.value ?? {};
  const workMin = typeof old.workMin === 'number' && old.workMin > 0 ? old.workMin : 25;

  // タスク：見積もりポモドーロ数 → 見積もり時間（分）
  await tx
    .table('tasks')
    .toCollection()
    .modify((t: Record<string, unknown>) => {
      const est = t.estimatedPomodoros;
      t.estimatedMin = typeof est === 'number' && est > 0 ? Math.min(LIMITS.maxEstimateMin, Math.round(est * workMin)) : null;
      delete t.estimatedPomodoros;
      t.repeat = null;
    });

  // 記録：種別「ポモドーロ」→「タイマー」（completed はそのまま）
  await tx
    .table('sessions')
    .toCollection()
    .modify((s: { type: string }) => {
      if (s.type === 'pomodoro') s.type = 'timer';
    });

  // 設定：ポモドーロの時間をなくし、最後に使ったプリセットを 2 時間ブロックにする。日付の区切りが 0 時なら 4 時に
  const { workMin: _w, shortBreakMin: _s, longBreakMin: _l, longBreakEvery: _e, ...rest } = old;
  const boundary = typeof rest.dayBoundaryHour === 'number' && rest.dayBoundaryHour !== 0 ? rest.dayBoundaryHour : 4;
  const settings: Settings = { ...DEFAULT_SETTINGS, ...rest, dayBoundaryHour: boundary, lastPresetId: presets[0].id };
  await tx.table('kv').put({ key: 'settings', value: settings });

  // 実行中のタイマー：消して、開始前の状態にする
  await tx.table('kv').delete('activeTimer');
}

/** v3 → v4：アラーム音を「作業終了の音」「作業開始の音」に分け、音量を足す（requirements.md 13 章） */
export async function migrateToV4(tx: Transaction): Promise<void> {
  const row = (await tx.table('kv').get('settings')) as { key: 'settings'; value: Record<string, unknown> } | undefined;
  if (!row) return; // 設定を保存していなければ初期値のまま
  const { alarmSound, ...rest } = row.value;
  const next: Record<string, unknown> = { ...rest };
  if (typeof alarmSound === 'string') {
    next.workEndSound = alarmSound;
    next.workStartSound = alarmSound;
  }
  if (typeof next.volume !== 'number') next.volume = 70;
  await tx.table('kv').put({ key: 'settings', value: { ...DEFAULT_SETTINGS, ...next } });
}
