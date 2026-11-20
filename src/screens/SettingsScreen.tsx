import { useEffect, useState } from 'react';
import { useSettings } from '../db/hooks';
import { PresetDialog } from '../components/PresetDialog';
import type { TimerPreset } from '../db/types';
import { getStatus } from '../timer/engine';
import { presetSummary } from '../timer/presets';
import { useTimerState } from '../timer/useTimerState';
import { updateSettings } from '../db/repo';
import type { Settings } from '../db/types';
import { BackupSection } from '../components/BackupSection';
import { notificationSupported, playSoundNow, requestNotificationPermission } from '../timer/alarm';
import { SOUNDS } from '../timer/sounds';
import { THEMES, type ColorMode } from '../lib/themes';
import { showToast } from '../timer/ui';

type NumberKey = 'stopwatchCheckMin';

/** 数字の入力欄。入力中は自由に打てて、確定（フォーカスを外す）したときに範囲内に直して保存する */
function NumberSetting({ settings, field, label, unit, min, max }: { settings: Settings; field: NumberKey; label: string; unit: string; min: number; max: number }) {
  const saved = settings[field];
  const [draft, setDraft] = useState(String(saved));
  useEffect(() => setDraft(String(saved)), [saved]);

  const commit = () => {
    const n = Math.round(Number(draft));
    const value = Number.isFinite(n) && draft.trim() !== '' ? Math.min(max, Math.max(min, n)) : saved;
    setDraft(String(value));
    if (value !== saved) void updateSettings({ [field]: value });
  };

  return (
    <label className="setting-row">
      <span>{label}</span>
      <span className="setting-input">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {unit}
      </span>
    </label>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="setting-row toggle-row">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={e => onChange(e.target.checked)} />
    </label>
  );
}

export function SettingsScreen() {
  const s = useSettings();

  const toggleNotification = async (on: boolean) => {
    if (!on) {
      await updateSettings({ notification: false });
      return;
    }
    if (!notificationSupported()) {
      showToast('このブラウザは通知に対応していません（iPad・iPhone はホーム画面に追加すると使えます）');
      return;
    }
    const granted = await requestNotificationPermission();
    await updateSettings({ notification: granted });
    showToast(granted ? '通知をオンにしました' : '通知が許可されませんでした。ブラウザの設定から許可してください');
  };

  return (
    <>
      <header className="screen-header">
        <h1>設定</h1>
      </header>

      <PresetSection />

      <section className="card settings">
        <h2>ブロックタイマー</h2>
        <Toggle
          label="次のブロックに自動で進む"
          hint="オフのときは、ブロックが終わるたびに止まります"
          checked={s.autoContinue}
          onChange={v => void updateSettings({ autoContinue: v })}
        />
      </section>

      <section className="card settings">
        <h2>ストップウォッチ</h2>
        <NumberSetting settings={s} field="stopwatchCheckMin" label="止め忘れ確認までの時間" unit="分" min={10} max={720} />
      </section>

      <section className="card settings">
        <h2>音・通知</h2>
        <Toggle label="ブロックが終わったら音を鳴らす" checked={s.sound} onChange={v => void updateSettings({ sound: v })} />
        <VolumeSetting settings={s} />
        <SoundSetting settings={s} field="workEndSound" label="作業終了の音" hint="作業ブロックが終わったとき" />
        <SoundSetting settings={s} field="workStartSound" label="作業開始の音" hint="休憩ブロックが終わったとき" />
        <Toggle
          label="ブラウザの通知を出す"
          hint="アプリを開いている間だけ届きます"
          checked={s.notification}
          onChange={v => void toggleNotification(v)}
        />
      </section>

      <AppearanceSection settings={s} />

      <section className="card settings">
        <h2>日付・週</h2>
        <label className="setting-row">
          <span>週の始まり</span>
          <span className="setting-input">
            <select value={s.weekStart} onChange={e => void updateSettings({ weekStart: e.target.value as Settings['weekStart'] })}>
              <option value="mon">月曜日</option>
              <option value="sun">日曜日</option>
            </select>
          </span>
        </label>
        <label className="setting-row">
          <span>
            日付の区切り
            <small>深夜の作業を前の日に含めたいときは 4 時などにします</small>
          </span>
          <span className="setting-input">
            <select value={s.dayBoundaryHour} onChange={e => void updateSettings({ dayBoundaryHour: Number(e.target.value) })}>
              {Array.from({ length: 7 }, (_, h) => (
                <option key={h} value={h}>
                  {h} 時
                </option>
              ))}
            </select>
          </span>
        </label>
      </section>

      <BackupSection />

      <section className="card settings usage-notes">
        <h2>使い方の注意</h2>
        <ul>
          <li>インストールして、資料のタブとは別のウィンドウで開いてください（タブに埋もれず、止められにくくなります）。</li>
          <li>Chrome・Edge のメモリセーバー（使っていないタブを止める機能）の「常にアクティブにするサイト」に、このアプリの URL（{window.location.origin}）を入れてください。</li>
          <li>タイマー中はアプリを閉じないでください。最小化や、ほかのウィンドウの後ろに隠れるのは問題ありません。閉じても時間はずれずに進みますが、閉じている間は音が鳴りません。</li>
        </ul>
      </section>
    </>
  );
}

/* ---------- プリセットの管理 ---------- */

function PresetSection() {
  const { timer, presets } = useTimerState();
  const [editing, setEditing] = useState<{ preset?: TimerPreset } | null>(null);
  // タイマーの実行中（一時停止中を含む）は、使っているプリセットを編集・削除できない
  const inUseId = timer && timer.mode === 'timer' && getStatus(timer) !== 'idle' ? timer.presetId : null;

  return (
    <section className="card settings">
      <div className="section-head">
        <h2>プリセット</h2>
        <button className="btn sm" onClick={() => setEditing({})}>
          ＋ プリセット
        </button>
      </div>
      <ul className="preset-list">
        {presets.map(p => (
          <li key={p.id}>
            <button className="preset-row" onClick={() => setEditing({ preset: p })} disabled={p.id === inUseId}>
              <span className="preset-name">
                {p.name}
                {p.id === inUseId && <span className="badge">実行中のため編集できません</span>}
              </span>
              <span className="preset-summary">{presetSummary(p)}</span>
            </button>
          </li>
        ))}
      </ul>
      {editing && <PresetDialog preset={editing.preset} canDelete={presets.length > 1} onClose={() => setEditing(null)} />}
    </section>
  );
}

/* ---------- 音 ---------- */

function VolumeSetting({ settings }: { settings: Settings }) {
  const [draft, setDraft] = useState(settings.volume);
  useEffect(() => setDraft(settings.volume), [settings.volume]);
  const commit = (v: number) => {
    if (v !== settings.volume) void updateSettings({ volume: v });
  };
  return (
    <label className="setting-row">
      <span>音量</span>
      <span className="setting-input volume">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={draft}
          onChange={e => setDraft(Number(e.target.value))}
          onPointerUp={() => commit(draft)}
          onKeyUp={() => commit(draft)}
          onBlur={() => commit(draft)}
          aria-label="音量"
        />
        <span className="volume-value">{draft}%</span>
      </span>
    </label>
  );
}

function SoundSetting({ settings, field, label, hint }: { settings: Settings; field: 'workEndSound' | 'workStartSound'; label: string; hint: string }) {
  return (
    <label className="setting-row">
      <span>
        {label}
        <small>{hint}</small>
      </span>
      <span className="setting-input">
        <select value={settings[field]} onChange={e => void updateSettings({ [field]: e.target.value })}>
          {SOUNDS.map(sound => (
            <option key={sound.id} value={sound.id}>
              {sound.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn sm" onClick={() => void playSoundNow(settings[field], settings.volume)}>
          試聴
        </button>
      </span>
    </label>
  );
}

/* ---------- 見た目 ---------- */

const MODE_LABEL: Record<ColorMode, string> = { auto: '端末に合わせる', light: 'ライト', dark: 'ダーク' };

function AppearanceSection({ settings }: { settings: Settings }) {
  return (
    <section className="card settings">
      <h2>見た目</h2>
      <div className="setting-row mode-row">
        <span>表示モード</span>
        <div className="segmented" role="radiogroup" aria-label="表示モード">
          {(Object.keys(MODE_LABEL) as ColorMode[]).map(m => (
            <button key={m} type="button" role="radio" aria-checked={settings.colorMode === m} onClick={() => void updateSettings({ colorMode: m })}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="setting-block theme-block">
        <span>テーマ</span>
        <div className="theme-grid" role="radiogroup" aria-label="テーマ">
          {THEMES.map(t => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={settings.theme === t.id}
              className="theme-card"
              onClick={() => void updateSettings({ theme: t.id })}
            >
              <span className="theme-preview" aria-hidden="true">
                <span className="theme-half" style={{ background: t.light.bg }}>
                  <span className="theme-chip" style={{ background: t.light.accent }} />
                  <span className="theme-line" style={{ background: t.light.accentSoft }} />
                </span>
                <span className="theme-half" style={{ background: t.dark.bg }}>
                  <span className="theme-chip" style={{ background: t.dark.accent }} />
                  <span className="theme-line" style={{ background: t.dark.accentSoft }} />
                </span>
              </span>
              <span className="theme-name">
                {settings.theme === t.id && <span aria-hidden="true">✓ </span>}
                {t.name}
              </span>
            </button>
          ))}
        </div>
        <p className="muted small">ボタン・強調の色と背景の色合いが変わります。グラフのプロジェクトの色は変わりません。</p>
      </div>
    </section>
  );
}
