import { useMemo, useState } from 'react';
import { useProjects, useSessions, useTasks } from '../db/hooks';
import { listProjects } from '../db/queries';
import { updateSessionNote } from '../db/repo';
import { LIMITS, type ActiveTimer, type Project, type Session, type Settings, type Task, type TimerPreset } from '../db/types';
import { dayKeyOf, dayRange, isWithin } from '../lib/day';
import { useStore } from '../lib/store';
import { formatClock, formatDateKey, formatDuration, formatTime } from '../lib/time';
import { Dialog } from '../components/Dialog';
import * as actions from '../timer/actions';
import { unlockAudio } from '../timer/alarm';
import {
  blockDurationMs,
  currentBlock,
  elapsedMs,
  isRecording,
  MIN_RECORD_SEC,
  nextIndex,
  remainingMs,
  getStatus,
  type PresetPlan,
  type TimerStatus,
} from '../timer/engine';
import { BLOCK_LABEL, describeBlock } from '../timer/presets';
import { handleResult, recentRecordStore, showToast, useNow } from '../timer/ui';
import { useTimerState } from '../timer/useTimerState';

const RING_R = 92;
const RING_C = 2 * Math.PI * RING_R;

/** 作業ブロックの途中で停止・スキップするときの確認 */
type Confirm = { action: 'stop' | 'skip' } | null;

export function TimerScreen() {
  const { timer, settings, presets, preset, plan } = useTimerState();
  const projects = useProjects();
  const tasks = useTasks();
  const sessions = useSessions();
  const status: TimerStatus = timer ? getStatus(timer) : 'idle';
  const now = useNow(status === 'running');
  const [confirm, setConfirm] = useState<Confirm>(null);

  if (!timer || !projects || !tasks || !sessions) {
    return (
      <header className="screen-header">
        <h1>タイマー</h1>
      </header>
    );
  }

  const idle = status === 'idle';
  const block = currentBlock(timer, plan);
  const run = async (fn: () => Promise<actions.ActionResult>) => {
    unlockAudio();
    handleResult(await fn(), settings);
  };

  /** 作業ブロックの途中（1 分以上）なら「記録する / 破棄する」を聞く。それ以外はそのまま */
  const needsConfirm = () =>
    timer.mode === 'timer' && !idle && block?.kind === 'work' && Math.min(elapsedMs(timer, Date.now()), timer.blockDurationSec * 1000) >= MIN_RECORD_SEC * 1000;

  const onStop = () => {
    if (needsConfirm()) return setConfirm({ action: 'stop' });
    const wasShort = timer.mode === 'stopwatch' && elapsedMs(timer, Date.now()) < MIN_RECORD_SEC * 1000;
    void run(() => actions.stop(true)).then(() => {
      if (wasShort) showToast('1分未満のため記録しませんでした');
    });
  };
  const onSkip = () => {
    if (needsConfirm()) return setConfirm({ action: 'skip' });
    void run(() => actions.skip(false));
  };

  return (
    <div className={`timer-screen kind-${block?.kind ?? 'work'}`}>
      <header className="screen-header">
        <h1>タイマー</h1>
      </header>

      <section className="card timer-card">
        <div className="segmented full" role="radiogroup" aria-label="モード">
          {(['timer', 'stopwatch'] as const).map(m => (
            <button key={m} role="radio" aria-checked={timer.mode === m} disabled={!idle && timer.mode !== m} onClick={() => void actions.setMode(m)}>
              {m === 'timer' ? 'ブロックタイマー' : 'ストップウォッチ'}
            </button>
          ))}
        </div>

        <div className="pickers">
          {timer.mode === 'timer' && <PresetPicker presets={presets} preset={preset} disabled={!idle} />}
          <TaskPicker timer={timer} tasks={tasks} projects={projects} disabled={!idle} />
        </div>

        <Dial timer={timer} status={status} now={now} plan={plan} />

        {timer.mode === 'timer' && plan && <BlockStrip plan={plan} index={timer.blockIndex} />}

        <div className="timer-controls">
          <Controls
            timer={timer}
            status={status}
            plan={plan}
            onStart={() => void run(actions.start)}
            onPause={() => void run(actions.pause)}
            onResume={() => void run(actions.resume)}
            onStop={onStop}
            onSkip={onSkip}
          />
        </div>
      </section>

      <RecentRecord tasks={tasks} />

      <TodaySummary sessions={sessions} timer={timer} plan={plan} now={now} settings={settings} />

      {confirm && (
        <ConfirmDialog
          timer={timer}
          action={confirm.action}
          onClose={() => setConfirm(null)}
          onAnswer={record => {
            setConfirm(null);
            void run(() => (confirm.action === 'stop' ? actions.stop(record) : actions.skip(record))).then(() => {
              if (!record) showToast('破棄しました');
            });
          }}
        />
      )}
    </div>
  );
}

/* ---------- プリセットとタスクの選択 ---------- */

function PresetPicker({ presets, preset, disabled }: { presets: TimerPreset[]; preset: TimerPreset | null; disabled: boolean }) {
  return (
    <label className="picker">
      <span>プリセット</span>
      <select value={preset?.id ?? ''} disabled={disabled} onChange={e => void actions.setPreset(e.target.value)}>
        {presets.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <a className="picker-link" href="#/settings">
        編集
      </a>
    </label>
  );
}

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
    <label className="picker">
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

function Dial({ timer, status, now, plan }: { timer: ActiveTimer; status: TimerStatus; now: number; plan: PresetPlan | null }) {
  const elapsed = elapsedMs(timer, now);
  const block = currentBlock(timer, plan);
  let clock: string;
  let progress: number;
  let label: string;
  let sub: string;
  if (timer.mode === 'timer') {
    const total = blockDurationMs(timer, plan);
    clock = formatClock(remainingMs(timer, now, plan), true);
    progress = total ? Math.min(1, elapsed / total) : 0;
    label = block ? `${BLOCK_LABEL[block.kind]}（${timer.blockIndex + 1}/${plan?.blocks.length ?? 0}）` : 'プリセットがありません';
    const next = plan ? nextIndex(timer.blockIndex, plan) : null;
    sub = !plan ? '' : next === null ? '次：なし（このブロックで終わり）' : `次：${describeBlock(plan.blocks[next])}${next === 0 ? '（最初に戻る）' : ''}`;
  } else {
    clock = formatClock(elapsed);
    progress = (elapsed % 3_600_000) / 3_600_000; // 1 時間で 1 周
    label = 'ストップウォッチ';
    sub = '一時停止中の時間は含めません';
  }

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
        <span className="dial-sub">{sub}</span>
      </div>
    </div>
  );
}

/** プリセットのブロックの並び（今のブロックを強調） */
function BlockStrip({ plan, index }: { plan: PresetPlan; index: number }) {
  return (
    <ol className="block-strip" aria-label="ブロックの並び">
      {plan.blocks.map((b, i) => (
        <li key={i} className={`block-chip kind-${b.kind}${i === index ? ' is-current' : ''}`} aria-current={i === index ? 'step' : undefined}>
          {BLOCK_LABEL[b.kind]} {b.min}
        </li>
      ))}
      <li className="block-end">{plan.repeat ? '↻ 繰り返す' : '1回だけ'}</li>
    </ol>
  );
}

/* ---------- ボタン ---------- */

function Controls(props: {
  timer: ActiveTimer;
  status: TimerStatus;
  plan: PresetPlan | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSkip: () => void;
}) {
  const { timer, status, plan } = props;
  const block = currentBlock(timer, plan);
  const canStart = timer.mode === 'stopwatch' || !!block;

  const main =
    status === 'idle' ? (
      <button className="btn primary big" onClick={props.onStart} disabled={!canStart}>
        {block?.kind === 'break' ? '休憩を開始' : '開始'}
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
      {status !== 'idle' && (
        <button className="btn big" onClick={props.onStop}>
          {timer.mode === 'stopwatch' ? '停止して記録' : '停止'}
        </button>
      )}
      {timer.mode === 'timer' && plan && (
        <button className="btn big" onClick={props.onSkip}>
          スキップ
        </button>
      )}
    </>
  );
}

function ConfirmDialog(props: { timer: ActiveTimer; action: 'stop' | 'skip'; onClose: () => void; onAnswer: (record: boolean) => void }) {
  const { timer, action, onClose, onAnswer } = props;
  const elapsed = Math.min(elapsedMs(timer, Date.now()), timer.blockDurationSec * 1000);
  return (
    <Dialog title={action === 'stop' ? 'タイマーを停止' : 'ブロックをスキップ'} onClose={onClose}>
      <p className="dialog-text">
        ここまでの作業 {formatDuration(elapsed / 1000)} を記録しますか？
        {action === 'stop' ? '停止すると、次は最初のブロックから始まります。' : '選んだあと、次のブロックへ進みます。'}
      </p>
      <div className="form-actions">
        <button className="btn ghost" onClick={onClose}>
          キャンセル
        </button>
        <span className="spacer" />
        <button className="btn danger" onClick={() => onAnswer(false)}>
          破棄する
        </button>
        <button className="btn primary" onClick={() => onAnswer(true)}>
          記録する
        </button>
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

function TodaySummary(props: { sessions: Session[]; timer: ActiveTimer; plan: PresetPlan | null; now: number; settings: Settings }) {
  const { sessions, timer, plan, now, settings } = props;
  const range = dayRange(new Date(now), settings.dayBoundaryHour);
  const today = sessions.filter(s => !s.deleted && isWithin(s.startAt, range));
  let totalSec = today.reduce((sum, s) => sum + s.durationSec, 0);
  // 計測中の作業も含める（記録と同じく、開始した日に数える）
  const measuring = !!timer.startedAt && isRecording(timer, plan);
  const startedEarlier = measuring && !isWithin(timer.startedAt!, range);
  if (measuring && !startedEarlier) {
    const live = timer.mode === 'timer' ? Math.min(elapsedMs(timer, now), timer.blockDurationSec * 1000) : elapsedMs(timer, now);
    totalSec += Math.floor(live / 1000);
  }
  return (
    <section className="card today">
      <div>
        <span className="muted">今日の合計</span>
        <strong className="today-total">{totalSec > 0 ? formatDuration(totalSec) : '0分'}</strong>
      </div>
      {startedEarlier && (
        <p className="today-note">
          計測中の作業は、開始した日（{formatDateKey(dayKeyOf(new Date(timer.startedAt!), settings.dayBoundaryHour))}）に数えます
        </p>
      )}
    </section>
  );
}
