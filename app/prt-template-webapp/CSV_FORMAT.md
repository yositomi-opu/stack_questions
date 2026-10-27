# PRT Template CSV v1

1問題をUTF-8 BOM付きのCSV一つへ保存します。これは本アプリの交換形式です。MeLQSの既存CSV規格への準拠は宣言しません。スキルIDを保持し、将来の対応付けに使用できます。

列は `kind,id,key,value` です。カンマ・引用符・改行を含む値は標準CSVの引用規則で保存します。Maxima・HTML・TeX・CASTextはソースのまま扱います。表計算ソフトで数値や式へ自動変換しないでください。

| kind | id | 内容 |
|---|---|---|
| format | 空 | schema = prt-template-csv-v1 |
| source | 空 | 元XMLのxml_base64とsha256。アプリが保持する原本欄 |
| question | 空 | name、questionvariables、questiontext、generalfeedback |
| template | 空 | version=2、mode、validationCode、checkCode |
| inputs | 1から連番 | STACK入力欄のname、type、tans、その他の設定 |
| validation | 空 | answertest、sans、tans、testoptions、feedback |
| correct | 空 | 同上 |
| checks | 1から連番 | id、skills、description、answertest、sans、tans、testoptions、weight、trueMessages、falseMessages |

`checks` の `id` はチェックの識別子、CSVの第2列は表示順です。`skills` はスキルIDのカンマ区切り文字列です。`trueMessages` / `falseMessages` のセルは言語コードをキーとするJSONオブジェクトです。表計算ソフトでも一つのセルに保持します。

`%_Num_Nodes` はチェック行の件数（Validation・正解判定を含めない）です。チェック関数は `[正解判定, チェック1, …]` を返します。ノードの追加・削除・順序変更後は関数の戻り値も対応させてください。`scL` は各ノードのweightから生成します。重みは0～1、合計1以下です。Validation成功時にTrueの重みを合計し、正解なら1、不正解ならscを設定します。Treeでもscは全チェック結果に基づきます。フィードバックとanswer noteは訪問ノードに限定します。

問題変数の自由編集欄には問題生成コードを保存します。Validation・チェック関数、件数、重み、多言語フィードバックは専用欄から生成し、`PRT_TEMPLATE_GENERATED_BEGIN` / `END` の間へ格納します。直接編集した生成ブロックは次の生成で更新されます。問題変数のメタデータコメントに編集情報を保持するため、外側のXMLコメントがなくても再編集できます。

未対応の形式・重複プロパティ・不連続の連番・原本ハッシュ不一致は読込を拒否します。元XMLはCSV内と作業ZIPに保持し、未知の問題要素・添付・テストを残します。入力欄とPRTの既知の設定はテンプレートから更新します。一般のPRTを無条件にテンプレートへ変換せず、認識できなければ理由と基本編集のみを表示します。

## English

One UTF-8 CSV with BOM stores one question. Columns are `kind,id,key,value`; ordinary CSV quoting preserves multiline code, markup and math. This is the application's format, not a claimed MeLQS CSV standard. Stable checkpoint IDs and skill IDs support future mappings.

`source` retains original XML bytes as Base64 plus SHA-256. `question` holds basic fields; `template` holds mode and function code; `inputs`, `validation`, `correct`, and `checks` hold their respective editable properties. Message cells contain language-to-CASText JSON objects. Input/check row IDs are contiguous, starting at 1.

The generated node count excludes Validation and correctness. The check function returns correctness followed by checkpoint flags; align it manually after changing the checkpoint list. Weights are between zero and one with total at most one. All True flags contribute to sc, including in Tree mode; only visited nodes emit feedback and answer notes. Correct answers receive one, incorrect answers receive sc. Generated sections are replaced from the dedicated editors; arbitrary source content is never executed in the browser.

## Compact editor settings

The version-2 template optionally has `layout=compact` and a `settings` JSON cell. It stores the base/selected languages, library URLs, language-to-CASText question messages, the generated question-variable name, and the editable feedback-variable program. Input options and unselected translations remain in the CSV. Existing version-2 CSVs are migrated only when their tests match the fixed pattern. Original XML and unsupported custom tests remain intact.

日本語: ページ編集用の設定は`settings`のJSONセルに保存します。標準／展開言語、ライブラリーURL、問題文の翻訳、フィードバック変数の実装もCSV一つで復元できます。旧CSVは固定パターンだけを変換し、独自のテストを隠れて変更しません。未選択の翻訳も消しません。
