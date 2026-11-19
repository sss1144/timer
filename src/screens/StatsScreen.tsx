import { Placeholder } from '../components/Placeholder';

export function StatsScreen() {
  return (
    <>
      <header className="screen-header">
        <h1>統計</h1>
      </header>
      <Placeholder
        step={6}
        items={[
          '日・週・月の切り替えと前後の期間への移動',
          '合計（作業時間・完了ポモドーロ数・完了タスク数）',
          '日ごとの推移（プロジェクトの色で積み上げ）',
          'プロジェクト別・タスク別の内訳',
          '1日のタイムライン',
        ]}
      />
    </>
  );
}
