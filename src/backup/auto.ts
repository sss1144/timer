/* 決めたフォルダへの自動バックアップ（PC の Chrome・Edge の File System Access API）
 * - フォルダの情報（FileSystemDirectoryHandle）は IndexedDB に保存する（JSON の書き出しには含めない）
 * - データが変わったら、1 分間変更がなかった時点で書き出す（実行中のタイマーの動きでは書き出さない）
 * - ファイルは 1 日 1 つ（同じ日のうちは上書き）。30 日より古いバックアップは消す */

import { useEffect } from 'react';
import { liveQuery } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { updateSettings } from '../db/repo';
import { nowIso } from '../lib/time';
import { backupFileName, backupSignature, oldBackupFiles, type BackupData } from './format';
import { backupJson, loadBackupData } from './io';

/* File System Access API のうち、TypeScript の型にまだない部分 */
type PermissionMode = { mode: 'readwrite' };
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (d: PermissionMode) => Promise<PermissionState>;
  requestPermission?: (d: PermissionMode) => Promise<PermissionState>;
  entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};
type PickerWindow = Window & { showDirectoryPicker?: (o: { id?: string; mode?: 'readwrite' }) => Promise<DirHandle> };

export type { DirHandle };

export type BackupState = {
  /** 最後に自動バックアップできた日時 */
  lastAt: string | null;
  /** 書き込めなかった理由（なければ null） */
  error: string | null;
  /** 最後に書き出した中身の目印（同じ中身なら書き直さない） */
  signature: string | null;
};

const EMPTY_STATE: BackupState = { lastAt: null, error: null, signature: null };
export const DEBOUNCE_MS = 60_000;

export const autoBackupSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

async function getHandle(): Promise<DirHandle | null> {
  const row = await db.kv.get('backupDir');
  return row?.key === 'backupDir' ? (row.value as DirHandle) : null;
}

async function getState(): Promise<BackupState> {
  const row = await db.kv.get('backupState');
  return { ...EMPTY_STATE, ...(row?.key === 'backupState' ? row.value : {}) };
}

async function setState(patch: Partial<BackupState>): Promise<void> {
  await db.kv.put({ key: 'backupState', value: { ...(await getState()), ...patch } });
}

/** 文字列の短い目印（FNV-1a） */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16) + ':' + text.length;
}

function errorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'フォルダへの書き込みが許可されていません';
  if (name === 'NotFoundError') return 'フォルダが見つかりません（移動・削除された可能性があります）';
  return err instanceof Error ? err.message : '書き込めませんでした';
}

async function hasPermission(dir: DirHandle, request: boolean): Promise<boolean> {
  const opts: PermissionMode = { mode: 'readwrite' };
  if (!dir.queryPermission) return true;
  if ((await dir.queryPermission(opts)) === 'granted') return true;
  return request && !!dir.requestPermission && (await dir.requestPermission(opts)) === 'granted';
}

/** バックアップを書き出す。force = true なら中身が同じでも書く。request = true なら許可を求める（ボタンを押したときだけ） */
export async function runBackup(options: { force?: boolean; request?: boolean; data?: BackupData; dir?: DirHandle } = {}): Promise<boolean> {
  const dir = options.dir ?? (await getHandle());
  if (!dir) return false;
  try {
    if (!(await hasPermission(dir, !!options.request))) {
      await setState({ error: 'フォルダへの書き込みの許可が切れています' });
      return false;
    }
    const data = options.data ?? (await loadBackupData());
    const signature = hash(backupSignature(data));
    const state = await getState();
    const name = backupFileName(new Date());
    const sameDay = state.lastAt ? backupFileName(new Date(state.lastAt)) === name : false;
    if (!options.force && state.signature === signature && sameDay && !state.error) return true;

    const file = await dir.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await writable.write(backupJson(data));
    await writable.close();

    // 30 日より古いバックアップを消す（このアプリが作った名前のファイルだけ）
    if (dir.entries) {
      const names: string[] = [];
      for await (const [entryName, handle] of dir.entries()) if (handle.kind === 'file') names.push(entryName);
      for (const old of oldBackupFiles(names, new Date())) await dir.removeEntry(old);
    }

    const at = nowIso();
    await setState({ lastAt: at, error: null, signature });
    await updateSettings({ lastBackupAt: at });
    return true;
  } catch (err) {
    await setState({ error: errorMessage(err) });
    return false;
  }
}

/** バックアップ先のフォルダを選ぶ（ボタンを押したときに呼ぶ） */
export async function chooseBackupFolder(): Promise<boolean> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) return false;
  let dir: DirHandle;
  try {
    dir = await picker({ id: 'work-timer-backup', mode: 'readwrite' });
  } catch {
    return false; // 選ぶのをやめた
  }
  await db.kv.put({ key: 'backupDir', value: dir });
  await setState({ error: null, signature: null });
  return runBackup({ force: true, request: true });
}

/** 許可をやり直す（ボタンを押したときに呼ぶ） */
export const retryBackup = () => runBackup({ force: true, request: true });

export async function stopAutoBackup(): Promise<void> {
  await db.kv.delete('backupDir');
  await db.kv.delete('backupState');
}

/** 自動バックアップの状態（設定画面・お知らせ用） */
export function useBackupStatus() {
  return useLiveQuery(async () => {
    const [dir, state] = await Promise.all([getHandle(), getState()]);
    return { folderName: dir?.name ?? null, configured: !!dir, ...state };
  }, []);
}

/** データが変わったら 1 分後（その間に変更がなければ）に書き出す。アプリ全体で 1 回だけ使う */
export function useAutoBackup(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // 記録・タスク・プロジェクト・プリセット・設定のどれかが変わると呼ばれる（実行中のタイマーの保存では呼ばれない）
    const sub = liveQuery(() =>
      Promise.all([db.projects.toArray(), db.tasks.toArray(), db.sessions.toArray(), db.presets.toArray(), db.kv.get('settings'), db.kv.get('backupDir')]),
    ).subscribe({
      next: () => {
        clearTimeout(timer);
        timer = setTimeout(() => void runBackup(), DEBOUNCE_MS);
      },
      error: () => {},
    });
    return () => {
      clearTimeout(timer);
      sub.unsubscribe();
    };
  }, []);
}
