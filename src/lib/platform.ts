/** iPhone / iPad か（iPadOS 13 以降の Safari は Mac として名乗るので、タッチ対応かどうかで見分ける） */
export function isAppleMobile(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

/** ホーム画面に追加したアプリとして開かれているか */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

export function shouldShowInstallHint(): boolean {
  return isAppleMobile(navigator.userAgent, navigator.platform, navigator.maxTouchPoints) && !isStandalone();
}
