import { describe, expect, it } from 'vitest';
import { dueStatus, filterTasks, findOverlaps, groupByProject, listProjects, sessionsInRange, sortTasks, summarizeByTask } from './queries';
import type { Project, Session, Task } from './types';

const project = (id: string, extra: Partial<Project> = {}): Project => ({
  id, name: id, color: '#4f7cff', archived: false, deleted: false,
  createdAt: `2026-11-0${id.length}T00:00:00.000+09:00`, updatedAt: '', ...extra,
});
const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id, projectId: null, title: id, estimatedMin: null, repeat: null, dueDate: null, note: '', done: false, doneAt: null,
  deleted: false, createdAt: `2026-11-19T10:00:0${id.length}.000+09:00`, updatedAt: '', ...extra,
});
const session = (taskId: string | null, extra: Partial<Session> = {}): Session => ({
  id: crypto.randomUUID(), taskId, type: 'timer', startAt: '', endAt: '', durationSec: 1500, completed: true,
  note: '', deleted: false, createdAt: '', updatedAt: '', ...extra,
});

describe('summarizeByTask', () => {
  it('タスクごとの合計時間（削除済みは数えない）', () => {
    const m = summarizeByTask([
      session('a'),
      session('a', { completed: false, durationSec: 600 }),
      session('a', { type: 'stopwatch', completed: false, durationSec: 3600 }),
      session('a', { deleted: true }),
      session(null, { type: 'manual', completed: false, durationSec: 120 }),
    ]);
    expect(m.get('a')).toEqual({ totalSec: 1500 + 600 + 3600 });
    expect(m.get(null)).toEqual({ totalSec: 120 });
  });
});

describe('listProjects', () => {
  it('削除済みは常に除き、アーカイブは指定したときだけ含める', () => {
    const ps = [project('bb'), project('a', { archived: true }), project('ccc', { deleted: true })];
    expect(listProjects(ps, false).map(p => p.id)).toEqual(['bb']);
    expect(listProjects(ps, true).map(p => p.id)).toEqual(['a', 'bb']);
  });
});

describe('filterTasks', () => {
  const projects = [project('p1'), project('p2', { archived: true }), project('p3', { deleted: true })];
  const tasks = [
    task('t1', { projectId: 'p1' }),
    task('t2', { projectId: 'p1', done: true }),
    task('t3', { projectId: 'p2' }),
    task('t4'),
    task('t5', { projectId: 'p3' }),
    task('t6', { deleted: true }),
  ];
  const ids = (ts: Task[]) => ts.map(t => t.id);

  it('未完了 / 完了済みで分ける。削除済みタスクは出さない', () => {
    expect(ids(filterTasks(tasks, projects, { status: 'open', project: 'all', includeArchived: true }))).toEqual(['t1', 't3', 't4', 't5']);
    expect(ids(filterTasks(tasks, projects, { status: 'done', project: 'all', includeArchived: true }))).toEqual(['t2']);
  });
  it('アーカイブしたプロジェクトのタスクは、指定しない限り隠す', () => {
    expect(ids(filterTasks(tasks, projects, { status: 'open', project: 'all', includeArchived: false }))).toEqual(['t1', 't4', 't5']);
    expect(ids(filterTasks(tasks, projects, { status: 'open', project: 'p2', includeArchived: false }))).toEqual(['t3']);
  });
  it('プロジェクト別。削除されたプロジェクトのタスクは「プロジェクトなし」に入る', () => {
    expect(ids(filterTasks(tasks, projects, { status: 'open', project: 'p1', includeArchived: false }))).toEqual(['t1']);
    expect(ids(filterTasks(tasks, projects, { status: 'open', project: 'none', includeArchived: false }))).toEqual(['t4', 't5']);
  });
});

describe('sortTasks', () => {
  it('未完了は期限の近い順、期限なしは後ろ', () => {
    const ts = [task('a'), task('bb', { dueDate: '2026-12-01' }), task('ccc', { dueDate: '2026-11-20' }), task('dddd')];
    expect(sortTasks(ts, 'open').map(t => t.id)).toEqual(['ccc', 'bb', 'a', 'dddd']);
  });
  it('完了済みは完了した新しい順', () => {
    const ts = [task('a', { doneAt: '2026-11-18T10:00:00.000+09:00' }), task('b', { doneAt: '2026-11-19T10:00:00.000+09:00' })];
    expect(sortTasks(ts, 'done').map(t => t.id)).toEqual(['b', 'a']);
  });
});

describe('groupByProject', () => {
  it('プロジェクト順に並べ、最後に「プロジェクトなし」。空のグループは出さない', () => {
    const projects = [project('p1'), project('pp2'), project('ppp3')];
    const groups = groupByProject([task('t1', { projectId: 'pp2' }), task('t2'), task('t3', { projectId: 'p1' }), task('t4', { projectId: 'gone' })], projects);
    expect(groups.map(g => [g.project?.id ?? null, g.tasks.map(t => t.id)])).toEqual([
      ['p1', ['t3']],
      ['pp2', ['t1']],
      [null, ['t2', 't4']],
    ]);
  });
});

describe('dueStatus', () => {
  it('今日と比べる', () => {
    expect(dueStatus(null, '2026-11-19')).toBe('none');
    expect(dueStatus('2026-11-18', '2026-11-19')).toBe('overdue');
    expect(dueStatus('2026-11-19', '2026-11-19')).toBe('today');
    expect(dueStatus('2026-11-20', '2026-11-19')).toBe('future');
  });
});

describe('sessionsInRange', () => {
  it('範囲内に開始した記録を時刻順に。削除済みは除く。日をまたぐ記録は開始した日に入る', () => {
    const range = { start: new Date('2026-11-19T00:00:00+09:00'), end: new Date('2026-11-20T00:00:00+09:00') };
    const list = sessionsInRange(
      [
        session('a', { id: 'late', startAt: '2026-11-19T23:30:00.000+09:00', endAt: '2026-11-20T00:45:00.000+09:00' }),
        session('a', { id: 'early', startAt: '2026-11-19T09:00:00.000+09:00', endAt: '2026-11-19T09:25:00.000+09:00' }),
        session('a', { id: 'deleted', startAt: '2026-11-19T10:00:00.000+09:00', endAt: '2026-11-19T10:25:00.000+09:00', deleted: true }),
        session('a', { id: 'next', startAt: '2026-11-20T00:10:00.000+09:00', endAt: '2026-11-20T00:35:00.000+09:00' }),
      ],
      range,
    );
    expect(list.map(s => s.id)).toEqual(['early', 'late']);
  });
});

describe('findOverlaps', () => {
  const base = [
    session('a', { id: 's1', startAt: '2026-11-19T20:00:00.000+09:00', endAt: '2026-11-19T20:25:00.000+09:00' }),
    session('a', { id: 's2', startAt: '2026-11-19T21:00:00.000+09:00', endAt: '2026-11-19T22:00:00.000+09:00' }),
    session('a', { id: 's3', startAt: '2026-11-19T20:10:00.000+09:00', endAt: '2026-11-19T20:20:00.000+09:00', deleted: true }),
  ];
  const ids = (xs: Session[]) => xs.map(s => s.id);
  it('一部でも重なれば警告の対象', () => {
    expect(ids(findOverlaps(base, { startAt: '2026-11-19T20:20:00.000+09:00', endAt: '2026-11-19T21:10:00.000+09:00' }))).toEqual(['s1', 's2']);
  });
  it('ちょうど続く記録は重ならない', () => {
    expect(findOverlaps(base, { startAt: '2026-11-19T20:25:00.000+09:00', endAt: '2026-11-19T21:00:00.000+09:00' })).toEqual([]);
  });
  it('編集中の記録自身は除く', () => {
    expect(findOverlaps(base, { id: 's1', startAt: '2026-11-19T20:00:00.000+09:00', endAt: '2026-11-19T20:30:00.000+09:00' })).toEqual([]);
  });
  it('時差の違う書き方でも正しく比べる', () => {
    expect(ids(findOverlaps(base, { startAt: '2026-11-19T11:05:00.000Z', endAt: '2026-11-19T11:15:00.000Z' }))).toEqual(['s1']);
  });
});
