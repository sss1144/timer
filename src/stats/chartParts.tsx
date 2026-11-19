import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/** 要素の幅（px）。グラフを実際の幅で描いて、文字が小さくならないようにする */
export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(entries => setWidth(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** 上の角だけ丸めた棒（下は基準線に接するので四角） */
export function topRoundedRect(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.max(0, Math.min(r, h, w / 2));
  return `M${x},${y + h}V${y + rr}A${rr},${rr} 0 0 1 ${x + rr},${y}H${x + w - rr}A${rr},${rr} 0 0 1 ${x + w},${y + rr}V${y + h}Z`;
}

/** 時間の目盛り（きりのよい間隔で 4 本以内） */
export function timeAxis(maxSec: number): { top: number; step: number } {
  const steps = [5, 10, 15, 30, 60, 120, 180, 240, 360, 480, 720].map(m => m * 60);
  if (maxSec <= 0) return { top: 3600, step: 1800 };
  const step = steps.find(s => maxSec / s <= 4) ?? 1440 * 60;
  return { top: Math.ceil(maxSec / step) * step, step };
}

export function axisLabel(sec: number): string {
  if (sec === 0) return '0';
  if (sec < 3600) return `${Math.round(sec / 60)}分`;
  const h = sec / 3600;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}時間`;
}

export function Swatch({ color }: { color: string }) {
  return <span className="swatch-dot" style={{ background: color }} aria-hidden="true" />;
}

/** グラフの上に出す説明（マウスを乗せる・タップする・キーボードで選ぶ） */
export function ChartTooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(200);
  useEffect(() => {
    if (ref.current) setW(ref.current.offsetWidth);
  });
  const left = Math.max(0, Math.min(width - w, x - w / 2));
  return (
    <div ref={ref} className="chart-tooltip" style={{ left, top: y }} role="status">
      {children}
    </div>
  );
}
