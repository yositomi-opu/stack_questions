# Batch CSV conversion and XML merging / CSV一括変換とXML結合

## 日本語

リポジトリのルートで実行します。CSV変換にはPython 3.10以降とNode.js 18以降が必要です。通常の変換ではブラウザーやWebAppの起動は不要です。MCQ WebAppと同じCSV解析・XML生成処理を使用します。

```sh
mkdir -p exports
python3 scripts/mcq_csv2xml.py materials/*.csv --output-dir exports
```

複数ファイルを個別に指定することもできます。出力名はWebAppと同じ命名規則です。全入力の変換と出力先確認を終えてから保存します。同じ出力名になるCSVは拒否します。既存XMLの置換は `--force` で明示します。元CSVは変更しません。保存中のディスク障害などでは一部だけ出力される可能性があります。

従来の単一ファイルの `-o question.xml`、標準出力への `-o -` も利用できます。計算によって決まる選択肢リストの長さなどを評価する必要があるCSVは、WebAppとSTACK APIを起動し、信頼できる教材に `--evaluate --webapp-url http://127.0.0.1:4173/` を付けてください。評価なしでは対応できないCSVは理由を表示して停止します。これは翻訳を自動生成するコマンドではありません。

複数XMLを、指定カテゴリーにまとめた**1つのMoodle XML**へ結合します。Pythonだけで実行でき、MoodleサーバーへのアクセスやPHPは不要です。

```sh
python3 scripts/moodle_xml_merge.py exports/*.xml \
  --category "線形代数/基底と次元" -o combined.xml
```

- 全問題を「線形代数」の下の「基底と次元」へ直接配置するXMLを生成します。`/` はカテゴリ階層の区切りです。単一カテゴリーなら `--category "線形代数"` と指定します。
- 各入力の元カテゴリー指定は置き換え、問題の順序・重複・問題本体のUTF-8バイト列（数式・HTML・STACK構文・CDATA・未知の問題内タグ）を維持します。コメントも保持します。元ファイルは変更しません。
- 入力は通常のUTF-8 Moodle XML（`<quiz>`形式）です。バックアップXML、DTD、ルートの名前空間属性など、保持できない構造は理由を表示して処理を中止します。入力ごとの問題数・置き換えたカテゴリー指定数を標準エラーへ出力します。
- 既存出力は `--force` を付けた場合のみ置き換えます。結合結果を入力のワイルドカードに含めないよう、出力は入力ディレクトリーの外に置いてください。出力先が入力ファイルと同じなら拒否します。

Moodleの問題バンクで「インポート」から「Moodle XMLフォーマット」を選び、`combined.xml` をアップロードします。**「ファイルからカテゴリーを取得」相当の設定を有効**にして取り込んでください。無効にすると、XML内で指定したカテゴリーは使用されません。STACK問題には対象MoodleへのSTACK導入が必要です。再取込時の重複整理や既存問題の置換は、この結合スクリプトでは行いません。

XML生成・バイト列保持・カテゴリー指定・出力保護の自動テストは実施済みです。今回の結合XMLを実Moodleへ取り込む確認と採点テストは未実施です。

## English

Run from the repository root. CSV conversion requires Python 3.10+ and Node.js 18+. The first example converts multiple CSV files using the MCQ WebApp's actual parser and XML generator, without opening the browser or starting the WebApp. `--output-dir` must exist. All conversions and destinations are checked before writing. Duplicate generated filenames are rejected, existing outputs require `--force`, and input CSVs remain unchanged. Filesystem failures during writing can leave partial output. Single-file `-o` and stdout `-o -` remain supported.

For CSVs requiring dynamic Maxima list evaluation, start the WebApp and STACK API and add `--evaluate --webapp-url http://127.0.0.1:4173/` for trusted teaching material. Unsupported unevaluated inputs fail with an explanation. This command does not generate translations.

Combine multiple XML files into **one Moodle XML** using the second example. Only Python is required; no Moodle server access or PHP execution is needed. `--category "Linear algebra/Bases"` assigns every question directly to Bases under Linear algebra; `/` separates category levels.

Original category records are replaced by one `$course$/top/...` marker. Question order, duplicates, original UTF-8 question bytes (including maths, HTML, STACK syntax, CDATA and unknown nested tags), and comments are preserved. Inputs remain untouched. Unsupported structures such as backup XML, DTDs or root namespace attributes fail with an explanation. Per-input question counts and replaced category-record counts are printed to stderr. Existing outputs require `--force`. Keep the combined output outside the input wildcard; overwriting an input is always refused.

In Moodle's normal question-bank import page, select Moodle XML format, upload the combined file, and **enable the option to obtain categories from the file**. Without this option Moodle ignores the generated category marker. STACK must be installed to import STACK questions. The merger does not replace existing Moodle questions or deduplicate repeated imports.

XML generation, byte preservation, category mapping and output protection have automated tests. Actual Moodle import and grading of this combined output have not yet been verified.
