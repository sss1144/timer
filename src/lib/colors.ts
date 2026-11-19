import { PROJECT_COLORS } from '../db/types';

/** 「未分類」「プロジェクトなし」「その他」などに使う灰色（CSS 変数。ライト・ダークで切り替わる） */
export const NEUTRAL_COLOR = 'var(--series-neutral)';

const PRESETS = new Set<string>(PROJECT_COLORS);

/** 画面に表示する色。候補の 8 色は CSS 変数にして、ダークモードで暗い背景用の段階に切り替える。
 * 自分で選んだ色はそのまま使う */
export function displayColor(hex: string | null | undefined): string {
  if (!hex) return NEUTRAL_COLOR;
  const lower = hex.toLowerCase();
  return PRESETS.has(lower) ? `var(--p-${lower.slice(1)})` : lower;
}

/** 以前の色の候補から、近い新しい候補への置き換え表（データベースの更新で使う） */
export const LEGACY_COLOR_MAP: Record<string, string> = {
  '#4f7cff': '#2a78d6',
  '#ff7a59': '#eb6834',
  '#22a565': '#008300',
  '#f5b700': '#eda100',
  '#9a55f5': '#6250d6',
  '#00b8d9': '#1baf7a',
  '#ff5c8a': '#e87ba4',
};
