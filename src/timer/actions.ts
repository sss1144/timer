/* タイマーの操作。状態の読み出し → 計算（engine）→ 記録と状態の保存 を 1 つのトランザクションで行う。
 * 別のタブで同時に開いていても、同じ記録が 2 回保存されることはない。 */

import { db } from '../db/db';
import { getSettings, makeSession } from '../db/repo';
import { IDLE_TIMER, type ActiveTimer, type Session, type Settings } from '../db/types';
import * as engine from './engine';

export type ActionResult = engine.TimerChange & { sessions: Session[] };

export async function loadTimer(): Promise<ActiveTimer> {
  const row = await db.kv.get('activeTimer');
  return { ...IDLE_TIMER, ...(row?.key === 'activeTimer' ? row.value : {}) };
}

async function mutate(
  fn: (t: ActiveTimer, now: number, s: Settings) => engine.TimerChange | ActiveTimer,
): Promise<ActionResult> {
  return db.transaction('rw', db.kv, db.sessions, async () => {
    const now = Date.now();
    const [t, s] = await Promise.all([loadTimer(), getSettings()]);
    const out = fn(t, now, s);
    const change: engine.TimerChange = 'timer' in out ? out : { timer: out, drafts: [], events: [] };
    const sessions = change.drafts.map(makeSession);
    if (sessions.length) await db.sessions.bulkAdd(sessions);
    if (change.timer !== t) await db.kv.put({ key: 'activeTimer', value: change.timer });
    return { ...change, sessions };
  });
}

export const setMode = (mode: ActiveTimer['mode']) => mutate(t => engine.setMode(t, mode));
export const setTask = (taskId: string | null) => mutate(t => engine.setTask(t, taskId));
export const start = () => mutate((t, now, s) => engine.start(t, now, s));
export const pause = () => mutate((t, now) => engine.pause(t, now));
export const resume = () => mutate((t, now) => engine.resume(t, now));
export const stop = (record: boolean) => mutate((t, now) => engine.stop(t, now, record));
export const skipBreak = () => mutate((t, now, s) => engine.skipBreak(t, now, s));
/** 時間になったフェーズを終わらせる（定期的に呼ぶ） */
export const advance = () => mutate((t, now, s) => engine.advance(t, now, s));
export const continueAfterCheck = () => mutate((t, now) => engine.continueAfterCheck(t, now));
export const stopAtCheckpoint = () => mutate((t, now, s) => engine.stopAtCheckpoint(t, now, s));

/** タスクを選んで、そのまま開始する（タスク一覧から） */
export const startWithTask = (taskId: string | null) =>
  mutate((t, now, s) => (engine.getStatus(t) === 'idle' ? engine.start(engine.setTask(t, taskId), now, s) : t));
