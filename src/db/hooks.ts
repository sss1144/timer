import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { DEFAULT_SETTINGS, IDLE_TIMER, type ActiveTimer, type Settings } from './types';

/* データベースの中身を画面に表示するためのフック。保存すると自動で再描画される（別のタブでの変更も反映） */

export const useProjects = () => useLiveQuery(() => db.projects.toArray(), []);
export const useTasks = () => useLiveQuery(() => db.tasks.toArray(), []);
export const useSessions = () => useLiveQuery(() => db.sessions.toArray(), []);

export function useSettings(): Settings {
  const row = useLiveQuery(() => db.kv.get('settings'), []);
  // 中身が変わったときだけ新しいオブジェクトにする（useEffect の依存に使えるように）
  return useMemo(() => ({ ...DEFAULT_SETTINGS, ...(row?.key === 'settings' ? row.value : {}) }), [row]);
}

/** タイマーの状態。読み込み中は undefined */
export function useActiveTimer(): ActiveTimer | undefined {
  const row = useLiveQuery(async () => (await db.kv.get('activeTimer')) ?? null, []);
  return useMemo(
    () => (row === undefined ? undefined : { ...IDLE_TIMER, ...(row?.key === 'activeTimer' ? row.value : {}) }),
    [row],
  );
}

export const usePresets = () => useLiveQuery(() => db.presets.toArray(), []);
