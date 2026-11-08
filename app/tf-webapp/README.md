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
2. 正しい主張と正しくない主張を追加します。各欄は引用符やcastext()を付けず、CASText本文を入力します。`{@A@}` や数式も使えます。各側1件は残り、上限は各100件です。一対の対応はありません。
3. 「言語依存」をオンにした主張には、選択した各言語の文章を入力します。オフの場合は共通CASTextとして全言語に使用し、翻訳JSONとAI翻訳の対象から除外します。切替前の翻訳データは保持します。
4. 規定の出題指示を確認し、正解時の `msgT` と不正解時の `msgF` を言語ごとに編集します。これらは主張の真偽ではなく、学生の回答の正誤に対応します。True/Falseの表示ラベルも編集できます。
5. 「出題する主張」はランダム／正しい主張のみ／正しくない主張のみを選択できます。XMLでは最初に `%_tf` を1（真）または2（偽）へ設定し、該当側から1つを選びます。`AssertC1, AssertC2, ...` と `AssertW1, AssertW2, ...` を定義し、`qtext:castext_concat(qtext0, ...);` で合成します。

「わからない」は未対応です。CSVでは `template,,%_noidea,false` を保持し、生成コードにも `%_noidea:false;` を設定します。trueへの変更は未対応として拒否します。

## 多言語とライブラリー

標準言語と展開する言語を選び、「編集する文章の言語」で切り替えます。解除した言語の文章も保持します。手動の翻訳JSON作成／反映と、MCQと同じ保存済みプロバイダー設定を使うAI展開があります。AI送信はボタンを押したときだけ行います。翻訳は数式・変数・CASTextプレースホルダーを保持しているか検査し、途中で元データが変わった場合は反映しません。

MCQと同じ公開ライブラリーURLを `stack_include` に使用します。「ライブラリー」欄へ1行1URLで指定してください。初期値は `ky_linear_algebra.mac` と `multilang_library.mac` です。後者は必須です。作問中には取得・CAS実行せず、XMLに設定を保存します。Moodleから取得できる公開URLを使用してください。

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

TFの自動テスト、既存PRT/Parsons/MCQ回帰、実Chromiumでの追加削除・翻訳JSON・CSV/XML保存再読込・日英・狭幅操作を確認しています。プレビュー画面の採点応答は模擬APIで検証しています。実CAS・実Moodleでのインポート／描画／採点、外部AIへの実送信、Mac/Windows実機は未確認です。公開前の追加検証で、原本の改行保持と問題変数中の生成マーカー文字列の往復保持も確認しました。

## English

Run `make start` and choose True/False from the common authoring page, or run `make tf-webapp` and open http://127.0.0.1:4178/. Custom managed ports use `TF_WEBAPP_PORT`. Preview requires the separate MCQ webapp and STACK API services.

Maintain at least one true and one false assertion. Add/remove assertions independently. Each assertion can be multilingual or shared CASText; shared assertions are excluded from manual/AI translation. Use the text-language selector to edit the instruction, assertions, answer labels, and correct/incorrect-answer feedback (`msgT`/`msgF`). Random or fixed truth selection sets `%_tf` before selecting from the corresponding pool and combining the assertion with the instruction using `castext_concat`.

Include URLs and AI provider settings follow MCQ conventions. AI sends text only on explicit action and validates mathematical/CASText tokens before applying translations. `%_noidea` is stored as false in CSV; this template does not offer an I-don’t-know answer.

Save incomplete translations as CSV drafts. XML/preview require complete selected-language assertions, prompts and labels. CSV preserves all language data, flags and original XML; the format is the PRT container with a dedicated TF model, not MCQ CSV. Project ZIP retains original/current XML. Sessions expire after two hours and are not autosaved. The updated Question Manager supports new TF questions and direct reopening via STACK-TF. Save and close, including XML Save, returns complete XML to the bank and closes only after acceptance. Conflicts leave the editor open; CSV/project backups remain available. Update/restart both repositories and save the bank project separately.

Automated tests and real Chromium authoring/save/reload checks pass. Preview transport was checked with mocked STACK responses; actual CAS/Moodle import and grading, external AI calls and Mac/Windows operation remain unverified. The supplied template bytes are retained; generated output corrects its Korean `castxt` typo and uses the shared MCQ language helper. Existing GPL licensing applies.
