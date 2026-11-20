import { useState, type FormEvent } from 'react';
import { Dialog } from './Dialog';
import { createTask, deleteTask, updateTask, ValidationError } from '../db/repo';
import { LIMITS, type Project, type Task } from '../db/types';

type Props = {
  /** 編集するタスク。なければ新規作成 */
  task?: Task;
  /** 選べるプロジェクト（アーカイブ済みを除いたもの） */
  projects: Project[];
  defaultProjectId?: string | null;
  onClose: () => void;
};

export function TaskDialog({ task, projects, defaultProjectId, onClose }: Props) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [projectId, setProjectId] = useState(task?.projectId ?? defaultProjectId ?? '');
  const [estimate, setEstimate] = useState(task?.estimatedMin?.toString() ?? '');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [note, setNote] = useState(task?.note ?? '');
  const [error, setError] = useState('');

  // 編集中のタスクがアーカイブ済みプロジェクトに入っている場合も選択肢に出す
  const current = task?.projectId ? projects.find(p => p.id === task.projectId) : undefined;
  const options = projects.filter(p => !p.archived || p.id === current?.id);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const input = {
      title,
      projectId: projectId || null,
      estimatedMin: estimate === '' ? null : Number(estimate),
      dueDate: dueDate || null,
      note,
    };
    try {
      if (task) await updateTask(task.id, input);
      else await createTask(input);
      onClose();
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : '保存できませんでした');
    }
  };

  const remove = async () => {
    if (!task) return;
    if (!window.confirm(`「${task.title}」を削除しますか？\nこのタスクの作業記録は消えず、統計では「削除済みタスク」として残ります。`)) return;
    await deleteTask(task.id);
    onClose();
  };

  return (
    <Dialog title={task ? 'タスクを編集' : 'タスクを追加'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label className="form-field">
          <span>タスク名</span>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={LIMITS.taskTitle} placeholder="例: 手のデッサン" autoFocus required />
        </label>

        <label className="form-field">
          <span>プロジェクト</span>
          <select value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">プロジェクトなし</option>
            {options.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archived ? '（アーカイブ済み）' : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="form-row">
          <label className="form-field">
            <span>見積もり時間（分・任意）</span>
            <input type="number" inputMode="numeric" min={1} max={LIMITS.maxEstimateMin} value={estimate} onChange={e => setEstimate(e.target.value)} placeholder="例: 120" />
          </label>
          <label className="form-field">
            <span>期限（任意）</span>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </label>
        </div>

        <label className="form-field">
          <span>メモ（任意）</span>
          <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={LIMITS.note} rows={3} />
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          {task && (
            <button type="button" className="btn danger" onClick={remove}>
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
