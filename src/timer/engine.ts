/* タイマーの計算（画面やデータベースに依存しない純粋な関数だけを置く。自動テストの対象）
 *
 * - 時間は「開始時刻と現在時刻の差 − 一時停止していた時間」で計算する。1 秒ずつ数えないので、
 *   画面を閉じたり再読み込みしても時間がずれない。
 * - 関数はすべて新しい状態を返し、渡された状態は書き換えない。
 * - now はミリ秒（Date.now() の値）。 */

import { LIMITS, type ActiveTimer, type Session, type Settings } from '../db/types';
import { toIsoLocal } from '../lib/time';

export type TimerSettings = Pick<
  Settings,
  'workMin' | 'shortBreakMin' | 'longBreakMin' | 'longBreakEvery' | 'autoContinue' | 'stopwatchCheckMin'
>;

/** これより短い記録は保存しない */
export const MIN_RECORD_SEC = LIMITS.minRecordSec;
/** 終了予定からこの時間以内に気づいた場合を「その場で終わった」とみなす（音・通知・連続モード） */
export const LIVE_GRACE_MS = 60_000;

export type TimerStatus = 'idle' | 'running' | 'paused';
export type Phase = ActiveTimer['phase'];

/** 保存する前の記録 */
export type SessionDraft = Pick<Session, 'taskId' | 'type' | 'startAt' | 'endAt' | 'durationSec' | 'completed'>;

export type TimerEvent = { kind: 'workDone' | 'breakDone'; at: number; live: boolean };

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

export const isBreak = (phase: Phase) => phase !== 'work';

/** 一時停止を除いた経過時間 */
export function elapsedMs(t: ActiveTimer, now: number): number {
  if (!t.startedAt) return 0;
  const end = t.pausedAt ? toMs(t.pausedAt) : now;
  return Math.max(0, end - toMs(t.startedAt) - t.pausedTotalSec * 1000);
}

export function phaseSeconds(phase: Phase, s: TimerSettings): number {
  const min = phase === 'work' ? s.workMin : phase === 'shortBreak' ? s.shortBreakMin : s.longBreakMin;
  return Math.round(min * 60);
}

/** ポモドーロの今のフェーズの長さ（開始前は設定の値、開始後は開始時に固定した値） */
export function phaseDurationMs(t: ActiveTimer, s: TimerSettings): number {
  return (t.startedAt ? t.phaseDurationSec : phaseSeconds(t.phase, s)) * 1000;
}

export function remainingMs(t: ActiveTimer, now: number, s: TimerSettings): number {
  return Math.max(0, phaseDurationMs(t, s) - elapsedMs(t, now));
}

/** 今のフェーズが終わる時刻（実行中のポモドーロのみ） */
function phaseEndMs(t: ActiveTimer): number | null {
  if (t.mode !== 'pomodoro' || !t.startedAt || t.pausedAt) return null;
  return toMs(t.startedAt) + t.pausedTotalSec * 1000 + t.phaseDurationSec * 1000;
}

/** 記録の対象になる作業中か（休憩中は記録しない） */
export const isRecording = (t: ActiveTimer) => t.mode === 'stopwatch' || t.phase === 'work';

/* ---------- 状態を作る ---------- */

function idleAt(t: ActiveTimer, phase: Phase, pomodoroCount = t.pomodoroCount): ActiveTimer {
  return { ...t, phase, pomodoroCount, startedAt: null, pausedAt: null, pausedTotalSec: 0, phaseDurationSec: 0, checkedElapsedSec: 0 };
}

function runningFrom(t: ActiveTimer, phase: Phase, fromMs: number, s: TimerSettings, pomodoroCount = t.pomodoroCount): ActiveTimer {
  return { ...idleAt(t, phase, pomodoroCount), startedAt: iso(fromMs), phaseDurationSec: phaseSeconds(phase, s) };
}

function makeDraft(t: ActiveTimer, endMs: number, durationMs: number, completed: boolean): SessionDraft | null {
  if (!t.startedAt || !isRecording(t) || durationMs < MIN_RECORD_SEC * 1000) return null;
  return {
    taskId: t.taskId,
    type: t.mode === 'pomodoro' ? 'pomodoro' : 'stopwatch',
    startAt: t.startedAt,
    endAt: iso(endMs),
    durationSec: Math.round(durationMs / 1000),
    completed,
  };
}

/* ---------- 操作 ---------- */

/** モード切り替え（開始前のみ） */
export function setMode(t: ActiveTimer, mode: ActiveTimer['mode']): ActiveTimer {
  if (getStatus(t) !== 'idle' || t.mode === mode) return t;
  return idleAt({ ...t, mode }, 'work');
}

/** タスクの選択（開始前のみ。null = 未分類） */
export function setTask(t: ActiveTimer, taskId: string | null): ActiveTimer {
  if (getStatus(t) !== 'idle') return t;
  return { ...t, taskId };
}

export function start(t: ActiveTimer, now: number, s: TimerSettings): ActiveTimer {
  if (getStatus(t) !== 'idle') return t;
  return {
    ...t,
    startedAt: iso(now),
    pausedAt: null,
    pausedTotalSec: 0,
    phaseDurationSec: t.mode === 'pomodoro' ? phaseSeconds(t.phase, s) : 0,
    checkedElapsedSec: 0,
  };
}

export function pause(t: ActiveTimer, now: number): ActiveTimer {
  if (getStatus(t) !== 'running') return t;
  return { ...t, pausedAt: iso(now) };
}

export function resume(t: ActiveTimer, now: number): ActiveTimer {
  if (getStatus(t) !== 'paused' || !t.pausedAt) return t;
  return { ...t, pausedAt: null, pausedTotalSec: t.pausedTotalSec + Math.max(0, now - toMs(t.pausedAt)) / 1000 };
}

/** 停止。record = true なら作業時間を記録する（1 分未満は記録しない）。休憩中は記録せず作業の待機に戻る */
export function stop(t: ActiveTimer, now: number, record: boolean): TimerChange {
  if (getStatus(t) === 'idle') return unchanged(t);
  const endMs = t.pausedAt ? toMs(t.pausedAt) : now;
  let duration = elapsedMs(t, now);
  if (t.mode === 'pomodoro') duration = Math.min(duration, t.phaseDurationSec * 1000);
  const draft = record ? makeDraft(t, endMs, duration, false) : null;
  return { timer: idleAt(t, 'work'), drafts: draft ? [draft] : [], events: [] };
}

/** 休憩をスキップして作業へ（連続モードなら作業をすぐ始める） */
export function skipBreak(t: ActiveTimer, now: number, s: TimerSettings): ActiveTimer {
  if (t.mode !== 'pomodoro' || !isBreak(t.phase)) return t;
  return s.autoContinue ? runningFrom(t, 'work', now, s) : idleAt(t, 'work');
}

/** 時間になったフェーズを終わらせる。画面を閉じていた間に終わった分もまとめて処理する。
 * - 作業が終わったら 1 件記録し、休憩へ（連続モードなら終了時刻から休憩を始める）
 * - 休憩が終わったら作業の待機へ。連続モードでも、その場で気づいた場合だけ作業を自動で始める
 *   （閉じている間に作業の記録が勝手に何件も増えないように） */
export function advance(t: ActiveTimer, now: number, s: TimerSettings): TimerChange {
  let cur = t;
  const drafts: SessionDraft[] = [];
  const events: TimerEvent[] = [];
  for (let guard = 0; guard < 100; guard++) {
    const endMs = phaseEndMs(cur);
    if (endMs === null || endMs > now) break;
    const live = now - endMs < LIVE_GRACE_MS;
    if (cur.phase === 'work') {
      const draft = makeDraft(cur, endMs, cur.phaseDurationSec * 1000, true);
      if (draft) drafts.push(draft);
      const count = cur.pomodoroCount + 1;
      const next: Phase = count % Math.max(1, s.longBreakEvery) === 0 ? 'longBreak' : 'shortBreak';
      cur = s.autoContinue ? runningFrom(cur, next, endMs, s, count) : idleAt(cur, next, count);
      events.push({ kind: 'workDone', at: endMs, live });
    } else {
      cur = s.autoContinue && live ? runningFrom(cur, 'work', endMs, s) : idleAt(cur, 'work');
      events.push({ kind: 'breakDone', at: endMs, live });
    }
  }
  return { timer: cur, drafts, events };
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
  if (elapsed < point) return stop(t, now, true);
  const endMs = (t.pausedAt ? toMs(t.pausedAt) : now) - (elapsed - point);
  const draft = makeDraft(t, endMs, point, false);
  return { timer: idleAt(t, 'work'), drafts: draft ? [draft] : [], events: [] };
}
