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

export type Settings = {
  workMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
  autoContinue: boolean;
  stopwatchCheckMin: number;
  sound: boolean;
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
  notification: false,
  weekStart: 'mon',
  dayBoundaryHour: 0,
  lastBackupAt: null,
};

/** 実行中タイマー（再読み込みしても復帰できるよう保存する） */
export type ActiveTimer = {
  mode: 'pomodoro' | 'stopwatch';
  phase: 'work' | 'shortBreak' | 'longBreak';
  taskId: string | null;
  startedAt: string;
  pausedAt: string | null;
  pausedTotalSec: number;
  /** 長い休憩までの回数 */
  pomodoroCount: number;
  /** 実行中フェーズの長さ（ストップウォッチは 0） */
  phaseDurationSec: number;
  /** ストップウォッチの止め忘れ確認を最後に出した時刻 */
  lastCheckAt: string | null;
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
} as const;
