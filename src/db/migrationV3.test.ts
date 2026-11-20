import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { AppDB } from './db';
import { DEFAULT_SETTINGS } from './types';

const V2_STORES = { projects: 'id, updatedAt', tasks: 'id, projectId, updatedAt', sessions: 'id, taskId, startAt, updatedAt', kv: 'key' };

async function makeV2(name: string, fill: (db: Dexie) => Promise<void>) {
  const old = new Dexie(name);
  old.version(2).stores(V2_STORES);
  await old.open();
  await fill(old);
  old.close();
}

const task = (id: string, estimatedPomodoros: number | null) => ({
  id, projectId: null, title: id, estimatedPomodoros, dueDate: null, note: '', done: false, doneAt: null, deleted: false,
  createdAt: '2026-11-19T10:00:00.000+09:00', updatedAt: '2026-11-19T10:00:00.000+09:00',
});
const session = (id: string, type: string, completed: boolean) => ({
  id, taskId: 't1', type, startAt: '2026-11-19T20:00:00.000+09:00', endAt: '2026-11-19T20:25:00.000+09:00', durationSec: 1500,
  completed, note: '', deleted: false, createdAt: '', updatedAt: '2026-11-19T20:25:00.000+09:00',
});

describe('データベースの移行（v2 → v3）', () => {
  it('13 章のとおりに移行する', async () => {
    const name = 'migration-v3';
    await makeV2(name, async db => {
      await db.table('tasks').bulkAdd([task('t1', 4), task('t2', null)]);
      await db.table('sessions').bulkAdd([session('s1', 'pomodoro', true), session('s2', 'pomodoro', false), session('s3', 'stopwatch', false)]);
      await db.table('kv').bulkPut([
        {
          key: 'settings',
          value: {
            workMin: 30, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4, autoContinue: true, stopwatchCheckMin: 120,
            sound: false, alarmSound: 'bell', notification: false, weekStart: 'sun', dayBoundaryHour: 0, lastBackupAt: null,
          },
        },
        {
          key: 'activeTimer',
          value: { mode: 'pomodoro', phase: 'work', taskId: 't1', startedAt: '2026-11-20T09:00:00.000+09:00', pausedAt: null, pausedTotalSec: 0, pomodoroCount: 2, phaseDurationSec: 1500, checkedElapsedSec: 0 },
        },
      ]);
    });

    const db = new AppDB(name);

    // プリセット：初期の 2 つ（作成順に 2 時間ブロック → ポモドーロ）
    const presets = await db.presets.orderBy('createdAt').toArray();
    expect(presets.map(p => [p.name, p.repeat, p.blocks.length])).toEqual([
      ['2時間ブロック', false, 1],
      ['ポモドーロ', true, 8],
    ]);

    // タスク：見積もりポモドーロ数 × 移行時の作業時間（30 分）
    const tasks = await db.tasks.orderBy('id').toArray();
    expect(tasks.map(t => [t.id, t.estimatedMin, t.repeat])).toEqual([
      ['t1', 120, null],
      ['t2', null, null],
    ]);
    expect(tasks.every(t => !('estimatedPomodoros' in t))).toBe(true);

    // 記録：ポモドーロ → タイマー。completed はそのまま
    const sessions = await db.sessions.orderBy('id').toArray();
    expect(sessions.map(s => [s.id, s.type, s.completed])).toEqual([
      ['s1', 'timer', true],
      ['s2', 'timer', false],
      ['s3', 'stopwatch', false],
    ]);

    // 設定：ポモドーロの時間を消す。ほかの設定は残す。日付の区切り 0 時 → 4 時。最後に使ったプリセット = 2 時間ブロック
    const settings = (await db.kv.get('settings'))!.value as unknown as Record<string, unknown>;
    expect(settings).toEqual({
      ...DEFAULT_SETTINGS,
      autoContinue: true, stopwatchCheckMin: 120, sound: false, alarmSound: 'bell', weekStart: 'sun',
      dayBoundaryHour: 4, lastPresetId: presets[0].id,
    });

    // 実行中のタイマー：消す
    expect(await db.kv.get('activeTimer')).toBeUndefined();
    db.close();
  });

  it('日付の区切りが 0 時以外ならそのまま。設定を保存していなければ初期値で作る', async () => {
    await makeV2('migration-v3-b', async db => {
      await db.table('kv').put({ key: 'settings', value: { ...DEFAULT_SETTINGS, dayBoundaryHour: 5 } });
    });
    const db = new AppDB('migration-v3-b');
    expect(((await db.kv.get('settings'))!.value as { dayBoundaryHour: number }).dayBoundaryHour).toBe(5);
    db.close();

    await makeV2('migration-v3-c', async () => {});
    const db2 = new AppDB('migration-v3-c');
    const s = (await db2.kv.get('settings'))!.value as { dayBoundaryHour: number; lastPresetId: string };
    expect(s.dayBoundaryHour).toBe(4);
    expect(await db2.presets.get(s.lastPresetId)).toMatchObject({ name: '2時間ブロック' });
    db2.close();
  });

  it('新しく使い始めたときは、初期のプリセットが入っている', async () => {
    const db = new AppDB('fresh-v3');
    const presets = await db.presets.orderBy('createdAt').toArray();
    expect(presets.map(p => p.name)).toEqual(['2時間ブロック', 'ポモドーロ']);
    db.close();
  });
});
