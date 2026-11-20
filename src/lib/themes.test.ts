import { describe, expect, it } from 'vitest';
import { appearancePlan, findTheme, isDarkMode, THEMES } from './themes';

/** WCAG のコントラスト比 */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('テーマ', () => {
  it('ID が重ならず、ライト・ダークの色がそろっている', () => {
    expect(new Set(THEMES.map(t => t.id)).size).toBe(THEMES.length);
    for (const t of THEMES) {
      for (const c of [t.light, t.dark]) {
        for (const v of [c.accent, c.accentSoft, c.accentContrast, c.bg, c.breakColor, c.surface, c.surface2, c.text, c.muted, c.border]) {
          if (v !== undefined) expect(v).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it('ボタンの文字が読める（強調の色と文字の色のコントラスト 3:1 以上）', () => {
    for (const t of THEMES) {
      for (const c of [t.light, t.dark]) expect(contrast(c.accent, c.accentContrast), `${t.name} ${c.accent}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('強調の色が面から見分けられる（3:1 以上）', () => {
    for (const t of THEMES) {
      if (!t.alwaysDark) expect(contrast(t.light.accent, t.light.surface ?? '#ffffff'), t.name).toBeGreaterThanOrEqual(3);
      expect(contrast(t.dark.accent, t.dark.surface ?? '#1a1d26'), t.name).toBeGreaterThanOrEqual(3);
    }
  });

  it('文字の色を変えるテーマは、文字が面の上で読める（本文 4.5:1、補足 3:1 以上）', () => {
    for (const t of THEMES) {
      for (const c of [t.light, t.dark]) {
        if (c.text && c.surface) expect(contrast(c.text, c.surface), t.name).toBeGreaterThanOrEqual(4.5);
        if (c.muted && c.surface) expect(contrast(c.muted, c.surface), t.name).toBeGreaterThanOrEqual(3);
        if (c.breakColor && c.surface) expect(contrast(c.breakColor, c.surface), t.name).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('常に暗いテーマは、表示モードがライトでも暗い表示', () => {
    const ruins = THEMES.find(t => t.alwaysDark)!;
    expect(isDarkMode('light', false, ruins)).toBe(true);
    expect(appearancePlan('light', ruins.id).dataMode).toBe('dark');
    expect(appearancePlan('auto', 'blue').dataMode).toBeNull();
    expect(appearancePlan('light', 'blue').dataMode).toBe('light');
  });

  it('知らない ID は標準のテーマ', () => {
    expect(findTheme('nothing').id).toBe('blue');
  });

  it('表示モード：端末に合わせる / ライト / ダーク', () => {
    expect(isDarkMode('auto', true)).toBe(true);
    expect(isDarkMode('auto', false)).toBe(false);
    expect(isDarkMode('light', true)).toBe(false);
    expect(isDarkMode('dark', false)).toBe(true);
  });
});
