# PRT Template WebApp · Tree / Chain

一般STACK問題を作成・編集する独立したローカルWebアプリです。問題変数、ライブラリー指定、複数の解答欄、Validation、正解判定、Tree／Chain型の誤答フィードバックを編集します。日本語・英語に対応します。

## 起動

Python 3.10以降を使用します。追加のPythonパッケージは不要です。リポジトリのルートから実行します。

```sh
python3 app/prt-template-webapp/server.py
```

ブラウザーで http://127.0.0.1:4175/ を開きます。別ポートは `--port` で指定できます。MCQ webappは既定4173、STACK APIは3080です。編集中の問題を表示・採点する場合は両サービスを起動してください。接続先は `--preview-server` と `--stack-api` で変更できます。

## 作成・保存

- 新しい問題を作るか「XMLを開く」でSTACK問題1件を含むMoodle XMLを開きます。複数問題のバンク・バックアップXMLは問題バンクマネージャーで管理してください。対応しない入力は理由を表示して拒否します。
- `[[ans1]]` の直後にTabを押すと `[[input:ans1]][[validation:ans1]]` に展開します。
- 判定はValidation（Trueで不正として停止）、正解判定（Trueで満点として停止）、誤答チェックの順です。Treeは最初の一致で停止、Chainは全チェックを実行します。標準の空欄・構文検証はSTACKがPRTより前に行います。
- 「編集を適用」はサーバーの作業セッションへ反映します。単独利用では「作業を保存」で原本と現在XMLを含むZIPをダウンロードしてください。「XMLを保存」はMoodle用XML、「原本」は読み込んだ元バイトをダウンロードします。元ファイルは書き換えません。未知フィールド、テスト、添付XML、コメントは編集対象以外を保持します。
- 作業ZIPを再度開くと原本と現在の編集を再開できます。既存入力欄・PRTをテンプレートへ置き換える場合は確認します。自動保存はありません。セッションは最大2時間で、サーバー停止で消えるため、長時間の作業も適宜ZIPへ保存してください。

## 問題バンクとの連携

問題バンクマネージャーを次のように起動すると、別タブでこのEditorを開けます。

```sh
python3 server.py --stack-editor http://127.0.0.1:4175 --mcq-app http://127.0.0.1:4173
```

このコマンドは問題バンクマネージャー側のリポジトリで実行します。両アプリは別プロセスです。問題バンクから開いた場合、「編集を適用」で元の問題・版へ返却し、新規作成は指定カテゴリーへ追加します。原本・各版・undo/redoは問題バンク側が管理します。最後に問題バンク側でも作業ZIPを保存してください。編集中に別操作でバンクが更新された場合は反映を拒否し、編集中の内容は画面に残します。

localhostのセッションを使い、任意の外部URLへは転送しません。HTML／CASTextはソース編集で、実行プレビューは隔離した画面へ表示します。MCQ由来の問題は、問題バンクが識別してMCQ WebAppへ渡します。

---

# English

Run `python3 app/prt-template-webapp/server.py` from the repository root and open http://127.0.0.1:4175/. This standalone editor supports question variables, library includes, multiple inputs, Validation, correctness, and Tree/Chain feedback. Rendering/grading additionally requires the MCQ webapp (4173) and STACK API (3080).

Open a single-question Moodle STACK XML or start a new question. Apply edits updates an in-memory session. Download **Save project** to preserve both the original bytes and the current XML; reopen that ZIP to resume. **Save XML** exports the current Moodle question. Unknown fields, attachments, question tests and comments outside the edited settings are retained. Sessions expire after two hours and are lost when the server stops; there is no automatic save.

Configure qbank with `--stack-editor http://127.0.0.1:4175 --mcq-app http://127.0.0.1:4173`. For a question opened from qbank, Apply edits returns changes to the original version or creates a new question in the chosen category. Qbank retains originals, versions and undo/redo, and rejects edits if the bank changed in the meantime. Save the qbank project ZIP as well. Qbank identifies MCQ provenance and opens MCQ WebApp for those questions.

## ノード編集・CSV/XMLファイルメニュー

新規作成では固定パターンのノード編集を使用します。Validation関数はtrueで有効、チェック関数は `[正解判定, チェック1, …]` を返します。各ノードでテスト・配点・スキルID・言語別のTrue/Falseフィードバックを編集します。件数・配点リスト・フィードバック変数は自動生成します。ノードの追加・削除・並べ替え後は、チェック関数の戻り値も対応させてください。旧テンプレートも引き続き読めます。

CSV/XMLそれぞれに「読込・表示・保存・上書」があります。保存・表示は未適用の編集中の値を使用します。対応ブラウザーでは保存先を選択でき、上書きはその形式で読み込んだファイルまたは直前の保存先へ書き込みます。CSVとXMLの保存先は別々に保持し、新規作成・別ファイル読込で解除します。非対応ブラウザーではダウンロード保存になり、上書きは無効です。CSV一つに問題設定・ノード・原本XMLを保存します。[CSV仕様](CSV_FORMAT.md)を参照してください。

メッセージは引用符やcastext()を付けずCASText本文を入力します。MCQと同じcastext()・%__mcq_langの形へ生成します。言語コードを追加でき、手動翻訳JSONの作成・反映と、MCQの設定を共用するAI翻訳に対応します。数式・タグ・プレースホルダーが変わった翻訳は反映を拒否します。AI翻訳はボタンを押したときだけ設定済みサービスへフィードバック本文を送信します。問題変数内の多言語文字列はそのまま保存し、問題変数欄で編集します。

## Node editing and file menus

New questions use the fixed node-list pattern. Validation returns true when valid; the check function returns correctness followed by checkpoint flags. Edit answer tests, weights, skill IDs and multilingual True/False CASText per node. Counts, weights and feedback variables are generated. Align the function result list after changing checkpoint order/count. Legacy templates remain readable.

CSV and XML each provide Open, View, Save as and Overwrite, including unapplied current edits. Supporting browsers retain independent file handles per format; other browsers download files and disable Overwrite. Opening another file or creating a question resets handles. One CSV retains the question, nodes and original XML. See [CSV format](CSV_FORMAT.md).

Enter CASText prose without quotes or castext(). Generated messages use MCQ's castext() and %__mcq_lang interface. Add languages, prepare/apply manual translation JSON, or explicitly request AI feedback translation using shared MCQ provider settings. Math, tags and placeholders are checked before applying translations. Multilingual strings already in question variables remain editable source code.

## ページ内の編集画面

編集はMCQと同様にページ内で行います。ライブラリーはチェックボックスで選択し、XML生成時に読み込みます。`multilang_library`は必須で、一括版`ky_linear_algebra`と分割ライブラリーは相互に選択を解除します。選択操作で問題変数の本文は書き換えません。

標準言語の問題文は専用のCASText欄に入力します。選択した展開言語への手動翻訳・AI翻訳はMCQ共通の保護処理を使い、問題文とノードのTrue/Falseメッセージをまとめて扱います。生成する`qtext`とメッセージの定義は問題変数の末尾に置きます。本文中の変数名・TeX・HTML・STACKプレースホルダーは保持します。未翻訳の言語を選択したままのXML出力は理由を表示して拒否します。翻訳途中の状態もCSVへ保存・再読込できます。

「問題文・解答欄の配置」には`<p>{@qtext@}</p>`や`[[ans1]]`を書きます。XML生成時に選択言語の空の`[[lang]]`ブロックを`<p>…<br></p>`で囲んで先頭へ追加し、短い解答タグをinput/validationタグへ展開します。入力設定は変数名・4種のタイプ・正解例・サイズ・allowempty/hideanswerを1行で編集します。狭い画面では入力行の内部を横スクロールできます。

`%_validate`と`%_chkfunc`は問題変数で定義します。フィードバック変数欄の定義ボタンで関数サンプルを問題変数へ挿入できます。通常は`ansL`の解答変数の対応だけを調整します。件数や各ノードの判定式は生成するため表示しません。説明は「?」のホバー・キーボードフォーカスで確認できます。個別の判定テストを持つ旧問題は自動変換せず、既存設定を保持する基本編集となります。

## Page editor

Author questions directly on the page, as in MCQ. Library checkboxes are applied at XML generation; `multilang_library` is mandatory and the linear-algebra bundle replaces its individual modules. Choosing libraries does not edit the source textarea.

Use a dedicated base-language CASText field for question prose, language checkboxes for targets, and shared MCQ translation protection for both question prose and node feedback. Generated `qtext` and message definitions are appended to question variables. Missing translations block XML export with a reason; incomplete translation work can still be saved and reopened as CSV.

Write layout source such as `<p>{@qtext@}</p>` and `[[ans1]]`. Export adds the selected empty language blocks inside `<p>…<br></p>` and expands short inputs into input/validation tags. Each input occupies one row with name, one of four types, teacher's answer, size, allowempty and hideanswer. Narrow screens scroll these rows horizontally.

Define `%_validate` and `%_chkfunc` in question variables; definition buttons beside feedback variables insert editable examples there. Normally only the `ansL` binding needs adaptation in feedback variables. Internal node counts and comparisons are generated and hidden. Hover or focus “?” for help. Legacy custom tests are preserved without automatic conversion. `tests/browser_compact.cjs` exercises the page UI with Playwright and a disposable session; set `PRT_TEST_URL` to choose a test server.
