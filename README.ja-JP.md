![](/public/og-image.png)

[English](./README.md) | [简体中文](README.zh-CN.md) | 日本語

***リアルタイムで最新のニュースをエレガントに読む***

> [!NOTE]
> 本バージョンはデモ版であり、現在中国語のみ対応しています。カスタマイズ機能や英語コンテンツをサポートした正式版は後日リリース予定です。
> このプロジェクトは [ourongxing/newsnow](https://github.com/ourongxing/newsnow) からフォークされました

## 機能
- 最適な読書体験のためのクリーンでエレガントなUIデザイン
- トレンドニュースのリアルタイム更新
- GitHub OAuthログインとデータ同期
- デフォルトのキャッシュ期間は30分（ログインユーザーは強制更新可能）
- リソース使用を最適化し、IPブロックを防ぐためのソース更新頻度に基づく適応型スクレイピング間隔（最短2分）
- MCPサーバーをサポート

```json
{
  "mcpServers": {
    "newsnow": {
      "command": "npx",
      "args": [
        "-y",
        "newsnow-mcp-server"
      ],
      "env": {
        "BASE_URL": "https://newsnow.your.domain"
      }
    }
  }
}
```
`BASE_URL`を自分のドメインに変更できます。

### 新機能
- 個別のソースごとにプロキシ設定をサポート
- より多くのコンテンツソースをサポート

## デプロイ

### 基本デプロイ
ログインとキャッシュ機能なしでデプロイする場合：
1. このリポジトリをフォーク
2. Cloudflare PagesやVercelなどのプラットフォームにインポート

### Cloudflare Pages設定
- ビルドコマンド：`pnpm run build`
- 出力ディレクトリ：`dist/output/public`

### GitHub OAuth設定
1. [GitHub Appを作成](https://github.com/settings/applications/new)
2. 特別な権限は不要
3. コールバックURLを設定：`https://your-domain.com/api/oauth/github`（your-domainを実際のドメインに置き換え）
4. Client IDとClient Secretを取得

### 環境変数
`example.env.server`を参照。ローカル開発では、`.env.server`にリネームして設定し、Dockerでデプロイする場合はコンテナに環境変数を設定：

```env
# GitHub Client ID
G_CLIENT_ID=
# GitHub Client Secret
G_CLIENT_SECRET=
# JWT Secret（通常はClient Secretと同じ）
JWT_SECRET=
# データベース初期化（初回実行時はtrueに設定）
INIT_TABLE=true
# キャッシュを有効にするかどうか
ENABLE_CACHE=true
# ProductHunt API Token
PRODUCTHUNT_API_TOKEN=
# 環境変数プロキシ設定を有効にするかどうか
NODE_USE_ENV_PROXY=
# HTTPプロキシアドレス
HTTP_PROXY=
# HTTPSプロキシアドレス
HTTPS_PROXY=
# プロキシアドレス（フォールバック）
PROXY=
```

### データベースサポート
対応データベースコネクタ： https://db0.unjs.io/connectors
このプロジェクトではCloudflare PagesとDockerデプロイを推奨しています。Vercelでは自分でデータベースを処理する必要があります。

1. Cloudflare WorkerダッシュボードでD1データベースを作成
2. `wrangler.toml` に `database_id` と `database_name` を設定
3. `wrangler.toml` が存在しない場合、 `example.wrangler.toml` をリネームして設定を変更
4. 次回デプロイ時に変更が反映

### Dockerデプロイ
Dockerデプロイの場合、自分でイメージをビルドするか、Docker Hubの公開リリースバージョン kayparavel/newsnow-kayparavel:latest を参照できます。プロジェクトルートディレクトリにymlファイルがあればよく、同じディレクトリでdocker-composeを実行：
- **ローカルDockerデプロイ**：`example.docker-compose.local.yml`を参照
- **クラウドDockerデプロイ**：`example.docker-compose.yml`を参照

```sh
docker compose up
```

yml設定を通じて環境変数を設定することもできます。

## 開発
> [!TIP]
> Node.js >= 20が必要

```sh
corepack enable
pnpm i
pnpm dev
```

`shared/sources` と `server/sources` ディレクトリを参照。プロジェクトは完全な型定義とクリーンなアーキテクチャを提供します。

## ロードマップ
- **データソース**を拡張し、多言語のグローバルニュースをカバー
- **自動更新**を追加し、ニュースコンテンツを自動的に取得・記録
- **NLP分析**を追加し、即時かつ便利なホットスポット通知と明確で簡潔な日次要約機能を提供

## コントリビューション
コントリビューションを歓迎します！機能リクエストやバグレポートのために、プルリクエストやイシューの作成をお気軽にどうぞ。

## ライセンス
[MIT](./LICENSE) © ourongxing, kayparavel

## スポンサー
このプロジェクトが役に立ったら、猫におやつを買ってあげてください。カスタマイズやその他のヘルプが必要な場合は、以下の方法で備考を添えてご連絡ください。

[kayparavel](./screenshots/wechatpay-kayparavel.png)
[kayparavel](./screenshots/alipaypay-kayparavel.jpg)
![](./screenshots/reward.gif)
