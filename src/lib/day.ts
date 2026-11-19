/** 日付の区切り時刻（例: 4 時）を考えた「その日」の始まり。4 時区切りなら 11/20 2:00 は 11/19 4:00 始まりの日 */
export function dayStart(at: Date, boundaryHour: number): Date {
  const start = new Date(at.getFullYear(), at.getMonth(), at.getDate(), boundaryHour);
  if (at < start) start.setDate(start.getDate() - 1);
  return start;
}

/** その日の範囲 [始まり, 次の日の始まり) */
export function dayRange(at: Date, boundaryHour: number): { start: Date; end: Date } {
  const start = dayStart(at, boundaryHour);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/** 時刻（ISO 文字列）が範囲に入るか */
export function isWithin(isoTime: string, range: { start: Date; end: Date }): boolean {
  const t = new Date(isoTime).getTime();
  return t >= range.start.getTime() && t < range.end.getTime();
}
