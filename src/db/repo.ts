import { db } from './db';
import { DEFAULT_SETTINGS, LIMITS, PROJECT_COLORS, type Project, type Settings, type Task } from './types';
import { nowIso } from '../lib/time';

/* ---------- 入力の整形 ---------- */

export class ValidationError extends Error {}

function cleanText(value: string, max: number, emptyMessage?: string): string {
  const text = value.trim().slice(0, max);
  if (!text && emptyMessage) throw new ValidationError(emptyMessage);
  return text;
}

export function cleanColor(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : PROJECT_COLORS[0];
}

export function cleanEstimate(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  return n >= 1 ? Math.min(n, LIMITS.maxEstimate) : null;
}

export function cleanDueDate(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/* ---------- プロジェクト ---------- */

export type ProjectInput = { name: string; color: string };

export async function createProject(input: ProjectInput): Promise<Project> {
  const now = nowIso();
  const project: Project = {
    id: crypto.randomUUID(),
    name: cleanText(input.name, LIMITS.projectName, 'プロジェクト名を入力してください'),
    color: cleanColor(input.color),
    archived: false,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.projects.add(project);
  return project;
}

export async function updateProject(id: string, patch: Partial<ProjectInput & { archived: boolean }>): Promise<Project> {
  return db.transaction('rw', db.projects, async () => {
    const current = await db.projects.get(id);
    if (!current) throw new ValidationError('プロジェクトが見つかりません');
    const next: Project = { ...current, updatedAt: nowIso() };
    if (patch.name !== undefined) next.name = cleanText(patch.name, LIMITS.projectName, 'プロジェクト名を入力してください');
    if (patch.color !== undefined) next.color = cleanColor(patch.color);
    if (patch.archived !== undefined) next.archived = patch.archived;
    await db.projects.put(next);
    return next;
  });
}

/* ---------- タスク ---------- */

export type TaskInput = {
  title: string;
  projectId: string | null;
  estimatedPomodoros: number | null;
  dueDate: string | null;
  note: string;
};

export async function createTask(input: TaskInput): Promise<Task> {
  const now = nowIso();
  const task: Task = {
    id: crypto.randomUUID(),
    projectId: input.projectId || null,
    title: cleanText(input.title, LIMITS.taskTitle, 'タスク名を入力してください'),
    estimatedPomodoros: cleanEstimate(input.estimatedPomodoros),
    dueDate: cleanDueDate(input.dueDate),
    note: cleanText(input.note, LIMITS.note),
    done: false,
    doneAt: null,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.tasks.add(task);
  return task;
}

async function patchTask(id: string, apply: (task: Task) => void): Promise<Task> {
  return db.transaction('rw', db.tasks, async () => {
    const current = await db.tasks.get(id);
    if (!current) throw new ValidationError('タスクが見つかりません');
    const next: Task = { ...current };
    apply(next);
    next.updatedAt = nowIso();
    await db.tasks.put(next);
    return next;
  });
}

export function updateTask(id: string, patch: Partial<TaskInput>): Promise<Task> {
  return patchTask(id, t => {
    if (patch.title !== undefined) t.title = cleanText(patch.title, LIMITS.taskTitle, 'タスク名を入力してください');
    if (patch.projectId !== undefined) t.projectId = patch.projectId || null;
    if (patch.estimatedPomodoros !== undefined) t.estimatedPomodoros = cleanEstimate(patch.estimatedPomodoros);
    if (patch.dueDate !== undefined) t.dueDate = cleanDueDate(patch.dueDate);
    if (patch.note !== undefined) t.note = cleanText(patch.note, LIMITS.note);
  });
}

export function setTaskDone(id: string, done: boolean): Promise<Task> {
  return patchTask(id, t => {
    t.done = done;
    t.doneAt = done ? nowIso() : null;
  });
}

/** 削除済みの印を付ける。記録（Session）は消さない */
export function deleteTask(id: string): Promise<Task> {
  return patchTask(id, t => {
    t.deleted = true;
  });
}

/* ---------- 設定 ---------- */

export async function getSettings(): Promise<Settings> {
  const row = await db.kv.get('settings');
  return { ...DEFAULT_SETTINGS, ...(row?.key === 'settings' ? row.value : {}) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  return db.transaction('rw', db.kv, async () => {
    const next = { ...(await getSettings()), ...patch };
    await db.kv.put({ key: 'settings', value: next });
    return next;
  });
}
