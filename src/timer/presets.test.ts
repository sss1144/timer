import { describe, expect, it } from 'vitest';
import { livePresets, presetSummary, resolvePreset } from './presets';
import { DEFAULT_PRESETS, IDLE_TIMER, type TimerPreset } from '../db/types';

const preset = (id: string, createdAt: string, deleted = false): TimerPreset => ({
  id, name: id, blocks: [{ kind: 'work', min: 25 }], repeat: false, deleted, createdAt, updatedAt: createdAt,
});

describe('resolvePreset', () => {
  const live = livePresets([preset('b', '2026-11-20T02'), preset('a', '2026-11-20T01'), preset('x', '2026-11-20T00', true)]);

  it('削除済みを除いて作成順', () => {
    expect(live.map(p => p.id)).toEqual(['a', 'b']);
  });
  it('選んでいるもの → 最後に使ったもの → 先頭', () => {
    expect(resolvePreset({ ...IDLE_TIMER, presetId: 'b' }, live, 'a')?.id).toBe('b');
    expect(resolvePreset({ ...IDLE_TIMER, presetId: 'x' }, live, 'b')?.id).toBe('b'); // 削除済みは使わない
    expect(resolvePreset({ ...IDLE_TIMER, presetId: null }, live, null)?.id).toBe('a');
    expect(resolvePreset(IDLE_TIMER, [], null)).toBeNull();
  });
});

describe('presetSummary', () => {
  it('ブロックの並びと繰り返し、作業の合計', () => {
    expect(presetSummary(DEFAULT_PRESETS[0])).toBe('作業 120分 ・ 1回だけ ・ 作業 計2時間');
    expect(presetSummary(DEFAULT_PRESETS[1])).toBe('作業 25分 → 休憩 5分 → 作業 25分 → 休憩 5分 → …（全 8 ブロック） ・ 繰り返す ・ 作業 計1時間40分');
  });
});
