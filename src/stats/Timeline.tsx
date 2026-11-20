import { useState } from 'react';
import type { Project, Session, Task } from '../db/types';
import { describeTask, SESSION_TYPE_LABEL } from '../db/queries';
import { displayColor } from '../lib/colors';
import { formatDateKey, formatDuration, formatTime } from '../lib/time';
import { makeSeriesResolver, timelineOfDay } from './aggregate';
import { ChartTooltip, useWidth } from './chartParts';

type Props = {
  days: string[];
  sessions: Session[];
  tasks: Task[];
  projects: Project[];
  boundaryHour: number;
};

/** どの時間帯に作業したか（1 日を 1 本の帯にして、記録を並べる） */
export function Timeline({ days, sessions, tasks, projects, boundaryHour }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<{ row: number; id: string } | null>(null);
  const seriesOf = makeSeriesResolver(tasks, projects);

  const multi = days.length > 1;
  const L = multi ? 76 : 4; // 日付ラベルの幅（等幅の文字のテーマでも重ならないように）
  const R = 8;
  const rowH = 30;
  const band = 16;
  const T = 4;
  const B = 24;
  const H = T + rowH * days.length + B;
  const pw = Math.max(0, width - L - R);
  const xOf = (f: number) => L + f * pw;
  // 幅が狭いときは 6 時間ごとに目盛りを出す
  const every = pw < 420 ? 6 : 3;
  const hours = Array.from({ length: 24 / every + 1 }, (_, i) => i * every);
  const rows = days.map(d => timelineOfDay(sessions, d, boundaryHour));

  const activeSeg = active ? rows[active.row]?.find(s => s.session.id === active.id) : undefined;

  return (
    <div className="chart" ref={ref} onPointerLeave={() => setActive(null)}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="作業した時間帯">
          {hours.map(h => (
            <g key={h}>
              <line className="grid" x1={xOf(h / 24)} x2={xOf(h / 24)} y1={T} y2={T + rowH * days.length} />
              <text className="axis" x={xOf(h / 24)} y={H - 8} textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}>
                {(boundaryHour + h) % 24}時
              </text>
            </g>
          ))}
          {rows.map((segs, r) => {
            const yMid = T + rowH * r + rowH / 2;
            return (
              <g key={days[r]}>
                {multi && (
                  <text className="axis row-label" x={0} y={yMid + 4}>
                    {formatDateKey(days[r])}
                  </text>
                )}
                <rect className="band-bg" x={L} y={yMid - band / 2} width={pw} height={band} rx={4} />
                {segs.map(seg => {
                  const x = xOf(seg.from);
                  const w = Math.max(3, xOf(seg.to) - x);
                  const color = displayColor(seriesOf(seg.session.taskId).color);
                  const label = describeTask(seg.session.taskId, tasks, projects).title;
                  return (
                    <g
                      key={seg.session.id}
                      className="seg"
                      tabIndex={0}
                      role="button"
                      aria-label={`${formatTime(seg.session.startAt)}から${formatTime(seg.session.endAt)} ${label} ${formatDuration(seg.session.durationSec)}`}
                      onPointerEnter={e => e.pointerType === 'mouse' && setActive({ row: r, id: seg.session.id })}
                      onClick={() => setActive({ row: r, id: seg.session.id })}
                      onFocus={() => setActive({ row: r, id: seg.session.id })}
                      onBlur={() => setActive(null)}
                    >
                      <rect x={x} y={yMid - band / 2 - 6} width={w} height={band + 12} fill="transparent" />
                      <rect x={x} y={yMid - band / 2} width={w} height={band} rx={Math.min(4, w / 2)} style={{ fill: color }} />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}
      {active && activeSeg && (
        <ChartTooltip x={(xOf(activeSeg.from) + xOf(activeSeg.to)) / 2} y={T + rowH * (active.row + 1) + 2} width={width}>
          <strong>{describeTask(activeSeg.session.taskId, tasks, projects).title}</strong>
          <span className="tt-row">
            {formatTime(activeSeg.session.startAt)}–{activeSeg.cutEnd ? '翌' : ''}
            {formatTime(activeSeg.session.endAt)}
            <span className="tt-val">{formatDuration(activeSeg.session.durationSec)}</span>
          </span>
          <span className="tt-sub">{SESSION_TYPE_LABEL[activeSeg.session.type]}</span>
          {activeSeg.session.note && <span className="tt-note">{activeSeg.session.note}</span>}
        </ChartTooltip>
      )}
    </div>
  );
}
