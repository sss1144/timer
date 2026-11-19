import { describe, expect, it } from 'vitest';
import { dayRange, dayStart, isWithin } from './day';
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
