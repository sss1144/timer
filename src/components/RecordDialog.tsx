import { useMemo, useState, type FormEvent } from 'react';
import { Dialog } from './Dialog';
import { createSession, deleteSession, updateSession, ValidationError } from '../db/repo';
import { describeTask, findOverlaps, listProjects, SESSION_TYPE_LABEL } from '../db/queries';
import { LIMITS, type Project, type Session, type SessionType, type Task } from '../db/types';
import { formatDuration, formatTime, spanFromInputs, toDateKey, toIsoLocal, toTimeInput } from '../lib/time';
import { showToast } from '../timer/ui';

type Props = {
  /** 編集する記録。なければ手動で追加 */
  session?: Session;
  /** 追加するときの日付と開始時刻 */
  defaultDate: string;
  defaultStart: string;
  tasks: Task[];
  projects: Project[];
  /** 時間の重なりを調べるための全記録 */
  sessions: Session[];
  onClose: () => void;
};

const spanSec = (s: Session) => (new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 1000;

export function RecordDialog({ session, defaultDate, defaultStart, tasks, projects, sessions, onClose }: Props) {
  const initial = useMemo(() => {
    if (!session) {
      const span = spanFromInputs(defaultDate, defaultStart, defaultStart);
      const end = span ? new Date(span.start.getTime() + 30 * 60_000) : null;
      return { date: defaultDate, start: defaultStart, end: end ? toTimeInput(end) : '', minutes: '30' };
    }
    const start = new Date(session.startAt);
    return {
      date: toDateKey(start),
      start: toTimeInput(start),
      end: toTimeInput(new Date(session.endAt)),
      minutes: String(Math.round(session.durationSec / 60)),
    };
  }, [session, defaultDate, defaultStart]);

  const [taskId, setTaskId] = useState(session?.taskId ?? '');
  const [type, setType] = useState<SessionType>(session?.type ?? 'manual');
  // 作業ブロックを最後まで終えたか。画面には出さず、元の値を保つ（種別をタイマー以外にすると false）
  const [completed] = useState(session?.completed ?? false);
  const [date, setDate] = useState(initial.date);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [note, setNote] = useState(session?.note ?? '');
  const [error, setError] = useState('');

  // 作業時間 = 開始〜終了 の記録（一時停止がない）なら、時刻を変えると作業時間も合わせて変える
  const [linked] = useState(() => !session || Math.abs(spanSec(session) - session.durationSec) < 60);

  const span = spanFromInputs(date, start, end);
  const timesChanged = date !== initial.date || start !== initial.start || end !== initial.end;
  const minutesChanged = minutes !== initial.minutes;

  const setTimes = (next: { date?: string; start?: string; end?: string }) => {
    const d = next.date ?? date;
    const s = next.start ?? start;
    const e = next.end ?? end;
    setDate(d);
    setStart(s);
    setEnd(e);
    const sp = spanFromInputs(d, s, e);
    if (linked && sp) setMinutes(String(Math.round((sp.end.getTime() - sp.start.getTime()) / 60_000)));
  };

  const changeMinutes = (value: string) => {
    setMinutes(value);
    const min = Number(value);
    const sp = spanFromInputs(date, start, start);
    if (linked && sp && Number.isFinite(min) && min > 0) {
      setEnd(toTimeInput(new Date(sp.start.getTime() + min * 60_000)));
    }
  };

  // 保存する値（時刻や作業時間に触れていなければ、秒まで元の値のまま）
  const startAt = session && !timesChanged ? session.startAt : span ? toIsoLocal(span.start) : '';
  const endAt = session && !timesChanged ? session.endAt : span ? toIsoLocal(span.end) : '';
  const durationSec = session && !minutesChanged && !timesChanged ? session.durationSec : Math.round(Number(minutes) * 60);
  const overlaps = startAt && endAt ? findOverlaps(sessions, { id: session?.id, startAt, endAt }) : [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!span) {
      setError('日付と時刻を入力してください');
      return;
    }
    const input = { taskId: taskId || null, type, startAt, endAt, durationSec, completed, note };
    try {
      if (session) await updateSession(session.id, input);
      else await createSession(input);
      showToast(session ? '記録を更新しました' : '記録を追加しました');
      onClose();
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : '保存できませんでした');
    }
  };

  const remove = async () => {
    if (!session) return;
    const label = describeTask(session.taskId, tasks, projects).title;
    if (!window.confirm(`${formatTime(session.startAt)} からの「${label}」（${formatDuration(session.durationSec)}）を削除しますか？`)) return;
    await deleteSession(session.id);
    showToast('記録を削除しました');
    onClose();
  };

  // タスクの選択肢：削除済みでないタスクをプロジェクトごとに（完了済みも含める）
  const groups = useMemo(() => {
    const live = tasks.filter(t => !t.deleted);
    const ps = listProjects(projects, true);
    const known = new Set(ps.map(p => p.id));
    const result = ps.map(p => ({ label: p.archived ? `${p.name}（アーカイブ済み）` : p.name, tasks: live.filter(t => t.projectId === p.id) }));
    result.push({ label: 'プロジェクトなし', tasks: live.filter(t => !t.projectId || !known.has(t.projectId)) });
    return result.filter(g => g.tasks.length > 0);
  }, [tasks, projects]);
  const currentMissing = session?.taskId && !tasks.some(t => t.id === session.taskId && !t.deleted);

  return (
    <Dialog title={session ? '記録を編集' : '記録を追加'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label className="form-field">
          <span>タスク</span>
          <select value={taskId} onChange={e => setTaskId(e.target.value)}>
            <option value="">未分類</option>
            {groups.map(g => (
              <optgroup key={g.label} label={g.label}>
                {g.tasks.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                    {t.done ? '（完了）' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
            {currentMissing && <option value={session.taskId!}>削除済みタスク</option>}
          </select>
        </label>

        <div className="form-row three">
          <label className="form-field">
            <span>日付</span>
            <input type="date" value={date} onChange={e => setTimes({ date: e.target.value })} required />
          </label>
          <label className="form-field">
            <span>開始</span>
            <input type="time" value={start} onChange={e => setTimes({ start: e.target.value })} required />
          </label>
          <label className="form-field">
            <span>終了{span?.nextDay && <em className="next-day">翌日</em>}</span>
            <input type="time" value={end} onChange={e => setTimes({ end: e.target.value })} required />
          </label>
        </div>

        <div className="form-row">
          <label className="form-field">
            <span>作業時間（分）</span>
            <input type="number" inputMode="numeric" min={1} max={1440} value={minutes} onChange={e => changeMinutes(e.target.value)} required />
          </label>
          <label className="form-field">
            <span>種別</span>
            <select value={type} onChange={e => setType(e.target.value as SessionType)}>
              {(Object.keys(SESSION_TYPE_LABEL) as SessionType[]).map(k => (
                <option key={k} value={k}>
                  {SESSION_TYPE_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="form-hint">
          {linked
            ? '作業時間を変えると終了時刻も変わります。終了が開始より前なら翌日として扱います。'
            : 'この記録は一時停止した時間を除いた作業時間です。時刻を変えても作業時間はそのままです。'}
        </p>

        <label className="form-field">
          <span>メモ（任意）</span>
          <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={LIMITS.note} rows={2} />
        </label>

        {overlaps.length > 0 && (
          <div className="warning" role="alert">
            <strong>時間が重なる記録があります（このまま保存もできます）</strong>
            <ul>
              {overlaps.slice(0, 5).map(o => (
                <li key={o.id}>
                  {formatTime(o.startAt)}–{formatTime(o.endAt)} {describeTask(o.taskId, tasks, projects).title}（{formatDuration(o.durationSec)}）
                </li>
              ))}
              {overlaps.length > 5 && <li>ほか {overlaps.length - 5} 件</li>}
            </ul>
          </div>
        )}

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          {session && (
            <button type="button" className="btn danger" onClick={() => void remove()}>
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
