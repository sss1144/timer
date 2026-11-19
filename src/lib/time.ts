const pad = (n: number, len = 2) => String(Math.abs(n)).padStart(len, '0');

/** 端末の時差付き ISO 8601 文字列（例: 2026-11-19T20:00:00.000+09:00） */
export function toIsoLocal(date: Date): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(Math.abs(offsetMin) / 60))}:${pad(Math.abs(offsetMin) % 60)}`
  );
}

export const nowIso = () => toIsoLocal(new Date());

/** YYYY-MM-DD（端末の日付） */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 秒を「1時間23分」「12分」「45秒」の形にする */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  if (sec < 60) return `${sec}秒`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

/** YYYY-MM-DD を「11/19(水)」の形にする */
export function formatDateKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}/${d}(${'日月火水木金土'[date.getDay()]})`;
}

/** タイマー表示用「25:00」「1:02:03」。roundUp = true なら秒を切り上げる（残り時間用） */
export function formatClock(ms: number, roundUp = false): string {
  const total = Math.max(0, roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** ISO 文字列を「20:05」の形にする */
export function formatTime(isoTime: string): string {
  const d = new Date(isoTime);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 日付（YYYY-MM-DD）と時刻（HH:mm）から日時を作る */
export function combineDateTime(dateKey: string, time: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

/** 入力欄の値から開始・終了の日時を作る。終了が開始以前なら翌日の時刻とみなす（日付をまたぐ作業） */
export function spanFromInputs(dateKey: string, startTime: string, endTime: string): { start: Date; end: Date; nextDay: boolean } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return null;
  const start = combineDateTime(dateKey, startTime);
  const end = combineDateTime(dateKey, endTime);
  const nextDay = end <= start;
  if (nextDay) end.setDate(end.getDate() + 1);
  return { start, end, nextDay };
}

/** 日時を入力欄用の「HH:mm」にする */
export const toTimeInput = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
