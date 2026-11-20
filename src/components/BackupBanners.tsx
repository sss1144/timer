import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useSettings } from '../db/hooks';
import { retryBackup, useBackupStatus } from '../backup/auto';
import { exportJson } from '../backup/io';
import { showToast } from '../timer/ui';

const DAY = 24 * 3600_000;

/** 画面上部のお知らせ：自動バックアップに失敗したとき／自動バックアップを設定しておらず、7 日以上バックアップしていないとき */
export function BackupBanners() {
  const status = useBackupStatus();
  const settings = useSettings();
  // 一度もバックアップしていないときは、いちばん古い記録の日から数える
  const firstRecordAt = useLiveQuery(async () => (await db.sessions.orderBy('startAt').first())?.createdAt ?? null, []);

  if (!status) return null;

  if (status.configured && status.error) {
    return (
      <div className="banner warn-banner" role="alert">
        <div>
          <strong>自動バックアップできませんでした</strong>
          <p>{status.error}</p>
        </div>
        <button className="btn sm" onClick={() => void retryBackup().then(ok => showToast(ok ? 'バックアップしました' : 'まだバックアップできません'))}>
          許可をやり直す
        </button>
      </div>
    );
  }

  if (!status.configured) {
    const since = settings.lastBackupAt ?? firstRecordAt;
    if (since && Date.now() - new Date(since).getTime() >= 7 * DAY) {
      return (
        <div className="banner" role="note">
          <div>
            <strong>最後のバックアップから 7 日以上たっています</strong>
            <p>データを JSON で書き出しておきましょう。設定画面で自動バックアップも設定できます。</p>
          </div>
          <div className="button-col">
            <button className="btn sm primary" onClick={() => void exportJson()}>
              JSON で書き出す
            </button>
            <a className="btn sm ghost" href="#/settings">
              設定を開く
            </a>
          </div>
        </div>
      );
    }
  }
  return null;
}
