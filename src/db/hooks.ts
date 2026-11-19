import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { DEFAULT_SETTINGS, type Settings } from './types';

/* データベースの中身を画面に表示するためのフック。保存すると自動で再描画される（別のタブでの変更も反映） */

export const useProjects = () => useLiveQuery(() => db.projects.toArray(), []);
export const useTasks = () => useLiveQuery(() => db.tasks.toArray(), []);
export const useSessions = () => useLiveQuery(() => db.sessions.toArray(), []);

export function useSettings(): Settings {
  const row = useLiveQuery(() => db.kv.get('settings'), []);
  return { ...DEFAULT_SETTINGS, ...(row?.key === 'settings' ? row.value : {}) };
}
