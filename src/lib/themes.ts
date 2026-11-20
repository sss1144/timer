/* 見た目のテーマ。ここに 1 つ足すだけで、設定画面で選べるようになる。
 * テーマで変わるのは、強調の色・背景などの色合い（テーマによっては面・文字・枠線の色、文字の形、角の形も）。
 * グラフのプロジェクトの色は変えない（色覚の違いも含めて検証した配色のため）。 */

export type ColorMode = 'auto' | 'light' | 'dark';

export type ThemeColors = {
  /** ボタン・強調の色 */
  accent: string;
  /** 強調の色の薄い背景（選択中の行など） */
  accentSoft: string;
  /** 強調の色の上に置く文字の色 */
  accentContrast: string;
  /** 画面の背景 */
  bg: string;
  /** 休憩の色（強調の色と見分けにくいテーマだけ変える） */
  breakColor?: string;
  /* 以下は、雰囲気を大きく変えるテーマだけが指定する（指定しなければ標準のまま） */
  /** カードなどの面 */
  surface?: string;
  /** 少し沈んだ面（入力欄の背景、切り替えボタンの地など） */
  surface2?: string;
  /** 文字 */
  text?: string;
  /** 補足の文字 */
  muted?: string;
  /** 枠線 */
  border?: string;
};

export type ThemeDef = {
  id: string;
  name: string;
  light: ThemeColors;
  dark: ThemeColors;
  /** 表示モードに関係なく、常に暗い表示にする */
  alwaysDark?: boolean;
  /** 文字の形（CSS の font-family）。指定しなければ標準 */
  font?: string;
  /** 見た目の型（CSS で角の形などを変える）。指定しなければ標準 */
  style?: 'retro';
  /** 設定画面に出す説明 */
  note?: string;
};

/** 「地下遺跡（レトロ）」の色：黒地に青緑の枠、黄色の強調。古い端末の画面のような雰囲気 */
const RUINS: ThemeColors = {
  accent: '#d8c64a',
  accentSoft: '#23260f',
  accentContrast: '#12130a',
  bg: '#070b0a',
  breakColor: '#4fb7c9',
  surface: '#0d1615',
  surface2: '#13302c',
  text: '#cdd9c4',
  muted: '#86a093',
  border: '#2f6b61',
};

export const THEMES: ThemeDef[] = [
  {
    id: 'blue',
    name: 'ブルー（標準）',
    light: { accent: '#4f7cff', accentSoft: '#e8eeff', accentContrast: '#ffffff', bg: '#f5f6fa' },
    dark: { accent: '#6d93ff', accentSoft: '#232c45', accentContrast: '#0b1530', bg: '#111319' },
  },
  {
    id: 'forest',
    name: 'フォレスト',
    light: { accent: '#1e8a5a', accentSoft: '#e2f3ea', accentContrast: '#ffffff', bg: '#f3f7f4', breakColor: '#2f7fc1' },
    dark: { accent: '#4cc38a', accentSoft: '#1b3529', accentContrast: '#0d1a13', bg: '#0f1512', breakColor: '#6aa8e8' },
  },
  {
    id: 'lavender',
    name: 'ラベンダー',
    light: { accent: '#7357e8', accentSoft: '#eeeaff', accentContrast: '#ffffff', bg: '#f6f5fb' },
    dark: { accent: '#a58cff', accentSoft: '#2b2547', accentContrast: '#140f2a', bg: '#12111a' },
  },
  {
    id: 'sunset',
    name: 'サンセット',
    light: { accent: '#c9541f', accentSoft: '#fdebe2', accentContrast: '#ffffff', bg: '#faf6f3' },
    dark: { accent: '#f08a55', accentSoft: '#3b271d', accentContrast: '#1f0e05', bg: '#15110f' },
  },
  {
    id: 'rose',
    name: 'ローズ',
    light: { accent: '#c93a6d', accentSoft: '#fde7ef', accentContrast: '#ffffff', bg: '#faf5f7' },
    dark: { accent: '#f07aa3', accentSoft: '#3d2130', accentContrast: '#22060f', bg: '#161013' },
  },
  {
    id: 'mono',
    name: 'モノクロ',
    light: { accent: '#3a404d', accentSoft: '#e9ebef', accentContrast: '#ffffff', bg: '#f4f4f5' },
    dark: { accent: '#d3d7df', accentSoft: '#2c3039', accentContrast: '#15171c', bg: '#121316' },
  },
  {
    id: 'ruins',
    name: '地下遺跡（レトロ）',
    light: RUINS,
    dark: RUINS,
    alwaysDark: true,
    font: 'ui-monospace, "Cascadia Mono", Consolas, "BIZ UDGothic", "MS Gothic", "Osaka-Mono", monospace',
    style: 'retro',
    note: '古い端末の画面のような、等幅の文字と角ばった見た目。常に暗い表示になります',
  },
];

export const findTheme = (id: string) => THEMES.find(t => t.id === id) ?? THEMES[0];

/** 表示モードと端末の設定から、ダークで表示するかを決める */
export const isDarkMode = (mode: ColorMode, systemDark: boolean, theme?: ThemeDef) =>
  !!theme?.alwaysDark || mode === 'dark' || (mode === 'auto' && systemDark);

/* ---------- 画面に当てる ---------- */

/** テーマの色と CSS の変数の対応 */
const VARS: Record<keyof ThemeColors, string> = {
  accent: '--accent',
  accentSoft: '--accent-soft',
  accentContrast: '--accent-contrast',
  bg: '--bg',
  breakColor: '--break',
  surface: '--surface',
  surface2: '--surface-2',
  text: '--text',
  muted: '--muted',
  border: '--border',
};

/** 画面に当てる内容（index.html でも同じ形で使う） */
export type AppearancePlan = {
  /** <html data-mode>。null なら端末に合わせる */
  dataMode: 'light' | 'dark' | null;
  /** ライト・ダークそれぞれで当てる CSS の変数 */
  light: Record<string, string>;
  dark: Record<string, string>;
  font: string | null;
  style: string | null;
};

const toVars = (c: ThemeColors) =>
  Object.fromEntries((Object.keys(VARS) as (keyof ThemeColors)[]).filter(k => c[k]).map(k => [VARS[k], c[k] as string]));

export function appearancePlan(mode: ColorMode, themeId: string): AppearancePlan {
  const theme = findTheme(themeId);
  return {
    dataMode: theme.alwaysDark ? 'dark' : mode === 'auto' ? null : mode,
    light: toVars(theme.light),
    dark: toVars(theme.dark),
    font: theme.font ?? null,
    style: theme.style ?? null,
  };
}

const PRELOAD_KEY = 'appearance-v2';
const SURFACE = { light: '#ffffff', dark: '#1a1d26' };

/** <html> に表示モードとテーマを当てる（CSS の変数を上書きする） */
export function applyAppearance(mode: ColorMode, themeId: string): void {
  const plan = appearancePlan(mode, themeId);
  const root = document.documentElement;
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const dark = plan.dataMode === 'dark' || (plan.dataMode === null && systemDark);

  if (plan.dataMode) root.dataset.mode = plan.dataMode;
  else delete root.dataset.mode;
  if (plan.style) root.dataset.style = plan.style;
  else delete root.dataset.style;
  for (const name of Object.values(VARS)) root.style.removeProperty(name);
  for (const [name, value] of Object.entries(dark ? plan.dark : plan.light)) root.style.setProperty(name, value);
  if (plan.font) root.style.setProperty('--font-body', plan.font);
  else root.style.removeProperty('--font-body');

  const bar = (dark ? plan.dark['--surface'] : plan.light['--surface']) ?? (dark ? SURFACE.dark : SURFACE.light);
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = bar;
    meta.removeAttribute('media');
  }
  // 次に開いたとき、データベースを読む前に同じ見た目で表示するために覚えておく（index.html で使う）
  try {
    localStorage.setItem(PRELOAD_KEY, JSON.stringify(plan));
  } catch {
    /* 保存できなくても表示は変わる */
  }
}
