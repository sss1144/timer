import { useState, type FormEvent } from 'react';
import { Dialog } from './Dialog';
import { createPreset, deletePreset, updatePreset, ValidationError } from '../db/repo';
import { LIMITS, type BlockKind, type TimerPreset } from '../db/types';
import { formatDuration } from '../lib/time';
import { BLOCK_LABEL } from '../timer/presets';
import { showToast } from '../timer/ui';

type Props = {
  /** 編集するプリセット。なければ新規作成 */
  preset?: TimerPreset;
  /** 削除できるか（最後の 1 つは削除できない） */
  canDelete: boolean;
  onClose: () => void;
};

/** 入力中のブロック（長さは入力欄の文字のまま持つ） */
type DraftBlock = { key: number; kind: BlockKind; min: string };

let nextKey = 1;
const draftOf = (kind: BlockKind, min: number | string): DraftBlock => ({ key: nextKey++, kind, min: String(min) });

export function PresetDialog({ preset, canDelete, onClose }: Props) {
  const [name, setName] = useState(preset?.name ?? '');
  const [repeat, setRepeat] = useState(preset?.repeat ?? false);
  const [blocks, setBlocks] = useState<DraftBlock[]>(() => (preset?.blocks ?? [{ kind: 'work', min: 25 }]).map(b => draftOf(b.kind, b.min)));
  const [error, setError] = useState('');

  const update = (key: number, patch: Partial<DraftBlock>) => setBlocks(bs => bs.map(b => (b.key === key ? { ...b, ...patch } : b)));
  const remove = (key: number) => setBlocks(bs => bs.filter(b => b.key !== key));
  const add = (kind: BlockKind) => setBlocks(bs => [...bs, draftOf(kind, kind === 'work' ? 25 : 5)]);

  const minutes = (kind: BlockKind) => blocks.filter(b => b.kind === kind).reduce((a, b) => a + (Number(b.min) || 0), 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const input = { name, repeat, blocks: blocks.map(b => ({ kind: b.kind, min: Number(b.min) })) };
    try {
      if (preset) await updatePreset(preset.id, input);
      else await createPreset(input);
      showToast(preset ? 'プリセットを更新しました' : 'プリセットを追加しました');
      onClose();
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : '保存できませんでした');
    }
  };

  const removePreset = async () => {
    if (!preset) return;
    if (!window.confirm(`プリセット「${preset.name}」を削除しますか？\nこれまでの記録は消えません。`)) return;
    try {
      await deletePreset(preset.id);
      showToast('プリセットを削除しました');
      onClose();
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : '削除できませんでした');
    }
  };

  return (
    <Dialog title={preset ? 'プリセットを編集' : 'プリセットを追加'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label className="form-field">
          <span>名前</span>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={LIMITS.presetName} placeholder="例: 50分集中" required />
        </label>

        <fieldset className="form-field">
          <legend>ブロック（上から順に進みます）</legend>
          <ol className="block-editor">
            {blocks.map((b, i) => (
              <li key={b.key} className={`kind-${b.kind}`}>
                <span className="block-no">{i + 1}</span>
                <select value={b.kind} onChange={e => update(b.key, { kind: e.target.value as BlockKind })} aria-label={`${i + 1} 番目のブロックの種類`}>
                  <option value="work">{BLOCK_LABEL.work}</option>
                  <option value="break">{BLOCK_LABEL.break}</option>
                </select>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={LIMITS.maxBlockMin}
                  value={b.min}
                  onChange={e => update(b.key, { min: e.target.value })}
                  aria-label={`${i + 1} 番目のブロックの長さ（分）`}
                  required
                />
                <span className="unit">分</span>
                <button type="button" className="icon-btn" onClick={() => remove(b.key)} disabled={blocks.length <= 1} aria-label={`${i + 1} 番目のブロックを削除`}>
                  ×
                </button>
              </li>
            ))}
          </ol>
          <div className="block-add">
            <button type="button" className="btn sm" onClick={() => add('work')}>
              ＋ 作業
            </button>
            <button type="button" className="btn sm" onClick={() => add('break')}>
              ＋ 休憩
            </button>
            <span className="muted small">
              作業 {formatDuration(minutes('work') * 60)} ・ 休憩 {formatDuration(minutes('break') * 60)}
            </span>
          </div>
        </fieldset>

        <fieldset className="form-field">
          <legend>最後のブロックが終わったら</legend>
          <div className="segmented full" role="radiogroup">
            <button type="button" role="radio" aria-checked={repeat} onClick={() => setRepeat(true)}>
              最初に戻って繰り返す
            </button>
            <button type="button" role="radio" aria-checked={!repeat} onClick={() => setRepeat(false)}>
              1回だけで終わる
            </button>
          </div>
        </fieldset>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          {preset && canDelete && (
            <button type="button" className="btn danger" onClick={() => void removePreset()}>
              削除
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            キャンセル
          </button>
          <button type="submit" className="btn primary">
            保存
          </button>
        </div>
      </form>
    </Dialog>
  );
}
