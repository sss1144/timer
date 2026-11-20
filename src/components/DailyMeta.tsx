import type { DailyProgress } from '../db/daily';
import { displayColor } from '../lib/colors';
import { formatDuration } from '../lib/time';
import { ProgressBar } from './ProgressBar';

/** 毎日のタスクの今日の「実績 / 予定」、進み具合のバー、達成の印 */
export function DailyMeta({ progress }: { progress: DailyProgress }) {
  return (
    <span className="daily-meta">
      <span className="daily-nums">
        今日 {progress.actualSec >= 60 ? formatDuration(progress.actualSec) : '0分'} / {formatDuration(progress.planSec)}
      </span>
      <ProgressBar ratio={progress.ratio} color={displayColor(progress.project?.color)} />
      {progress.achieved && <span className="achieved">✓ 達成</span>}
    </span>
  );
}
