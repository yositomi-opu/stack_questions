# 開発引き継ぎ

更新日: 2026-09-12

この文書は、別のMac・別の開発者・新しいCodexタスクでも開発を再開するための現在地です。作業開始時に読み、作業終了時に更新してください。継続的な開発ルールは [AGENTS.md](AGENTS.md)、利用方法は [WebApp README](app/mcq-webapp/README.md) を参照してください。

## 現在の対象と状態

- 主な開発対象: `app/mcq-webapp`（CSV/XLSXや編集画面からMoodle STACK用の多肢選択問題XMLを生成）。
- 直近の変更: インポート前の問題プレビューを追加。STACK APIで描画・採点し、編集時点のパラメータとinclude内容を反映。コミット・送信状態は `git log` と `git status` で確認すること。
- 最新版をNextcloud外へ新規cloneして `make setup` を実行し、利用者からセットアップ完了・WebAppの起動成功の報告あり。
- 日本語サンプルCSVを `app/mcq-webapp/samples.ja` 直下へ統合。看護学の重複10件をNUR識別子へ統一し、全6分野60問を収録。

## 直近の変更と決定事項

- プレビューのサブパス修正: 新機能だけ `fetch("/api/stack/...")` でサイト直下へ送っていたため、Moodle配下の公開構成でHTMLの404等をJSONとして解析していた。既存の `webappUrl()` を使用し、描画・採点とも公開パスを保持するよう修正。HTML応答はHTTP状態と再起動／ログイン確認の案内を表示する。プレビューJSのキャッシュ番号も更新。
- この修正の検証: `node scripts/tests/test_preview_ui.cjs` でサイト直下・`/mcq-webapp/`・`/moodle/mcq-webapp/` の描画／採点URL、HTML 404・ログインへの転送・既存JSONエラーを模擬応答で確認。JS構文と差分検査成功。利用者の実サーバーでの再確認は未実施。

- プレビュー追加: 上部ボタンから独立したダイアログを開く。`preview.js` は明示操作時だけAPI／数式表示を利用し、編集・保存のイベントを置き換えない。Radio/Checkbox回答、得点、PRTフィードバック、全般的解説、乱数の種の切替に対応。日英UI対応。
- `previewQuestionSnapshot()` は保存用XML生成後のコピーに、パラメータ→編集中のinclude本体を組み込む。プレビュー専用サーバー処理はローカルの共通includeを展開し、指定seedのdeployedseedを補う。描画後の展開済みXMLをクライアントへ返し、採点・別seedの表示にも同じコピーを使う。CSV・保存XML・共有ファイルには影響しない。
- `/api/stack/preview` と `/api/stack/grade` を追加。接続先制限は既存APIと共通。includeのリポジトリ外参照／非公開ファイル／循環を拒否。描画・採点用JSONのみ最大4 MiB（展開済みXML往復用）、既存APIは512 KiBを維持。画像はサーバー経由でdata URLにして返す。
- 問題HTMLはスクリプト無効のsandbox iframeへ表示。MathJax 3.2.2のSVG版とApache 2.0ライセンスを同梱し、外部CDNは不要。JSXGraph等の対話型iframeは未対応として明示エラー。Moodleテーマとの見た目の完全一致は対象外。
- プレビュー検証: Python単体17件、Nodeの既存XML・候補数・パラメータ／保存XML非変更・プレビュー回答／プレースホルダーの回帰テストを実施。実APIで天体Radioとrank 0/1/2のCheckboxをseed 1/2で描画し、8通りすべて模範解答100%を確認。展開済みコピーでの採点も確認。
- 実ブラウザ: 日英UI、Radio正答100%／誤答0%と解説、既存rank 2 XMLのCAS評価→行列の数式表示→Checkbox満点、パラメータだけrank 1へ変更→再評価→問題文／選択肢の反映、seed入力直後の採点無効化、回答変更時の得点／解説消去、API接続先エラー後も生成XMLと保存操作が利用可能なことを確認。静的プロット画像、対話型図、Ubuntu実機での確認は未実施。

- ルートREADMEを日英とも一般利用者向けに再構成。AI翻訳プロンプトと個別変数名への注意、未確定の公開・一括変換予定を削除。導入・サンプル・問題作成・多言語対応・管理者向けガイド・開発参加への導線を整理し、翻訳時のコード保持ルールはAGENTS.mdへ移動。
- README整理の検証: 日英の内容対応、相対リンクの参照先、Markdownコードブロックの対応、差分チェックを確認。文書のみの変更のためアプリのテストは再実行していない。

- パラメータ欄: 問題文の上へ追加。既存XMLのメイン `stack_include` 前の任意の設定・コメントを復元する。XML側の選択肢数・正解数をinclude先の既定値より優先して画面に設定し、それ以外をパラメータへ分離。対応できない選択肢設定式は黙って破棄せずエラーにする。
- 実行・出力順は「画面の選択肢設定 → パラメータ → 問題変数本体／stack_include」。共有include出力に個別パラメータを埋め込まない。既存includeの既定値もvariant設定で上書きしない。
- XMLメタデータの `parameters` とCSVの `config,parameters` で再編集可能。旧データは空欄扱い。ローカル評価とCAS検証用コピーにも先行設定を適用する。
- 正解数候補の重複は抽選の重みとして保持する（`rand([2, 3, 4, 4])` を重複排除しない）。

- 初期文言: タイトル例は `MCQ_sampleXYZ`。初期問題・同梱CSV・天体XMLは「次の恒星・惑星・衛星に関する主張について正しいものを __SELTYPE__。」を使用し、英語も語順を合わせる。固定真偽モードのCSV見本は方程式の解に関する文言を使用。「？」とREADMEに `__SELTYPE__`（選択動作）と `__SELPROMPT__`（指示文全体）の違い、誤り・rankを条件にする例を記載。既存60問などが使う `__SELPROMPT__` の置換仕様は維持。
- 文言変更の検証: JS構文検査・既存XML読込の回帰テスト・差分チェックが成功。ブラウザでの確認は今回未実施。

- 候補数の修正: `updateOptionLimit` が未評価の各CASリストを1件と数え、読込済みの選択肢数を2などへ自動変更していた。未評価／再評価待ち／評価失敗のリストがある間は入力上限を未確定とし、評価後は実際の合計を上限に設定。入力値は自動変更せず、候補不足は生成時に検証する。
- XML読込時は前の問題のCAS評価結果をクリアし、行番号が同じ別問題の評価結果を候補数へ流用しない。

- Ubuntuで更新後もCASリスト表示にならないとの報告。XML名・画面URL・コミット番号は未確認で、利用者環境の原因は未確定。前回のJS/CSS/翻訳更新でキャッシュ用URLの番号が据え置きだったため更新し、ローカルサーバーのHTML/JS/CSS応答へ `Cache-Control: no-cache, must-revalidate` を追加。
- 実ブラウザで `001/001.GaussElimElemMatOp-A-rb.xml` をファイル選択から読み込み、ローカルinclude経由で `ListAL1`・`ListBL1`・`ListBL2` がすべて「CASリスト式」と表示されることを確認。検証環境のMaxima評価は失敗しており、評価成功までは確認していない。

- 既存XML読込: 再編集用メタデータのないXMLの `%__CoptL1`／`%__Copt1L` などと対応するW候補は、代入された候補リスト全体を1行の `cas_list` として復元。リスト要素を個別の `cas` に分解せず、`map(...)` 内の角括弧や添字を代入式本体と誤認しない。多言語の各候補リスト・フィードバック、および旧ランダム化XMLのパターン分割を維持する。メタデータ付きXMLは従来どおり保存済みの型を優先。

- サンプル統合: 旧 `samples/SampleNurse001.csv`〜`SampleNurse010.csv` はNUR各問と問題ID以外が同一であることを確認し、重複を解消。旧 `samples/applied-ja` のCSV・README・スクリプトを `samples.ja` へ移動。XMLサンプルは `samples` に残す。
- 看護学10問は `samples.ja/NUR*.csv` を正本として直接編集する。生成スクリプトは他5分野50問を再生成し、看護学を上書きしない。

- `65c266b`: 問題編集画面のレイアウト改善、表示言語・基本言語・展開先言語の保存。
- `d94cc56`: 問題文を「選択肢設定」の下、「選択肢データ」の上へ移動。
- 問題文見出し右端の「？」に、ホバーまたはキーボードフォーカスで説明を表示。常設の説明で画面の場所を取らない方針。
- 説明には `__SELPROMPT__` の自動挿入、Radio形式で複数正解があり得る場合の指示文全文、プレースホルダーを使わず自分で指示文を書けることを含める。日本語・英語のUIに対応。
- macOSではsetup/start/restart/Finderランチャーからの起動時、Dockerへ接続できなければインストール済みDocker Desktopを起動して最大120秒待機する。接続済みなら再起動しない。`make check` はDockerの自動起動を行わない。
- CSV schema v2、旧CSVの読込、パターンごとの共通／真偽別フィードバック混在などの既存機能を維持する。

## 主なファイル

| ファイル | 役割 |
| --- | --- |
| `app/mcq-webapp/index.html` | 画面構造 |
| `app/mcq-webapp/styles.css` | レイアウト・説明ポップアップ |
| `app/mcq-webapp/app.js` | 編集・CSV/XML処理 |
| `app/mcq-webapp/i18n.js` | UI翻訳 |
| `app/mcq-webapp/server.py` | ローカルサーバー・CAS連携 |
| `scripts/mcq-webapp.py` | セットアップ・サービス管理・Docker起動 |
| `scripts/tests/test_docker_startup.py` | Docker起動の単体テスト |

## 再開と検証

プレビュー機能の検証（実API確認は起動中のWebAppとSTACK APIが必要）:

```sh
node scripts/tests/test_preview_ui.cjs
node scripts/tests/test_variant_parameters.cjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -v
python3 scripts/tests/check_stack_preview_integration.py --url http://127.0.0.1:4174
```

実API確認時は既存サービスを変更せず、`python3 app/mcq-webapp/server.py --port 4174` で検証用サーバーを別に起動した。通常の4173を使う場合は検証コマンドの `--url` を省略できる。統合検証にはNode.jsが必要で、生成した一時XMLは終了時に削除される。

パラメータ機能の検証:

- `node scripts/tests/test_variant_parameters.cjs` 成功。実際のrank 0/1/2 XMLを用いて読込、生成XMLの出力順、メタデータとCSV往復、評価コードの順序、重み付き正解数、共有／新規includeへ個別rank値を埋め込まないこと、旧メタデータを検証。
- 候補数・旧XMLのNode回帰テスト、Python単体テスト10件、JS構文検査、差分チェックが成功。
- 実ブラウザで問題文上のパラメータ欄、入力のXML反映順、英語表示を確認。実Maximaでrank別の数値結果が一致することまでは今回確認していない。

リポジトリのルートで状態とブランチを確認する。未コミット変更や分岐がある場合は内容を保護し、強制的に上書きしない。

```sh
git status --short --branch
git log -5 --oneline
```

初回は `make setup`、設定済みなら `make start`。既定の画面URLは `http://127.0.0.1:4173/`。`make check setup` とまとめるとcheck失敗でsetupが実行されないため、セットアップは単独で実行する。

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -v
git diff --check
```

- `d94cc56` の検証では単体テスト8件と差分チェックが成功。
- 単体テストは外部処理を模擬して、接続済み・起動待ち・起動失敗・時間切れ・未導入・OSによる分岐・診断時の非起動を確認。実際のDocker Desktop起動を直接テストするものではない。
- 利用者によるMacでのセットアップ・WebApp起動は成功。ただし、停止状態からのDocker自動起動が実際に通ったかは個別には未確認。
- 説明ポップアップのブラウザによる詳細な表示検証は未完了。次のUI確認時に、ホバー／フォーカスでの表示、非操作時の非表示、日英切替、狭い画面での収まり、問題文の編集とXML生成を確認する。

候補数の修正時の検証:

- `node scripts/tests/test_choice_capacity.cjs` 成功。選択肢数6が未評価時にも維持され、正解4件・誤答13件の評価後は合計上限17、正解数候補0〜4で固定真偽モードの生成が通ることを確認。正解5件や誤答不足、実際の出題選択肢数を超える正解数は引き続き拒否する。再評価待ちでも入力値を維持。
- 既存XMLのNode回帰テスト、JS構文検査、差分チェックが成功。今回の修正はブラウザでは未検証。

キャッシュ対策時の検証:

- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -v` で10件成功（アセット再検証・APIヘッダー維持を含む）。既存XMLのNode回帰テストと `git diff --check` も成功。

既存XMLの候補型修正時の検証:

- `node scripts/tests/test_legacy_xml_import.cjs` 成功。製品の読込ヘルパーを使い、リスト直接代入・単一要素・空リスト・リスト変数・map式・添字・多言語・フィードバック・旧ランダム化XMLを確認。`001/*.txt` の実データ176代入について式全体の保持とCSV型 `cas_list` を検証。
- `node --check app/mcq-webapp/app.js` と `git diff --check` 成功。
- ブラウザでのXML読込から実際のCAS評価までの一連の検証は今回未実施。

サンプル統合時の検証:

- `python3 app/mcq-webapp/samples.ja/validate_samples.py` で60問の構造・BOM・ID・真偽ペアなどを検証。
- `python3 app/mcq-webapp/samples.ja/generate_samples.py` 実行前後で全60CSVの内容が不変であることを確認。
- 移動前の60CSVとのバイト一致、旧看護10件との問題ID以外の一致、差分チェックを確認。ブラウザでのCSV読込は今回未実施。

## 複数Mac・共同開発の運用

- 開発用cloneはNextcloudなどの同期フォルダ外に置く。Nextcloudはバックアップ用とする。
- Mac切替前に変更とこのメモをコミットしてpushし、移動先では編集前に取得する。同じ変更を複数Macで同時に進めない。
- Codexには移動先のcloneを開かせ、この文書を読むよう依頼する。Gitでは会話履歴や未追跡ファイルは移動しない。
- 各Macで環境をセットアップする。ローカル設定、生成キャッシュ、認証情報は共有しない。
- 旧同期フォルダに独自コミット・未コミット変更・未追跡の問題データが残っている。必要なデータの選別移行は未完了。旧フォルダ全体や `.git` を最新版へ上書きせず、必要になった時に所有者と確認して比較・移行する。

## 更新時に残す情報

実装内容、設計上の決定、関連コミット、実施した検証と結果、未確認事項、次の作業を簡潔に更新する。完了した課題は未完了一覧から外し、過去の状態を現在の事実として残さない。公開文書のため、個人の絶対パス、認証情報、非公開の問題・個人情報は記載しない。
