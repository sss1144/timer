import { useState } from 'react';
import { shouldShowInstallHint } from '../lib/platform';

const DISMISS_KEY = 'hint.install.dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** iPad・iPhone の Safari で開いたときだけ「ホーム画面に追加」を案内する */
export function InstallHint() {
  const [visible, setVisible] = useState(() => shouldShowInstallHint() && !readDismissed());
  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* 保存できなくても閉じる */
    }
    setVisible(false);
  };

  return (
    <aside className="banner" role="note">
      <div>
        <strong>ホーム画面に追加して使ってください</strong>
        <p>
          共有ボタン <span aria-hidden="true">⎙</span> →「ホーム画面に追加」で追加できます。
          Safari で開いたままだと、しばらく使わないうちに記録が消えることがあります。
        </p>
      </div>
      <button type="button" className="btn ghost" onClick={dismiss}>
        閉じる
      </button>
    </aside>
  );
}
