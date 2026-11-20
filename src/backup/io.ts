/* 書き出し（ファイルの保存・クリップボード）と復元 */

import { db } from '../db/db';
import { getSettings, updateSettings } from '../db/repo';
import { makeDefaultPresets } from '../db/migrations';
import { nowIso, toDateKey } from '../lib/time';
import { backupFileName, buildBackup, dayToMarkdown, sessionsToCsv, type BackupData } from './format';

/** 今のデータをまとめて読む（実行中のタイマーとバックアップ先のフォルダは含めない） */
export async function loadBackupData(): Promise<BackupData> {
  const [projects, tasks, sessions, presets, settings] = await Promise.all([
    db.projects.toArray(),
    db.tasks.toArray(),
    db.sessions.toArray(),
    db.presets.toArray(),
    getSettings(),
  ]);
  return { projects, tasks, sessions, presets, settings };
}

export function backupJson(data: BackupData): string {
  return JSON.stringify(buildBackup(data, nowIso()), null, 2);
}

/** ファイルとして保存する（ブラウザのダウンロード） */
export function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** JSON で全データを書き出す */
export async function exportJson(): Promise<void> {
  const data = await loadBackupData();
  downloadFile(backupFileName(new Date()), backupJson(data), 'application/json');
  await updateSettings({ lastBackupAt: nowIso() });
}

/** 指定期間の記録を CSV で書き出す */
export async function exportCsv(from: string, to: string): Promise<void> {
  const data = await loadBackupData();
  const csv = sessionsToCsv({ ...data, from, to, boundaryHour: data.settings.dayBoundaryHour });
  downloadFile(`worklog-${from}_${to}.csv`, csv, 'text/csv;charset=utf-8');
}

/** 指定日の作業ログ（Markdown） */
export async function dayMarkdown(day: string): Promise<string> {
  const data = await loadBackupData();
  return dayToMarkdown({ ...data, day, boundaryHour: data.settings.dayBoundaryHour });
}

export async function exportMarkdown(day: string): Promise<void> {
  downloadFile(`worklog-${day}.md`, await dayMarkdown(day), 'text/markdown;charset=utf-8');
}

export async function copyMarkdown(day: string): Promise<void> {
  await navigator.clipboard.writeText(await dayMarkdown(day));
}

/** 復元：今のデータを自動で書き出してから、読み込んだデータと置き換える。実行中のタイマーは開始前の状態にする */
export async function restoreBackup(data: BackupData): Promise<void> {
  const current = await loadBackupData();
  const d = new Date();
  const stamp = `${toDateKey(d)}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  downloadFile(`worklog-before-restore-${stamp}.json`, backupJson(current), 'application/json');
  await replaceAllData(data);
}

/** データを丸ごと置き換える（復元の中身） */
export async function replaceAllData(data: BackupData): Promise<void> {
  await db.transaction('rw', [db.projects, db.tasks, db.sessions, db.presets, db.kv], async () => {
    await Promise.all([db.projects.clear(), db.tasks.clear(), db.sessions.clear(), db.presets.clear()]);
    await db.projects.bulkAdd(data.projects);
    await db.tasks.bulkAdd(data.tasks);
    await db.sessions.bulkAdd(data.sessions);
    // プリセットが 1 つもなければ初期のものを入れる（ブロックタイマーを使えるように）
    const presets = data.presets.some(p => !p.deleted) ? data.presets : [...data.presets, ...makeDefaultPresets()];
    await db.presets.bulkAdd(presets);
    await db.kv.put({ key: 'settings', value: data.settings });
    await db.kv.delete('activeTimer');
  });
}
