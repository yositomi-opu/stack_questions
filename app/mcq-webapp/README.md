# STACK MCQ XML Generator

`001.MCQ-rb.xml` / `001.MCQ-cb.xml` をもとに、CSV または XLSX から MCQ 用 XML を生成するローカル WebApp です。

画面で編集した内容は「CSV保存」で再編集可能なCSVとして保存できます。「CSV見本」は現在選択中の真偽ペアモードに対応した固定サンプルを保存します。

選択肢数の最大値は、入力済みのパターン数に合わせて自動調整されます。生成XML欄は縦の「XML」タブで開閉でき、境界線をドラッグして幅を調整できます。「表示設定」ではXML列の表示・非表示と、設定欄・選択肢欄の幅も変更できます。

## 起動

リポジトリのルートで次を実行し、ブラウザで `http://localhost:4173/mcq-webapp/mcq-webapp/` を開きます。

```sh
python3 -m http.server 4173
```

## CSV / XLSX 形式

ヘッダーは付けず、行の第1フィールドで種類を指定します。

```csv
config,question_id,000.sample-mcq
config,mode,rb
config,num_options,2
config,num_correct,1
config,random_correct,false
config,correct_counts,"1, 2"
config,require_pairs,true
qtextL,ja,"次のうち正しいものを __SELTYPE__."
qtextL,en,"__SELTYPE__ the correct statement."
qvar,,"aa1:rand([1, 2, 3])"
qvar,,"aa2:rand([3, 4, 5])"
option,01,C,"パターン01が真の場合の文"
option,01,W,"パターン01が偽の場合の文"
feedback,01,"パターン01に共通のフィードバック"
option,02,C,"パターン02が真の場合の文"
option,02,W,"パターン02が偽の場合の文"
feedback,02,"パターン02に共通のフィードバック"
```

- `option`: `option, パターン番号, CまたはW, 文`。同じパターン・真偽を複数行書くと、候補リストになります。
- `feedback`: `feedback, パターン番号, 文`。同じ命題の C/W に共通です。
- `qtextL`: `qtextL, 言語, 問題文`。言語は `ja`, `en`, `fr`, `de`, `it` です。
- `qvar`: 第3フィールド以降を Maxima 式として、上から順にそのまま挿入します。末尾に `;` または `$` がなければ `;` を補います。CSVセル内の改行も保持します。
- `config`: 任意です。`question_id`, `mode`, `num_options`, `num_correct` を指定できます。
- `config,random_correct,true`: 正解数をランダムにします。候補は `config,correct_counts,"1, 2, 3"` のように指定します。
- `config,require_pairs,true`: 各パターンに C/W の両方を必須とし、命題の真偽をランダムに割り当てます（既定）。

多言語の選択肢とフィードバックは、言語を追加フィールドにします。

```csv
option,01,C,ja,"日本語"
option,01,C,en,"English"
feedback,01,ja,"日本語のフィードバック"
feedback,01,en,"English feedback"
```

## ランダム化

命題パターンを STACK/Maxima の `random_permutation` で並べ替えます。その先頭から `num_correct` 個を C 文による正答パターンにし、続く `num_options - num_correct` 個を W 文による誤答パターンにします。同一パターンの C/W が同じ問題内に同時出現することはありません。

## 真偽を固定するモード

数学問題など、パターンごとに C/W の対を作らない場合は、画面の「各パターンは真偽1対以上を必須とする」をオフにするか、CSVに次を書きます。

```csv
config,require_pairs,false
```

このモードでは画面が「正解選択肢」と「誤答選択肢」の2表に分かれます。各行でパターン番号、1行1要素の候補リスト、フィードバックを編集します。同じパターン・真偽の `option` を複数行書くと、そのパターンの候補リストになります。フィードバックは1件だけです。

```csv
option,01,C,"正解候補1"
option,01,C,"正解候補2"
feedback,01,C,"パターン01のフィードバック"
option,02,W,"誤答候補1"
option,02,W,"誤答候補2"
feedback,02,W,"パターン02のフィードバック"
```

CSV/XLSXはパターン、真偽、言語を列として検査しやすいため、入力形式として維持しています。Markdownは説明文や利用ガイドに使用します。
