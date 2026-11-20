import { describe, expect, it } from 'vitest';
import { dailyTasks, todayProgress } from './daily';
import { IDLE_TIMER, type ActiveTimer, type Project, type Session, type Task } from './types';
import { toIsoLocal } from '../lib/time';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m); // 2026-11-d
const iso = (d: Date) => toIsoLocal(d);

const project = (id: string, extra: Partial<Project> = {}): Project => ({
  id, name: id, color: '#2a78d6', archived: false, deleted: false, createdAt: '', updatedAt: '', ...extra,
});
const task = (id: string, minPerDay: number | null, extra: Partial<Task> = {}): Task => ({
  id, projectId: null, title: id, estimatedMin: null, repeat: minPerDay ? { minPerDay } : null, dueDate: null, note: '',
  done: false, doneAt: null, deleted: false, createdAt: `2026-11-01T00:00:0${id.length}.000+09:00`, updatedAt: '', ...extra,
});
let n = 0;
const session = (taskId: string, start: Date, min: number, extra: Partial<Session> = {}): Session => ({
  id: `s${n++}`, taskId, type: 'timer', startAt: iso(start), endAt: iso(new Date(start.getTime() + min * 60_000)),
  durationSec: min * 60, completed: true, note: '', deleted: false, createdAt: '', updatedAt: '', ...extra,
});

describe('dailyTasks', () => {
  it('未完了・削除済みでない・アーカイブしたプロジェクトに入っていない繰り返しタスクだけ', () => {
    const ids = dailyTasks(
      [
        task('a', 60),
        task('bb', null), // 繰り返しなし
        task('ccc', 30, { done: true }), // 繰り返しを終えた
        task('dddd', 30, { deleted: true }),
        task('eeeee', 30, { projectId: 'arch' }),
        task('ffffff', 30, { projectId: 'p1' }),
      ],
      [project('arch', { archived: true }), project('p1')],
    ).map(t => t.id);
    expect(ids).toEqual(['a', 'ffffff']);
  });
});

describe('todayProgress', () => {
  const tasks = [
    task('drawing', 60, { projectId: 'p1', createdAt: '2026-11-01T00:00:00.000+09:00' }),
    task('words', 20, { createdAt: '2026-11-02T00:00:00.000+09:00' }),
  ];
  const projects = [project('p1')];

  it('今日に開始した記録の合計と、予定時間との比較', () => {
    const sessions = [
      session('drawing', at(20, 9), 25),
      session('drawing', at(20, 20), 25),
      session('drawing', at(19, 21), 60), // きのう
      session('drawing', at(20, 22), 30, { deleted: true }), // 削除済み
      session('words', at(20, 7), 20),
    ];
    const r = todayProgress({ tasks, projects, sessions, now: at(20, 23).getTime(), boundaryHour: 0 });
    expect(r.map(x => [x.task.id, x.actualSec / 60, x.planSec / 60, x.achieved, x.ratio])).toEqual([
      ['drawing', 50, 60, false, 50 / 60],
      ['words', 20, 20, true, 1],
    ]);
    expect(r[0].project?.id).toBe('p1');
  });

  it('日付の区切りが 4 時なら、深夜 1 時の作業はきのうの分', () => {
    const sessions = [session('drawing', at(21, 1), 40), session('drawing', at(20, 21), 30)];
    const r = todayProgress({ tasks, projects, sessions, now: at(21, 2).getTime(), boundaryHour: 4 }); // まだ 11/20 の扱い
    expect(r[0].actualSec / 60).toBe(70);
    const next = todayProgress({ tasks, projects, sessions, now: at(21, 5).getTime(), boundaryHour: 4 });
    expect(next[0].actualSec).toBe(0);
  });

  it('計測中の時間も含める（今日に開始した作業だけ）', () => {
    const running: ActiveTimer = { ...IDLE_TIMER, mode: 'stopwatch', taskId: 'drawing', startedAt: iso(at(20, 21)) };
    const sessions = [session('drawing', at(20, 9), 25)];
    const r = todayProgress({ tasks, projects, sessions, timer: running, now: at(20, 21, 40).getTime(), boundaryHour: 0 });
    expect(r[0]).toMatchObject({ actualSec: 65 * 60, achieved: true, live: true });

    // きのう開始して日付をまたいだ作業は、今日の分には入れない（今日の記録 25 分だけ）
    const yesterday: ActiveTimer = { ...running, startedAt: iso(at(19, 23)) };
    expect(todayProgress({ tasks, projects, sessions, timer: yesterday, now: at(20, 0, 30).getTime(), boundaryHour: 0 })[0].actualSec).toBe(25 * 60);
  });

  it('ブロックタイマーの休憩中は増えない。作業ブロックはブロックの長さまで', () => {
    const plan = { blocks: [{ kind: 'work' as const, min: 25 }, { kind: 'break' as const, min: 5 }], repeat: true };
    const work: ActiveTimer = { ...IDLE_TIMER, presetId: 'x', taskId: 'words', startedAt: iso(at(20, 10)), blockDurationSec: 1500 };
    expect(todayProgress({ tasks, projects, sessions: [], timer: work, plan, now: at(20, 10, 10).getTime(), boundaryHour: 0 })[1].actualSec).toBe(600);
    const rest: ActiveTimer = { ...work, blockIndex: 1, blockDurationSec: 300 };
    expect(todayProgress({ tasks, projects, sessions: [], timer: rest, plan, now: at(20, 10, 3).getTime(), boundaryHour: 0 })[1].actualSec).toBe(0);
  });
});
