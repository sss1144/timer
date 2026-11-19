import { useMemo, useState } from 'react';
import { useActiveTimer, useProjects, useSessions, useSettings, useTasks } from '../db/hooks';
import { listProjects } from '../db/queries';
import { updateSessionNote } from '../db/repo';
import { LIMITS, type ActiveTimer, type Project, type Session, type Settings, type Task } from '../db/types';
import { dayKeyOf, dayRange, isWithin } from '../lib/day';
import { useStore } from '../lib/store';
import { formatClock, formatDateKey, formatDuration, formatTime } from '../lib/time';
import { Dialog } from '../components/Dialog';
import * as actions from '../timer/actions';
import { unlockAudio } from '../timer/alarm';
import { elapsedMs, getStatus, isBreak, isRecording, MIN_RECORD_SEC, phaseDurationMs, remainingMs, type TimerStatus } from '../timer/engine';
import { handleResult, PHASE_LABEL, recentRecordStore, showToast, useNow } from '../timer/ui';

const RING_R = 92;
const RING_C = 2 * Math.PI * RING_R;

export function TimerScreen() {
  const timer = useActiveTimer();
  const settings = useSettings();
  const projects = useProjects();
  const tasks = useTasks();
  const sessions = useSessions();
  const status: TimerStatus = timer ? getStatus(timer) : 'idle';
  const now = useNow(status === 'running');
  const [confirmStop, setConfirmStop] = useState(false);

  if (!timer || !projects || !tasks || !sessions) {
    return (
      <header className="screen-header">
        <h1>タイマー</h1>
      </header>
    );
  }

  const idle = status === 'idle';
  const run = async (fn: () => Promise<actions.ActionResult>) => {
    unlockAudio();
    handleResult(await fn(), settings);
  };

  const onStop = () => {
    if (timer.mode === 'pomodoro') {
      setConfirmStop(true);
      return;
    }
    void run(() => actions.stop(true)).then(() => {
      if (elapsedMs(timer, Date.now()) < MIN_RECORD_SEC * 1000) showToast('1分未満のため記録しませんでした');
    });
  };

  return (
    <div className={`timer-screen phase-${timer.mode === 'pomodoro' ? timer.phase : 'work'}`}>
      <header className="screen-header">
        <h1>タイマー</h1>
      </header>

      <section className="card timer-card">
        <div className="segmented full" role="radiogroup" aria-label="モード">
          {(['pomodoro', 'stopwatch'] as const).map(m => (
            <button
              key={m}
              role="radio"
              aria-checked={timer.mode === m}
              disabled={!idle && timer.mode !== m}
              onClick={() => void actions.setMode(m)}
            >
              {m === 'pomodoro' ? 'ポモドーロ' : 'ストップウォッチ'}
            </button>
          ))}
        </div>

        <TaskPicker timer={timer} tasks={tasks} projects={projects} disabled={!idle} />

        <Dial timer={timer} status={status} now={now} settings={settings} />

        {timer.mode === 'pomodoro' && <PomodoroDots count={timer.pomodoroCount} every={settings.longBreakEvery} phase={timer.phase} />}

        <div className="timer-controls">
          <Controls
            timer={timer}
            status={status}
            onStart={() => void run(actions.start)}
            onPause={() => void run(actions.pause)}
            onResume={() => void run(actions.resume)}
            onStop={onStop}
            onSkip={() => void run(actions.skipBreak)}
          />
        </div>
      </section>

      <RecentRecord tasks={tasks} />

      <TodaySummary sessions={sessions} timer={timer} now={now} settings={settings} />

      {confirmStop && (
        <StopDialog
          timer={timer}
          onClose={() => setConfirmStop(false)}
          onAnswer={record => {
            setConfirmStop(false);
            void run(() => actions.stop(record)).then(() => {
              if (!record) showToast('破棄しました');
            });
          }}
        />
      )}
    </div>
  );
}

/* ---------- タスクの選択 ---------- */

function TaskPicker({ timer, tasks, projects, disabled }: { timer: ActiveTimer; tasks: Task[]; projects: Project[]; disabled: boolean }) {
  const groups = useMemo(() => {
    const visible = listProjects(projects, false);
    const known = new Set(visible.map(p => p.id));
    const open = tasks.filter(t => !t.deleted && !t.done);
    const result = visible.map(p => ({ label: p.name, tasks: open.filter(t => t.projectId === p.id) }));
    const allProjects = new Set(projects.filter(p => !p.deleted).map(p => p.id));
    result.push({
      label: 'プロジェクトなし',
      tasks: open.filter(t => !t.projectId || (!known.has(t.projectId) && !allProjects.has(t.projectId))),
    });
    return result.filter(g => g.tasks.length > 0);
  }, [tasks, projects]);

  // 選択中のタスクが一覧にない（完了済みなど）場合も表示する
  const current = timer.taskId ? tasks.find(t => t.id === timer.taskId) : undefined;
  const listed = groups.some(g => g.tasks.some(t => t.id === timer.taskId));

  return (
    <label className="task-picker">
      <span>タスク</span>
      <select value={timer.taskId ?? ''} disabled={disabled} onChange={e => void actions.setTask(e.target.value || null)}>
        <option value="">未分類（タスクを選ばない）</option>
        {groups.map(g => (
          <optgroup key={g.label} label={g.label}>
            {g.tasks.map(t => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </optgroup>
        ))}
        {current && !listed && (
          <option value={current.id}>
            {current.title}
            {current.deleted ? '（削除済み）' : current.done ? '（完了済み）' : ''}
          </option>
        )}
      </select>
    </label>
  );
}

/* ---------- 大きな時計 ---------- */

function Dial({ timer, status, now, settings }: { timer: ActiveTimer; status: TimerStatus; now: number; settings: Settings }) {
  const elapsed = elapsedMs(timer, now);
  let clock: string;
  let progress: number;
  if (timer.mode === 'pomodoro') {
    const total = phaseDurationMs(timer, settings);
    clock = formatClock(remainingMs(timer, now, settings), true);
    progress = total ? Math.min(1, elapsed / total) : 0;
  } else {
    clock = formatClock(elapsed);
    progress = (elapsed % 3_600_000) / 3_600_000; // 1 時間で 1 周
  }
  const label = timer.mode === 'pomodoro' ? PHASE_LABEL[timer.phase] : 'ストップウォッチ';

  return (
    <div className="dial" role="timer" aria-live="off">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle className="ring-bg" cx="100" cy="100" r={RING_R} />
        <circle className="ring-fg" cx="100" cy="100" r={RING_R} strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - progress)} />
      </svg>
      <div className="dial-inner">
        <span className="dial-phase">
          {label}
          {status === 'paused' && '（一時停止中）'}
        </span>
        <span className="dial-clock">{clock}</span>
        <span className="dial-sub">{timer.mode === 'pomodoro' ? (status === 'idle' ? '開始を押してください' : `${formatDuration(phaseDurationMs(timer, settings) / 1000)}`) : '一時停止中の時間は含めません'}</span>
      </div>
    </div>
  );
}

function PomodoroDots({ count, every, phase }: { count: number; every: number; phase: ActiveTimer['phase'] }) {
  let filled = count % every;
  if (filled === 0 && count > 0 && phase === 'longBreak') filled = every;
  return (
    <div className="pomo-dots" aria-label={`長い休憩まで ${every - filled} 回`}>
      {Array.from({ length: every }, (_, i) => (
        <span key={i} className={`pomo-dot${i < filled ? ' done' : ''}`} />
      ))}
    </div>
  );
}

/* ---------- ボタン ---------- */

function Controls(props: {
  timer: ActiveTimer;
  status: TimerStatus;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSkip: () => void;
}) {
  const { timer, status } = props;
  const inBreak = timer.mode === 'pomodoro' && isBreak(timer.phase);

  const main =
    status === 'idle' ? (
      <button className="btn primary big" onClick={props.onStart}>
        {inBreak ? '休憩を開始' : '開始'}
      </button>
    ) : status === 'running' ? (
      <button className="btn primary big" onClick={props.onPause}>
        一時停止
      </button>
    ) : (
      <button className="btn primary big" onClick={props.onResume}>
        再開
      </button>
    );

  return (
    <>
      {main}
      {inBreak ? (
        <button className="btn big" onClick={props.onSkip}>
          休憩をスキップ
        </button>
      ) : (
        status !== 'idle' && (
          <button className="btn big" onClick={props.onStop}>
            {timer.mode === 'stopwatch' ? '停止して記録' : '停止'}
          </button>
        )
      )}
    </>
  );
}

function StopDialog({ timer, onClose, onAnswer }: { timer: ActiveTimer; onClose: () => void; onAnswer: (record: boolean) => void }) {
  const elapsed = Math.min(elapsedMs(timer, Date.now()), timer.phaseDurationSec * 1000);
  const enough = elapsed >= MIN_RECORD_SEC * 1000;
  return (
    <Dialog title="ポモドーロを停止" onClose={onClose}>
      <p className="dialog-text">
        {enough
          ? `ここまでの ${formatDuration(elapsed / 1000)} を記録しますか？（完了したポモドーロには数えません）`
          : '1分未満なので記録されません。停止しますか？'}
      </p>
      <div className="form-actions">
        <button className="btn ghost" onClick={onClose}>
          キャンセル
        </button>
        <span className="spacer" />
        {enough ? (
          <>
            <button className="btn danger" onClick={() => onAnswer(false)}>
              破棄する
            </button>
            <button className="btn primary" onClick={() => onAnswer(true)}>
              記録する
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={() => onAnswer(false)}>
            停止する
          </button>
        )}
      </div>
    </Dialog>
  );
}

/* ---------- 終わった記録にメモを付ける ---------- */

function RecentRecord({ tasks }: { tasks: Task[] }) {
  const record = useStore(recentRecordStore);
  const [note, setNote] = useState('');
  if (!record) return null;

  const task = record.taskId ? tasks.find(t => t.id === record.taskId) : undefined;
  const close = () => {
    recentRecordStore.set(null);
    setNote('');
  };
  const save = async () => {
    if (note.trim()) {
      await updateSessionNote(record.id, note);
      showToast('メモを保存しました');
    }
    close();
  };

  return (
    <section className="card recent">
      <div className="recent-head">
        <div>
          <strong>記録しました</strong>
          <span className="muted">
            {' '}
            {task?.title ?? '未分類'} ・ {formatTime(record.startAt)}–{formatTime(record.endAt)}（{formatDuration(record.durationSec)}）
          </span>
        </div>
        <button className="icon-btn" onClick={close} aria-label="閉じる">
          ×
        </button>
      </div>
      <form
        className="recent-form"
        onSubmit={e => {
          e.preventDefault();
          void save();
        }}
      >
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={LIMITS.note} placeholder="ひとことメモ（任意）" aria-label="メモ" />
        <button className="btn" type="submit">
          保存
        </button>
      </form>
    </section>
  );
}

/* ---------- 今日の合計 ---------- */

function TodaySummary({ sessions, timer, now, settings }: { sessions: Session[]; timer: ActiveTimer; now: number; settings: Settings }) {
  const range = dayRange(new Date(now), settings.dayBoundaryHour);
  const today = sessions.filter(s => !s.deleted && isWithin(s.startAt, range));
  let totalSec = today.reduce((sum, s) => sum + s.durationSec, 0);
  const pomodoros = today.filter(s => s.type === 'pomodoro' && s.completed).length;
  // 計測中の作業も含める（記録と同じく、開始した日に数える）
  const measuring = !!timer.startedAt && isRecording(timer);
  const startedEarlier = measuring && !isWithin(timer.startedAt!, range);
  if (measuring && !startedEarlier) {
    const live = timer.mode === 'pomodoro' ? Math.min(elapsedMs(timer, now), timer.phaseDurationSec * 1000) : elapsedMs(timer, now);
    totalSec += Math.floor(live / 1000);
  }
  return (
    <section className="card today">
      <div>
        <span className="muted">今日の合計</span>
        <strong className="today-total">{totalSec > 0 ? formatDuration(totalSec) : '0分'}</strong>
      </div>
      <div>
        <span className="muted">完了ポモドーロ</span>
        <strong className="today-total">🍅 {pomodoros}</strong>
      </div>
      {startedEarlier && (
        <p className="today-note">
          計測中の作業は、開始した日（{formatDateKey(dayKeyOf(new Date(timer.startedAt!), settings.dayBoundaryHour))}）に数えます
        </p>
      )}
    </section>
  );
}
