import { useRef, useState } from 'react';
import { useSettings } from '../db/hooks';
import { dayKeyOf } from '../lib/day';
import { formatDateKey } from '../lib/time';
import { autoBackupSupported, chooseBackupFolder, runBackup, stopAutoBackup, useBackupStatus } from '../backup/auto';
import { ImportError, parseBackup } from '../backup/format';
import { copyMarkdown, exportCsv, exportJson, exportMarkdown, restoreBackup } from '../backup/io';
import { showToast } from '../timer/ui';

const fmtDateTime = (iso: string | null) => {
  if (!iso) return 'まだありません';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 設定画面の「バックアップ・書き出し・復元」 */
export function BackupSection() {
  const settings = useSettings();
  const status = useBackupStatus();
  const today = dayKeyOf(new Date(), settings.dayBoundaryHour);
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [mdDay, setMdDay] = useState(today);
  const fileRef = useRef<HTMLInputElement>(null);

  const choose = async () => {
    const ok = await chooseBackupFolder();
    if (ok) showToast('自動バックアップを始めました');
  };

  const restore = async (file: File) => {
    try {
      const data = parseBackup(await file.text());
      const live = (xs: { deleted: boolean }[]) => xs.filter(x => !x.deleted).length;
      const ok = window.confirm(
        `「${file.name}」から復元します。\n` +
          `プロジェクト ${live(data.projects)} 件・タスク ${live(data.tasks)} 件・記録 ${live(data.sessions)} 件\n\n` +
          '今のデータはすべて置き換わります（先に今のデータを JSON で書き出します）。実行中のタイマーは止まります。よろしいですか？',
      );
      if (!ok) return;
      await restoreBackup(data);
      showToast('復元しました');
    } catch (err) {
      showToast(err instanceof ImportError ? `復元できませんでした：${err.message}` : '復元できませんでした');
    }
  };

  return (
    <section className="card settings backup">
      <h2>バックアップ・書き出し・復元</h2>

      <div className="setting-block">
        <h3>自動バックアップ</h3>
        {!autoBackupSupported() ? (
          <p className="muted small">このブラウザでは使えません。PC の Chrome か Edge で開いてください。</p>
        ) : status?.configured ? (
          <>
            <dl className="backup-status">
              <dt>フォルダ</dt>
              <dd>{status.folderName}</dd>
              <dt>最後のバックアップ</dt>
              <dd>{fmtDateTime(status.lastAt)}</dd>
            </dl>
            {status.error && <p className="form-error">{status.error}</p>}
            <div className="button-row">
              <button className="btn sm" onClick={() => void runBackup({ force: true, request: true }).then(ok => showToast(ok ? 'バックアップしました' : 'バックアップできませんでした'))}>
                今すぐバックアップ
              </button>
              <button className="btn sm" onClick={() => void choose()}>
                フォルダを変える
              </button>
              <button
                className="btn sm ghost"
                onClick={() => {
                  if (window.confirm('自動バックアップをやめますか？（フォルダの中のファイルは消しません）')) void stopAutoBackup();
                }}
              >
                やめる
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted small">
              選んだフォルダに、データが変わるたびに（1 分たってから）自動で JSON を書き出します。ファイルは 1 日 1 つで、30 日より古いものは消します。
              フォルダを選ぶときに「毎回許可する」を選んでください。PC の故障に備えるなら、OneDrive などの同期されるフォルダを選びます。
            </p>
            <button className="btn primary sm" onClick={() => void choose()}>
              フォルダを選ぶ
            </button>
          </>
        )}
      </div>

      <div className="setting-block">
        <h3>書き出し</h3>
        <div className="export-row">
          <span>全データ（JSON）</span>
          <button className="btn sm" onClick={() => void exportJson()}>
            JSON で書き出す
          </button>
        </div>
        <div className="export-row">
          <span>記録（CSV・Excel 用）</span>
          <span className="export-inputs">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="CSV の開始日" />
            〜
            <input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="CSV の終了日" />
            <button className="btn sm" disabled={!from || !to || from > to} onClick={() => void exportCsv(from, to)}>
              CSV で書き出す
            </button>
          </span>
        </div>
        <div className="export-row">
          <span>作業ログ（Markdown）</span>
          <span className="export-inputs">
            <input type="date" value={mdDay} onChange={e => setMdDay(e.target.value)} aria-label="作業ログの日付" />
            <button className="btn sm" disabled={!mdDay} onClick={() => void exportMarkdown(mdDay)}>
              保存
            </button>
            <button
              className="btn sm"
              disabled={!mdDay}
              onClick={() =>
                void copyMarkdown(mdDay).then(
                  () => showToast(`${formatDateKey(mdDay)} の作業ログをコピーしました`),
                  () => showToast('コピーできませんでした'),
                )
              }
            >
              コピー
            </button>
          </span>
        </div>
      </div>

      <div className="setting-block">
        <h3>復元</h3>
        <p className="muted small">書き出した JSON を選ぶと、今のデータと置き換えます（統合はしません）。置き換える前に、今のデータを JSON で書き出します。</p>
        <button className="btn sm" onClick={() => fileRef.current?.click()}>
          JSON を選んで復元
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void restore(file);
          }}
        />
      </div>
    </section>
  );
}
