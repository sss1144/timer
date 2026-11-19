import { Placeholder } from '../components/Placeholder';

export function TasksScreen() {
  return (
    <>
      <header className="screen-header">
        <h1>タスク</h1>
      </header>
      <Placeholder
        step={3}
        items={[
          'プロジェクト（名前・色）の追加・編集・アーカイブ',
          'タスク（見積もりポモドーロ数・期限・メモ）の追加・編集・完了・削除',
          '実績ポモドーロ数 / 見積もりと合計作業時間',
          '未完了 / 完了済み、プロジェクト別の絞り込み',
          'タスク一覧からタイマーを開始',
        ]}
      />
    </>
  );
}
