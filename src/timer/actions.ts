/* タイマーの操作。状態の読み出し → 計算（engine）→ 記録と状態の保存 を 1 つのトランザクションで行う。
 * 別のタブで同時に開いていても、同じ記録が 2 回保存されることはない。 */

import { db } from '../db/db';
import { getSettings, makeSession } from '../db/repo';
import { IDLE_TIMER, type ActiveTimer, type Session, type Settings, type TimerPreset } from '../db/types';
import * as engine from './engine';
import { livePresets, planOf, resolvePreset } from './presets';

export type ActionResult = engine.TimerChange & { sessions: Session[]; plan: engine.PresetPlan | null };

export async function loadTimer(): Promise<ActiveTimer> {
  const row = await db.kv.get('activeTimer');
  return { ...IDLE_TIMER, ...(row?.key === 'activeTimer' ? row.value : {}) };
}

type Ctx = { now: number; settings: Settings; preset: TimerPreset | null; plan: engine.PresetPlan | null };

async function mutate(fn: (t: ActiveTimer, ctx: Ctx) => engine.TimerChange | ActiveTimer): Promise<ActionResult> {
  return db.transaction('rw', db.kv, db.sessions, db.presets, async () => {
    const now = Date.now();
    const [loaded, settings, presets] = await Promise.all([loadTimer(), getSettings(), db.presets.toArray()]);
    const preset = resolvePreset(loaded, livePresets(presets), settings.lastPresetId);
    // 選んでいたプリセットが消えていたら（開始前のみ）、使えるプリセットに合わせる
    let t = loaded;
    if (t.mode === 'timer' && !t.startedAt && preset && t.presetId !== preset.id) t = engine.setPreset(t, preset.id);
    const plan = planOf(preset);

    const out = fn(t, { now, settings, preset, plan });
    const change: engine.TimerChange = 'timer' in out ? out : { timer: out, drafts: [], events: [] };
    const sessions = change.drafts.map(makeSession);
    if (sessions.length) await db.sessions.bulkAdd(sessions);
    if (change.timer !== loaded) await db.kv.put({ key: 'activeTimer', value: change.timer });
    // 最後に使ったプリセットを覚えておく（次回も選んでおくため）
    const used = change.timer.mode === 'timer' ? change.timer.presetId : null;
    if (used && used !== settings.lastPresetId) await db.kv.put({ key: 'settings', value: { ...settings, lastPresetId: used } });
    return { ...change, sessions, plan };
  });
}

export const setMode = (mode: ActiveTimer['mode']) => mutate(t => engine.setMode(t, mode));
export const setPreset = (presetId: string) => mutate(t => engine.setPreset(t, presetId));
export const setTask = (taskId: string | null) => mutate(t => engine.setTask(t, taskId));
export const start = () => mutate((t, c) => engine.start(t, c.now, c.plan));
export const pause = () => mutate((t, c) => engine.pause(t, c.now));
export const resume = () => mutate((t, c) => engine.resume(t, c.now));
export const stop = (record: boolean) => mutate((t, c) => engine.stop(t, c.now, c.plan, record));
export const skip = (record: boolean) => mutate((t, c) => engine.skip(t, c.now, c.plan, c.settings, record));
/** 時間になったブロックを終わらせる（定期的に呼ぶ） */
export const advance = () => mutate((t, c) => engine.advance(t, c.now, c.plan, c.settings));
export const continueAfterCheck = () => mutate((t, c) => engine.continueAfterCheck(t, c.now));
export const stopAtCheckpoint = () => mutate((t, c) => engine.stopAtCheckpoint(t, c.now, c.settings));

/** タスクを選んで、そのまま開始する（タスク一覧から） */
export const startWithTask = (taskId: string | null) =>
  mutate((t, c) => (engine.getStatus(t) === 'idle' ? engine.start(engine.setTask(t, taskId), c.now, c.plan) : t));
