# 技術選定

3 画面（[requirements.md](requirements.md)）を実装するための技術スタックの選定と、その理由の記録。

## 選定方針

1. **確定要件に対応するライブラリは、スキャフォールド時点で一括インストールする。** 画面ごとのブランチで並行開発するため、途中で各自が依存を追加すると package-lock.json の競合が頻発する。使わなかったものを外す方が、後から足すより安い
2. **既製品が存在しない領域は自作し、既製品が要件と 1:1 で一致する領域は採用する。** ボード・タイムラインは前者、カレンダーは後者
3. **条件付きの項目は採用条件を明記し、条件が満たされるまで入れない。**

## 確定スタック（共通）

| 領域 | 採用 | 理由 |
| --- | --- | --- |
| ビルド | Vite | 確定済み。dev リロードが速い |
| UI | React 19 + TypeScript | 確定済み |
| バックエンド | Supabase (`@supabase/supabase-js` v2) | 確定済み。Postgres・Realtime・Auth・Edge Functions を使用 |
| ルーティング | react-router-dom v7 | 旅行一覧 / ボード / タイムライン / カレンダーの画面遷移と招待 URL 直接入場。画面数が少なく標準で十分 |
| 状態管理 | zustand | 「初回スナップショット取得 + Realtime 購読でストア更新」パターンに最適。旅行切替時のストアリセットも容易 |
| スキーマ検証 | zod | AI 出力（operations）の検証が本アプリの安全弁。フロントと Edge Function（Deno）で同一スキーマを共有できる |
| スタイリング | Tailwind CSS v4 (`@tailwindcss/vite`) | 設定ファイル不要。カスタム UI（ボード・カード・チャット）中心の構成に合う |
| UI 部品 | shadcn/ui — **dialog / dropdown-menu / sonner / button の 4 つのみ** | ライブラリではなくコードコピー方式。モーダルのフォーカストラップ・ドロップダウンのキーボード操作・トースト管理を自作しないための採用。「shadcn で画面を作る」のではない |
| アイコン | lucide-react | 軽量・tree-shaking 対応 |
| 日付処理 | date-fns | 週の開始日・期間の重複判定（衝突検知）・履歴の日付グルーピングなど、画面 2・3 で実際の日付演算が発生する |
| テスト | Vitest | LLM フィクスチャテスト（画面 1 要件 6 章）と操作適用ロジックのユニットテスト。Vite と設定を共有 |
| PWA | vite-plugin-pwa | 方針 1 に従い最初から導入。**本番ビルドのみ有効**（devOptions 既定値 = dev では SW を登録しないため、開発中のキャッシュ事故は起きない）。`registerType: 'autoUpdate'` で利用者が古いキャッシュに固定されるのを防ぐ。第 2 段階のオフライン閲覧はここに runtime caching を足すだけ |
| 開発ツール | Supabase CLI | マイグレーション管理 + Edge Functions のローカル実行 |
| Lint / Format | oxlint | Vite テンプレートの既定（現行テンプレートは ESLint ではなく oxlint を同梱）を維持し、設定に時間を使わない |

## 画面別の追加ライブラリ

### 画面 1（アイデアボード + チャット）: 追加なし

- ボードは**絶対配置の div + pointer events** で自作（[screen1-requirements.md](screen1-requirements.md) 1 章で確定済み）
- ドラッグは pointerdown / move / up 約 30 行。移動中は broadcast（スロットル）、確定時のみ DB 保存
- 整列・移動アニメーションは CSS transition 1 行

### 画面 2（タイムラインプラン）: 追加なし

- タイムラインは「時刻 → px」変換 + 絶対配置で自作。ボードと同じパターンで、横軸が時間になるだけ
- 予定の移動・時間の伸縮は pointer events + 左右のリサイズハンドル（小さな div 2 つ）
- 変更履歴は `plan_versions` テーブル（jsonb スナップショット）+ **予定 ID 基準の構造比較**で差分を自作。テキスト diff ではないため diff ライブラリは不要
- 投票は Supabase テーブル + Realtime 集計。UI は button + badge のみ

### 画面 3（カレンダー）: ここで初めて大きなライブラリを採用

| 採用 | 理由 |
| --- | --- |
| **FullCalendar**（`@fullcalendar/react` + daygrid / timegrid / list / interaction） | 要件の 4 ビューがプラグインと 1:1 対応（日・週 = timegrid、月 = daygrid、アジェンダ = list）。ドラッグ移動・時間の伸縮・終日予定の別枠表示が interaction プラグインで標準対応。必要な範囲はすべて MIT ライセンスで無料 |
| **ics**（npm） | ics エクスポート。自前の文字列組み立てはタイムゾーン・エスケープの罠が多い |

**ボードは 0 でカレンダーは採用する非対称の根拠**: ボードは自由形式で既製品が存在しない。カレンダーは標準化されたグリッド + 深い操作慣習（月グリッドの溢れ処理・週ビューの重なり配置・終日行・ドラッグスナップ）の塊で、自作すると数週間かかる。「既製品がない場所は自作、要件と正確に一致する場所は採用」で方針は一貫している。

## Edge Functions（Deno）

- LLM 呼び出しは公式 SDK を `npm:` specifier で利用、または fetch 直叩き。**モデル未定のため、呼び出し部は薄いアダプタに分離**する
- zod スキーマ（operations 契約）をフロントと共有し、入出力検証を二重化する

**LLM モデルの選定基準**（候補: GPT-4o-mini / Claude Haiku / Gemini Flash 級）

1. Structured Output（JSON スキーマ強制）対応 — 画面 1 の操作ベース反映の成否を左右する
2. 日本語チャットの理解力
3. 応答速度（デバウンス後 2〜3 秒以内）

画面 1 要件 6 章のフィクスチャテストのスキーマ遵守率で決定する。

## 通知の方針

- **アプリ内通知（Realtime + sonner）を採用。** プラン変更通知は計画中＝アプリを開いている場面が主のため、これで要件を満たす
- **当日リマインドは ics 経由で端末標準カレンダーに委任する。** 自前実装なしでリマインドが成立する
- **Web Push は不採用。** service worker + 購読管理 + 配信サーバが必要で数日規模。iOS はホーム画面へのインストールが前提となり利用障壁が高い。必要になった場合は PWA 化とセットで再検討

## 条件付き・段階的項目（今は入れない）

| 項目 | 採用条件 | 備考 |
| --- | --- | --- |
| オフライン閲覧の runtime caching | 第 2 段階の「オフライン閲覧」要件が確定した場合 | vite-plugin-pwa 自体は最初から導入する（確定スタック参照）。データのキャッシュ戦略（何をどこまでオフラインで見せるか）だけを要件確定後に設計する |
| Google カレンダー双方向同期 | 第 2 段階 | 追加パッケージ不要の見込み。Supabase Auth の Google プロバイダ（calendar scope）+ Edge Functions から REST 呼び出し。googleapis SDK は Deno で重いため使わない |
| TanStack Query | 履歴一覧・プレビュー等のリクエスト / レスポンス型取得が増えて負担になった場合、その範囲に限定して再検討 | Realtime 中心の状態は「スナップショット + 購読」で zustand に一本化する。Query キャッシュと Realtime の二重管理を避ける |

## 不採用リスト

| 不採用 | 理由 |
| --- | --- |
| MUI | Emotion（CSS-in-JS）ベースで Tailwind と二重体系になる。Material ルックの剥がし作業が純損失。カスタム比重の大きい本アプリに不向き |
| dnd-kit / react-dnd | 「リスト並べ替え・ドロップゾーン」用途であり、自由配置ボードには不適合。ドラッグは pointer events 約 30 行で足りる |
| tldraw / Konva / Excalidraw | カスタムカード 4 種に図形クラス体系を合わせるコスト > div 直接実装のコスト。無限キャンバス・手描き等の強みを使わない |
| Redux | 過剰 |
| socket.io / 自前 WebSocket | Supabase Realtime がその役割 |
| react-hook-form | フォームがチャット入力 + 付箋編集数フィールドのみ。制御コンポーネントで十分 |
| moment / dayjs | date-fns に統一 |
| uuid パッケージ | `crypto.randomUUID()` で足りる |

## 横断的な未決事項（チーム判断が必要）

**認証方式**: 画面 3 の案 C（個人予定・外部カレンダー連携・端末間の連続性）は**匿名 Auth と両立しない**（匿名はブラウザ単位の身元のため）。Google ログインが有力候補 — カレンダー連携に必要な Google OAuth とログインを統合できる。現実的な経路: 画面 1 の開発は匿名 Auth で進め、Supabase が公式サポートする**匿名 → 正式アカウント昇格**で移行する。

## セットアップコマンド

本ドキュメントのレビュー・マージ後、スキャフォールド PR で以下を実行する。以後の開発参加者は `npm install` だけでよい。

```bash
npm create vite@latest aiau-app -- --template react-ts
cd aiau-app

# 依存は最初に一括インストール（方針 1）
npm i @supabase/supabase-js react-router-dom zustand zod lucide-react date-fns \
      @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid \
      @fullcalendar/list @fullcalendar/interaction ics
npm i -D tailwindcss @tailwindcss/vite vitest vite-plugin-pwa

# shadcn/ui（4 部品のみ）
npx shadcn@latest init
npx shadcn@latest add dialog dropdown-menu sonner button

# Supabase CLI（Supabase 担当のみ）
brew install supabase/tap/supabase
supabase init
```

> FullCalendar は react コネクタ含め **v6 系で統一**する（v7 はプラグイン側が RC 段階のため）。

> 認証情報・API キーは `.env.local` で管理し、コミットしない。service role key・LLM API キーは Edge Function のシークレットにのみ置く。
