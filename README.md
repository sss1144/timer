# 作業記録タイマー

イラスト練習や学習など、個人の作業時間を記録して振り返るための Web アプリ（PWA）です。
データは使っている端末のブラウザ内だけに保存され、外部には送信されません。

- 公開 URL：https://sss1144.github.io/timer/
- 要件：[requirements.md](requirements.md)
- 開発計画と決定事項：[docs/plan.md](docs/plan.md)

## 使い方

- **Windows PC（Chrome / Edge）**：公開 URL を開き、アドレスバー右側の「インストール」アイコンからアプリとしてインストールできます。
- **iPad・iPhone（Safari）**：公開 URL を開き、共有ボタン →「ホーム画面に追加」で追加して、ホーム画面から起動してください。Safari で開いたままだと、しばらく使わないうちにデータが消えることがあります。

## 開発

Node.js 22 以上が必要です。

```bash
npm install
```

```bash
npm run dev
```

上のコマンドで開発用サーバーが起動します（http://localhost:5173/timer/）。

| コマンド | 内容 |
| --- | --- |
| `npm test` | 自動テスト |
| `npm run typecheck` | 型チェック |
| `npm run build` | 本番用ビルド（`dist/`） |
| `npm run preview` | ビルド結果の確認（http://localhost:4173/timer/） |

## 公開の仕組み

`main` ブランチに push すると、GitHub Actions がテストとビルドを行い、GitHub Pages に公開します（`.github/workflows/deploy.yml`）。

初回だけ GitHub 側の設定が必要です。

1. リポジトリを公開（public）にする：**Settings → General → Danger Zone → Change repository visibility**
2. **Settings → Pages → Build and deployment → Source** を「GitHub Actions」にする
