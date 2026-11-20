import { describe, expect, it } from 'vitest';
import {
  advance,
  blockDurationMs,
  continueAfterCheck,
  elapsedMs,
  getStatus,
  isCheckDue,
  nextIndex,
  pause,
  remainingMs,
  resume,
  setMode,
  setPreset,
  setTask,
  skip,
  start,
  stop,
  stopAtCheckpoint,
  type PresetPlan,
  type TimerSettings,
} from './engine';
import { DEFAULT_PRESETS, IDLE_TIMER, type ActiveTimer } from '../db/types';

const S: TimerSettings = { autoContinue: false, stopwatchCheckMin: 180 };
const AUTO: TimerSettings = { ...S, autoContinue: true };
const T0 = new Date('2026-11-20T20:00:00+09:00').getTime();
const MIN = 60_000;
const at = (min: number) => T0 + min * MIN;
const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

const TWO_HOURS: PresetPlan = DEFAULT_PRESETS[0];
const POMODORO: PresetPlan = DEFAULT_PRESETS[1]; // 作業25 休憩5 ×3, 作業25 休憩20, 繰り返す
const SHORT: PresetPlan = { blocks: [{ kind: 'work', min: 10 }, { kind: 'break', min: 5 }, { kind: 'work', min: 10 }], repeat: false };

const timer = (extra: Partial<ActiveTimer> = {}): ActiveTimer => ({ ...IDLE_TIMER, presetId: 'p', taskId: 'task-1', ...extra });
const stopwatch = (extra: Partial<ActiveTimer> = {}): ActiveTimer => ({ ...IDLE_TIMER, mode: 'stopwatch', taskId: 'task-1', ...extra });

describe('経過時間', () => {
  it('開始時刻との差で計算し、一時停止していた時間は含めない', () => {
    let t = start(stopwatch(), at(0), null);
    expect(getStatus(t)).toBe('running');
    expect(elapsedMs(t, at(10))).toBe(10 * MIN);
    t = pause(t, at(10));
    expect(elapsedMs(t, at(40))).toBe(10 * MIN);
    t = resume(t, at(40));
    expect(elapsedMs(t, at(45))).toBe(15 * MIN);
  });

  it('保存した状態から復帰しても同じ値になる（再読み込み対策）', () => {
    const t = resume(pause(start(timer(), at(0), POMODORO), at(5)), at(8));
    const restored = JSON.parse(JSON.stringify(t)) as ActiveTimer;
    expect(remainingMs(restored, at(20), POMODORO)).toBe(25 * MIN - 17 * MIN);
  });

  it('開始前はプリセットのブロックの長さ、開始後は開始時の長さ', () => {
    expect(blockDurationMs(timer({ blockIndex: 1 }), POMODORO)).toBe(5 * MIN);
    const t = start(timer(), at(0), POMODORO);
    const edited: PresetPlan = { ...POMODORO, blocks: [{ kind: 'work', min: 50 }, ...POMODORO.blocks.slice(1)] };
    expect(remainingMs(t, at(10), edited)).toBe(15 * MIN);
  });

  it('次のブロック：繰り返すなら最初へ、1 回だけなら終わり', () => {
    expect(nextIndex(0, POMODORO)).toBe(1);
    expect(nextIndex(7, POMODORO)).toBe(0);
    expect(nextIndex(0, TWO_HOURS)).toBeNull();
  });
});

describe('ブロックの自動記録', () => {
  it('作業ブロックが終わると 1 件記録し、次のブロックの開始前で止まる', () => {
    const t = start(timer(), at(0), POMODORO);
    expect(advance(t, at(24.9), POMODORO, S).drafts).toHaveLength(0);
    const r = advance(t, at(25), POMODORO, S);
    expect(r.drafts).toEqual([
      { taskId: 'task-1', type: 'timer', startAt: t.startedAt, endAt: expect.any(String), durationSec: 1500, completed: true },
    ]);
    expect(ms(r.drafts[0].endAt)).toBe(at(25));
    expect(r.timer).toMatchObject({ blockIndex: 1, startedAt: null });
    expect(r.events).toEqual([{ kind: 'work', at: at(25), live: true }]);
  });

  it('休憩ブロックは記録しない', () => {
    const t = start(timer({ blockIndex: 1 }), at(0), POMODORO);
    const r = advance(t, at(5), POMODORO, S);
    expect(r.drafts).toHaveLength(0);
    expect(r.events[0].kind).toBe('break');
    expect(r.timer).toMatchObject({ blockIndex: 2, startedAt: null });
  });

  it('一時停止した分だけ終了が遅れ、記録は実作業時間', () => {
    const t = resume(pause(start(timer(), at(0), POMODORO), at(10)), at(20));
    expect(advance(t, at(34), POMODORO, S).drafts).toHaveLength(0);
    const r = advance(t, at(35), POMODORO, S);
    expect(r.drafts[0].durationSec).toBe(1500);
    expect(ms(r.drafts[0].endAt)).toBe(at(35));
  });

  it('一時停止中は時間になっても終わらない', () => {
    const t = pause(start(timer(), at(0), POMODORO), at(10));
    expect(advance(t, at(100), POMODORO, S).drafts).toHaveLength(0);
  });

  it('自動で進む設定なら、終了時刻から次のブロックを始める', () => {
    const t = start(timer(), at(0), POMODORO);
    const r1 = advance(t, at(25), POMODORO, AUTO);
    expect(r1.timer).toMatchObject({ blockIndex: 1, blockDurationSec: 300 });
    expect(ms(r1.timer.startedAt)).toBe(at(25));
    const r2 = advance(r1.timer, at(30), POMODORO, AUTO);
    expect(r2.timer).toMatchObject({ blockIndex: 2, blockDurationSec: 1500 });
    expect(ms(r2.timer.startedAt)).toBe(at(30));
  });

  it('繰り返すプリセットは、最後のブロックのあと最初に戻る', () => {
    const t = start(timer({ blockIndex: 7 }), at(0), POMODORO);
    expect(advance(t, at(20), POMODORO, S).timer).toMatchObject({ blockIndex: 0, startedAt: null });
    const auto = advance(t, at(20), POMODORO, AUTO).timer;
    expect(auto.blockIndex).toBe(0);
    expect(ms(auto.startedAt)).toBe(at(20));
  });

  it('1 回だけのプリセットは、最後のブロックが終わったら開始前の状態に戻る（自動で進む設定でも）', () => {
    const t = start(timer(), at(0), TWO_HOURS);
    const r = advance(t, at(120), TWO_HOURS, AUTO);
    expect(r.drafts[0].durationSec).toBe(7200);
    expect(r.timer).toMatchObject({ blockIndex: 0, startedAt: null });
  });

  it('閉じている間に終わったブロックは本来の終了時刻で記録し、次のブロックは自動で始めない', () => {
    const t = start(timer(), at(0), POMODORO);
    const r = advance(t, at(180), POMODORO, AUTO); // 3 時間後に開いた
    expect(r.drafts).toHaveLength(1);
    expect(ms(r.drafts[0].endAt)).toBe(at(25));
    expect(r.timer).toMatchObject({ blockIndex: 1, startedAt: null });
    expect(r.events).toEqual([{ kind: 'work', at: at(25), live: false }]);
  });

  it('プリセットのタスクとモードの情報を記録に入れる（未分類も）', () => {
    const t = start(timer({ taskId: null }), at(0), SHORT);
    expect(advance(t, at(10), SHORT, S).drafts[0]).toMatchObject({ taskId: null, type: 'timer' });
  });
});

describe('停止', () => {
  it('作業ブロックの途中で「記録する」と未完了として記録し、最初のブロックの開始前に戻る', () => {
    const t = start(timer({ blockIndex: 2 }), at(0), POMODORO);
    const r = stop(t, at(12), POMODORO, true);
    expect(r.drafts[0]).toMatchObject({ type: 'timer', durationSec: 720, completed: false });
    expect(r.timer).toMatchObject({ blockIndex: 0, startedAt: null });
  });

  it('「破棄する」と記録しない', () => {
    expect(stop(start(timer(), at(0), POMODORO), at(12), POMODORO, false).drafts).toHaveLength(0);
  });

  it('1 分未満は記録しない', () => {
    expect(stop(start(stopwatch(), at(0), null), at(0.9), null, true).drafts).toHaveLength(0);
    expect(stop(start(stopwatch(), at(0), null), at(1), null, true).drafts).toHaveLength(1);
  });

  it('休憩中に止めても記録しない', () => {
    const t = start(timer({ blockIndex: 1 }), at(0), POMODORO);
    const r = stop(t, at(3), POMODORO, true);
    expect(r.drafts).toHaveLength(0);
    expect(r.timer).toMatchObject({ blockIndex: 0, startedAt: null });
  });

  it('ストップウォッチは開始から停止まで（一時停止を除く）。一時停止中に止めたら一時停止した時刻で終わる', () => {
    let t = start(stopwatch({ taskId: null }), at(0), null);
    t = resume(pause(t, at(30)), at(45));
    const r = stop(t, at(90), null, true);
    expect(r.drafts[0]).toMatchObject({ taskId: null, type: 'stopwatch', durationSec: 75 * 60, completed: false });
    const paused = pause(start(stopwatch(), at(0), null), at(30));
    expect(ms(stop(paused, at(90), null, true).drafts[0].endAt)).toBe(at(30));
  });
});

describe('スキップ', () => {
  it('開始前なら待機するブロックを次へ送るだけ', () => {
    const r = skip(timer(), at(0), POMODORO, S, true);
    expect(r.timer).toMatchObject({ blockIndex: 1, startedAt: null });
    expect(r.drafts).toHaveLength(0);
    expect(skip(timer({ blockIndex: 7 }), at(0), POMODORO, S, true).timer.blockIndex).toBe(0);
  });

  it('作業ブロックの途中で「記録する」を選ぶと記録して次へ', () => {
    const t = start(timer(), at(0), POMODORO);
    const r = skip(t, at(10), POMODORO, S, true);
    expect(r.drafts[0]).toMatchObject({ durationSec: 600, completed: false });
    expect(r.timer).toMatchObject({ blockIndex: 1, startedAt: null });
    expect(skip(t, at(10), POMODORO, S, false).drafts).toHaveLength(0);
  });

  it('動いていて自動で進む設定なら、次のブロックをすぐ始める', () => {
    const t = start(timer({ blockIndex: 1 }), at(0), POMODORO);
    const r = skip(t, at(2), POMODORO, AUTO, true);
    expect(r.drafts).toHaveLength(0); // 休憩は記録しない
    expect(r.timer.blockIndex).toBe(2);
    expect(ms(r.timer.startedAt)).toBe(at(2));
  });

  it('1 回だけのプリセットの最後のブロックなら、最初のブロックの開始前に戻る', () => {
    const t = start(timer({ blockIndex: 2 }), at(0), SHORT);
    expect(skip(t, at(3), SHORT, AUTO, true).timer).toMatchObject({ blockIndex: 0, startedAt: null });
  });
});

describe('モード・プリセット・タスクの切り替え', () => {
  it('開始前だけ変えられる。プリセットを変えると最初のブロックから', () => {
    expect(setMode(timer({ blockIndex: 3 }), 'stopwatch')).toMatchObject({ mode: 'stopwatch', blockIndex: 0 });
    expect(setPreset(timer({ blockIndex: 3 }), 'other')).toMatchObject({ presetId: 'other', blockIndex: 0 });
    expect(setTask(timer(), 'other').taskId).toBe('other');
    const running = start(timer(), at(0), POMODORO);
    expect(setMode(running, 'stopwatch')).toBe(running);
    expect(setPreset(running, 'other')).toBe(running);
    expect(setTask(running, 'other')).toBe(running);
  });

  it('プリセットがなければブロック式は開始しない', () => {
    const t = timer();
    expect(start(t, at(0), null)).toBe(t);
  });
});

describe('ストップウォッチの止め忘れ確認', () => {
  it('設定の時間（初期値 3 時間）がたったら確認する', () => {
    const t = start(stopwatch(), at(0), null);
    expect(isCheckDue(t, at(179), S)).toBe(false);
    expect(isCheckDue(t, at(180), S)).toBe(true);
    expect(isCheckDue(pause(t, at(200)), at(200), S)).toBe(false);
  });

  it('「続ける」を選ぶと、そこからさらに 3 時間後に確認する', () => {
    const t = continueAfterCheck(start(stopwatch(), at(0), null), at(200));
    expect(isCheckDue(t, at(379), S)).toBe(false);
    expect(isCheckDue(t, at(380), S)).toBe(true);
  });

  it('「確認した時点で止めて記録」は 3 時間ちょうどまでを記録する', () => {
    let t = start(stopwatch(), at(0), null);
    t = resume(pause(t, at(60)), at(90)); // 30 分停止
    const r = stopAtCheckpoint(t, at(300), S);
    expect(r.drafts[0].durationSec).toBe(180 * 60);
    expect(ms(r.drafts[0].endAt)).toBe(at(210));
    expect(getStatus(r.timer)).toBe('idle');
  });
});
