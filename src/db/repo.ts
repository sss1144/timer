import { db } from './db';
import { DEFAULT_SETTINGS, IDLE_TIMER, LIMITS, PROJECT_COLORS, type Project, type Session, type Settings, type Task, type TimerBlock, type TimerPreset } from './types';
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
  return n >= 1 ? Math.min(n, LIMITS.maxEstimateMin) : null;
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
  /** 見積もり時間（分）。繰り返しタスクでは使わない */
  estimatedMin: number | null;
  /** 毎日繰り返すなら 1 日あたりの予定時間（分）。null = 繰り返さない */
  repeat?: { minPerDay: number } | null;
  /** 期限。繰り返しタスクでは使わない */
  dueDate: string | null;
  note: string;
};

/** 繰り返しの予定時間を確かめる（1〜1440 分の整数、必須） */
export function cleanRepeat(repeat: { minPerDay: number } | null | undefined): { minPerDay: number } | null {
  if (!repeat) return null;
  const n = Math.round(Number(repeat.minPerDay));
  if (!Number.isFinite(n) || n < 1 || n > LIMITS.maxMinPerDay) {
    throw new ValidationError(`1 日の予定時間は 1〜${LIMITS.maxMinPerDay} 分にしてください`);
  }
  return { minPerDay: n };
}

/** 繰り返しタスクは見積もり時間と期限を持たない */
function applyRepeatRules(t: Pick<Task, 'repeat' | 'estimatedMin' | 'dueDate'>): void {
  if (t.repeat) {
    t.estimatedMin = null;
    t.dueDate = null;
  }
}

export async function createTask(input: TaskInput): Promise<Task> {
  const now = nowIso();
  const task: Task = {
    id: crypto.randomUUID(),
    projectId: input.projectId || null,
    title: cleanText(input.title, LIMITS.taskTitle, 'タスク名を入力してください'),
    estimatedMin: cleanEstimate(input.estimatedMin),
    repeat: cleanRepeat(input.repeat),
    dueDate: cleanDueDate(input.dueDate),
    note: cleanText(input.note, LIMITS.note),
    done: false,
    doneAt: null,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };
  applyRepeatRules(task);
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
    if (patch.estimatedMin !== undefined) t.estimatedMin = cleanEstimate(patch.estimatedMin);
    if (patch.dueDate !== undefined) t.dueDate = cleanDueDate(patch.dueDate);
    if (patch.repeat !== undefined) t.repeat = cleanRepeat(patch.repeat);
    if (patch.note !== undefined) t.note = cleanText(patch.note, LIMITS.note);
    applyRepeatRules(t);
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

/* ---------- 記録 ---------- */

/** タイマーが作った記録の下書きを保存できる形にする */
export function makeSession(draft: Pick<Session, 'taskId' | 'type' | 'startAt' | 'endAt' | 'durationSec' | 'completed'>): Session {
  const now = nowIso();
  return { id: crypto.randomUUID(), ...draft, note: '', deleted: false, createdAt: now, updatedAt: now };
}

export async function updateSessionNote(id: string, note: string): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const current = await db.sessions.get(id);
    if (!current) throw new ValidationError('記録が見つかりません');
    await db.sessions.put({ ...current, note: cleanText(note, LIMITS.note), updatedAt: nowIso() });
  });
}

export type SessionInput = Pick<Session, 'taskId' | 'type' | 'startAt' | 'endAt' | 'durationSec' | 'completed' | 'note'>;

/** 手動追加・編集の入力を確かめる。作業時間は開始〜終了の長さ以下（一時停止を除くと短くなる） */
export function validateSession(input: SessionInput): SessionInput {
  const start = new Date(input.startAt).getTime();
  const end = new Date(input.endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new ValidationError('日時を正しく入力してください');
  if (end <= start) throw new ValidationError('終了は開始より後にしてください');
  if (end - start > LIMITS.maxRecordSec * 1000) throw new ValidationError('1件の記録は24時間までです');
  const durationSec = Math.round(input.durationSec);
  if (!Number.isFinite(durationSec) || durationSec < LIMITS.minRecordSec) throw new ValidationError('1分未満の記録は保存できません');
  if (durationSec * 1000 > end - start + 1000) throw new ValidationError('作業時間が、開始から終了までの時間より長くなっています');
  return {
    taskId: input.taskId || null,
    type: input.type,
    startAt: input.startAt,
    endAt: input.endAt,
    durationSec,
    completed: input.type === 'timer' && input.completed,
    note: cleanText(input.note, LIMITS.note),
  };
}

export async function createSession(input: SessionInput): Promise<Session> {
  const now = nowIso();
  const session: Session = { id: crypto.randomUUID(), ...validateSession(input), deleted: false, createdAt: now, updatedAt: now };
  await db.sessions.add(session);
  return session;
}

export async function updateSession(id: string, input: SessionInput): Promise<Session> {
  return db.transaction('rw', db.sessions, async () => {
    const current = await db.sessions.get(id);
    if (!current) throw new ValidationError('記録が見つかりません');
    const next: Session = { ...current, ...validateSession(input), updatedAt: nowIso() };
    await db.sessions.put(next);
    return next;
  });
}

/** 削除済みの印を付ける */
export async function deleteSession(id: string): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const current = await db.sessions.get(id);
    if (!current) return;
    await db.sessions.put({ ...current, deleted: true, updatedAt: nowIso() });
  });
}

/* ---------- タイマーのプリセット ---------- */

export type PresetInput = Pick<TimerPreset, 'name' | 'blocks' | 'repeat'>;

/** プリセットの入力を確かめる。作業ブロックが 1 つ以上必要 */
export function validatePreset(input: PresetInput): PresetInput {
  const name = cleanText(input.name, LIMITS.presetName, 'プリセット名を入力してください');
  const blocks: TimerBlock[] = input.blocks.map(b => {
    const min = Math.round(Number(b.min));
    if (!Number.isFinite(min) || min < 1 || min > LIMITS.maxBlockMin) {
      throw new ValidationError(`ブロックの長さは 1〜${LIMITS.maxBlockMin} 分にしてください`);
    }
    return { kind: b.kind === 'break' ? 'break' : 'work', min };
  });
  if (!blocks.some(b => b.kind === 'work')) throw new ValidationError('作業ブロックを 1 つ以上入れてください');
  return { name, blocks, repeat: !!input.repeat };
}

/** タイマーが動いている（一時停止中を含む）間は、そのプリセットを編集・削除できない */
async function assertPresetNotInUse(id: string): Promise<void> {
  const row = await db.kv.get('activeTimer');
  const t = row?.key === 'activeTimer' ? { ...IDLE_TIMER, ...row.value } : IDLE_TIMER;
  if (t.mode === 'timer' && t.startedAt && t.presetId === id) {
    throw new ValidationError('タイマーの実行中は、このプリセットを編集・削除できません');
  }
}

export async function createPreset(input: PresetInput): Promise<TimerPreset> {
  const now = nowIso();
  const preset: TimerPreset = { id: crypto.randomUUID(), ...validatePreset(input), deleted: false, createdAt: now, updatedAt: now };
  await db.presets.add(preset);
  return preset;
}

export async function updatePreset(id: string, input: PresetInput): Promise<TimerPreset> {
  return db.transaction('rw', db.presets, db.kv, async () => {
    const current = await db.presets.get(id);
    if (!current || current.deleted) throw new ValidationError('プリセットが見つかりません');
    await assertPresetNotInUse(id);
    const next: TimerPreset = { ...current, ...validatePreset(input), updatedAt: nowIso() };
    await db.presets.put(next);
    return next;
  });
}

/** 削除済みの印を付ける。最後の 1 つは削除できない */
export async function deletePreset(id: string): Promise<void> {
  await db.transaction('rw', db.presets, db.kv, async () => {
    const current = await db.presets.get(id);
    if (!current || current.deleted) return;
    await assertPresetNotInUse(id);
    const remaining = (await db.presets.toArray()).filter(p => !p.deleted && p.id !== id);
    if (remaining.length === 0) throw new ValidationError('プリセットは 1 つ以上必要です');
    await db.presets.put({ ...current, deleted: true, updatedAt: nowIso() });
  });
}
