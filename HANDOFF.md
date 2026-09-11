# 開発引き継ぎ

更新日: 2026-09-12

この文書は、別のMac・別の開発者・新しいCodexタスクでも開発を再開するための現在地です。作業開始時に読み、作業終了時に更新してください。継続的な開発ルールは [AGENTS.md](AGENTS.md)、利用方法は [WebApp README](app/mcq-webapp/README.md) を参照してください。

## 現在の対象と状態

- 主な開発対象: `app/mcq-webapp`（CSV/XLSXや編集画面からMoodle STACK用の多肢選択問題XMLを生成）。
- 直近の変更: CASリスト未評価時に選択肢数が2へ縮められ、その後も正解数を制限する不具合の修正。コミット・送信状態は `git log` と `git status` で確認すること。
- 最新版をNextcloud外へ新規cloneして `make setup` を実行し、利用者からセットアップ完了・WebAppの起動成功の報告あり。
- 日本語サンプルCSVを `app/mcq-webapp/samples.ja` 直下へ統合。看護学の重複10件をNUR識別子へ統一し、全6分野60問を収録。

## 直近の変更と決定事項

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
