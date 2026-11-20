/* 書き出し・読み込みのファイルの中身（画面やファイル操作に依存しない純粋な関数。自動テストの対象） */

import { DEFAULT_SETTINGS, type Project, type Session, type Settings, type Task, type TimerPreset } from '../db/types';
import { describeTask } from '../db/queries';
import { dayKeyOf, rangeOfDayKey } from '../lib/day';
import { formatDuration, formatTime, toDateKey } from '../lib/time';

export const FORMAT_APP = 'work-timer';
export const FORMAT_VERSION = 3;

/** 書き出す全データ（実行中のタイマーとバックアップ先のフォルダは含めない） */
export type BackupData = {
  projects: Project[];
  tasks: Task[];
  sessions: Session[];
  presets: TimerPreset[];
  settings: Settings;
};

export type BackupFile = {
  app: typeof FORMAT_APP;
  version: typeof FORMAT_VERSION;
  exportedAt: string;
  data: BackupData;
};

export function buildBackup(data: BackupData, exportedAt: string): BackupFile {
  return { app: FORMAT_APP, version: FORMAT_VERSION, exportedAt, data };
}

/** バックアップの中身が変わったかを比べるための文字列（最後にバックアップした日時は除く） */
export function backupSignature(data: BackupData): string {
  return JSON.stringify({ ...data, settings: { ...data.settings, lastBackupAt: null } });
}

/* ---------- 読み込み（復元） ---------- */

export class ImportError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown) => typeof v === 'string';

function checkList(list: unknown, name: string, required: string[]): Record<string, unknown>[] {
  if (!Array.isArray(list)) throw new ImportError(`${name}の形が正しくありません`);
  list.forEach((item, i) => {
    if (!isObj(item) || !isStr(item.id)) throw new ImportError(`${name}の ${i + 1} 件目に ID がありません`);
    for (const key of required) {
      if (!(key in item)) throw new ImportError(`${name}の ${i + 1} 件目に「${key}」がありません`);
    }
  });
  return list as Record<string, unknown>[];
}

/** JSON の文字列を読み込む。v3 の形（このアプリが書き出したもの）だけを受け付ける */
export function parseBackup(text: string): BackupData {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportError('JSON として読み込めませんでした');
  }
  if (!isObj(json) || json.app !== FORMAT_APP) throw new ImportError('このアプリで書き出したバックアップファイルではありません');
  if (json.version !== FORMAT_VERSION) throw new ImportError(`対応していない形式です（version ${String(json.version)}）`);
  const d = json.data;
  if (!isObj(d)) throw new ImportError('データが見つかりません');
  const projects = checkList(d.projects, 'プロジェクト', ['name', 'color', 'createdAt']) as unknown as Project[];
  const tasks = checkList(d.tasks, 'タスク', ['title', 'createdAt']) as unknown as Task[];
  const sessions = checkList(d.sessions, '記録', ['type', 'startAt', 'endAt', 'durationSec']) as unknown as Session[];
  const presets = checkList(d.presets, 'プリセット', ['name', 'blocks', 'createdAt']) as unknown as TimerPreset[];
  if (!isObj(d.settings)) throw new ImportError('設定が見つかりません');
  return { projects, tasks, sessions, presets, settings: { ...DEFAULT_SETTINGS, ...(d.settings as Partial<Settings>) } };
}

/* ---------- ファイル名 ---------- */

/** 自動バックアップと JSON の書き出しのファイル名（1 日 1 つ） */
export const backupFileName = (date: Date) => `worklog-backup-${toDateKey(date)}.json`;

const BACKUP_NAME = /^worklog-backup-(\d{4})-(\d{2})-(\d{2})\.json$/;

/** フォルダの中で消してよい古いバックアップ（このアプリが作った名前で、keepDays 日より前の日付のもの） */
export function oldBackupFiles(names: string[], today: Date, keepDays = 30): string[] {
  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() - keepDays).getTime();
  return names.filter(name => {
    const m = name.match(BACKUP_NAME);
    if (!m) return false;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() < limit;
  });
}

/* ---------- CSV ---------- */

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const TYPE_NAME: Record<Session['type'], string> = { timer: 'タイマー', stopwatch: 'ストップウォッチ', manual: '手動' };

/** 指定期間（from〜to の日付、両端を含む）の記録。Excel で文字化けしないよう先頭に BOM を付ける */
export function sessionsToCsv(args: {
  sessions: Session[];
  tasks: Task[];
  projects: Project[];
  from: string;
  to: string;
  boundaryHour: number;
}): string {
  const { sessions, tasks, projects, from, to, boundaryHour } = args;
  const rows = sessions
    .filter(s => !s.deleted)
    .map(s => ({ s, day: dayKeyOf(new Date(s.startAt), boundaryHour) }))
    .filter(({ day }) => day >= from && day <= to)
    .sort((a, b) => new Date(a.s.startAt).getTime() - new Date(b.s.startAt).getTime());
  const lines = [['日付', '開始', '終了', '分', 'プロジェクト', 'タスク', '種別', 'メモ'].join(',')];
  for (const { s, day } of rows) {
    const label = describeTask(s.taskId, tasks, projects);
    lines.push(
      [day, formatTime(s.startAt), formatTime(s.endAt), Math.round((s.durationSec / 60) * 10) / 10, label.project?.name ?? '', label.title, TYPE_NAME[s.type], s.note]
        .map(csvCell)
        .join(','),
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/* ---------- Markdown ---------- */

/** 指定日の作業ログ（Obsidian のデイリーノートに貼る用） */
export function dayToMarkdown(args: { sessions: Session[]; tasks: Task[]; projects: Project[]; day: string; boundaryHour: number }): string {
  const { sessions, tasks, projects, day, boundaryHour } = args;
  const range = rangeOfDayKey(day, boundaryHour);
  const list = sessions
    .filter(s => !s.deleted)
    .filter(s => {
      const t = new Date(s.startAt).getTime();
      return t >= range.start.getTime() && t < range.end.getTime();
    })
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const total = list.reduce((sum, s) => sum + s.durationSec, 0);
  const lines = [`## 作業ログ ${day}（合計 ${total > 0 ? formatDuration(total) : '0分'}）`, ''];
  if (list.length === 0) lines.push('- 記録なし');
  for (const s of list) {
    const label = describeTask(s.taskId, tasks, projects);
    const name = label.project ? `${label.project.name} / ${label.title}` : label.title;
    const memo = s.note ? `メモ：${s.note}` : '';
    lines.push(`- ${formatTime(s.startAt)}–${formatTime(s.endAt)} ${name}（${Math.round(s.durationSec / 60)}分）${memo}`);
  }
  return lines.join('\n') + '\n';
}
