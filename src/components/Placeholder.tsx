/** まだ作っていない機能の一覧（開発中だけ使う） */
export function Placeholder({ step, items }: { step: number; items: string[] }) {
  return (
    <section className="card placeholder">
      <h2>
        ステップ {step} で作るもの <span className="badge">準備中</span>
      </h2>
      <ul>
        {items.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
