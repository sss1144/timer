/* タイマーの計算（画面やデータベースに依存しない純粋な関数だけを置く。自動テストの対象）
 *
 * - ブロック式タイマー：プリセットに並んだ作業・休憩のブロックを順に進める。作業ブロックが終わったら 1 件記録する
 * - 時間は「開始時刻と現在時刻の差 − 一時停止していた時間」で計算する。1 秒ずつ数えないので、
 *   画面を閉じたり再読み込みしても時間がずれない。
 * - 関数はすべて新しい状態を返し、渡された状態は書き換えない。
 * - now はミリ秒（Date.now() の値）。 */

import { LIMITS, type ActiveTimer, type BlockKind, type Session, type Settings, type TimerBlock } from '../db/types';
import { toIsoLocal } from '../lib/time';

export type TimerSettings = Pick<Settings, 'autoContinue' | 'stopwatchCheckMin'>;

/** タイマーが使うプリセットの中身 */
export type PresetPlan = { blocks: TimerBlock[]; repeat: boolean };

/** これより短い記録は保存しない */
export const MIN_RECORD_SEC = LIMITS.minRecordSec;
/** 終了予定からこの時間以内に気づいた場合を「その場で終わった」とみなす（通知・自動で進む）。
 * 画面が隠れていると、ページのタイマーは最大 1 分ほど遅れるため 2 分にする */
export const LIVE_GRACE_MS = 120_000;

export type TimerStatus = 'idle' | 'running' | 'paused';

/** 保存する前の記録 */
export type SessionDraft = Pick<Session, 'taskId' | 'type' | 'startAt' | 'endAt' | 'durationSec' | 'completed'>;

/** ブロックが時間どおりに終わった。live = その場で気づいた（閉じている間に終わったのではない） */
export type TimerEvent = { kind: BlockKind; at: number; live: boolean };

export type TimerChange = {
  timer: ActiveTimer;
  drafts: SessionDraft[];
  events: TimerEvent[];
};

const toMs = (iso: string) => new Date(iso).getTime();
const iso = (ms: number) => toIsoLocal(new Date(ms));
const unchanged = (timer: ActiveTimer): TimerChange => ({ timer, drafts: [], events: [] });

/* ---------- 状態を読む ---------- */

export function getStatus(t: ActiveTimer): TimerStatus {
  if (!t.startedAt) return 'idle';
  return t.pausedAt ? 'paused' : 'running';
}

/** 一時停止を除いた経過時間 */
export function elapsedMs(t: ActiveTimer, now: number): number {
  if (!t.startedAt) return 0;
  const end = t.pausedAt ? toMs(t.pausedAt) : now;
  return Math.max(0, end - toMs(t.startedAt) - t.pausedTotalSec * 1000);
}

/** 今のブロック（ストップウォッチやプリセットがない場合は undefined） */
export function currentBlock(t: ActiveTimer, plan: PresetPlan | null): TimerBlock | undefined {
  return t.mode === 'timer' ? plan?.blocks[t.blockIndex] : undefined;
}

/** 記録の対象になる作業中か（休憩ブロックは記録しない） */
export function isRecording(t: ActiveTimer, plan: PresetPlan | null): boolean {
  return t.mode === 'stopwatch' || currentBlock(t, plan)?.kind === 'work';
}

/** 今のブロックの長さ（開始前はプリセットの値、開始後は開始時に固定した値） */
export function blockDurationMs(t: ActiveTimer, plan: PresetPlan | null): number {
  if (t.mode !== 'timer') return 0;
  return (t.startedAt ? t.blockDurationSec : (currentBlock(t, plan)?.min ?? 0) * 60) * 1000;
}

export function remainingMs(t: ActiveTimer, now: number, plan: PresetPlan | null): number {
  return Math.max(0, blockDurationMs(t, plan) - elapsedMs(t, now));
}

/** 次のブロック。「1 回だけ」のプリセットで最後のブロックなら null（終わり） */
export function nextIndex(index: number, plan: PresetPlan): number | null {
  if (index + 1 < plan.blocks.length) return index + 1;
  return plan.repeat ? 0 : null;
}

/** 今のブロックが終わる時刻（実行中のブロック式のみ） */
function blockEndMs(t: ActiveTimer): number | null {
  if (t.mode !== 'timer' || !t.startedAt || t.pausedAt) return null;
  return toMs(t.startedAt) + t.pausedTotalSec * 1000 + t.blockDurationSec * 1000;
}

/* ---------- 状態を作る ---------- */

/** ブロックの開始前（待機中）にする */
function idleAt(t: ActiveTimer, blockIndex: number): ActiveTimer {
  return { ...t, blockIndex, startedAt: null, pausedAt: null, pausedTotalSec: 0, blockDurationSec: 0, checkedElapsedSec: 0 };
}

function runningFrom(t: ActiveTimer, blockIndex: number, fromMs: number, plan: PresetPlan): ActiveTimer {
  return { ...idleAt(t, blockIndex), startedAt: iso(fromMs), blockDurationSec: (plan.blocks[blockIndex]?.min ?? 0) * 60 };
}

function makeDraft(t: ActiveTimer, plan: PresetPlan | null, endMs: number, durationMs: number, completed: boolean): SessionDraft | null {
  if (!t.startedAt || !isRecording(t, plan) || durationMs < MIN_RECORD_SEC * 1000) return null;
  return {
    taskId: t.taskId,
    type: t.mode === 'timer' ? 'timer' : 'stopwatch',
    startAt: t.startedAt,
    endAt: iso(endMs),
    durationSec: Math.round(durationMs / 1000),
    completed,
  };
}

/** 途中で止めたときの記録の長さと終了時刻（ブロックの長さを超えない） */
function partial(t: ActiveTimer, now: number): { endMs: number; duration: number } {
  const endMs = t.pausedAt ? toMs(t.pausedAt) : now;
  let duration = elapsedMs(t, now);
  if (t.mode === 'timer') duration = Math.min(duration, t.blockDurationSec * 1000);
  return { endMs, duration };
}

/* ---------- 操作 ---------- */

/** モード切り替え（開始前のみ） */
export function setMode(t: ActiveTimer, mode: ActiveTimer['mode']): ActiveTimer {
  if (getStatus(t) !== 'idle' || t.mode === mode) return t;
  return idleAt({ ...t, mode }, 0);
}

/** プリセットの選択（開始前のみ。最初のブロックから） */
export function setPreset(t: ActiveTimer, presetId: string | null): ActiveTimer {
  if (getStatus(t) !== 'idle' || t.presetId === presetId) return t;
  return idleAt({ ...t, presetId }, 0);
}

/** タスクの選択（開始前のみ。null = 未分類） */
export function setTask(t: ActiveTimer, taskId: string | null): ActiveTimer {
  if (getStatus(t) !== 'idle') return t;
  return { ...t, taskId };
}

export function start(t: ActiveTimer, now: number, plan: PresetPlan | null): ActiveTimer {
  if (getStatus(t) !== 'idle') return t;
  if (t.mode === 'timer') {
    if (!plan || plan.blocks.length === 0) return t;
    const index = t.blockIndex < plan.blocks.length ? t.blockIndex : 0;
    return runningFrom(t, index, now, plan);
  }
  return { ...idleAt(t, 0), startedAt: iso(now) };
}

export function pause(t: ActiveTimer, now: number): ActiveTimer {
  if (getStatus(t) !== 'running') return t;
  return { ...t, pausedAt: iso(now) };
}

export function resume(t: ActiveTimer, now: number): ActiveTimer {
  if (getStatus(t) !== 'paused' || !t.pausedAt) return t;
  return { ...t, pausedAt: null, pausedTotalSec: t.pausedTotalSec + Math.max(0, now - toMs(t.pausedAt)) / 1000 };
}

/** 停止。record = true なら作業時間を記録する（1 分未満と休憩は記録しない）。最初のブロックの開始前に戻る */
export function stop(t: ActiveTimer, now: number, plan: PresetPlan | null, record: boolean): TimerChange {
  if (getStatus(t) === 'idle') return unchanged(t);
  const { endMs, duration } = partial(t, now);
  const draft = record ? makeDraft(t, plan, endMs, duration, false) : null;
  return { timer: idleAt(t, 0), drafts: draft ? [draft] : [], events: [] };
}

/** 今のブロックをスキップして次へ。
 * - 開始前なら、待機するブロックを次へ送るだけ
 * - 作業ブロックの途中なら record に従って記録する
 * - 動いていて「自動で進む」がオンなら次のブロックをすぐ始め、そうでなければ次のブロックの開始前で待つ
 * - 「1 回だけ」のプリセットの最後のブロックなら、最初のブロックの開始前に戻る */
export function skip(t: ActiveTimer, now: number, plan: PresetPlan | null, s: TimerSettings, record: boolean): TimerChange {
  if (t.mode !== 'timer' || !plan || plan.blocks.length === 0) return unchanged(t);
  const status = getStatus(t);
  const next = nextIndex(t.blockIndex, plan);
  if (status === 'idle') return { timer: idleAt(t, next ?? 0), drafts: [], events: [] };

  const { endMs, duration } = partial(t, now);
  const draft = record ? makeDraft(t, plan, endMs, duration, false) : null;
  const timer = next === null ? idleAt(t, 0) : s.autoContinue ? runningFrom(t, next, now, plan) : idleAt(t, next);
  return { timer, drafts: draft ? [draft] : [], events: [] };
}

/** 時間になったブロックを終わらせる。画面を閉じていた間に終わった分もまとめて処理する。
 * - 作業ブロックが終わったら 1 件記録する（休憩は記録しない）
 * - 「自動で進む」がオンで、その場で気づいた場合だけ、終了時刻から次のブロックを始める。
 *   閉じている間に終わった場合は次のブロックの開始前で止める（記録が勝手に増えないように）
 * - 「1 回だけ」のプリセットの最後のブロックが終わったら、最初のブロックの開始前に戻る */
export function advance(t: ActiveTimer, now: number, plan: PresetPlan | null, s: TimerSettings): TimerChange {
  let cur = t;
  const drafts: SessionDraft[] = [];
  const events: TimerEvent[] = [];
  if (!plan || plan.blocks.length === 0) return unchanged(t);
  for (let guard = 0; guard < 200; guard++) {
    const endMs = blockEndMs(cur);
    if (endMs === null || endMs > now) break;
    const live = now - endMs < LIVE_GRACE_MS;
    const block = currentBlock(cur, plan);
    const draft = makeDraft(cur, plan, endMs, cur.blockDurationSec * 1000, true);
    if (draft) drafts.push(draft);
    events.push({ kind: block?.kind ?? 'work', at: endMs, live });
    const next = nextIndex(cur.blockIndex, plan);
    if (next === null) cur = idleAt(cur, 0);
    else if (s.autoContinue && live) cur = runningFrom(cur, next, endMs, plan);
    else cur = idleAt(cur, next);
  }
  return { timer: cur, drafts, events };
}

/* ---------- 音の予約 ---------- */

export type BlockEnd = { at: number; kind: BlockKind };

/** これから終わるブロックの時刻と種類（音の予約用）。
 * 「自動で進む」がオンなら、続くブロックも同じ流れで進むので、先の分（horizonMs 以内）もまとめて返す。
 * 一時停止中・開始前・ストップウォッチは空 */
export function upcomingBlockEnds(t: ActiveTimer, now: number, plan: PresetPlan | null, s: TimerSettings, horizonMs = 24 * 3600_000): BlockEnd[] {
  let end = blockEndMs(t);
  if (end === null || !plan || plan.blocks.length === 0) return [];
  const out: BlockEnd[] = [];
  let index = t.blockIndex;
  for (let guard = 0; guard < 200; guard++) {
    const block = plan.blocks[index];
    if (!block) break;
    if (end > now) out.push({ at: end, kind: block.kind });
    if (!s.autoContinue) break;
    const next = nextIndex(index, plan);
    if (next === null) break;
    index = next;
    end += plan.blocks[index].min * 60_000;
    if (end - now > horizonMs) break;
  }
  return out;
}

/* ---------- ストップウォッチの止め忘れ確認 ---------- */

/** 確認を出す時点（経過秒数）。前回「続ける」を選んでから設定の時間がたったら確認する */
export function checkpointSec(t: ActiveTimer, s: TimerSettings): number {
  return t.checkedElapsedSec + s.stopwatchCheckMin * 60;
}

export function isCheckDue(t: ActiveTimer, now: number, s: TimerSettings): boolean {
  return t.mode === 'stopwatch' && getStatus(t) === 'running' && elapsedMs(t, now) >= checkpointSec(t, s) * 1000;
}

/** 「続ける」：次の確認は、今からさらに設定の時間がたったとき */
export function continueAfterCheck(t: ActiveTimer, now: number): ActiveTimer {
  return { ...t, checkedElapsedSec: elapsedMs(t, now) / 1000 };
}

/** 「確認した時点で止めて記録」：確認を出す時点までを記録する */
export function stopAtCheckpoint(t: ActiveTimer, now: number, s: TimerSettings): TimerChange {
  if (t.mode !== 'stopwatch' || getStatus(t) === 'idle') return unchanged(t);
  const point = checkpointSec(t, s) * 1000;
  const elapsed = elapsedMs(t, now);
  if (elapsed < point) return stop(t, now, null, true);
  const endMs = (t.pausedAt ? toMs(t.pausedAt) : now) - (elapsed - point);
  const draft = makeDraft(t, null, endMs, point, false);
  return { timer: idleAt(t, 0), drafts: draft ? [draft] : [], events: [] };
}
