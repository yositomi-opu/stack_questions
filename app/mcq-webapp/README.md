# STACK MCQ XML Generator

`001.MCQ-rb.xml` / `001.MCQ-cb.xml` をもとに、CSV または XLSX から MCQ 用 XML を生成するローカル WebApp です。

画面で編集した内容は「CSV保存」で再編集可能なCSVとして保存できます。「CSV見本」は現在選択中の真偽ペアモードに対応した固定サンプルを保存します。

選択肢数の最大値は、入力済みのパターン数に合わせて自動調整されます。生成XML欄は縦の「XML」タブで開閉でき、境界線をドラッグして幅を調整できます。「表示設定」ではXML列の表示・非表示と、設定欄・選択肢欄の幅も変更できます。

## 初めて使う場合

Git、Python 3.10以降、Maximaをインストールしてから、このリポジトリをcloneします。

```sh
git clone https://github.com/yositomi-opu/stack_questions.git
cd stack_questions
```

その後、macOSでは`scripts/macos/start-mcq-webapp.command`、Windowsでは`scripts\windows\start-mcq-webapp.bat`を起動します。

初回はSTACKコードの場所を尋ねられます。

- STACKをまだ持っていない場合：何も入力せずEnterを押します。`app/mcq-webapp/.local/`へ自動取得します。
- すでにSTACKをcloneしている場合：`moodle-qtype_stack`のclone先を入力します。
- `stackmaxima.mac`を直接置いたフォルダーがある場合：そのフォルダーを入力します。

セットアップが完了するとブラウザが開きます。開かない場合は、[http://127.0.0.1:4173/](http://127.0.0.1:4173/)を手動で開いてください。

画面では、問題変数・問題文・選択肢を入力し、「問題変数を評価」でSTACK/Maximaの評価結果を確認してから「XML保存」でファイルを保存します。

## 起動

### macOS / Linux

macOSでは、リポジトリ内の`scripts/macos/start-mcq-webapp.command`をダブルクリックします。初回にSTACKが未設定の場合は、既存のclone先を入力できます。何も入力せずEnterを押すと、STACKをGitHubからローカル領域へ自動取得します。

macOSで初回のダブルクリックがセキュリティ設定により拒否された場合は、FinderでファイルをControlキーを押しながらクリックして「開く」を選択するか、ターミナルから次を実行します。

```sh
./scripts/macos/start-mcq-webapp.command
```

ターミナルから起動する場合は、リポジトリのルートで次を実行し、ブラウザで`http://127.0.0.1:4173/`を開きます。

```sh
python3 app/mcq-webapp/server.py
```

ローカルCAS評価には、`PATH`から実行できるMaximaが必要です。サーバーは既定で`127.0.0.1`だけに接続を受け付けます。

同じポートですでにMCQ WebAppサーバーが動作している場合は、起動済みのURLと再起動方法が表示されます。動作中のサーバーを停止して再起動するには、次を実行します。

```sh
python3 app/mcq-webapp/server.py --reload
```

使用できる引数の一覧は、次のコマンドで確認できます。

```sh
python3 app/mcq-webapp/server.py --help
```

### Windows

1. [Python 3.10以降](https://www.python.org/downloads/windows/)をインストールします。
2. [Windows版Maxima](https://maxima.sourceforge.io/download.html)の`win64.exe`インストーラーを使ってMaximaをインストールします。
3. Gitでこのリポジトリをcloneします。
4. リポジトリ内の`scripts\windows\start-mcq-webapp.bat`をダブルクリックします。

ランチャーはPython、Maxima、STACKコードを確認してからサーバーを起動し、`http://127.0.0.1:4173/`をブラウザで開きます。初回にSTACKが未設定の場合は、既存のclone先を入力できます。何も入力せずEnterを押すと、STACKをGitHubからローカル領域へ自動取得します。終了するにはランチャーのウィンドウで`Ctrl+C`を押してください。Pythonパッケージの追加インストールは不要です。

Maximaは、まず`PATH`、次にWindowsの一般的なインストール先から自動検出します。検出されない場合は、コマンドプロンプトで実際のパスを指定してからランチャーを実行してください。

```bat
set "MAXIMA_EXECUTABLE=C:\maxima-5.xx.x\bin\maxima.bat"
scripts\windows\start-mcq-webapp.bat
```

macOS、Linuxでも`MAXIMA_EXECUTABLE`を利用できます。環境だけを診断する場合は、リポジトリのルートで次を実行します。

```sh
python3 app/mcq-webapp/server.py --check
```

## STACK用Maximaの設定

通常版MaximaだけではSTACK固有の関数を評価できません。STACK（`moodle-qtype_stack`）をgit cloneした場所、または`stackmaxima.mac`が置かれているSTACK Maximaディレクトリを一度設定すると、WebAppはその場所をローカル設定に保存し、リポジトリの`dump.txt`を読み込んだSTACK用Maxima実行ファイルを生成します。

STACKを持っていない場合は、GitHubから自動取得して設定できます。

```sh
python3 app/mcq-webapp/server.py --install-stack
```

既存のSTACK cloneを使用する場合は、その場所を指定します。

```sh
python3 app/mcq-webapp/server.py --setup-stack /path/to/moodle-qtype_stack
```

`stackmaxima.mac`がディレクトリ直下にある構成も指定できます。

```sh
python3 app/mcq-webapp/server.py --setup-stack /path/to/stack-maxima
```

clone先と生成した実行ファイルの場所は`app/mcq-webapp/.local-config.json`に保存されます。自動取得したSTACKと生成物は`app/mcq-webapp/.local/`に置かれ、いずれもGitにはcommitされません。設定後は通常どおりサーバーを起動すると、STACK用Maximaが優先して使われます。

利用中のMaximaがダンプ生成に対応しない場合は、設定処理は失敗せず、評価のたびにSTACKコードを通常読込する方式へ自動的に切り替わります。明示的に通常読込を選ぶ場合は`--no-dump`を追加します。

```sh
python3 app/mcq-webapp/server.py --setup-stack /path/to/moodle-qtype_stack --no-dump
```

STACKを更新した場合や`dump.txt`を変更した場合は、保存済みのclone先を使って実行ファイルを再生成します。

```sh
python3 app/mcq-webapp/server.py --rebuild-stack-maxima
```

設定とSTACKコードの読込状態は、次で確認できます。

```sh
python3 app/mcq-webapp/server.py --check
```

正常な場合は、出力に`STACK code: OK`と、使用中の`STACK読込方式`が表示されます。Windowsのコマンドプロンプトから手動確認する場合は、次を使用できます。

```bat
py -3 app\mcq-webapp\server.py --check
```

## 困ったとき

- `server.py: No such file or directory`：リポジトリのルートへ移動してから実行するか、OS別ランチャーを使用してください。
- `Address already in use`：同じポートのサーバーがすでに動作しています。ブラウザで`http://127.0.0.1:4173/`を開くか、`--reload`で再起動してください。
- `STACK code: 未読込`：OS別ランチャーを再実行するか、`--install-stack`または`--setup-stack`で設定してください。
- `rand(...)`などが式のまま表示される：`--check`で`STACK code: OK`を確認し、サーバーを`--reload`で再起動してからブラウザを再読み込みしてください。
- ダンプ生成に失敗する：通常は評価時の通常読込へ自動的に切り替わります。手動設定では`--no-dump`を追加できます。
- WindowsでMaximaが見つからない：`MAXIMA_EXECUTABLE`に`maxima.bat`または`maxima.exe`の実際のパスを設定してください。

## ローカルCAS評価

「問題変数を評価」を押すと、ローカルMaximaが次のファイルを読み込んでから問題変数と選択肢のCAS式を評価します。

- `ky_linear_algebra.mac`
- `tex_library.mac`
- `mcq_template_pre.mac`

「定義済み変数」には、問題変数欄のトップレベル代入から抽出した変数名、型、リストの`length`、評価値が表示されます。選択肢がCAS式の場合は入力欄にも評価結果が表示され、リストなら`CASリスト length: 3`のように候補数を確認できます。評価結果がリストだったCAS式は、XML生成時にも候補リスト式として扱われます。

問題変数または選択肢を変更すると評価結果は「再評価が必要」になります。ランダム変数を含む場合、表示される値と`length`はその評価時点の1回分です。

このAPIは入力したMaximaコードをローカルで実行します。信頼できる問題コードだけを評価し、外部公開用サーバーとしては使用しないでください。

既存XMLの問題変数が`stack_include`でリポジトリ内の`.txt`または`.mac`を参照している場合、WebAppはローカルサーバー経由でそのファイルを優先して読み込みます。外部公開URLへ接続できない環境でも、clone済みのincludeファイルから問題文と選択肢を復元できます。CAS式を含むXMLは、読込後に問題変数と選択肢を自動評価します。

## STACK APIによる動作確認

画面下部の「STACK API 動作確認」に、STACK APIのベースURL（例: `http://localhost:3080`）を入力します。

- 「接続確認」：STACK APIの`/render`へ確認用リクエストを送り、JSON応答を受信できるか確認します。
- 「生成XMLをテスト」：現在画面に生成されている問題XMLをSTACK APIの`/test`へ送り、STACK側のテスト結果を表示します。

入力したURLはそのブラウザ内に保存され、次回起動時にも復元されます。末尾に`/stack.php`、`/render`、`/test`などを含むURLを貼り付けた場合も、ベースURLへ自動調整します。API応答の詳細は画面上で展開して確認できます。

この機能はローカルの`server.py`を経由してSTACK APIへ接続します。接続先は信頼できるSTACKサーバーだけを指定してください。

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
