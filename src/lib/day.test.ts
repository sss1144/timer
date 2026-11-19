import { describe, expect, it } from 'vitest';
import { dayKeyOf, dayRange, dayStart, isWithin, rangeOfDayKey, shiftDayKey } from './day';
import { toIsoLocal } from './time';

const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

describe('dayStart', () => {
  it('区切りが 0 時なら、その日の 0 時', () => {
    expect(dayStart(d(2026, 11, 19, 23, 59), 0)).toEqual(d(2026, 11, 19));
    expect(dayStart(d(2026, 11, 19, 0, 0), 0)).toEqual(d(2026, 11, 19));
  });
  it('区切りが 4 時なら、深夜 2 時は前の日に含める', () => {
    expect(dayStart(d(2026, 11, 20, 2, 0), 4)).toEqual(d(2026, 11, 19, 4));
    expect(dayStart(d(2026, 11, 20, 4, 0), 4)).toEqual(d(2026, 11, 20, 4));
  });
  it('月や年をまたいでも正しい', () => {
    expect(dayStart(d(2027, 1, 1, 3, 0), 4)).toEqual(d(2026, 12, 31, 4));
  });
});

describe('dayRange / isWithin', () => {
  it('その日の始まりから次の日の始まりの直前まで', () => {
    const range = dayRange(d(2026, 11, 19, 12), 4);
    expect(range.start).toEqual(d(2026, 11, 19, 4));
    expect(range.end).toEqual(d(2026, 11, 20, 4));
    expect(isWithin(toIsoLocal(d(2026, 11, 20, 3, 59)), range)).toBe(true);
    expect(isWithin(toIsoLocal(d(2026, 11, 20, 4, 0)), range)).toBe(false);
    expect(isWithin(toIsoLocal(d(2026, 11, 19, 3, 59)), range)).toBe(false);
  });
});

describe('dayKeyOf / rangeOfDayKey / shiftDayKey', () => {
  it('区切り時刻を考えて日付を決める', () => {
    expect(dayKeyOf(d(2026, 11, 20, 2), 0)).toBe('2026-11-20');
    expect(dayKeyOf(d(2026, 11, 20, 2), 4)).toBe('2026-11-19');
  });
  it('日付から範囲を作る', () => {
    expect(rangeOfDayKey('2026-11-19', 4)).toEqual({ start: d(2026, 11, 19, 4), end: d(2026, 11, 20, 4) });
  });
  it('前後の日へ移動（月・年をまたぐ）', () => {
    expect(shiftDayKey('2026-11-30', 1)).toBe('2026-12-01');
    expect(shiftDayKey('2027-01-01', -1)).toBe('2026-12-31');
  });
});
