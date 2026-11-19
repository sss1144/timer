import { Placeholder } from '../components/Placeholder';

export function TimerScreen() {
  return (
    <>
      <header className="screen-header">
        <h1>タイマー</h1>
      </header>
      <Placeholder
        step={4}
        items={[
          '残り時間・経過時間の大きな表示（ブラウザのタブ名にも表示）',
          'ポモドーロ / ストップウォッチの切り替え、開始・一時停止・再開・停止',
          '作業が終わったら自動で記録、終了時のメモ入力',
          '選択中のタスクと今日の合計時間',
          'アラーム音・通知、タイマー中は画面を消さない',
        ]}
      />
    </>
  );
}
