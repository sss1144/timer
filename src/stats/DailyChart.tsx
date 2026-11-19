import { useState } from 'react';
import { displayColor, NEUTRAL_COLOR } from '../lib/colors';
import { formatDateKey, formatDuration } from '../lib/time';
import type { DayTotal, Series } from './aggregate';
import { axisLabel, ChartTooltip, Swatch, timeAxis, topRoundedRect, useWidth } from './chartParts';

/** 9 色目以降は「その他」にまとめる（色を使い回さない） */
const MAX_SERIES = 8;
export const OTHER_KEY = 'other';

export function legendSeries(totals: (Series & { sec: number })[]): { list: Series[]; fold: Set<string> } {
  const ordered = [...totals].sort((a, b) => a.order - b.order);
  if (ordered.length <= MAX_SERIES) return { list: ordered, fold: new Set() };
  const keep = new Set([...totals].sort((a, b) => b.sec - a.sec).slice(0, MAX_SERIES - 1).map(s => s.key));
  return {
    list: [...ordered.filter(s => keep.has(s.key)), { key: OTHER_KEY, name: 'その他', color: null, order: Infinity }],
    fold: new Set(ordered.filter(s => !keep.has(s.key)).map(s => s.key)),
  };
}

const colorOf = (s: Series) => (s.key === OTHER_KEY ? NEUTRAL_COLOR : displayColor(s.color));

type Props = {
  days: DayTotal[];
  series: Series[];
  fold: Set<string>;
  today: string;
  onOpenDay: (day: string) => void;
};

/** 日ごとの作業時間（プロジェクトの色で積み上げた縦棒） */
export function DailyChart({ days, series, fold, today, onOpenDay }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const H = 220;
  const L = 52;
  const R = 8;
  const T = 22;
  const B = 34;
  const pw = Math.max(0, width - L - R);
  const ph = H - T - B;
  const slot = days.length ? pw / days.length : 0;
  const bw = Math.min(24, slot * 0.62);
  const max = Math.max(0, ...days.map(d => d.sec));
  const { top, step } = timeAxis(max);
  const y = (sec: number) => T + ph - (sec / top) * ph;
  const maxIndex = max > 0 ? days.findIndex(d => d.sec === max) : -1;
  const many = days.length > 10;

  // 1 日分の内訳（「その他」にまとめた分も含めて、凡例と同じ順）
  const partsOf = (d: DayTotal) => {
    const out: { s: Series; sec: number }[] = [];
    for (const s of series) {
      const sec =
        s.key === OTHER_KEY
          ? [...d.bySeries].filter(([k]) => fold.has(k)).reduce((a, [, v]) => a + v, 0)
          : (d.bySeries.get(s.key) ?? 0);
      if (sec > 0) out.push({ s, sec });
    }
    return out;
  };

  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-6; v += step) ticks.push(v);

  return (
    <div className="chart" ref={ref} onPointerLeave={() => setActive(null)}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="日ごとの作業時間の棒グラフ">
          {ticks.map(v => (
            <g key={v}>
              <line className="grid" x1={L} x2={width - R} y1={y(v)} y2={y(v)} />
              <text className="axis" x={L - 8} y={y(v) + 4} textAnchor="end">
                {axisLabel(v)}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const x = L + slot * i + (slot - bw) / 2;
            const parts = partsOf(d);
            let acc = 0;
            const [, m, dd] = d.day.split('-').map(Number);
            const dow = '日月火水木金土'[new Date(d.day + 'T12:00:00').getDay()];
            const showLabel = !many || dd === 1 || dd % 5 === 0 || d.day === today;
            return (
              <g
                key={d.day}
                className={`col${active === i ? ' is-active' : ''}`}
                tabIndex={0}
                role="button"
                aria-label={`${formatDateKey(d.day)} ${formatDuration(d.sec)}`}
                onPointerEnter={e => e.pointerType === 'mouse' && setActive(i)}
                onClick={() => setActive(active === i ? null : i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onKeyDown={e => e.key === 'Enter' && onOpenDay(d.day)}
              >
                {/* 当たり判定は棒より広く */}
                <rect x={L + slot * i} y={T} width={slot} height={ph} fill="transparent" />
                {parts.map(({ s, sec }, j) => {
                  const y1 = y(acc + sec);
                  const y0 = y(acc);
                  acc += sec;
                  const gap = j > 0 && y0 - y1 > 3 ? 2 : 0; // 積み上げの間に 2px のすき間
                  const h = Math.max(1, y0 - y1 - gap);
                  return j === parts.length - 1 ? (
                    <path key={s.key} d={topRoundedRect(x, y1, bw, h)} style={{ fill: colorOf(s) }} />
                  ) : (
                    <rect key={s.key} x={x} y={y1} width={bw} height={h} style={{ fill: colorOf(s) }} />
                  );
                })}
                {i === maxIndex && (
                  <text className="cap-label" x={x + bw / 2} y={y(d.sec) - 6} textAnchor="middle">
                    {formatDuration(d.sec)}
                  </text>
                )}
                {showLabel &&
                  (many || slot >= 72 ? (
                    <text className={`axis${d.day === today ? ' is-today' : ''}`} x={L + slot * i + slot / 2} y={H - 8} textAnchor="middle">
                      {many ? dd : `${m}/${dd}(${dow})`}
                    </text>
                  ) : (
                    // 幅が狭いときは「16」と「月」の 2 行にする
                    <text className={`axis${d.day === today ? ' is-today' : ''}`} x={L + slot * i + slot / 2} y={H - 16} textAnchor="middle">
                      <tspan>{dd}</tspan>
                      <tspan x={L + slot * i + slot / 2} dy={12}>
                        {dow}
                      </tspan>
                    </text>
                  ))}
              </g>
            );
          })}
          <line className="baseline" x1={L} x2={width - R} y1={y(0)} y2={y(0)} />
        </svg>
      )}
      {active !== null && days[active] && (
        <ChartTooltip x={L + slot * active + slot / 2} y={4} width={width}>
          <strong>{formatDateKey(days[active].day)}</strong>
          <span className="tt-total">{days[active].sec > 0 ? formatDuration(days[active].sec) : '記録なし'}</span>
          {partsOf(days[active])
            .slice()
            .reverse()
            .map(({ s, sec }) => (
              <span key={s.key} className="tt-row">
                <Swatch color={colorOf(s)} />
                {s.name}
                <span className="tt-val">{formatDuration(sec)}</span>
              </span>
            ))}
          <button className="tt-link" onClick={() => onOpenDay(days[active].day)}>
            この日を見る ›
          </button>
        </ChartTooltip>
      )}
    </div>
  );
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="legend">
      {series.map(s => (
        <li key={s.key}>
          <Swatch color={colorOf(s)} />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

/** グラフと同じ内容の表（色に頼らずに読めるように） */
export function DailyTable({ days, series, fold }: { days: DayTotal[]; series: Series[]; fold: Set<string> }) {
  const valueOf = (d: DayTotal, s: Series) =>
    s.key === OTHER_KEY ? [...d.bySeries].filter(([k]) => fold.has(k)).reduce((a, [, v]) => a + v, 0) : (d.bySeries.get(s.key) ?? 0);
  return (
    <details className="table-view">
      <summary>表で見る</summary>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>日付</th>
              <th>合計</th>
              {series.map(s => (
                <th key={s.key}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map(d => (
              <tr key={d.day}>
                <td>{formatDateKey(d.day)}</td>
                <td>{d.sec ? formatDuration(d.sec) : '–'}</td>
                {series.map(s => {
                  const v = valueOf(d, s);
                  return <td key={s.key}>{v ? formatDuration(v) : '–'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
