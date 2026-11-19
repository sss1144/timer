import Dexie, { type Table } from 'dexie';
import type { ActiveTimer, Project, Session, Settings, Task } from './types';

/** 設定と実行中タイマーのように 1 件だけ持つデータの置き場所 */
export type KvRow =
  | { key: 'settings'; value: Settings }
  | { key: 'activeTimer'; value: ActiveTimer };

export class AppDB extends Dexie {
  projects!: Table<Project, string>;
  tasks!: Table<Task, string>;
  sessions!: Table<Session, string>;
  kv!: Table<KvRow, string>;

  constructor(name = 'work-timer') {
    super(name);
    this.version(1).stores({
      projects: 'id, updatedAt',
      tasks: 'id, projectId, updatedAt',
      sessions: 'id, taskId, startAt, updatedAt',
      kv: 'key',
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
