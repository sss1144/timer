import { useMemo, useState, type ReactNode } from 'react';
import { useActiveTimer, useProjects, useSessions, useSettings, useTasks } from '../db/hooks';
import {
  dueStatus,
  filterTasks,
  groupByProject,
  listProjects,
  sortTasks,
  summarizeByTask,
  type ProjectFilter,
  type TaskStatusFilter,
  type TaskSummary,
} from '../db/queries';
import { setTaskDone } from '../db/repo';
import { PROJECT_COLORS, type Project, type Task } from '../db/types';
import { ProjectDialog } from '../components/ProjectDialog';
import { TaskDialog } from '../components/TaskDialog';
import { formatDateKey, formatDuration, toDateKey } from '../lib/time';
import { displayColor } from '../lib/colors';
import * as timerActions from '../timer/actions';
import { unlockAudio } from '../timer/alarm';
import { getStatus } from '../timer/engine';
import { handleResult, showToast } from '../timer/ui';

type View = 'tasks' | 'projects';
type Editing =
  | { kind: 'task'; task?: Task }
  | { kind: 'project'; project?: Project }
  | null;

export function TasksScreen() {
  const projects = useProjects();
  const tasks = useTasks();
  const sessions = useSessions();

  const [view, setView] = useState<View>('tasks');
  const [status, setStatus] = useState<TaskStatusFilter>('open');
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);

  const summaries = useMemo(() => summarizeByTask(sessions ?? []), [sessions]);
  const timer = useActiveTimer();
  const settings = useSettings();
  const timerBusy = !!timer && getStatus(timer) !== 'idle';

  /** タスク一覧からそのままタイマーを開始する */
  const startTask = async (task: Task) => {
    if (timerBusy) {
      showToast('タイマーが動いています。止めてから開始してください');
    } else {
      unlockAudio();
      handleResult(await timerActions.startWithTask(task.id), settings);
    }
    window.location.hash = '#/';
  };

  if (!projects || !tasks || !sessions) return <ScreenHeader />;

  const activeProjects = listProjects(projects, false);
  const selectableProjects = listProjects(projects, includeArchived);
  // 絞り込み中のプロジェクトが選択肢から消えたら「すべて」に戻す
  const effectiveFilter =
    projectFilter === 'all' || projectFilter === 'none' || selectableProjects.some(p => p.id === projectFilter) ? projectFilter : 'all';

  const filtered = sortTasks(filterTasks(tasks, projects, { status, project: effectiveFilter, includeArchived }), status);
  const groups = effectiveFilter === 'all' ? groupByProject(filtered, projects) : [{ project: null, tasks: filtered }];
  const unusedColor = PROJECT_COLORS.find(c => !projects.some(p => !p.deleted && p.color === c));

  return (
    <>
      <ScreenHeader>
        {view === 'tasks' ? (
          <button className="btn primary" onClick={() => setEditing({ kind: 'task' })}>
            ＋ タスク
          </button>
        ) : (
          <button className="btn primary" onClick={() => setEditing({ kind: 'project' })}>
            ＋ プロジェクト
          </button>
        )}
      </ScreenHeader>

      <div className="segmented full" role="tablist">
        <button role="tab" aria-selected={view === 'tasks'} onClick={() => setView('tasks')}>
          タスク
        </button>
        <button role="tab" aria-selected={view === 'projects'} onClick={() => setView('projects')}>
          プロジェクト
        </button>
      </div>

      {view === 'tasks' ? (
        <>
          <div className="toolbar">
            <div className="segmented">
              <button aria-pressed={status === 'open'} onClick={() => setStatus('open')}>
                未完了
              </button>
              <button aria-pressed={status === 'done'} onClick={() => setStatus('done')}>
                完了済み
              </button>
            </div>
            <select value={effectiveFilter} onChange={e => setProjectFilter(e.target.value)} aria-label="プロジェクトで絞り込む">
              <option value="all">すべてのプロジェクト</option>
              {selectableProjects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.archived ? '（アーカイブ済み）' : ''}
                </option>
              ))}
              <option value="none">プロジェクトなし</option>
            </select>
            <label className="check">
              <input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)} />
              アーカイブ済みも表示
            </label>
          </div>

          {filtered.length === 0 ? (
            <EmptyTasks status={status} hasProjects={activeProjects.length > 0} onAddTask={() => setEditing({ kind: 'task' })} onAddProject={() => setEditing({ kind: 'project' })} />
          ) : (
            groups.map(g => (
              <section key={g.project?.id ?? 'none'} className="card task-group">
                {effectiveFilter === 'all' && (
                  <h2>
                    <span className="dot" style={{ background: displayColor(g.project?.color) }} />
                    {g.project?.name ?? 'プロジェクトなし'}
                    {g.project?.archived && <span className="badge">アーカイブ済み</span>}
                    <span className="count">{g.tasks.length}</span>
                  </h2>
                )}
                <ul className="task-list">
                  {g.tasks.map(t => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      summary={summaries.get(t.id)}
                      running={timerBusy && timer?.taskId === t.id}
                      onEdit={() => setEditing({ kind: 'task', task: t })}
                      onStart={() => void startTask(t)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      ) : (
        <ProjectList projects={projects} tasks={tasks} summaries={summaries} onEdit={p => setEditing({ kind: 'project', project: p })} />
      )}

      {editing?.kind === 'task' && (
        <TaskDialog
          task={editing.task}
          projects={listProjects(projects, true)}
          defaultProjectId={effectiveFilter !== 'all' && effectiveFilter !== 'none' ? effectiveFilter : null}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === 'project' && <ProjectDialog project={editing.project} defaultColor={unusedColor} onClose={() => setEditing(null)} />}
    </>
  );
}

function ScreenHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="screen-header">
      <h1>タスク</h1>
      <div className="screen-actions">{children}</div>
    </header>
  );
}

function TaskRow(props: { task: Task; summary?: TaskSummary; running: boolean; onEdit: () => void; onStart: () => void }) {
  const { task, summary, running, onEdit, onStart } = props;
  const due = dueStatus(task.dueDate, toDateKey(new Date()));
  const total = summary?.totalSec ?? 0;

  return (
    <li className={`task-row${task.done ? ' is-done' : ''}`}>
      <button
        className="check-btn"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? `「${task.title}」を未完了に戻す` : `「${task.title}」を完了にする`}
        onClick={() => setTaskDone(task.id, !task.done)}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button className="task-main" onClick={onEdit}>
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          <span title={task.estimatedMin ? '合計作業時間 / 見積もり時間' : '合計作業時間'}>
            ⏱ {total > 0 ? formatDuration(total) : '0分'}
            {task.estimatedMin ? ` / ${formatDuration(task.estimatedMin * 60)}` : ''}
          </span>
          {task.dueDate && (
            <span className={`due due-${due}`}>
              期限 {formatDateKey(task.dueDate)}
              {due === 'overdue' && !task.done ? '（過ぎています）' : due === 'today' && !task.done ? '（今日）' : ''}
            </span>
          )}
          {task.note && <span className="task-note">{task.note}</span>}
        </span>
      </button>
      {!task.done &&
        (running ? (
          <a href="#/" className="start-btn is-running" aria-label={`「${task.title}」を計測中。タイマーを開く`}>
            計測中
          </a>
        ) : (
          <button className="start-btn" onClick={onStart} aria-label={`「${task.title}」でタイマーを開始`}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
            </svg>
          </button>
        ))}
    </li>
  );
}

function EmptyTasks(props: { status: TaskStatusFilter; hasProjects: boolean; onAddTask: () => void; onAddProject: () => void }) {
  if (props.status === 'done') {
    return <p className="empty card">完了したタスクはまだありません。</p>;
  }
  return (
    <div className="empty card">
      {props.hasProjects ? (
        <p>未完了のタスクはありません。</p>
      ) : (
        <p>
          まずは「イラスト練習」「学習」のようなプロジェクトを作り、その中にタスクを追加しましょう。
          <br />
          プロジェクトなしでもタスクは作れます。
        </p>
      )}
      <div className="empty-actions">
        {!props.hasProjects && (
          <button className="btn" onClick={props.onAddProject}>
            ＋ プロジェクト
          </button>
        )}
        <button className="btn primary" onClick={props.onAddTask}>
          ＋ タスク
        </button>
      </div>
    </div>
  );
}

function ProjectList({
  projects,
  tasks,
  summaries,
  onEdit,
}: {
  projects: Project[];
  tasks: Task[];
  summaries: Map<string | null, TaskSummary>;
  onEdit: (p: Project) => void;
}) {
  const all = listProjects(projects, true);
  const active = all.filter(p => !p.archived);
  const archived = all.filter(p => p.archived);

  const stats = (p: Project) => {
    const own = tasks.filter(t => t.projectId === p.id);
    const open = own.filter(t => !t.done && !t.deleted).length;
    // 削除済みタスクの記録もプロジェクトの合計には含める
    const totalSec = own.reduce((sum, t) => sum + (summaries.get(t.id)?.totalSec ?? 0), 0);
    return { open, totalSec };
  };

  const renderList = (list: Project[]) => (
    <ul className="project-list">
      {list.map(p => {
        const s = stats(p);
        return (
          <li key={p.id}>
            <button className="project-row" onClick={() => onEdit(p)}>
              <span className="dot lg" style={{ background: displayColor(p.color) }} />
              <span className="project-name">{p.name}</span>
              <span className="project-meta">
                未完了 {s.open} 件 ・ 合計 {s.totalSec > 0 ? formatDuration(s.totalSec) : '0分'}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (all.length === 0) {
    return <p className="empty card">プロジェクトはまだありません。「＋ プロジェクト」から追加してください。</p>;
  }
  return (
    <>
      <section className="card">{active.length ? renderList(active) : <p className="empty">表示中のプロジェクトはありません。</p>}</section>
      {archived.length > 0 && (
        <section className="card">
          <h2>アーカイブ済み</h2>
          {renderList(archived)}
        </section>
      )}
    </>
  );
}
