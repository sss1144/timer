import { useState, type FormEvent } from 'react';
import { Dialog } from './Dialog';
import { createProject, updateProject, ValidationError } from '../db/repo';
import { LIMITS, PROJECT_COLORS, type Project } from '../db/types';

type Props = {
  /** 編集するプロジェクト。なければ新規作成 */
  project?: Project;
  /** 新規作成時に最初に選んでおく色 */
  defaultColor?: string;
  onClose: () => void;
};

export function ProjectDialog({ project, defaultColor, onClose }: Props) {
  const [name, setName] = useState(project?.name ?? '');
  const [color, setColor] = useState(project?.color ?? defaultColor ?? PROJECT_COLORS[0]);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (project) await updateProject(project.id, { name, color });
      else await createProject({ name, color });
      onClose();
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : '保存できませんでした');
    }
  };

  const toggleArchive = async () => {
    if (!project) return;
    await updateProject(project.id, { archived: !project.archived });
    onClose();
  };

  return (
    <Dialog title={project ? 'プロジェクトを編集' : 'プロジェクトを追加'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label className="form-field">
          <span>名前</span>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={LIMITS.projectName} placeholder="例: イラスト練習" autoFocus required />
        </label>

        <fieldset className="form-field">
          <legend>色</legend>
          <div className="swatches">
            {PROJECT_COLORS.map(c => (
              <label key={c} className="swatch" style={{ background: c }} title={c}>
                <input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} />
                <span className="visually-hidden">{c}</span>
              </label>
            ))}
            <label className="swatch custom" title="ほかの色">
              <input type="color" value={color} onChange={e => setColor(e.target.value)} aria-label="ほかの色を選ぶ" />
            </label>
          </div>
        </fieldset>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          {project && (
            <button type="button" className="btn" onClick={toggleArchive}>
              {project.archived ? 'アーカイブから戻す' : 'アーカイブ'}
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
        {project && !project.archived && (
          <p className="form-hint">アーカイブすると一覧に出なくなりますが、過去の記録と統計は残ります。</p>
        )}
      </form>
    </Dialog>
  );
}
