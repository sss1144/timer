import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import {
  cleanDueDate,
  cleanEstimate,
  createProject,
  createTask,
  deleteTask,
  getSettings,
  setTaskDone,
  updateProject,
  updateSettings,
  updateTask,
  ValidationError,
} from './repo';
import { DEFAULT_SETTINGS } from './types';

const baseTask = { title: '手のデッサン', projectId: null, estimatedPomodoros: null, dueDate: null, note: '' };

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
    const t = await createTask({ ...baseTask, title: ' 模写 ', estimatedPomodoros: 3.4, dueDate: '2026-11-30', note: ' メモ ' });
    expect(t).toMatchObject({ title: '模写', estimatedPomodoros: 3, dueDate: '2026-11-30', note: 'メモ', done: false, doneAt: null });
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
      id: 's1', taskId: t.id, type: 'pomodoro', startAt: '2026-11-19T20:00:00.000+09:00', endAt: '2026-11-19T20:25:00.000+09:00',
      durationSec: 1500, completed: true, note: '', deleted: false, createdAt: '', updatedAt: '',
    });
    await deleteTask(t.id);
    expect((await db.tasks.get(t.id))?.deleted).toBe(true);
    expect(await db.sessions.count()).toBe(1);
  });

  it('編集で一部の項目だけ変えられる', async () => {
    const t = await createTask({ ...baseTask, estimatedPomodoros: 4 });
    const edited = await updateTask(t.id, { dueDate: '2026-12-01', estimatedPomodoros: null });
    expect(edited.title).toBe(t.title);
    expect(edited.dueDate).toBe('2026-12-01');
    expect(edited.estimatedPomodoros).toBeNull();
  });
});

describe('入力の整形', () => {
  it('見積もりは 1〜99 の整数、それ以外は null', () => {
    expect(cleanEstimate(0)).toBeNull();
    expect(cleanEstimate(-2)).toBeNull();
    expect(cleanEstimate(Number.NaN)).toBeNull();
    expect(cleanEstimate(2.6)).toBe(3);
    expect(cleanEstimate(500)).toBe(99);
  });
  it('期限は YYYY-MM-DD だけ受け付ける', () => {
    expect(cleanDueDate('2026-11-19')).toBe('2026-11-19');
    expect(cleanDueDate('11/19')).toBeNull();
    expect(cleanDueDate('')).toBeNull();
  });
});

describe('設定', () => {
  it('保存していなければ初期値、変更した項目だけ上書きされる', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    await updateSettings({ workMin: 50 });
    expect(await getSettings()).toEqual({ ...DEFAULT_SETTINGS, workMin: 50 });
  });
});
