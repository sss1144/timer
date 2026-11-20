import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import {
  cleanDueDate,
  cleanEstimate,
  createProject,
  createSession,
  createTask,
  deleteSession,
  deleteTask,
  getSettings,
  setTaskDone,
  updateProject,
  updateSession,
  updateSettings,
  createPreset,
  updatePreset,
  deletePreset,
  updateTask,
  ValidationError,
} from './repo';
import { DEFAULT_SETTINGS, IDLE_TIMER } from './types';

const baseTask = { title: '手のデッサン', projectId: null, estimatedMin: null, dueDate: null, note: '' };

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-19T20:00:00+09:00'));
  await db.delete();
  await db.open();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('プロジェクト', () => {
  it('作成すると UUID と作成・更新日時が入る', async () => {
    const p = await createProject({ name: '  イラスト練習 ', color: '#FF7A59' });
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(p.name).toBe('イラスト練習');
    expect(p.color).toBe('#ff7a59');
    expect(p.archived).toBe(false);
    expect(p.deleted).toBe(false);
    expect(p.createdAt).toBe(p.updatedAt);
    expect(p.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    expect(await db.projects.get(p.id)).toEqual(p);
  });

  it('名前が空ならエラー、不正な色は既定の色にする', async () => {
    await expect(createProject({ name: '   ', color: '#000000' })).rejects.toBeInstanceOf(ValidationError);
    const p = await createProject({ name: '学習', color: 'red' });
    expect(p.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('編集・アーカイブで更新日時が新しくなる', async () => {
    const p = await createProject({ name: '学習', color: '#4f7cff' });
    vi.setSystemTime(new Date('2026-11-20T08:00:00+09:00'));
    const edited = await updateProject(p.id, { name: '資格の学習', archived: true });
    expect(edited.name).toBe('資格の学習');
    expect(edited.archived).toBe(true);
    expect(edited.createdAt).toBe(p.createdAt);
    expect(new Date(edited.updatedAt).getTime()).toBeGreaterThan(new Date(p.updatedAt).getTime());
  });
});

describe('タスク', () => {
  it('作成時に入力を整える', async () => {
    const t = await createTask({ ...baseTask, title: ' 模写 ', estimatedMin: 90.4, dueDate: '2026-11-30', note: ' メモ ' });
    expect(t).toMatchObject({ title: '模写', estimatedMin: 90, repeat: null, dueDate: '2026-11-30', note: 'メモ', done: false, doneAt: null });
  });

  it('完了・未完了に戻すと doneAt が入れ替わる', async () => {
    const t = await createTask(baseTask);
    const done = await setTaskDone(t.id, true);
    expect(done.done).toBe(true);
    expect(done.doneAt).not.toBeNull();
    const reopened = await setTaskDone(t.id, false);
    expect(reopened.done).toBe(false);
    expect(reopened.doneAt).toBeNull();
  });

  it('削除しても行は残り、削除済みの印が付く。記録も消えない', async () => {
    const t = await createTask(baseTask);
    await db.sessions.add({
      id: 's1', taskId: t.id, type: 'timer', startAt: '2026-11-19T20:00:00.000+09:00', endAt: '2026-11-19T20:25:00.000+09:00',
      durationSec: 1500, completed: true, note: '', deleted: false, createdAt: '', updatedAt: '',
    });
    await deleteTask(t.id);
    expect((await db.tasks.get(t.id))?.deleted).toBe(true);
    expect(await db.sessions.count()).toBe(1);
  });

  it('編集で一部の項目だけ変えられる', async () => {
    const t = await createTask({ ...baseTask, estimatedMin: 120 });
    const edited = await updateTask(t.id, { dueDate: '2026-12-01', estimatedMin: null });
    expect(edited.title).toBe(t.title);
    expect(edited.dueDate).toBe('2026-12-01');
    expect(edited.estimatedMin).toBeNull();
  });
});

describe('繰り返しタスク', () => {
  it('毎日の予定時間を持ち、見積もり時間と期限は持たない', async () => {
    const t = await createTask({ ...baseTask, repeat: { minPerDay: 60.4 }, estimatedMin: 300, dueDate: '2026-12-01' });
    expect(t).toMatchObject({ repeat: { minPerDay: 60 }, estimatedMin: null, dueDate: null });
  });

  it('予定時間は 1〜1440 分', async () => {
    await expect(createTask({ ...baseTask, repeat: { minPerDay: 0 } })).rejects.toThrow('1〜1440');
    await expect(createTask({ ...baseTask, repeat: { minPerDay: 1441 } })).rejects.toThrow('1〜1440');
  });

  it('繰り返しのオン・オフを編集で切り替えられる', async () => {
    const t = await createTask({ ...baseTask, estimatedMin: 120, dueDate: '2026-12-01' });
    const daily = await updateTask(t.id, { repeat: { minPerDay: 30 } });
    expect(daily).toMatchObject({ repeat: { minPerDay: 30 }, estimatedMin: null, dueDate: null });
    const single = await updateTask(t.id, { repeat: null, estimatedMin: 90 });
    expect(single).toMatchObject({ repeat: null, estimatedMin: 90 });
  });
});

describe('入力の整形', () => {
  it('見積もり時間は 1〜9999 分の整数、それ以外は null', () => {
    expect(cleanEstimate(0)).toBeNull();
    expect(cleanEstimate(-2)).toBeNull();
    expect(cleanEstimate(Number.NaN)).toBeNull();
    expect(cleanEstimate(2.6)).toBe(3);
    expect(cleanEstimate(20000)).toBe(9999);
  });
  it('期限は YYYY-MM-DD だけ受け付ける', () => {
    expect(cleanDueDate('2026-11-19')).toBe('2026-11-19');
    expect(cleanDueDate('11/19')).toBeNull();
    expect(cleanDueDate('')).toBeNull();
  });
});

describe('プリセット', () => {
  const blocks = [{ kind: 'work' as const, min: 50 }, { kind: 'break' as const, min: 10 }];

  it('追加・編集・削除（削除は印を付けるだけ）', async () => {
    const p = await createPreset({ name: ' 50分集中 ', blocks, repeat: true });
    expect(p).toMatchObject({ name: '50分集中', blocks, repeat: true, deleted: false });
    const edited = await updatePreset(p.id, { name: '50分', blocks: [{ kind: 'work', min: 45.6 }], repeat: false });
    expect(edited).toMatchObject({ name: '50分', blocks: [{ kind: 'work', min: 46 }], repeat: false, createdAt: p.createdAt });
    await deletePreset(p.id);
    expect((await db.presets.get(p.id))?.deleted).toBe(true);
  });

  it('作業ブロックがない・長さが範囲外・名前が空なら保存しない', async () => {
    await expect(createPreset({ name: '休憩だけ', blocks: [{ kind: 'break', min: 5 }], repeat: false })).rejects.toThrow('作業ブロック');
    await expect(createPreset({ name: '長すぎ', blocks: [{ kind: 'work', min: 721 }], repeat: false })).rejects.toThrow('1〜720');
    await expect(createPreset({ name: ' ', blocks, repeat: false })).rejects.toThrow('プリセット名');
  });

  it('最後の 1 つは削除できない', async () => {
    const all = await db.presets.toArray();
    for (const p of all) await db.presets.update(p.id, { deleted: true });
    const p = await createPreset({ name: '残る', blocks, repeat: false });
    await expect(deletePreset(p.id)).rejects.toThrow('1 つ以上');
  });

  it('タイマーの実行中（一時停止中を含む）は、使っているプリセットを編集・削除できない', async () => {
    const p = await createPreset({ name: '使用中', blocks, repeat: false });
    await createPreset({ name: 'ほか', blocks, repeat: false });
    await db.kv.put({ key: 'activeTimer', value: { ...IDLE_TIMER, presetId: p.id, startedAt: '2026-11-20T20:00:00.000+09:00', pausedAt: '2026-11-20T20:05:00.000+09:00', blockDurationSec: 3000 } });
    await expect(updatePreset(p.id, { name: 'x', blocks, repeat: false })).rejects.toThrow('実行中');
    await expect(deletePreset(p.id)).rejects.toThrow('実行中');
  });
});

describe('設定', () => {
  it('保存していなければ初期値、変更した項目だけ上書きされる', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    await updateSettings({ stopwatchCheckMin: 60 });
    expect(await getSettings()).toEqual({ ...DEFAULT_SETTINGS, stopwatchCheckMin: 60 });
  });
});

describe('記録の手動追加・編集・削除', () => {
  const input = {
    taskId: null, type: 'manual' as const, startAt: '2026-11-19T20:00:00.000+09:00', endAt: '2026-11-19T20:30:00.000+09:00',
    durationSec: 1800, completed: true, note: ' 模写 ',
  };

  it('追加できる。手動の記録は completed にしない', async () => {
    const s = await createSession(input);
    expect(s).toMatchObject({ type: 'manual', durationSec: 1800, completed: false, note: '模写', deleted: false });
  });

  it('おかしな入力は保存しない', async () => {
    await expect(createSession({ ...input, endAt: input.startAt })).rejects.toThrow('終了は開始より後');
    await expect(createSession({ ...input, durationSec: 59 })).rejects.toThrow('1分未満');
    await expect(createSession({ ...input, durationSec: 3600 })).rejects.toThrow('作業時間が');
    await expect(createSession({ ...input, endAt: '2026-11-21T20:00:00.000+09:00' })).rejects.toThrow('24時間');
  });

  it('日付をまたぐ記録も保存できる', async () => {
    const s = await createSession({ ...input, startAt: '2026-11-19T23:30:00.000+09:00', endAt: '2026-11-20T00:45:00.000+09:00', durationSec: 4500 });
    expect(s.durationSec).toBe(4500);
  });

  it('すべての項目を編集でき、削除は印を付けるだけ', async () => {
    const s = await createSession(input);
    const edited = await updateSession(s.id, { ...input, type: 'timer', completed: true, durationSec: 1500, taskId: 't1', note: '' });
    expect(edited).toMatchObject({ id: s.id, type: 'timer', completed: true, durationSec: 1500, taskId: 't1', note: '', createdAt: s.createdAt });
    await deleteSession(s.id);
    expect((await db.sessions.get(s.id))?.deleted).toBe(true);
  });
});
