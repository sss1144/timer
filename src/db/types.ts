/* データ構造（requirements.md 9 章）
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
  /** 繰り返しなしのタスクの見積もり時間（合計、分）。繰り返しタスクでは null */
  estimatedMin: number | null;
  /** null = 繰り返さない。あとで曜日などを足すときは、この中に項目を足す（ステップ 8 で使う） */
  repeat: { minPerDay: number } | null;
  /** YYYY-MM-DD。繰り返しタスクでは null */
  dueDate: string | null;
  note: string;
  done: boolean;
  doneAt: string | null;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SessionType = 'timer' | 'stopwatch' | 'manual';

export type BlockKind = 'work' | 'break';
export type TimerBlock = { kind: BlockKind; min: number };

/** タイマーのプリセット（一覧は作成順に並べる） */
export type TimerPreset = {
  id: string;
  name: string;
  blocks: TimerBlock[];
  /** true = 最後のブロックのあと最初に戻る */
  repeat: boolean;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
};

/** 初期のプリセット（新しく使い始めたときと、v2 からの移行で入れる） */
export const DEFAULT_PRESETS: Pick<TimerPreset, 'name' | 'blocks' | 'repeat'>[] = [
  { name: '2時間ブロック', blocks: [{ kind: 'work', min: 120 }], repeat: false },
  {
    name: 'ポモドーロ',
    blocks: [
      { kind: 'work', min: 25 },
      { kind: 'break', min: 5 },
      { kind: 'work', min: 25 },
      { kind: 'break', min: 5 },
      { kind: 'work', min: 25 },
      { kind: 'break', min: 5 },
      { kind: 'work', min: 25 },
      { kind: 'break', min: 20 },
    ],
    repeat: true,
  },
];

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
  /** 作業ブロックを最後まで終えたか（途中で止めて記録したもの・手動などは false）。画面には出さない */
  completed: boolean;
  note: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Settings = {
  /** 次のブロックに自動で進む */
  autoContinue: boolean;
  stopwatchCheckMin: number;
  sound: boolean;
  /** 作業ブロックが終わったときの音の ID（src/timer/sounds.ts の一覧のどれか） */
  workEndSound: string;
  /** 休憩ブロックが終わった（作業が始まる）ときの音の ID */
  workStartSound: string;
  /** 音量 0〜100 */
  volume: number;
  notification: boolean;
  weekStart: 'mon' | 'sun';
  dayBoundaryHour: number;
  /** 表示モード：端末に合わせる / ライト / ダーク */
  colorMode: 'auto' | 'light' | 'dark';
  /** 見た目のテーマの ID（src/lib/themes.ts の一覧のどれか） */
  theme: string;
  lastPresetId: string | null;
  lastBackupAt: string | null;
};

export const DEFAULT_SETTINGS: Settings = {
  autoContinue: false,
  stopwatchCheckMin: 180,
  sound: true,
  workEndSound: 'chime',
  workStartSound: 'bell',
  volume: 70,
  notification: false,
  weekStart: 'mon',
  dayBoundaryHour: 4,
  colorMode: 'auto',
  theme: 'blue',
  lastPresetId: null,
  lastBackupAt: null,
};

/** タイマーの状態（再読み込みしても復帰できるよう保存する）。
 * 時間は「開始時刻と現在時刻の差 − 一時停止していた時間」で計算する。 */
export type ActiveTimer = {
  mode: 'timer' | 'stopwatch';
  /** 選んでいるプリセット。実行中はこのプリセットを編集・削除できない */
  presetId: string | null;
  /** 今のブロックの番号（ストップウォッチは 0） */
  blockIndex: number;
  taskId: string | null;
  /** 今のブロックの開始時刻。null = 開始前の待機中 */
  startedAt: string | null;
  pausedAt: string | null;
  pausedTotalSec: number;
  /** 今のブロックの長さ（ストップウォッチは 0） */
  blockDurationSec: number;
  /** ストップウォッチの止め忘れ確認で「続ける」を選んだ時点の経過秒数 */
  checkedElapsedSec: number;
};

export const IDLE_TIMER: ActiveTimer = {
  mode: 'timer',
  presetId: null,
  blockIndex: 0,
  taskId: null,
  startedAt: null,
  pausedAt: null,
  pausedTotalSec: 0,
  blockDurationSec: 0,
  checkedElapsedSec: 0,
};

/** プロジェクトの色の候補（グラフ用に色覚の違いも含めて見分けやすさを確かめた 8 色。この順に割り当てる）。
 * ダークモードでは同じ色相の、暗い背景用の段階で表示する（src/lib/colors.ts） */
export const PROJECT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'] as const;

export const LIMITS = {
  projectName: 30,
  taskTitle: 60,
  note: 500,
  maxEstimateMin: 9999,
  presetName: 30,
  maxBlockMin: 720,
  maxMinPerDay: 1440,
  /** これより短い記録は保存しない（秒） */
  minRecordSec: 60,
  /** 1 件の記録の最大の長さ（秒） */
  maxRecordSec: 24 * 3600,
} as const;
