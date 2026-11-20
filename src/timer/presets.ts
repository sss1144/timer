import type { ActiveTimer, BlockKind, TimerBlock, TimerPreset } from '../db/types';
import { formatDuration } from '../lib/time';
import type { PresetPlan } from './engine';

export const BLOCK_LABEL: Record<BlockKind, string> = { work: '作業', break: '休憩' };

/** 使えるプリセット（削除済みを除いて作成順） */
export function livePresets(presets: TimerPreset[]): TimerPreset[] {
  return presets.filter(p => !p.deleted).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** タイマーが使うプリセット：選んでいるもの → 最後に使ったもの → 先頭 の順に、使えるものを選ぶ */
export function resolvePreset(t: ActiveTimer, live: TimerPreset[], lastPresetId: string | null): TimerPreset | null {
  return live.find(p => p.id === t.presetId) ?? live.find(p => p.id === lastPresetId) ?? live[0] ?? null;
}

export function planOf(p: TimerPreset | null | undefined): PresetPlan | null {
  return p ? { blocks: p.blocks, repeat: p.repeat } : null;
}

export const describeBlock = (b: TimerBlock) => `${BLOCK_LABEL[b.kind]} ${b.min}分`;

/** 一覧に出す説明（例：「作業 25分 → 休憩 5分 → … ・繰り返す」「作業 120分 ・1回だけ」） */
export function presetSummary(p: Pick<TimerPreset, 'blocks' | 'repeat'>): string {
  const shown = p.blocks.slice(0, 4).map(describeBlock).join(' → ');
  const more = p.blocks.length > 4 ? ` → …（全 ${p.blocks.length} ブロック）` : '';
  const work = p.blocks.filter(b => b.kind === 'work').reduce((a, b) => a + b.min, 0);
  return `${shown}${more} ・ ${p.repeat ? '繰り返す' : '1回だけ'} ・ 作業 計${formatDuration(work * 60)}`;
}
