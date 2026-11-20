import { useEffect, useMemo, useState } from 'react';
import { useProjects, useSessions, useSettings, useTasks } from '../db/hooks';
import { describeTask, findOverlaps, SESSION_TYPE_LABEL, sessionsInRange } from '../db/queries';
import type { Session } from '../db/types';
import { dayKeyOf, rangeOfDayKey, shiftDayKey } from '../lib/day';
import { formatDateKey, formatDuration, formatTime, toDateKey, toTimeInput } from '../lib/time';
import { RecordDialog } from '../components/RecordDialog';

/** URL の #/records/2026-11-19 から日付を読む（再読み込みしても同じ日を開くため） */
function dayFromHash(): string | null {
  const m = window.location.hash.match(/^#\/records\/(\d{4}-\d{2}-\d{2})$/);
  return m ? m[1] : null;
}

type Editing = { session?: Session } | null;

export function RecordsScreen() {
  const sessions = useSessions();
  const tasks = useTasks();
  const projects = useProjects();
  const settings = useSettings();
  const [selected, setSelected] = useState<string | null>(dayFromHash);
  const [editing, setEditing] = useState<Editing>(null);

  const todayKey = dayKeyOf(new Date(), settings.dayBoundaryHour);
  const dayKey = selected ?? todayKey;
  const isToday = dayKey === todayKey;

  useEffect(() => {
    const hash = selected && selected !== todayKey ? `#/records/${selected}` : '#/records';
    if (window.location.hash !== hash) history.replaceState(null, '', hash);
  }, [selected, todayKey]);

  const range = useMemo(() => rangeOfDayKey(dayKey, settings.dayBoundaryHour), [dayKey, settings.dayBoundaryHour]);
  const daySessions = useMemo(() => sessionsInRange(sessions ?? [], range), [sessions, range]);

  if (!sessions || !tasks || !projects) {
    return (
      <header className="screen-header">
        <h1>記録</h1>
      </header>
    );
  }

  const total = daySessions.reduce((sum, s) => sum + s.durationSec, 0);

  // 追加するときの初期値：今日なら 30 分前、それ以外はその日の最後の記録の終了時刻（なければ 12:00）
  const last = daySessions.at(-1);
  const defaultStart = isToday
    ? toTimeInput(new Date(Math.floor((Date.now() - 30 * 60_000) / 300_000) * 300_000))
    : last
      ? toTimeInput(new Date(last.endAt))
      : '12:00';
  const defaultDate = isToday ? toDateKey(new Date(Date.now() - 30 * 60_000)) : last ? toDateKey(new Date(last.endAt)) : dayKey;

  return (
    <>
      <header className="screen-header">
        <h1>記録</h1>
        <div className="screen-actions">
          <button className="btn primary" onClick={() => setEditing({})}>
            ＋ 記録を追加
          </button>
        </div>
      </header>

      <div className="day-nav">
        <button className="icon-btn" onClick={() => setSelected(shiftDayKey(dayKey, -1))} aria-label="前の日">
          ‹
        </button>
        <label className="day-label">
          <span>{formatDateKey(dayKey)}</span>
          {isToday && <span className="badge">今日</span>}
          <input
            type="date"
            value={dayKey}
            onChange={e => e.target.value && setSelected(e.target.value)}
            aria-label="日付を選ぶ"
          />
        </label>
        <button className="icon-btn" onClick={() => setSelected(shiftDayKey(dayKey, 1))} aria-label="次の日">
          ›
        </button>
        <button className="btn sm" disabled={isToday} onClick={() => setSelected(null)}>
          今日
        </button>
      </div>

      <section className="card day-summary">
        <div>
          <span className="muted">合計</span>
          <strong>{total > 0 ? formatDuration(total) : '0分'}</strong>
        </div>
        <div>
          <span className="muted">記録</span>
          <strong>{daySessions.length} 件</strong>
        </div>
      </section>

      {daySessions.length === 0 ? (
        <div className="card empty">
          <p>この日の記録はありません。</p>
          <div className="empty-actions">
            <button className="btn" onClick={() => setEditing({})}>
              ＋ 記録を追加
            </button>
          </div>
        </div>
      ) : (
        <section className="card record-card">
          <ul className="record-list">
            {daySessions.map(s => {
              const label = describeTask(s.taskId, tasks, projects);
              const overlap = findOverlaps(sessions, s).length > 0;
              const endDay = dayKeyOf(new Date(s.endAt), 0) !== dayKeyOf(new Date(s.startAt), 0);
              return (
                <li key={s.id}>
                  <button className="record-row" onClick={() => setEditing({ session: s })}>
                    <span className="record-time">
                      {formatTime(s.startAt)}–{endDay && <small>翌</small>}
                      {formatTime(s.endAt)}
                    </span>
                    <span className="record-main">
                      <span className="record-title">
                        <span className="dot" style={{ background: label.color }} />
                        {label.project && <span className="muted">{label.project.name} / </span>}
                        <span className={label.missing ? 'muted' : undefined}>{label.title}</span>
                      </span>
                      <span className="record-meta">
                        <span className="badge">{SESSION_TYPE_LABEL[s.type]}</span>
                        {overlap && <span className="badge warn">時間が重なっています</span>}
                        {s.note && <span className="record-note">{s.note}</span>}
                      </span>
                    </span>
                    <span className="record-dur">{formatDuration(s.durationSec)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {editing && (
        <RecordDialog
          session={editing.session}
          defaultDate={defaultDate}
          defaultStart={defaultStart}
          tasks={tasks}
          projects={projects}
          sessions={sessions}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
