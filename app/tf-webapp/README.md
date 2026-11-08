# True/False WebApp

STACK形式の正誤問題を作成するローカルアプリです。正しい主張と正しくない主張をそれぞれ1つ以上登録し、選ばれた主張にTrue/Falseで答える問題を生成します。Moodleネイティブのtruefalse問題とは異なります。

## 起動

リポジトリのルートで `make start` を実行し、[作問一覧](http://127.0.0.1:4173/authoring.html)からTrue/Falseを選びます。直接のURLは http://127.0.0.1:4178/ です。

TFだけを起動する場合:

```sh
make tf-webapp
# 別ポートを使う場合
python3 app/tf-webapp/server.py --port 4188
```

Python 3.10以降を使用します。追加のPythonパッケージは不要です。まとめて起動する際のポート変更には `TF_WEBAPP_PORT` を使用します。プレビューは別途MCQ（4173）とSTACK API（3080）が必要です。接続先は `--preview-server` / `--stack-api` で変更できます。

## 作問

1. 問題名と問題変数を入力します。問題変数では `AssertC1` 等の生成用変数を再定義しないでください。
2. 「正しい/正しくない主張」で各欄の X の下にある + を押すと、その直後に同じ種類の欄を追加します。正1・正2、誤1・誤2の順に番号を付け直します。説明は見出しの ? で表示します。各欄は引用符やcastext()を付けず、CASText本文を入力します。`{@A@}` や数式も使えます。各側1件は残り、上限は各100件です。一対の対応はありません。
3. 「言語依存」をオンにした主張には、選択した各言語の文章を入力します。オフの場合は共通CASTextとして全言語に使用し、翻訳JSONとAI翻訳の対象から除外します。切替前の翻訳データは保持します。
4. 「問題文」を確認し、正解時と不正解時のフィードバックを言語ごとに編集します。これらは主張の真偽ではなく、学生の回答の正誤に対応します。True/Falseの表示ラベルも編集できます。
5. 「正解」はランダム／正しい／正しくないを選択できます。XMLでは最初に `%_tf` を1（真）または2（偽）へ設定し、該当側から1つを選びます。`AssertC1, AssertC2, ...` と `AssertW1, AssertW2, ...` を定義し、`qtext:castext_concat(qtext0, ...);` で合成します。

「正解」の右にある「「わからない」を使用」はOn/Offで設定します（新規作成時はOff）。CSV・XMLへ `%_noidea` のtrue/falseとして保存し、Onでは値 `-1` の「わからない」を追加します。表示文言は「回答ラベル」で言語ごとに編集でき、翻訳JSON・AI展開にも含まれます。「わからない」は専用PRT分岐で0点です。未回答の「-」はSTACK標準の `notanswered` として扱い、採点対象にしません。`nonotanswered` は使用しません。旧CSV・旧1段PRTのXMLも読み込め、再出力時に新しい構成へ更新します。

## 多言語とライブラリー

標準言語と展開する言語を選び、「編集する文章の言語」で切り替えます。解除した言語の文章も保持します。手動の翻訳JSON作成／反映と、MCQと同じ保存済みプロバイダー設定を使うAI展開があります。AI送信はボタンを押したときだけ行います。翻訳は数式・変数・CASTextプレースホルダーを保持しているか検査し、途中で元データが変わった場合は反映しません。

問題変数欄は常時表示します。`stack_include Base URL` は読取専用で、「変更」から必須・選択中のライブラリーを取得できることを確認して保存します。確認に失敗した場合やキャンセルした場合は元の設定を保持します。共通ライブラリーはMCQと同じチェック欄で選択し、問題変数より先に読み込みます。初期値は旧一括版と必須の多言語ライブラリーです。追加のURLを含む既存データは保持します。URL確認ではコードを実行しません。

「問題文」とフィードバックの ? にCASText・HTML・`{@a@}`の説明を表示します。主張欄は番号のみ表示し、XMLの変数名はヘルプで確認できます。「評価」「評価結果」は問題変数とライブラリーをMCQの評価サービスで計算します。MCQとMaxima/STACKの評価環境が必要です。編集後は再評価してください。

## 保存・再開

CSV/XMLメニューは読込・表示・保存・上書です。CSVには問題設定、全言語の文章、言語依存フラグ、原本XMLとSHA-256を保存します。CSVの列は既存PRTコンテナーと同じ `kind,id,key,value`、TFモデルは `mode=truefalse, version=4` です。MCQ CSVとは別形式で、MCQ用CLI変換器の対象ではありません。

未翻訳の下書きもCSVで保存・再読込できます。XML保存・プレビューでは選択した言語の出題指示と主張、回答ラベルを確認し、不足があれば停止します。未選択言語の文章はCSVとXMLの編集用メタデータに保持します。

対応ブラウザーでは保存先を選び、同じ形式を保存済みの場合に「上書」が使えます。それ以外はダウンロード保存です。読込後の最初の保存では保存先を選び直します。XMLの保存名は `003.問題名-tf.xml`、CSVは `問題名.csv`。作業ZIPは原本と現在XMLをまとめ、「原本」は読み込んだ元XMLをそのまま取得します。未完成の作業にはCSVを使用してください。

自動保存はありません。セッションは2時間で失効し、サーバー再起動でも失われます。適宜CSVや作業ZIPへ保存してください。最新版Question Managerの「＋ True/False問題」から新規作成でき、形式欄のSTACK-TFから再編集できます。「保存して終了」とXML保存は完成XMLを問題バンクへ返し、受理後に画面を閉じます。競合・通信失敗時は編集画面を残します。CSVや作業ZIPで退避でき、返却後はQuestion Manager側の作業ZIPも保存してください。両リポジトリを更新・再起動してください。

## Templateと確認範囲

`template.xml` は提供された `003.TF_multilang.xml` の原本バイトです。生成時は韓国語の出題指示の `castxt` を `castext` に補正し、言語選択にMCQ共通の `%__mcq_lang` を使用します。元のdropdown/AlgEquiv/正誤フィードバック構成を使用します。数式の意味や主張の真偽は作問者が確認してください。

```sh
make tf-check
```

TFの自動テスト、既存PRT/Parsons/MCQ回帰、実Chromiumでの追加削除・翻訳JSON・CSV/XML保存再読込・日英・狭幅操作を確認しています。模擬APIの画面試験に加え、一時環境のSTACK API 2026101500＋Maxima-sage 5.45.1でOn/Off・正誤・わからない・未回答を実採点しました。APIソースの検証用設定とlocale補助を使用しており、利用者のDockerイメージや実Moodleでの動作確認とは区別します。実Moodleでのインポート／受験、外部AIへの実送信、Mac/Windows実機は未確認です。公開前の追加検証で、原本の改行保持と問題変数中の生成マーカー文字列の往復保持も確認しました。

## English

Run `make start` and choose True/False from the common authoring page, or run `make tf-webapp` and open http://127.0.0.1:4178/. Custom managed ports use `TF_WEBAPP_PORT`. Preview requires the separate MCQ webapp and STACK API services.

Maintain at least one true and one false assertion. Use + below each row’s X to insert immediately after it; X removes that row. Labels are T1, T2 and F1, F2 in English (正1 and 誤1 in Japanese). Hover or focus the combined heading’s ? for guidance. Each assertion can be multilingual or shared CASText; shared assertions are excluded from manual/AI translation. Use the text-language selector to edit the instruction, assertions, answer labels, and correct/incorrect-answer feedback (`msgT`/`msgF`). Random or fixed truth selection sets `%_tf` before selecting from the corresponding pool and combining the assertion with the instruction using `castext_concat`.

Question variables remain expanded. Select shared libraries with MCQ-style checkboxes. The read-only stack_include Base URL can be changed only after an explicit availability check succeeds; failures and cancellation preserve the previous setting. No fetched code is executed during validation. Evaluate / Evaluation results use the MCQ evaluation service and require its Maxima/STACK setup. Help tooltips explain CASText, HTML, {@a@} and generated feedback variables. Assertion labels use numbers.

Include URLs and AI provider settings follow MCQ conventions. AI sends text only on explicit action and validates mathematical/CASText tokens before applying translations. Use ‘I don’t know’ defaults to Off for new questions. Both CSV and XML retain `%_noidea` as true/false; On adds value -1, graded by a dedicated zero-score PRT branch. Edit its localized text under Answer labels; manual/AI translation includes it. The “-” choice uses STACK’s standard notanswered value and remains ungraded; nonotanswered is removed. Legacy CSV and one-node TF XML remain readable and are upgraded when exported.

Save incomplete translations as CSV drafts. XML/preview require complete selected-language assertions, prompts and labels. CSV preserves all language data, flags and original XML; the format is the PRT container with a dedicated TF model, not MCQ CSV. Project ZIP retains original/current XML. Sessions expire after two hours and are not autosaved. The updated Question Manager supports new TF questions and direct reopening via STACK-TF. Save and close, including XML Save, returns complete XML to the bank and closes only after acceptance. Conflicts leave the editor open; CSV/project backups remain available. Update/restart both repositories and save the bank project separately.

Automated tests and Chromium authoring/save/reload checks pass. Live checks with a disposable STACK API 2026101500 and Maxima-sage 5.45.1 confirm correct/incorrect/no-idea scoring and ungraded unanswered responses. The API source test setup uses local configuration and locale helpers; this does not verify the installed Docker image or Moodle. External AI calls and Mac/Windows operation remain unverified. The supplied template bytes are retained; generated output corrects its Korean `castxt` typo and uses the shared MCQ language helper. Existing GPL licensing applies.

## Live API regression (optional)

Use a disposable local STACK API and synthetic sample questions:

```sh
python3 app/tf-webapp/tests/check_stack_api.py --api-url http://127.0.0.1:3080
```

This opt-in check renders and grades On/Off questions in Japanese/English, covering correct, incorrect, no-idea and unanswered responses. It requires the local API/Maxima environment and does not install Moodle or prove Moodle/browser operation.
