/* 統計の計算（画面に依存しない純粋な関数。自動テストの対象）
 * - 記録は開始した日に数える（日をまたいでも分割しない）
 * - 「日」は日付の区切り時刻（dayBoundaryHour）で区切る */

import type { Project, Session, Settings, Task } from '../db/types';
import { dayKeyOf, rangeOfDayKey, shiftDayKey } from '../lib/day';
import { formatDateKey } from '../lib/time';

export type PeriodKind = 'day' | 'week' | 'month';

export type Period = {
  kind: PeriodKind;
  /** 期間に含まれる日（YYYY-MM-DD）を順に */
  days: string[];
  start: Date;
  end: Date;
};

const parseKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
};

export function makePeriod(kind: PeriodKind, anchor: string, weekStart: Settings['weekStart'], boundaryHour: number): Period {
  let days: string[];
  if (kind === 'day') {
    days = [anchor];
  } else if (kind === 'week') {
    const { y, m, d } = parseKey(anchor);
    const dow = new Date(y, m - 1, d).getDay(); // 0 = 日曜
    const offset = weekStart === 'mon' ? (dow + 6) % 7 : dow;
    const first = shiftDayKey(anchor, -offset);
    days = Array.from({ length: 7 }, (_, i) => shiftDayKey(first, i));
  } else {
    const { y, m } = parseKey(anchor);
    const count = new Date(y, m, 0).getDate();
    const first = `${y}-${String(m).padStart(2, '0')}-01`;
    days = Array.from({ length: count }, (_, i) => shiftDayKey(first, i));
  }
  return {
    kind,
    days,
    start: rangeOfDayKey(days[0], boundaryHour).start,
    end: rangeOfDayKey(days[days.length - 1], boundaryHour).end,
  };
}

/** 前後の期間へ移動したときの基準日 */
export function shiftAnchor(kind: PeriodKind, anchor: string, dir: 1 | -1): string {
  if (kind === 'day') return shiftDayKey(anchor, dir);
  if (kind === 'week') return shiftDayKey(anchor, 7 * dir);
  const { y, m } = parseKey(anchor);
  const date = new Date(y, m - 1 + dir, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

export function periodLabel(p: Period): string {
  if (p.kind === 'day') return formatDateKey(p.days[0]);
  if (p.kind === 'week') return `${formatDateKey(p.days[0])} 〜 ${formatDateKey(p.days[6])}`;
  const { y, m } = parseKey(p.days[0]);
  return `${y}年${m}月`;
}

/* ---------- 色分けの単位（プロジェクト） ---------- */

export type Series = {
  key: string;
  name: string;
  /** プロジェクトの色。null は灰色（未分類・プロジェクトなし・削除済みタスク） */
  color: string | null;
  /** 並び順（プロジェクトの作成順 → プロジェクトなし → 未分類 → 削除済みタスク） */
  order: number;
};

export const SERIES_UNCATEGORIZED = 'uncategorized';
export const SERIES_NO_PROJECT = 'no-project';
export const SERIES_DELETED_TASK = 'deleted-task';

export function makeSeriesResolver(tasks: Task[], projects: Project[]) {
  const taskById = new Map(tasks.map(t => [t.id, t]));
  const ordered = projects.filter(p => !p.deleted).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const projectSeries = new Map<string, Series>(
    ordered.map((p, i) => [p.id, { key: p.id, name: p.name, color: p.color, order: i }]),
  );
  const n = ordered.length;
  const noProject: Series = { key: SERIES_NO_PROJECT, name: 'プロジェクトなし', color: null, order: n };
  const uncategorized: Series = { key: SERIES_UNCATEGORIZED, name: '未分類', color: null, order: n + 1 };
  const deletedTask: Series = { key: SERIES_DELETED_TASK, name: '削除済みタスク', color: null, order: n + 2 };

  return (taskId: string | null): Series => {
    if (!taskId) return uncategorized;
    const task = taskById.get(taskId);
    if (!task) return deletedTask;
    // 削除済みタスクでも、プロジェクトが分かればそのプロジェクトに数える
    return (task.projectId && projectSeries.get(task.projectId)) || noProject;
  };
}

/* ---------- 集計 ---------- */

export type SeriesTotal = Series & { sec: number; share: number };
export type TaskTotal = {
  key: string;
  title: string;
  series: Series;
  deleted: boolean;
  sec: number;
  pomodoros: number;
};
export type DayTotal = { day: string; sec: number; bySeries: Map<string, number> };

export type Stats = {
  sessions: Session[];
  totalSec: number;
  completedPomodoros: number;
  completedTasks: number;
  byDay: DayTotal[];
  bySeries: SeriesTotal[];
  byTask: TaskTotal[];
};

const msOf = (iso: string) => new Date(iso).getTime();

export function computeStats(sessions: Session[], tasks: Task[], projects: Project[], period: Period, boundaryHour: number): Stats {
  const seriesOf = makeSeriesResolver(tasks, projects);
  const taskById = new Map(tasks.map(t => [t.id, t]));
  const daySet = new Set(period.days);
  const inPeriod = sessions
    .filter(s => !s.deleted && daySet.has(dayKeyOf(new Date(s.startAt), boundaryHour)))
    .sort((a, b) => msOf(a.startAt) - msOf(b.startAt));

  const byDayMap = new Map<string, DayTotal>(period.days.map(d => [d, { day: d, sec: 0, bySeries: new Map() }]));
  const seriesMap = new Map<string, SeriesTotal>();
  const taskMap = new Map<string, TaskTotal>();
  let totalSec = 0;
  let completedPomodoros = 0;

  for (const s of inPeriod) {
    const series = seriesOf(s.taskId);
    totalSec += s.durationSec;
    const done = s.type === 'pomodoro' && s.completed;
    if (done) completedPomodoros++;

    const day = byDayMap.get(dayKeyOf(new Date(s.startAt), boundaryHour))!;
    day.sec += s.durationSec;
    day.bySeries.set(series.key, (day.bySeries.get(series.key) ?? 0) + s.durationSec);

    const st = seriesMap.get(series.key) ?? { ...series, sec: 0, share: 0 };
    st.sec += s.durationSec;
    seriesMap.set(series.key, st);

    const task = s.taskId ? taskById.get(s.taskId) : undefined;
    const deleted = !!s.taskId && (!task || task.deleted);
    // 削除済みタスクは 1 行にまとめる
    const key = !s.taskId ? SERIES_UNCATEGORIZED : deleted ? SERIES_DELETED_TASK : s.taskId;
    const title = !s.taskId ? '未分類' : deleted ? '削除済みタスク' : task!.title;
    const tt = taskMap.get(key) ?? { key, title, series, deleted, sec: 0, pomodoros: 0 };
    tt.sec += s.durationSec;
    if (done) tt.pomodoros++;
    taskMap.set(key, tt);
  }

  const bySeries = [...seriesMap.values()]
    .map(x => ({ ...x, share: totalSec ? x.sec / totalSec : 0 }))
    .sort((a, b) => b.sec - a.sec || a.order - b.order);
  const byTask = [...taskMap.values()].sort((a, b) => b.sec - a.sec || a.title.localeCompare(b.title));

  const from = period.start.getTime();
  const to = period.end.getTime();
  const completedTasks = tasks.filter(t => !t.deleted && t.done && t.doneAt && msOf(t.doneAt) >= from && msOf(t.doneAt) < to).length;

  return {
    sessions: inPeriod,
    totalSec,
    completedPomodoros,
    completedTasks,
    byDay: period.days.map(d => byDayMap.get(d)!),
    bySeries,
    byTask,
  };
}

/* ---------- 1 日のタイムライン ---------- */

export type TimelineSegment = {
  session: Session;
  /** その日の範囲の中での位置（0〜1） */
  from: number;
  to: number;
  /** 日の範囲からはみ出して切った部分があるか */
  cutEnd: boolean;
};

/** その日に開始した記録を、その日の範囲（区切り時刻から 24 時間）の帯に並べる。はみ出す部分は端で切る */
export function timelineOfDay(sessions: Session[], day: string, boundaryHour: number): TimelineSegment[] {
  const { start, end } = rangeOfDayKey(day, boundaryHour);
  const s0 = start.getTime();
  const span = end.getTime() - s0;
  return sessions
    .filter(s => !s.deleted && dayKeyOf(new Date(s.startAt), boundaryHour) === day)
    .map(s => {
      const a = Math.max(0, (msOf(s.startAt) - s0) / span);
      const rawEnd = (msOf(s.endAt) - s0) / span;
      return { session: s, from: a, to: Math.min(1, rawEnd), cutEnd: rawEnd > 1 };
    })
    .sort((x, y) => x.from - y.from);
}
