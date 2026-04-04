# YouTube投稿管理システム & LinkStock

## プロジェクト概要
YouTube動画の制作進捗を管理するダッシュボードと、リンクを整理できるLinkStock、編集者管理を備えた静的Webアプリです。ブラウザから直感的に動画の進捗・予定・編集者・予算を整理し、リンクの保存と検索を効率化します。

## ゴール
- 動画制作の進捗を可視化し、制作フローを効率化する
- 重要なリンクを簡単に保存・検索・整理できるようにする
- 編集者・予算の情報をリンクと紐づけて管理する
- シンプルでモダンなUIで操作性を高める

## 現在完了している機能
### 📺 YouTube投稿管理
- ステータス（計画中/収録中/編集中/レビュー中/公開済み）による進捗管理
- 動画一覧表示（サムネイル・タイトル・編集者・予算・進捗・公開予定日）
- ステータス別フィルタ、編集者フィルタ、キーワード検索
- Tables API接続エラー時の通知表示と安全な初期化
- 動画情報の追加/編集/削除
- 編集者（複数選択）と予算の管理
- 台本モーダル（構成セクション分割・参考URL常時表示）
- 月次予算サマリー
- 進捗率の自動計算
- サムネイルURLのプレビュー
- クリップボードへの情報コピー

### 🔗 LinkStock
- リンクの追加/編集/削除
- 編集者（複数選択）と予算の管理
- 編集者フィルタ・検索
- お気に入りフラグ
- 月次予算サマリー
- 検索/フィルタリング（全件/お気に入り）
- クリック回数・最終アクセス日時の記録

### 👥 編集者管理
- 編集者の追加/編集/削除
- 役割・権限・表示順・メモ・稼働ステータス管理
- 並び替え（上下ボタン）
- YouTube/LinkStockの編集者選択リストに連動

### 🔎 検索除外対応
- `noindex` / `nofollow` メタタグの追加（index.html / links.html / editors.html）
- `robots.txt` の追加（全クロール抑止）

### 📱 モバイル表示改善
- スマホ時の文字サイズ・見出しサイズを拡大し、可読性を向上
- YouTube一覧をカード表示（テーブルヘッダー非表示＋ラベル付与）
- ナビボタンの文字サイズ/余白を拡大

## 現在の機能エントリURI
### ページ
- `/index.html` - YouTube投稿管理ダッシュボード
- `/links.html` - LinkStock（リンク管理）
- `/editors.html` - 編集者管理

### RESTful Table API
- `GET /tables/youtube_videos`
- `GET /tables/youtube_videos/{id}`
- `POST /tables/youtube_videos`
- `PUT /tables/youtube_videos/{id}`
- `DELETE /tables/youtube_videos/{id}`

- `GET /tables/links`
- `GET /tables/links/{id}`
- `POST /tables/links`
- `PUT /tables/links/{id}`
- `DELETE /tables/links/{id}`

- `GET /tables/editors`
- `GET /tables/editors/{id}`
- `POST /tables/editors`
- `PUT /tables/editors/{id}`
- `DELETE /tables/editors/{id}`

## 未実装の機能
- アクセス制限（ログイン/認証）
- サムネイルや動画ファイルのアップロード（サーバー機能が必要）
- 複数ユーザーの権限に応じたページ閲覧制御（サーバー機能が必要）

## 推奨される次のステップ
- 認証付きのホスティング（Basic認証/Google Workspace など）への移行検討
- 進捗/予算/台本のチャート表示
- 月次予算のCSVエクスポート（要サーバー機能）
- 編集者ごとの稼働状況や予算消化の可視化

## 公開URL
- 本番URL: 未設定（**Publishタブ**で公開すると発行されます）
- APIエンドポイント: `/tables/*`（同一オリジン）

## データモデル
### youtube_videos テーブル
- `id`: text
- `title`: text
- `description`: rich_text
- `status`: text（planning/recording/editing/review/published）
- `progress`: number
- `thumbnail_url`: text
- `video_url`: text
- `scheduled_date`: datetime
- `editors`: array
- `budget`: number
- `script_sections`: array
- `script_reference_url`: text
- `views`: number
- `likes`: number
- `comments`: number
- `notes`: rich_text

### links テーブル
- `id`: text
- `title`: text
- `url`: text
- `description`: rich_text
- `editors`: array
- `budget`: number
- `is_favorite`: bool
- `click_count`: number
- `last_accessed`: datetime
- `notes`: rich_text

### editors テーブル
- `id`: text
- `name`: text
- `role`: text
- `permissions`: text
- `sort_order`: number
- `notes`: rich_text
- `active`: bool

## データ保存・利用サービス
- RESTful Table API（ブラウザからCRUD操作）

## ファイル構成
```
/
├── index.html
├── links.html
├── editors.html
├── robots.txt
├── js/
│   ├── app.js
│   ├── links.js
│   └── editors.js
└── README.md
```
