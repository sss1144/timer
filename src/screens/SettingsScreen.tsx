import { Placeholder } from '../components/Placeholder';

export function SettingsScreen() {
  return (
    <>
      <header className="screen-header">
        <h1>設定</h1>
      </header>
      <Placeholder
        step={7}
        items={[
          'ポモドーロの時間・連続モード・止め忘れ確認の時間（ステップ 4）',
          '音・通知、週の始まり、日付の区切り時刻',
          'JSON / CSV / Markdown の書き出しと JSON の読み込み',
        ]}
      />
    </>
  );
}
