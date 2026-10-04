# EXCEL QUEST OS｜実務Excelスピード学習システム

> 仕事を解決していたら、Excelが速くなっていた。

ショートカットを暗記させる研修ではなく、実務に近い課題を解く中で「この仕事なら、この操作」を判断・実行できる力を身につける **Just-in-Time 型 Excel Performance Support System**（要件定義 FINAL v2.0 準拠の MVP）。

```
DIAGNOSE → EXPERIENCE → DISCOVER → USE → RETRY → APPLY → RETAIN
```

## 起動

ビルド不要の静的サイトです。`index.html` をブラウザで開くか、任意の静的サーバーで配信します。

```bash
npx http-server -p 8123 .      # → http://localhost:8123/
```

GitHub Pages 等にそのまま置けます。記録はブラウザの localStorage にのみ保存し、サーバー送信はありません。

## Journey（実装済み）

| 段階 | 画面 | 内容 |
|---|---|---|
| ENTRY | ホーム | 「あなたのExcel、何秒速くできる？」→ ボタン1つで即操作開始 |
| LEVEL 0 | 60 SECOND SPEED CHECK | 5,000行で 移動／選択／検索／一括修正／合計／絞込 の6工程を自由操作（マウス可・各15〜20秒で自動的に次へ） |
| AHA | 1問目直後 | 「12.8秒 → 0.6秒」を同じ仕事で実測比較（Time to First Speed-Up を記録） |
| BOTTLENECK | 診断 | 6カテゴリを 🟢🟡🔴 で表示 →「今日は3つだけ」を自動推薦 |
| 3層学習 | ハブ | ⚡FAST（今日の3技）／🎮PRACTICE（他技能・再挑戦）／🏆CHALLENGE（FINAL） |
| MISSION | 各技能 | JOB → FREE ACTION → FEEDBACK → DISCOVERY → RETRY（別データ）→ SELF SUCCESS |
| HINT | 各MISSION | 考え方 → 方向 → ANSWER の3段階。答えを見たことは習得扱いにしない |
| REAL EXCEL TRAP | RETRY | 空白セルで止まる／選択範囲内だけ検索／部分一致置換（A-010）／オートSUMが空白で止まる／シート最下部 |
| FINAL | 16:00 DEADLINE | 15:55 上司の依頼、05:00 カウントダウン。問題文にキー名なし。時間超過しても最後まで可 |
| BEFORE / AFTER | 結果 | SPEED CHECK と FINAL を同じ6工程・同じ行数で比較。両方完了した工程のみ比較し、条件が揃わなければ比較しない |
| SPEED CARD | 終了時 | 得意／次に伸ばす／明日使う3技。印刷・PDF・テキストコピー |
| NEXT DAY | 翌日ホーム | 「昨日の3技、1つ使えた？」✓／△／?。忘れた技は30秒復習へ |
| 30 SECOND RESCUE | いつでも | 困りごと7種 → JOB → KEY → 10秒デモ → 注意点 → Excelで試す |
| 1 WEEK LOOP | 7日後ホーム | 今週使った技能 → 次の1技を追加（3 → 定着 → +1） |
| 記録 | KPI | Time to First Speed-Up ほか全KPI、技能状態、JSON書き出し、翌日/1週間後の日付シミュレーション |

## 習得判定（要件12）

`NEW → DISCOVERED（×表示した）→ PRACTICED（△一度成功）→ INDEPENDENT（○ヒントなしで別データでも再現）`

スマホでの操作結果はスキル判定に使いません（要件24）。

## Excel シミュレーター

研修対象操作だけを再現しています（Excel の完全再現はしていません）。

- セル選択・行列選択・ドラッグ選択（自動スクロール付き）・Shift+クリック・ホイール・スクロールバー
- `Ctrl+矢印` / `Ctrl+Shift+矢印`（空白セル・フィルター非表示行を考慮）、`Ctrl+Home/End`、`Ctrl+A`、`PageUp/Down`
- 入力・`F2`・`Delete`・`Ctrl+Z`・`Ctrl+C/V`・`Ctrl+D/R`
- 検索と置換ダイアログ（`Ctrl+F` / `Ctrl+H` / `Alt+A` / 完全一致オプション / 選択範囲内検索）
- オートフィルター（`Ctrl+Shift+L` / `Alt+↓` / 値リスト・検索）
- オートSUM（`Alt+=`、範囲の点線表示）と簡易数式（SUM / AVERAGE / COUNT / MAX / MIN / SUBTOTAL）
- ステータスバー集計、操作履歴、ショートカット検知
- マウス用ルート：リボンの「検索・置換・フィルター・オートSUM・元に戻す」

Mac では `⌘` を `Ctrl` として扱います。

## 計測について

- **実測値**：タスク時間（ダイアログ閲覧中は停止）、マウス操作数、キー操作数、ショートカット使用数、ヒント段階
- **推定値**：「ショートカットなら 約○秒相当※」は慣れた場合の目安として明示し、実測と同じ欄に並べません
- 根拠のない「年間○時間削減」は表示しません

## ACCEPTANCE GATE 対応

| # | 要件 | 実装 / 確認 |
|---|---|---|
| 1 | 初見10秒以内に操作開始 | ホームのボタン1つでシミュレーター表示（E2E で確認） |
| 2 | 60秒以内に Speed-Up | 1問目直後の AHA。KPI として記録 |
| 3 | 3分で1技能 | FAST＝今日の3技。途中終了でも SPEED CARD 作成可 |
| 4 | マウスでも進行 | 全6工程をマウスで達成可能（リボン・スクロールバー・Shift+クリック・ドロップダウン） |
| 5 | Shortcut 検知 | キーイベントから技能IDを判定し操作履歴に ⚡ 表示 |
| 6 | 段階 Hint | 3段階。HINT 3 のみキー表示 |
| 7 | ヒントなし再現 | 別データの RETRY で INDEPENDENT 判定 |
| 8 | REAL EXCEL TRAP | 5種。DISCOVERY として表示（減点なし） |
| 9 | FINAL が暗記問題でない | 問題文にキー名なし。操作選択も評価対象 |
| 10 | Before/After | 同等条件で比較、条件不一致は比較しない |
| 11 | 明日使う3技 | SPEED CARD で自動生成 |
| 12 | RESCUE 再訪 | 常設ナビ＋SPEED CARD／翌日チェックから誘導 |
| 13 | 誤操作で停止しない | 例外を握り、Ctrl+Z・最初から・スキップを常設（ランダム打鍵テストあり） |
| 14 | 実測と推定を混同しない | 表示・保存ともに分離 |

## テスト

```bash
npm test                         # シートモデルの単体テスト（Node）
npx http-server -p 8123 . &      # E2E は Playwright が必要
npm run e2e
```

E2E は SPEED CHECK → AHA → BOTTLENECK → MISSION（TRAP含む）→ FINAL → BEFORE/AFTER → SPEED CARD → NEXT DAY → 1 WEEK → RESCUE を実際のキー操作で通します。

## 構成

```
index.html
css/app.css            デザイン（#1b2838 濃紺 / #f2b705 安全黄 / #2f6fa8 調査青）
js/sheet.js            シートモデル（Ctrl+矢印・検索置換・フィルター・オートSUM・数式・データ生成）
js/sim.js              Excel シミュレーター（DOM・キーボード・マウス・ダイアログ）
js/content.js          技能・MISSION・ヒント・TRAP・RESCUE・10秒デモ定義
js/store.js            記録・習得判定・KPI・効果音
js/app.js              画面と Journey
assets/img/            素材パックのマスター画像から切り出したキャラクター・アイコン・背景
assets/sfx/            効果音（初期 SOUND OFF・BGMなし）
design/asset-pack/     受領した素材パック一式（参照用）
design/scene-pack/     受領したシーン画像パック一式（参照用）
tests/                 単体テスト・E2E
```

## 素材について

**シーン画像パック（SCENE IMAGES FINAL）の使用箇所**：トップのメインビジュアル（01）、FINAL の上司（11）、BEFORE/AFTER のエンディング（13・速くなった場合のみ成長メッセージを表示）、サポートキャラクターの表情とポーズ（04・16）、落とし穴の DISCOVERY ロボット（08）、RESCUE のロボットとナビゲーター（07・14）、AHA のナビゲーター（02）。個別の切り出し画像には隣のパネルの一部が写り込んでいたため、`00_MASTER_STORYBOARD.png` から同じ部分を切り直しています。画面サンプルの UI 部分（03・05・06・09・10・12・15）は実装の参照にとどめ、文字は HTML で描画しています。

素材パック README の方針どおり、UI のテキスト・ボタンは HTML/CSS で実装し、画像はキャラクター・アイコン・背景・メインビジュアルにのみ使用しています。画面サンプル・UIテンプレート・デモフレームは実装の参照として使い、ラスター画像のままは使っていません。AI ナレーション（外部リンク3本）は任意要素のため未組み込みで、文言はナビゲーターのセリフに反映しています。

元画像の解像度が低い（マスター 1536×1024）ため、メインビジュアルは最大約620px幅で表示しています。高解像度版があれば `assets/img/` を差し替えるだけで反映されます。
