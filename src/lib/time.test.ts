import { describe, expect, it } from 'vitest';
import { formatDateKey, formatDuration, toDateKey, toIsoLocal } from './time';

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
