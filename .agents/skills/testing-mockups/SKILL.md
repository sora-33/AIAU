---
name: testing-mockups
description: How to run and UI-test the static HTML/CSS/JS mockups under mockups/ (AIAU 3-screen prototype), including mobile-width verification and known environment gotchas.
---

# AIAU モックアップの動作確認

## 配信（依存インストール・ビルド不要）
```bash
cd <repo>/mockups
python3 -m http.server 8321   # http://localhost:8321/index.html
```
- npm / build は一切不要。`common-data.js` にダミーデータが集約され、`screen1..3.js` が描画する。
- 同じサーバを再利用してテストする場合は必ず `Ctrl+Shift+R`（ハードリロード）でキャッシュを排除する。

## 画面構成
- `index.html` → 3画面へのカードリンク
- `screen1.html` アイデアボード（付箋 CSS Grid + チャット）
- `screen2.html` タイムラインプラン（投票・採用・変更履歴パネル）
- `screen3.html` カレンダー（日/週/月/アジェンダ、詳細パネル）
- 要件は `docs/requirements.md` と `docs/screen1-requirements.md`。

## スマホ幅（390px）の確認方法 — 重要
- **Chrome の OS ウィンドウは幅 500 CSS px 未満に縮められない**（`--window-size=390,900` / `xdotool windowsize` / `wmctrl` すべて無効。最小 ~532px に戻される）。
- そのため 390px の検証は DevTools のデバイスツールバーを使う:
  `F12` → `Ctrl+Shift+M` → Dimensions の幅欄に `390` を入力。
- 横はみ出しの機械的な判定は次のワンライナーが確実:
  ```js
  console.log(innerWidth, document.documentElement.scrollWidth);
  [...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+1)
  ```
  `.timeline-scroll` 内部（画面2）は意図的に横スクロールするので、ページ全体の `scrollWidth === innerWidth` を合否基準にする。
- 期待値: 画面1は `.note-list` が1列（`gridTemplateColumns` が単一値）、画面3は初期タブが「アジェンダ」。

## ドラッグ（並べ替え）の検証時の注意
- 実装は改訂され、現在は **placeholder 要素＋document レベルの `pointermove`/`pointerup`** 方式（掴んだカード自体は DOM 移動しない）。
  4番目→1番目のような複数ステップの移動と、挿入先の teal 破線プレースホルダーが視認できる。
- 旧実装は `setPointerCapture` 中に `insertBefore` で掴んだ要素を DOM 移動していたため、
  `lostpointercapture` でドラッグが即終了し「1つ隣までしか動かない／半透明・破線が出ない」症状になった。
  同種の症状を見たらまず「キャプチャ喪失」を疑う。
- 「ドラッグ中は半透明」を検証するときは、掴んだカードが `visibility:hidden` / `display:none` で
  **完全に見えなくなる実装**もありうる。押下中スクリーンショットで半透明が見えない場合、
  それが仕様（半透明）との齟齬なのか実装差なのかを DOM の computed style で確認して切り分ける。
- 検証手順: `left_mouse_down`（座標は直前の `mouse_move` で指定。`left_mouse_down` に coordinate は渡せない）→
  複数回の `mouse_move` → **ボタンを離す前にスクリーンショット** → `left_mouse_up` 後にもう1枚。

## コンソールエラーの取り方
- `browser_console`（ログ取得）は**未捕捉例外を表示しないことがある**。操作起因のエラーを確実に拾うには先に仕込む:
  ```js
  window.addEventListener('error', e => console.log('CAPTURED_ERROR:', e.message));
  ```
  その後 UI を操作して `browser_console` を再取得する。

## タイムライン（画面2）の位置・幅・重複の検証 — 重要
- `screen2.js` は 9:00–18:00 を 100% にマップして `left`/`width` を % 指定するが、`styles.css` の
  `.schedule-block { min-width: 160px; }` が効くため、**短い予定（〜74分未満）は時間より広く描画される**。
  結果として確定プラン行で隣の予定と重なることがある（例: 45分/15分の予定）。
  「時刻どおりの位置・重複なし」を確認するときは目視だけで済ませず、必ず実測する:
  ```js
  const t=document.querySelector('.timeline-row').lastElementChild, tr=t.getBoundingClientRect();
  const bs=[...t.querySelectorAll('.schedule-block')].map(b=>{const r=b.getBoundingClientRect();
    return {title:b.querySelector('h3')?.textContent, left:Math.round(r.left-tr.left), right:Math.round(r.right-tr.left)};});
  // 総当たりで overlap を計算して px で報告する
  ```
- AI提案（`proposalType:"gap"`）は投票UIなし・`noteId` なし・`votes` なしで、採用/却下のみ。
  却下すると行が消え、採用すると確定行に入る（状態は JS 変数なのでリロードで初期化）。

## 枠からのテキストはみ出しの検証（画面3の未定枠など）
- 目視では判断しにくいので `scrollHeight` と `clientHeight` を比較する:
  ```js
  const el=[...document.querySelectorAll('a')].find(a=>a.textContent.includes('未定：'));
  console.log(el.scrollHeight, el.clientHeight);  // scrollHeight > clientHeight ならはみ出し
  ```

## データ整合性はヘッドレスに確認できる
```bash
cd <repo>/mockups && node -e "global.window={};eval(require('fs').readFileSync('common-data.js','utf8'));
const d=window.AIAU_DATA;console.log(d.notes.length,d.messages.length,d.plans.length,d.calendarEvents.length);"
```
`window.AIAU_DATA` に `trip / messages / notes / plans / calendarEvents / history` が入っている。
プランの `noteId` が `notes` に存在するか、`calendarEvents` の時刻が `plans` と一致するかをここで突き合わせる。

## その他の環境上の制約
- `xdotool type` で**日本語（マルチバイト）が入力できない**。さらに `xclip` / `xsel` も未インストールで
  クリップボード経由の日本語入力もできない。フォーム入力のテストは ASCII 文字列（例 `TEST-...`）で行う。
- 日本語入力が必要なサジェスト絞り込みなどは、入力欄の `value` を JS で設定して `input` イベントを
  発火させ、候補件数の変化を DOM／スクリーンショットで確認する（ユーザー承認済みの代替手段）。
- `Ctrl+Shift+M`（デバイスツールバー）は**DevTools パネル側にフォーカスがある状態**で押すこと。
  ページ側にフォーカスがあると効かず、アドレスバー付近だと Chrome のプロフィールメニューが開くことがある。
- 復元・採用は `alert()` のモックなので、クリック後は必ず alert の OK を押してから次の操作に進む。
