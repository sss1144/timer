/* データ構造（requirements.md 9 章 + docs/plan.md の追加分）
 * すべての日時は時差付きの ISO 8601 文字列（例: 2026-11-19T20:00:00.000+09:00）。
 * 削除は実際には消さず deleted: true にする（JSON の統合読み込みで復活しないように）。 */

export type Project = {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Task = {
  id: string;
  projectId: string | null;
  title: string;
  estimatedPomodoros: number | null;
  /** YYYY-MM-DD */
  dueDate: string | null;
  note: string;
  done: boolean;
  doneAt: string | null;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SessionType = 'pomodoro' | 'stopwatch' | 'manual';

/** 1 件の作業記録 */
export type Session = {
  id: string;
  /** null = 未分類 */
  taskId: string | null;
  type: SessionType;
  startAt: string;
  endAt: string;
  /** 一時停止を除いた実作業時間 */
  durationSec: number;
  /** ポモドーロを最後まで終えたか（途中で止めて記録したものは false） */
  completed: boolean;
  note: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AlarmSound = 'chime' | 'bell' | 'beep';

export type Settings = {
  workMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
  autoContinue: boolean;
  stopwatchCheckMin: number;
  sound: boolean;
  alarmSound: AlarmSound;
  notification: boolean;
  weekStart: 'mon' | 'sun';
  dayBoundaryHour: number;
  lastBackupAt: string | null;
};

export const DEFAULT_SETTINGS: Settings = {
  workMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
  autoContinue: false,
  stopwatchCheckMin: 180,
  sound: true,
  alarmSound: 'chime',
  notification: false,
  weekStart: 'mon',
  dayBoundaryHour: 0,
  lastBackupAt: null,
};

/** タイマーの状態（再読み込みしても復帰できるよう保存する）。
 * 時間は「開始時刻と現在時刻の差 − 一時停止していた時間」で計算する。 */
export type ActiveTimer = {
  mode: 'pomodoro' | 'stopwatch';
  phase: 'work' | 'shortBreak' | 'longBreak';
  taskId: string | null;
  /** null = まだ開始していない（待機中） */
  startedAt: string | null;
  pausedAt: string | null;
  pausedTotalSec: number;
  /** 完了したポモドーロの数（長い休憩のタイミングに使う） */
  pomodoroCount: number;
  /** 実行中フェーズの長さ。開始時の設定で固定する（ストップウォッチは 0） */
  phaseDurationSec: number;
  /** ストップウォッチの止め忘れ確認で「続ける」を選んだ時点の経過秒数 */
  checkedElapsedSec: number;
};

export const IDLE_TIMER: ActiveTimer = {
  mode: 'pomodoro',
  phase: 'work',
  taskId: null,
  startedAt: null,
  pausedAt: null,
  pausedTotalSec: 0,
  pomodoroCount: 0,
  phaseDurationSec: 0,
  checkedElapsedSec: 0,
};

/** プロジェクトの色の候補（ライト・ダークどちらでも見やすい色） */
export const PROJECT_COLORS = [
  '#4f7cff',
  '#ff7a59',
  '#22a565',
  '#f5b700',
  '#9a55f5',
  '#00b8d9',
  '#ff5c8a',
  '#14b8a6',
  '#a1785c',
  '#64748b',
] as const;

export const LIMITS = {
  projectName: 30,
  taskTitle: 60,
  note: 500,
  maxEstimate: 99,
  /** これより短い記録は保存しない（秒） */
  minRecordSec: 60,
  /** 1 件の記録の最大の長さ（秒） */
  maxRecordSec: 24 * 3600,
} as const;
