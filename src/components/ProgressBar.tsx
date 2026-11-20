/** 進み具合のバー（ratio は 0〜1） */
export function ProgressBar({ ratio, color }: { ratio: number; color: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <span className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span className="progress-fill" style={{ width: `${pct}%`, background: color }} />
    </span>
  );
}
