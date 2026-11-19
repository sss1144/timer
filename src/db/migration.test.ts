import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { AppDB } from './db';

describe('データベースの更新（v1 → v2）', () => {
  it('以前の色の候補を新しい色に置き換え、自分で選んだ色はそのまま', async () => {
    const name = 'migration-test';
    const old = new Dexie(name);
    old.version(1).stores({ projects: 'id, updatedAt', tasks: 'id, projectId, updatedAt', sessions: 'id, taskId, startAt, updatedAt', kv: 'key' });
    await old.table('projects').bulkAdd([
      { id: 'a', name: 'A', color: '#4f7cff' },
      { id: 'b', name: 'B', color: '#FF5C8A' },
      { id: 'c', name: 'C', color: '#123456' },
    ]);
    old.close();

    const db = new AppDB(name);
    const colors = (await db.projects.toArray()).sort((x, y) => x.id.localeCompare(y.id)).map(p => p.color);
    expect(colors).toEqual(['#2a78d6', '#e87ba4', '#123456']);
    db.close();
  });
});
