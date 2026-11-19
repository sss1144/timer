import { describe, expect, it } from 'vitest';
import {
  advance,
  continueAfterCheck,
  elapsedMs,
  getStatus,
  isCheckDue,
  pause,
  remainingMs,
  resume,
  setMode,
  setTask,
  skipBreak,
  start,
  stop,
  stopAtCheckpoint,
  type TimerSettings,
} from './engine';
import { IDLE_TIMER, type ActiveTimer } from '../db/types';

const S: TimerSettings = { workMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4, autoContinue: false, stopwatchCheckMin: 180 };
const T0 = new Date('2026-11-19T20:00:00+09:00').getTime();
const MIN = 60_000;
const at = (min: number) => T0 + min * MIN;
const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

const pomodoro = (extra: Partial<ActiveTimer> = {}): ActiveTimer => ({ ...IDLE_TIMER, taskId: 'task-1', ...extra });
const stopwatch = (extra: Partial<ActiveTimer> = {}): ActiveTimer => ({ ...IDLE_TIMER, mode: 'stopwatch', taskId: 'task-1', ...extra });

describe('経過時間', () => {
  it('開始時刻との差で計算し、一時停止していた時間は含めない', () => {
    let t = start(stopwatch(), at(0), S);
    expect(getStatus(t)).toBe('running');
    expect(elapsedMs(t, at(10))).toBe(10 * MIN);

    t = pause(t, at(10));
    expect(getStatus(t)).toBe('paused');
    expect(elapsedMs(t, at(40))).toBe(10 * MIN); // 停止中は増えない

    t = resume(t, at(40));
    expect(elapsedMs(t, at(45))).toBe(15 * MIN);

    t = resume(pause(t, at(50)), at(55));
    expect(elapsedMs(t, at(60))).toBe(25 * MIN);
  });

  it('保存した状態から復帰しても同じ値になる（再読み込み対策）', () => {
    const t = pause(start(stopwatch(), at(0), S), at(5));
    const restored = JSON.parse(JSON.stringify(resume(t, at(8)))) as ActiveTimer;
    expect(elapsedMs(restored, at(20))).toBe(17 * MIN);
  });

  it('ポモドーロの残り時間は開始時の設定で固定される', () => {
    const t = start(pomodoro(), at(0), S);
    expect(remainingMs(t, at(10), S)).toBe(15 * MIN);
    expect(remainingMs(t, at(10), { ...S, workMin: 50 })).toBe(15 * MIN);
    // 開始前は設定どおり
    expect(remainingMs(pomodoro(), at(0), { ...S, workMin: 50 })).toBe(50 * MIN);
  });
});

describe('ポモドーロの自動記録', () => {
  it('作業が終わると 1 件記録して短い休憩の待機になる', () => {
    const t = start(pomodoro(), at(0), S);
    expect(advance(t, at(24.9), S).drafts).toHaveLength(0);

    const r = advance(t, at(25), S);
    expect(r.drafts).toEqual([
      { taskId: 'task-1', type: 'pomodoro', startAt: t.startedAt, endAt: expect.any(String), durationSec: 1500, completed: true },
    ]);
    expect(ms(r.drafts[0].endAt)).toBe(at(25));
    expect(r.timer).toMatchObject({ phase: 'shortBreak', startedAt: null, pomodoroCount: 1 });
    expect(r.events).toEqual([{ kind: 'workDone', at: at(25), live: true }]);
  });

  it('一時停止した分だけ終了が遅れ、記録は実作業時間', () => {
    let t = start(pomodoro(), at(0), S);
    t = resume(pause(t, at(10)), at(20));
    expect(advance(t, at(34), S).drafts).toHaveLength(0);
    const r = advance(t, at(35), S);
    expect(r.drafts[0]).toMatchObject({ durationSec: 1500 });
    expect(ms(r.drafts[0].endAt)).toBe(at(35));
  });

  it('一時停止中は時間になっても終わらない', () => {
    const t = pause(start(pomodoro(), at(0), S), at(10));
    expect(advance(t, at(100), S).drafts).toHaveLength(0);
  });

  it('4 回ごとに長い休憩', () => {
    const t = start(pomodoro({ pomodoroCount: 3 }), at(0), S);
    const r = advance(t, at(25), S);
    expect(r.timer).toMatchObject({ phase: 'longBreak', pomodoroCount: 4 });
  });

  it('休憩が終わると作業の待機に戻る（休憩は記録しない）', () => {
    const t = start(pomodoro({ phase: 'shortBreak', pomodoroCount: 1 }), at(0), S);
    const r = advance(t, at(5), S);
    expect(r.drafts).toHaveLength(0);
    expect(r.timer).toMatchObject({ phase: 'work', startedAt: null, pomodoroCount: 1 });
    expect(r.events[0].kind).toBe('breakDone');
  });

  it('連続モードでは作業 → 休憩 → 作業と自動で進む', () => {
    const s = { ...S, autoContinue: true };
    const t = start(pomodoro(), at(0), s);
    const r1 = advance(t, at(25), s);
    expect(r1.timer).toMatchObject({ phase: 'shortBreak', phaseDurationSec: 300 });
    expect(ms(r1.timer.startedAt)).toBe(at(25));
    const r2 = advance(r1.timer, at(30), s);
    expect(r2.timer).toMatchObject({ phase: 'work', phaseDurationSec: 1500 });
    expect(ms(r2.timer.startedAt)).toBe(at(30));
  });

  it('閉じている間に終わった作業は本来の終了時刻で記録し、次の作業は自動で始めない', () => {
    const s = { ...S, autoContinue: true };
    const t = start(pomodoro(), at(0), s);
    const r = advance(t, at(180), s); // 3 時間後に開いた
    expect(r.drafts).toHaveLength(1);
    expect(ms(r.drafts[0].endAt)).toBe(at(25));
    expect(r.timer).toMatchObject({ phase: 'work', startedAt: null, pomodoroCount: 1 });
    expect(r.events.map(e => [e.kind, e.live])).toEqual([
      ['workDone', false],
      ['breakDone', false],
    ]);
  });

  it('連続モードでない場合、閉じている間に作業が終わったら休憩の待機で止まる', () => {
    const t = start(pomodoro(), at(0), S);
    const r = advance(t, at(180), S);
    expect(r.drafts).toHaveLength(1);
    expect(r.timer).toMatchObject({ phase: 'shortBreak', startedAt: null });
  });
});

describe('停止', () => {
  it('ポモドーロを途中で止めて「記録する」と、未完了として記録する', () => {
    const t = start(pomodoro(), at(0), S);
    const r = stop(t, at(12), true);
    expect(r.drafts[0]).toMatchObject({ type: 'pomodoro', durationSec: 720, completed: false });
    expect(r.timer).toMatchObject({ phase: 'work', startedAt: null });
  });

  it('「破棄する」と記録しない', () => {
    const r = stop(start(pomodoro(), at(0), S), at(12), false);
    expect(r.drafts).toHaveLength(0);
  });

  it('1 分未満は記録しない', () => {
    expect(stop(start(stopwatch(), at(0), S), at(0.9), true).drafts).toHaveLength(0);
    expect(stop(start(stopwatch(), at(0), S), at(1), true).drafts).toHaveLength(1);
  });

  it('ストップウォッチは開始から停止まで（一時停止を除く）を記録する', () => {
    let t = start(stopwatch({ taskId: null }), at(0), S);
    t = resume(pause(t, at(30)), at(45));
    const r = stop(t, at(90), true);
    expect(r.drafts[0]).toMatchObject({ taskId: null, type: 'stopwatch', durationSec: 75 * 60, completed: false });
    expect(ms(r.drafts[0].endAt)).toBe(at(90));
  });

  it('一時停止中に止めた場合、終了時刻は一時停止した時刻', () => {
    const t = pause(start(stopwatch(), at(0), S), at(30));
    const r = stop(t, at(90), true);
    expect(ms(r.drafts[0].endAt)).toBe(at(30));
    expect(r.drafts[0].durationSec).toBe(30 * 60);
  });

  it('休憩中に止めても記録しない', () => {
    const t = start(pomodoro({ phase: 'longBreak' }), at(0), S);
    const r = stop(t, at(10), true);
    expect(r.drafts).toHaveLength(0);
    expect(r.timer.phase).toBe('work');
  });
});

describe('休憩のスキップ', () => {
  it('作業の待機に戻る。連続モードなら作業を始める', () => {
    const t = start(pomodoro({ phase: 'shortBreak' }), at(0), S);
    expect(skipBreak(t, at(2), S)).toMatchObject({ phase: 'work', startedAt: null });
    const auto = skipBreak(t, at(2), { ...S, autoContinue: true });
    expect(auto.phase).toBe('work');
    expect(ms(auto.startedAt)).toBe(at(2));
  });
  it('作業中はスキップできない', () => {
    const t = start(pomodoro(), at(0), S);
    expect(skipBreak(t, at(2), S)).toBe(t);
  });
});

describe('モードとタスクの切り替え', () => {
  it('開始前だけ変えられる', () => {
    expect(setMode(pomodoro(), 'stopwatch').mode).toBe('stopwatch');
    expect(setTask(pomodoro(), 'other').taskId).toBe('other');
    const running = start(pomodoro(), at(0), S);
    expect(setMode(running, 'stopwatch')).toBe(running);
    expect(setTask(running, 'other')).toBe(running);
  });
});

describe('ストップウォッチの止め忘れ確認', () => {
  it('設定の時間（初期値 3 時間）がたったら確認する', () => {
    const t = start(stopwatch(), at(0), S);
    expect(isCheckDue(t, at(179), S)).toBe(false);
    expect(isCheckDue(t, at(180), S)).toBe(true);
    expect(isCheckDue(pause(t, at(200)), at(200), S)).toBe(false);
  });

  it('「続ける」を選ぶと、そこからさらに 3 時間後に確認する', () => {
    const t = continueAfterCheck(start(stopwatch(), at(0), S), at(200));
    expect(isCheckDue(t, at(379), S)).toBe(false);
    expect(isCheckDue(t, at(380), S)).toBe(true);
  });

  it('「確認した時点で止めて記録」は 3 時間ちょうどまでを記録する', () => {
    const t = start(stopwatch(), at(0), S);
    const r = stopAtCheckpoint(t, at(600), S); // 10 時間後に気づいた
    expect(r.drafts[0].durationSec).toBe(180 * 60);
    expect(ms(r.drafts[0].endAt)).toBe(at(180));
    expect(getStatus(r.timer)).toBe('idle');
  });

  it('一時停止をはさんだ場合も、確認時点の実時刻で終わる', () => {
    let t = start(stopwatch(), at(0), S);
    t = resume(pause(t, at(60)), at(90)); // 30 分停止
    const r = stopAtCheckpoint(t, at(300), S);
    expect(r.drafts[0].durationSec).toBe(180 * 60);
    expect(ms(r.drafts[0].endAt)).toBe(at(210));
  });
});
