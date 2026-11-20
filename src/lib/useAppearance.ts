import { useEffect } from 'react';
import { useSettings } from '../db/hooks';
import { applyAppearance } from './themes';

/** 設定の表示モードとテーマを画面に当てる。「端末に合わせる」のときは端末の設定が変わったら当て直す */
export function useAppearance(): void {
  const { colorMode, theme } = useSettings();
  useEffect(() => {
    applyAppearance(colorMode, theme);
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media || colorMode !== 'auto') return;
    const onChange = () => applyAppearance(colorMode, theme);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [colorMode, theme]);
}
