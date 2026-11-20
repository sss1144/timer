/* 繰り返しタスク（毎日）の今日の予定と実績（画面に依存しない純粋な関数。自動テストの対象）
 * - 今日の実績：今日（日付の区切り時刻で区切る）に開始した、そのタスクの記録の合計。計測中の時間も含める
 * - 実績が予定時間以上になったら「達成」。判定は今日の分だけ（過去の日は扱わない） */

import type { ActiveTimer, Project, Session, Task } from './types';
import { dayRange, isWithin } from '../lib/day';
import { elapsedMs, isRecording, type PresetPlan } from '../timer/engine';

export type DailyProgress = {
  task: Task;
  project: Project | null;
  actualSec: number;
  planSec: number;
  achieved: boolean;
  /** 0〜1（予定を超えたら 1） */
  ratio: number;
  /** 今このタスクを計測中か */
  live: boolean;
};

/** 今日の予定に出す繰り返しタスク：未完了・削除済みでない・アーカイブしたプロジェクトに入っていない
 * （includeArchived = true ならアーカイブしたプロジェクトのタスクも含める。タスク一覧の「アーカイブ済みも表示」用） */
export function dailyTasks(tasks: Task[], projects: Project[], includeArchived = false): Task[] {
  const archived = new Set(projects.filter(p => p.archived && !p.deleted).map(p => p.id));
  return tasks
    .filter(t => t.repeat && !t.done && !t.deleted && (includeArchived || !(t.projectId && archived.has(t.projectId))))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** 計測中の作業のうち、今日の分として数える秒数（今日に開始した作業だけ） */
function liveSecFor(taskId: string, timer: ActiveTimer | undefined, plan: PresetPlan | null, now: number, range: { start: Date; end: Date }): number {
  if (!timer?.startedAt || timer.taskId !== taskId || !isRecording(timer, plan) || !isWithin(timer.startedAt, range)) return 0;
  const ms = timer.mode === 'timer' ? Math.min(elapsedMs(timer, now), timer.blockDurationSec * 1000) : elapsedMs(timer, now);
  return Math.floor(ms / 1000);
}

export function todayProgress(args: {
  tasks: Task[];
  projects: Project[];
  sessions: Session[];
  timer?: ActiveTimer;
  plan?: PresetPlan | null;
  now: number;
  boundaryHour: number;
  includeArchived?: boolean;
}): DailyProgress[] {
  const { tasks, projects, sessions, timer, plan = null, now, boundaryHour, includeArchived = false } = args;
  const range = dayRange(new Date(now), boundaryHour);
  const byId = new Map(projects.map(p => [p.id, p]));
  const todaySec = new Map<string, number>();
  for (const s of sessions) {
    if (s.deleted || !s.taskId || !isWithin(s.startAt, range)) continue;
    todaySec.set(s.taskId, (todaySec.get(s.taskId) ?? 0) + s.durationSec);
  }
  return dailyTasks(tasks, projects, includeArchived).map(task => {
    const live = liveSecFor(task.id, timer, plan, now, range);
    const actualSec = (todaySec.get(task.id) ?? 0) + live;
    const planSec = (task.repeat?.minPerDay ?? 0) * 60;
    const project = task.projectId ? byId.get(task.projectId) ?? null : null;
    return {
      task,
      project: project && !project.deleted ? project : null,
      actualSec,
      planSec,
      achieved: planSec > 0 && actualSec >= planSec,
      ratio: planSec > 0 ? Math.min(1, actualSec / planSec) : 0,
      live: live > 0 || (!!timer?.startedAt && timer.taskId === task.id && isRecording(timer, plan)),
    };
  });
}
