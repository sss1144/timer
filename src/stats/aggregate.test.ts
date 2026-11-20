import { describe, expect, it } from 'vitest';
import { computeStats, makePeriod, periodLabel, shiftAnchor, timelineOfDay } from './aggregate';
import type { Project, Session, Task } from '../db/types';
import { toIsoLocal } from '../lib/time';

const at = (y: number, m: number, d: number, h = 0, min = 0) => toIsoLocal(new Date(y, m - 1, d, h, min));

const project = (id: string, createdAt: string, extra: Partial<Project> = {}): Project => ({
  id, name: id, color: '#2a78d6', archived: false, deleted: false, createdAt, updatedAt: createdAt, ...extra,
});
const task = (id: string, projectId: string | null, extra: Partial<Task> = {}): Task => ({
  id, projectId, title: id, estimatedMin: null, repeat: null, dueDate: null, note: '', done: false, doneAt: null, deleted: false,
  createdAt: '', updatedAt: '', ...extra,
});
let n = 0;
const session = (taskId: string | null, startAt: string, endAt: string, durationSec: number, extra: Partial<Session> = {}): Session => ({
  id: `s${n++}`, taskId, type: 'stopwatch', startAt, endAt, durationSec, completed: false, note: '', deleted: false,
  createdAt: '', updatedAt: '', ...extra,
});

describe('makePeriod', () => {
  it('週は月曜始まり（設定で日曜始まり）', () => {
    const mon = makePeriod('week', '2026-11-19', 'mon', 0); // 木曜
    expect(mon.days[0]).toBe('2026-11-16');
    expect(mon.days[6]).toBe('2026-11-22');
    const sun = makePeriod('week', '2026-11-19', 'sun', 0);
    expect(sun.days[0]).toBe('2026-11-15');
    // 日曜日を基準にした月曜始まりの週は、前の月曜から
    expect(makePeriod('week', '2026-11-22', 'mon', 0).days[0]).toBe('2026-11-16');
  });

  it('月はその月の日数分', () => {
    expect(makePeriod('month', '2026-11-19', 'mon', 0).days).toHaveLength(30);
    expect(makePeriod('month', '2028-02-10', 'mon', 0).days).toHaveLength(29);
  });

  it('範囲は日付の区切り時刻から', () => {
    const p = makePeriod('day', '2026-11-19', 'mon', 4);
    expect(p.start).toEqual(new Date(2026, 10, 19, 4));
    expect(p.end).toEqual(new Date(2026, 10, 20, 4));
  });

  it('前後の期間へ移動し、見出しを作る', () => {
    expect(shiftAnchor('day', '2026-11-30', 1)).toBe('2026-12-01');
    expect(shiftAnchor('week', '2026-11-19', -1)).toBe('2026-11-12');
    expect(shiftAnchor('month', '2026-01-31', -1)).toBe('2025-12-01');
    expect(periodLabel(makePeriod('week', '2026-11-19', 'mon', 0))).toBe('11/16(月) 〜 11/22(日)');
    expect(periodLabel(makePeriod('month', '2026-11-19', 'mon', 0))).toBe('2026年11月');
  });
});

describe('computeStats', () => {
  const projects = [project('イラスト', '2026-01-01'), project('学習', '2026-01-02'), project('古い', '2026-01-03', { deleted: true })];
  const tasks = [
    task('デッサン', 'イラスト', { done: true, doneAt: at(2026, 11, 18, 21) }),
    task('模写', 'イラスト'),
    task('Excel', '学習', { done: true, doneAt: at(2026, 11, 10, 9) }),
    task('雑務', null),
    task('消したタスク', '学習', { deleted: true }),
    task('消したプロジェクトのタスク', '古い'),
  ];
  const week = makePeriod('week', '2026-11-19', 'mon', 0);

  it('合計・完了タスク・日別・プロジェクト別・タスク別', () => {
    const sessions = [
      session('デッサン', at(2026, 11, 16, 20), at(2026, 11, 16, 20, 25), 1500, { type: 'timer', completed: true }),
      session('デッサン', at(2026, 11, 16, 21), at(2026, 11, 16, 21, 10), 600, { type: 'timer', completed: false }),
      session('Excel', at(2026, 11, 18, 9), at(2026, 11, 18, 10), 3600),
      session(null, at(2026, 11, 18, 12), at(2026, 11, 18, 12, 30), 1800),
      session('雑務', at(2026, 11, 19, 8), at(2026, 11, 19, 8, 20), 1200),
      session('消したタスク', at(2026, 11, 19, 9), at(2026, 11, 19, 9, 10), 600),
      session('消したプロジェクトのタスク', at(2026, 11, 19, 10), at(2026, 11, 19, 10, 10), 600),
      session('模写', at(2026, 11, 20, 10), at(2026, 11, 20, 10, 30), 1800, { deleted: true }), // 削除済みの記録
      session('模写', at(2026, 11, 23, 10), at(2026, 11, 23, 10, 30), 1800), // 翌週
    ];
    const st = computeStats(sessions, tasks, projects, week, 0);
    expect(st.totalSec).toBe(1500 + 600 + 3600 + 1800 + 1200 + 600 + 600);
    expect(st.completedTasks).toBe(1); // Excel は先週完了
    expect(st.byDay.map(d => d.sec)).toEqual([2100, 0, 5400, 2400, 0, 0, 0]);
    expect(st.bySeries.map(s => [s.name, s.sec])).toEqual([
      ['学習', 4200], // 削除済みタスクの記録も、そのプロジェクトに数える
      ['イラスト', 2100],
      ['プロジェクトなし', 1800], // 雑務 + 削除されたプロジェクトのタスク（同じ時間なら プロジェクトなし → 未分類 の順）
      ['未分類', 1800],
    ]);
    expect(st.bySeries[0].share).toBeCloseTo(4200 / st.totalSec);
    expect(st.byTask.map(t => [t.title, t.sec])).toEqual([
      ['Excel', 3600],
      ['デッサン', 2100],
      ['未分類', 1800],
      ['雑務', 1200],
      ['削除済みタスク', 600],
      ['消したプロジェクトのタスク', 600],
    ]);
  });

  it('日をまたぐ記録は開始した日にすべて数える', () => {
    const s = session('模写', at(2026, 11, 22, 23, 30), at(2026, 11, 23, 0, 45), 4500);
    const st = computeStats([s], tasks, projects, week, 0);
    expect(st.byDay[6]).toMatchObject({ day: '2026-11-22', sec: 4500 });
    expect(computeStats([s], tasks, projects, makePeriod('week', '2026-11-23', 'mon', 0), 0).totalSec).toBe(0);
  });

  it('日付の区切りが 4 時なら、深夜 2 時の作業は前の日', () => {
    const s = session('模写', at(2026, 11, 20, 2), at(2026, 11, 20, 2, 30), 1800);
    const st = computeStats([s], tasks, projects, week, 4);
    expect(st.byDay.find(d => d.sec > 0)?.day).toBe('2026-11-19');
  });
});

describe('timelineOfDay', () => {
  it('その日に開始した記録を 0〜1 の位置にし、はみ出す部分は切る', () => {
    const sessions = [
      session('a', at(2026, 11, 19, 6), at(2026, 11, 19, 12), 6 * 3600),
      session('b', at(2026, 11, 19, 23), at(2026, 11, 20, 1), 7200),
      session('c', at(2026, 11, 18, 23), at(2026, 11, 19, 1), 7200), // 前の日に開始 → 出さない
    ];
    const segs = timelineOfDay(sessions, '2026-11-19', 0);
    expect(segs.map(s => [s.session.taskId, s.from, s.to, s.cutEnd])).toEqual([
      ['a', 0.25, 0.5, false],
      ['b', 23 / 24, 1, true],
    ]);
  });
  it('区切り時刻から 24 時間の帯', () => {
    const segs = timelineOfDay([session('a', at(2026, 11, 20, 1), at(2026, 11, 20, 2), 3600)], '2026-11-19', 4);
    expect(segs[0].from).toBeCloseTo(21 / 24);
  });
});
