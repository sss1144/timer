import Dexie, { type Table } from 'dexie';
import type { ActiveTimer, Project, Session, Settings, Task, TimerPreset } from './types';
import { LEGACY_COLOR_MAP } from '../lib/colors';
import { makeDefaultPresets, migrateToV3, migrateToV4 } from './migrations';

/** 設定と実行中タイマーのように 1 件だけ持つデータの置き場所 */
export type KvRow =
  | { key: 'settings'; value: Settings }
  | { key: 'activeTimer'; value: ActiveTimer };

export class AppDB extends Dexie {
  projects!: Table<Project, string>;
  tasks!: Table<Task, string>;
  sessions!: Table<Session, string>;
  presets!: Table<TimerPreset, string>;
  kv!: Table<KvRow, string>;

  constructor(name = 'work-timer') {
    super(name);
    this.version(1).stores({
      projects: 'id, updatedAt',
      tasks: 'id, projectId, updatedAt',
      sessions: 'id, taskId, startAt, updatedAt',
      kv: 'key',
    });
    // v2: プロジェクトの色の候補をグラフ向けの 8 色に変えたので、以前の候補の色を近い新しい色に置き換える
    this.version(2).upgrade(tx =>
      tx
        .table('projects')
        .toCollection()
        .modify((p: Project) => {
          const next = LEGACY_COLOR_MAP[p.color.toLowerCase()];
          if (next) p.color = next;
        }),
    );
    // v3: ポモドーロタイマーをブロック式に変える（requirements.md 13 章）
    this.version(3).stores({ presets: 'id, createdAt' }).upgrade(migrateToV3);
    // v4: アラーム音を「作業終了の音」「作業開始の音」に分け、音量を足す
    this.version(4).upgrade(migrateToV4);

    // 新しく使い始めたときは、初期のプリセットを入れる
    this.on('populate', tx => {
      void tx.table('presets').bulkAdd(makeDefaultPresets());
    });
  }
}

export const db = new AppDB();

/** ブラウザに「容量が足りなくなってもデータを消さないで」と依頼する */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
