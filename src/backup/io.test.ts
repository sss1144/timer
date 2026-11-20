import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { createPreset, createProject, createTask, getSettings, updateSettings } from '../db/repo';
import { DEFAULT_SETTINGS, IDLE_TIMER } from '../db/types';
import { runBackup, type DirHandle } from './auto';
import { parseBackup, type BackupData } from './format';
import { loadBackupData, replaceAllData } from './io';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

/** テスト用のフォルダ（ファイルの名前と中身だけを持つ） */
function fakeDir(initial: string[] = [], permission: PermissionState = 'granted') {
  const files = new Map<string, string>(initial.map(n => [n, 'old']));
  const dir = {
    name: 'バックアップ',
    kind: 'directory',
    queryPermission: async () => permission,
    requestPermission: async () => permission,
    getFileHandle: async (name: string) => ({
      kind: 'file',
      createWritable: async () => {
        let buf = '';
        return { write: async (t: string) => void (buf += t), close: async () => void files.set(name, buf) };
      },
    }),
    removeEntry: async (name: string) => void files.delete(name),
    entries: async function* () {
      for (const name of files.keys()) yield [name, { kind: 'file' }];
    },
  };
  return { dir: dir as unknown as DirHandle, files };
}

describe('復元（データの置き換え）', () => {
  it('今のデータを消して、読み込んだデータに置き換える。実行中のタイマーは開始前に戻す', async () => {
    await createProject({ name: '古い', color: '#2a78d6' });
    await db.kv.put({ key: 'activeTimer', value: { ...IDLE_TIMER, startedAt: '2026-11-20T20:00:00.000+09:00' } });
    const p = await createPreset({ name: '残す', blocks: [{ kind: 'work', min: 30 }], repeat: false });
    const incoming: BackupData = {
      projects: [{ id: 'np', name: '新しい', color: '#eb6834', archived: false, deleted: false, createdAt: '', updatedAt: '' }],
      tasks: [],
      sessions: [],
      presets: [p],
      settings: { ...DEFAULT_SETTINGS, volume: 20 },
    };
    await replaceAllData(incoming);
    expect((await db.projects.toArray()).map(x => x.name)).toEqual(['新しい']);
    expect((await db.presets.toArray()).map(x => x.name)).toEqual(['残す']);
    expect((await getSettings()).volume).toBe(20);
    expect(await db.kv.get('activeTimer')).toBeUndefined();
  });

  it('プリセットが 1 つもなければ初期のプリセットを入れる', async () => {
    await replaceAllData({ projects: [], tasks: [], sessions: [], presets: [], settings: DEFAULT_SETTINGS });
    expect((await db.presets.toArray()).map(x => x.name).sort()).toEqual(['2時間ブロック', 'ポモドーロ']);
  });
});

describe('自動バックアップ', () => {
  it('今日の名前のファイルに全データを書き、30 日より古いバックアップを消す', async () => {
    await createTask({ title: 'クロッキー', projectId: null, estimatedMin: null, dueDate: null, note: '', repeat: { minPerDay: 30 } });
    const { dir, files } = fakeDir(['worklog-backup-2020-01-01.json', 'メモ.txt']);
    expect(await runBackup({ dir })).toBe(true);
    const today = [...files.keys()].find(n => n.startsWith('worklog-backup-') && !n.includes('2020'))!;
    expect([...files.keys()].sort()).toEqual([today, 'メモ.txt'].sort());
    const back = parseBackup(files.get(today)!);
    expect(back.tasks.map(t => t.title)).toEqual(['クロッキー']);
    expect((await getSettings()).lastBackupAt).not.toBeNull();
  });

  it('中身が変わっていなければ書き直さない。変わったら同じファイルに上書き', async () => {
    const { dir, files } = fakeDir();
    await runBackup({ dir });
    const name = [...files.keys()][0];
    files.set(name, 'marker');
    await runBackup({ dir }); // 変わっていない
    expect(files.get(name)).toBe('marker');
    await updateSettings({ volume: 10 });
    await runBackup({ dir });
    expect(parseBackup(files.get(name)!).settings.volume).toBe(10);
    expect(files.size).toBe(1);
  });

  it('許可が切れていたら書かずに、理由を残す', async () => {
    const { dir, files } = fakeDir([], 'prompt');
    expect(await runBackup({ dir })).toBe(false);
    expect(files.size).toBe(0);
    const state = await db.kv.get('backupState');
    expect(state?.value).toMatchObject({ error: expect.stringContaining('許可') });
  });

  it('書き出す中身は loadBackupData と同じ（実行中のタイマーは含めない）', async () => {
    await db.kv.put({ key: 'activeTimer', value: IDLE_TIMER });
    const data = await loadBackupData();
    expect(Object.keys(data).sort()).toEqual(['presets', 'projects', 'sessions', 'settings', 'tasks']);
  });
});
