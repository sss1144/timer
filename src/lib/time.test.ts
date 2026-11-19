import { describe, expect, it } from 'vitest';
import { formatClock, formatDateKey, formatDuration, toDateKey, toIsoLocal } from './time';

describe('toIsoLocal', () => {
  it('時差付きの ISO 8601 で、元の時刻に戻せる', () => {
    const d = new Date('2026-11-19T11:05:09.007Z');
    const iso = toIsoLocal(d);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    expect(new Date(iso).getTime()).toBe(d.getTime());
  });
});

describe('toDateKey', () => {
  it('端末の日付で YYYY-MM-DD', () => {
    expect(toDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('formatDuration', () => {
  it('秒・分・時間を読みやすくする', () => {
    expect(formatDuration(45)).toBe('45秒');
    expect(formatDuration(25 * 60)).toBe('25分');
    expect(formatDuration(2 * 3600)).toBe('2時間');
    expect(formatDuration(2 * 3600 + 10 * 60 + 30)).toBe('2時間10分');
  });
});

describe('formatDateKey', () => {
  it('月/日(曜日)', () => {
    expect(formatDateKey('2026-11-19')).toBe('11/19(木)');
  });
});

describe('formatClock', () => {
  it('分:秒、1 時間以上は 時:分:秒', () => {
    expect(formatClock(25 * 60_000)).toBe('25:00');
    expect(formatClock(3_723_000)).toBe('1:02:03');
    expect(formatClock(-5)).toBe('00:00');
  });
  it('残り時間は切り上げる（24:59.2 → 25:00）', () => {
    expect(formatClock(1_499_200, true)).toBe('25:00');
    expect(formatClock(1_499_200)).toBe('24:59');
  });
});
