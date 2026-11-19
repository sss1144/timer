import type { Project, Session, Task } from './types';

export type TaskSummary = { totalSec: number; completedPomodoros: number };

/** タスクごとの合計作業時間と完了ポモドーロ数（削除済みの記録は数えない） */
export function summarizeByTask(sessions: Session[]): Map<string | null, TaskSummary> {
  const map = new Map<string | null, TaskSummary>();
  for (const s of sessions) {
    if (s.deleted) continue;
    const cur = map.get(s.taskId) ?? { totalSec: 0, completedPomodoros: 0 };
    cur.totalSec += s.durationSec;
    if (s.type === 'pomodoro' && s.completed) cur.completedPomodoros += 1;
    map.set(s.taskId, cur);
  }
  return map;
}

/** 表示するプロジェクト（削除済みは除く。作った順） */
export function listProjects(projects: Project[], includeArchived: boolean): Project[] {
  return projects
    .filter(p => !p.deleted && (includeArchived || !p.archived))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export type TaskStatusFilter = 'open' | 'done';
/** 'all' = すべて、'none' = プロジェクトなし、それ以外はプロジェクトの id */
export type ProjectFilter = 'all' | 'none' | string;

export type TaskFilter = {
  status: TaskStatusFilter;
  project: ProjectFilter;
  /** アーカイブしたプロジェクトのタスクも表示するか */
  includeArchived: boolean;
};

export function filterTasks(tasks: Task[], projects: Project[], filter: TaskFilter): Task[] {
  const byId = new Map(projects.map(p => [p.id, p]));
  return tasks.filter(t => {
    if (t.deleted) return false;
    if (filter.status === 'open' ? t.done : !t.done) return false;
    const project = t.projectId ? byId.get(t.projectId) : undefined;
    // プロジェクトが見つからない（削除された）タスクは「プロジェクトなし」として扱う
    const projectKey = project && !project.deleted ? project.id : 'none';
    if (filter.project !== 'all' && filter.project !== projectKey) return false;
    if (!filter.includeArchived && project?.archived && filter.project === 'all') return false;
    return true;
  });
}

/** 未完了は期限の近い順（期限なしは後ろ）→ 作った順。完了済みは完了した新しい順 */
export function sortTasks(tasks: Task[], status: TaskStatusFilter): Task[] {
  const copy = [...tasks];
  if (status === 'done') return copy.sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  return copy.sort((a, b) => {
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export type TaskGroup = { project: Project | null; tasks: Task[] };

/** プロジェクトごとにまとめる（プロジェクトの並び順 → 最後に「プロジェクトなし」） */
export function groupByProject(tasks: Task[], projects: Project[]): TaskGroup[] {
  const ordered = listProjects(projects, true);
  const known = new Set(ordered.map(p => p.id));
  const groups: TaskGroup[] = ordered.map(p => ({ project: p, tasks: tasks.filter(t => t.projectId === p.id) }));
  groups.push({ project: null, tasks: tasks.filter(t => !t.projectId || !known.has(t.projectId)) });
  return groups.filter(g => g.tasks.length > 0);
}

/** 期限の状態（今日の日付 YYYY-MM-DD と比べる） */
export function dueStatus(dueDate: string | null, today: string): 'none' | 'overdue' | 'today' | 'future' {
  if (!dueDate) return 'none';
  if (dueDate < today) return 'overdue';
  return dueDate === today ? 'today' : 'future';
}
