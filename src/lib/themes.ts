/* 見た目のテーマ。ここに 1 つ足すだけで、設定画面で選べるようになる。
 * テーマで変わるのは、ボタン・強調の色と背景の色合い（グラフのプロジェクトの色は変えない。色覚の違いも含めて検証した配色のため） */

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
};

export type ThemeDef = { id: string; name: string; light: ThemeColors; dark: ThemeColors };

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
];

export const findTheme = (id: string) => THEMES.find(t => t.id === id) ?? THEMES[0];

/** 表示モードと端末の設定から、ダークで表示するかを決める */
export const isDarkMode = (mode: ColorMode, systemDark: boolean) => mode === 'dark' || (mode === 'auto' && systemDark);

/** スマホなどの上部の帯の色（画面の面の色） */
const SURFACE = { light: '#ffffff', dark: '#1a1d26' };

/* ---------- 画面に当てる ---------- */

const PRELOAD_KEY = 'appearance';

/** <html> に表示モードとテーマの色を当てる（CSS の変数を上書きする） */
export function applyAppearance(mode: ColorMode, themeId: string): void {
  const root = document.documentElement;
  const theme = findTheme(themeId);
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  setVars(root, mode, isDarkMode(mode, systemDark) ? theme.dark : theme.light, isDarkMode(mode, systemDark));
  // 次に開いたとき、データベースを読む前に同じ見た目で表示するために覚えておく（index.html で使う）
  try {
    localStorage.setItem(PRELOAD_KEY, JSON.stringify({ mode, light: theme.light, dark: theme.dark }));
  } catch {
    /* 保存できなくても表示は変わる */
  }
}

function setVars(root: HTMLElement, mode: ColorMode, c: ThemeColors, dark: boolean) {
  if (mode === 'auto') delete root.dataset.mode;
  else root.dataset.mode = mode;
  root.style.setProperty('--accent', c.accent);
  root.style.setProperty('--accent-soft', c.accentSoft);
  root.style.setProperty('--accent-contrast', c.accentContrast);
  root.style.setProperty('--bg', c.bg);
  if (c.breakColor) root.style.setProperty('--break', c.breakColor);
  else root.style.removeProperty('--break');
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = dark ? SURFACE.dark : SURFACE.light;
    meta.removeAttribute('media');
  }
}
