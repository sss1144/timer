import { Placeholder } from '../components/Placeholder';

export function RecordsScreen() {
  return (
    <>
      <header className="screen-header">
        <h1>記録</h1>
      </header>
      <Placeholder
        step={5}
        items={[
          '日ごとの記録一覧（前後の日に切り替え）',
          '記録の手動追加・編集・削除、メモ',
          '時間が重なる記録の警告',
        ]}
      />
    </>
  );
}
