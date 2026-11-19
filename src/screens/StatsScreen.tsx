import { useEffect, useMemo, useState } from 'react';
import { useProjects, useSessions, useSettings, useTasks } from '../db/hooks';
import { displayColor } from '../lib/colors';
import { dayKeyOf } from '../lib/day';
import { formatDuration } from '../lib/time';
import { computeStats, makePeriod, periodLabel, shiftAnchor, type PeriodKind, type Stats } from '../stats/aggregate';
import { DailyChart, DailyTable, Legend, legendSeries } from '../stats/DailyChart';
import { Timeline } from '../stats/Timeline';
import { Swatch } from '../stats/chartParts';

const KIND_LABEL: Record<PeriodKind, string> = { day: '日', week: '週', month: '月' };
const CURRENT_LABEL: Record<PeriodKind, string> = { day: '今日', week: '今週', month: '今月' };
const PREV_LABEL: Record<PeriodKind, string> = { day: '前の日', week: '前の週', month: '前の月' };

/** URL の #/stats/week/2026-11-19 から表示中の期間を読む（再読み込みしても同じ期間を開く） */
function fromHash(): { kind: PeriodKind; anchor: string | null } {
  const m = window.location.hash.match(/^#\/stats\/(day|week|month)(?:\/(\d{4}-\d{2}-\d{2}))?$/);
  return m ? { kind: m[1] as PeriodKind, anchor: m[2] ?? null } : { kind: 'week', anchor: null };
}

export function StatsScreen() {
  const sessions = useSessions();
  const tasks = useTasks();
  const projects = useProjects();
  const settings = useSettings();
  const [kind, setKind] = useState<PeriodKind>(() => fromHash().kind);
  const [selected, setSelected] = useState<string | null>(() => fromHash().anchor);

  const today = dayKeyOf(new Date(), settings.dayBoundaryHour);
  const anchor = selected ?? today;
  const period = useMemo(
    () => makePeriod(kind, anchor, settings.weekStart, settings.dayBoundaryHour),
    [kind, anchor, settings.weekStart, settings.dayBoundaryHour],
  );
  const isCurrent = period.days.includes(today);

  useEffect(() => {
    const hash = `#/stats/${kind}${selected && !period.days.includes(today) ? `/${selected}` : ''}`;
    if (window.location.hash !== hash) history.replaceState(null, '', hash);
  }, [kind, selected, period, today]);

  const stats = useMemo(
    () => (sessions && tasks && projects ? computeStats(sessions, tasks, projects, period, settings.dayBoundaryHour) : null),
    [sessions, tasks, projects, period, settings.dayBoundaryHour],
  );
  const prevStats = useMemo(() => {
    if (!sessions || !tasks || !projects) return null;
    const prev = makePeriod(kind, shiftAnchor(kind, anchor, -1), settings.weekStart, settings.dayBoundaryHour);
    return computeStats(sessions, tasks, projects, prev, settings.dayBoundaryHour);
  }, [sessions, tasks, projects, kind, anchor, settings.weekStart, settings.dayBoundaryHour]);

  const go = (dir: 1 | -1) => setSelected(shiftAnchor(kind, anchor, dir));
  const openDay = (day: string) => {
    setKind('day');
    setSelected(day);
  };

  return (
    <>
      <header className="screen-header">
        <h1>統計</h1>
      </header>

      <div className="segmented full" role="tablist" aria-label="期間の単位">
        {(Object.keys(KIND_LABEL) as PeriodKind[]).map(k => (
          <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="day-nav">
        <button className="icon-btn" onClick={() => go(-1)} aria-label={PREV_LABEL[kind]}>
          ‹
        </button>
        <div className="day-label static">
          <span>{periodLabel(period)}</span>
          {isCurrent && <span className="badge">{CURRENT_LABEL[kind]}</span>}
        </div>
        <button className="icon-btn" onClick={() => go(1)} aria-label="次へ">
          ›
        </button>
        <button className="btn sm" disabled={isCurrent} onClick={() => setSelected(null)}>
          {CURRENT_LABEL[kind]}
        </button>
      </div>

      {!stats || !tasks || !projects || !sessions ? null : (
        <>
          <Tiles stats={stats} prev={prevStats} kind={kind} elapsedDays={isCurrent ? period.days.indexOf(today) + 1 : period.days.length} />

          {stats.totalSec === 0 ? (
            <p className="card empty">この期間の記録はありません。</p>
          ) : (
            <>
              {kind !== 'day' && <TrendCard stats={stats} today={today} onOpenDay={openDay} />}

              {kind !== 'month' && (
                <section className="card">
                  <h2>作業した時間帯</h2>
                  <Timeline days={period.days} sessions={stats.sessions} tasks={tasks} projects={projects} boundaryHour={settings.dayBoundaryHour} />
                </section>
              )}

              <section className="card">
                <h2>プロジェクト別</h2>
                <SeriesBars stats={stats} />
              </section>

              <section className="card">
                <h2>タスク別</h2>
                <TaskList stats={stats} />
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}

/* ---------- 合計 ---------- */

function Tiles({ stats, prev, kind, elapsedDays }: { stats: Stats; prev: Stats | null; kind: PeriodKind; elapsedDays: number }) {
  let delta = '';
  if (prev) {
    const diff = stats.totalSec - prev.totalSec;
    const mins = Math.round(Math.abs(diff) / 60);
    delta = mins === 0 ? `${PREV_LABEL[kind]}と同じ` : `${PREV_LABEL[kind]}より ${diff > 0 ? '↑' : '↓'} ${formatDuration(Math.abs(diff))}`;
  }
  return (
    <section className="tiles">
      <div className="tile hero">
        <span className="tile-label">作業時間</span>
        <span className="tile-value">{stats.totalSec > 0 ? formatDuration(stats.totalSec) : '0分'}</span>
        {delta && <span className="tile-sub">{delta}</span>}
      </div>
      <div className="tile">
        <span className="tile-label">完了ポモドーロ</span>
        <span className="tile-value">🍅 {stats.completedPomodoros}</span>
      </div>
      <div className="tile">
        <span className="tile-label">完了タスク</span>
        <span className="tile-value">{stats.completedTasks} 件</span>
      </div>
      {kind !== 'day' && (
        <div className="tile">
          <span className="tile-label">1日あたり</span>
          <span className="tile-value">{stats.totalSec > 0 ? formatDuration(stats.totalSec / Math.max(1, elapsedDays)) : '0分'}</span>
          <span className="tile-sub">{elapsedDays} 日で平均</span>
        </div>
      )}
    </section>
  );
}

/* ---------- 推移 ---------- */

function TrendCard({ stats, today, onOpenDay }: { stats: Stats; today: string; onOpenDay: (d: string) => void }) {
  const { list, fold } = legendSeries(stats.bySeries);
  return (
    <section className="card">
      <h2>日ごとの推移</h2>
      <DailyChart days={stats.byDay} series={list} fold={fold} today={today} onOpenDay={onOpenDay} />
      <Legend series={list} />
      <DailyTable days={stats.byDay} series={list} fold={fold} />
    </section>
  );
}

/* ---------- プロジェクト別 ---------- */

function SeriesBars({ stats }: { stats: Stats }) {
  const max = Math.max(...stats.bySeries.map(s => s.sec), 1);
  return (
    <ul className="hbars">
      {stats.bySeries.map(s => {
        const color = displayColor(s.color);
        const pct = (s.sec / max) * 100;
        return (
          <li key={s.key} className="hbar">
            <span className="hbar-name">
              <Swatch color={color} />
              {s.name}
            </span>
            <span className="hbar-track" aria-hidden="true">
              <span className="hbar-fill" style={{ width: `${Math.max(pct, 1)}%`, background: color }} />
            </span>
            <span className="hbar-value">
              {formatDuration(s.sec)} <span className="muted">{Math.round(s.share * 100)}%</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- タスク別 ---------- */

function TaskList({ stats }: { stats: Stats }) {
  const [all, setAll] = useState(false);
  const LIMIT = 10;
  const rows = all ? stats.byTask : stats.byTask.slice(0, LIMIT);
  return (
    <>
      <ol className="task-rank">
        {rows.map(t => (
          <li key={t.key}>
            <Swatch color={displayColor(t.series.color)} />
            <span className="rank-title">
              <span className={t.deleted ? 'muted' : undefined}>{t.title}</span>
              {t.key !== 'uncategorized' && !t.deleted && <span className="muted small"> {t.series.name}</span>}
            </span>
            {t.pomodoros > 0 && <span className="rank-pomo">🍅 {t.pomodoros}</span>}
            <span className="rank-time">{formatDuration(t.sec)}</span>
          </li>
        ))}
      </ol>
      {stats.byTask.length > LIMIT && (
        <button className="btn sm more-btn" onClick={() => setAll(!all)}>
          {all ? '上位だけ表示' : `すべて表示（${stats.byTask.length} 件）`}
        </button>
      )}
    </>
  );
}
