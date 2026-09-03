# STACK MCQ XML Generator

`001.MCQ-rb.xml` / `001.MCQ-cb.xml` をもとに、CSV または XLSX から MCQ 用 XML を生成するローカル WebApp です。

画面で編集した内容は「CSV保存」で再編集可能なCSVとして保存できます。「CSV見本」は現在選択中の真偽ペアモードに対応した固定サンプルを保存します。

選択肢数の最大値は、文字列1件を1候補、評価済みCASリストをその`length`件として、利用可能な候補数に合わせて自動調整されます。同じパターンのCASリストから複数の選択肢を生成できます。生成XML欄は縦の「XML」タブで開閉でき、境界線をドラッグして幅を調整できます。「表示設定」ではXML列の表示・非表示と、設定欄・選択肢欄の幅も変更できます。

## 初めて使う場合

Git、Python 3.10以降、Docker EngineとDocker Composeを用意してから、このリポジトリをcloneします。macOS／WindowsではDocker Desktopを使うのが簡単です。Docker Desktopは起動した状態にしてください。

```sh
git clone https://github.com/yositomi-opu/stack_questions.git
cd stack_questions
make setup
```

`make setup`はOSを判別し、権限を修復し、公式STACK API Dockerイメージを取得して、STACK APIとMCQ WebAppをバックグラウンド起動します。2回目以降は`make start`を使用します。ホストにMaximaがありSTACKコードが設定済みならそれを優先し、そうでなければDocker内のSTACK用Maximaで問題変数を評価します。

セットアップ後、[http://127.0.0.1:4173/](http://127.0.0.1:4173/)を開きます。画面では、問題変数・問題文・選択肢を入力し、「問題変数を評価」でSTACK/Maximaの評価結果を確認してから「XML保存」でファイルを保存します。

GitHub Pages上でも静的な入力・CSV保存・XML生成は動作しますが、PagesではPython／Maxima／Dockerを実行できません。そのため、問題変数の評価、CAS式の`length`取得、STACK APIテストには、この手順で起動したローカル版を使用してください。

## 管理コマンド

リポジトリのルートで実行します。

```sh
make setup    # 初回設定、Dockerイメージ取得、両サービスの起動
make check    # 権限修復とPython／Maxima／STACK API／WebAppの総合診断
make start    # STACK APIとWebAppを開始
make stop     # 両サービスを停止
make restart  # 両サービスを再起動
make status   # 保存設定とWebAppの状態を表示
```

`make setup`時にサーバーのロケールを自動判定し、日本語ロケールなら日本語、それ以外なら英語でUIと初期問題を開きます。固定する場合は次のように指定します。この設定は`app/mcq-webapp/.local-config.json`へ保存されます。

```sh
make setup LOCALE=ja
make setup LOCALE=en
```

画面右上の`English`／`日本語`ボタンで一時的に表示を切り替えることもできます。問題文、選択肢、生成XML、STACK API応答の内容は切替対象外です。

## OS別の起動

### macOS

Docker Desktop、Git、Python 3.10以降をインストールします。ターミナルでは`make setup`を実行します。Finderからは`scripts/macos/start-mcq-webapp.command`をダブルクリックでき、未設定ならsetup、設定済みならstartを自動実行してブラウザを開きます。

macOSで初回のダブルクリックがセキュリティ設定により拒否された場合は、FinderでファイルをControlキーを押しながらクリックして「開く」を選択するか、ターミナルから次を実行します。

```sh
./scripts/macos/start-mcq-webapp.command
```

### Windows

1. [Python 3.10以降](https://www.python.org/downloads/windows/)をインストールします。
2. Docker Desktopをインストールし、Linux containersで起動します。
3. Gitでこのリポジトリをcloneします。
4. リポジトリ内の`scripts\windows\start-mcq-webapp.bat`をダブルクリックします。

WindowsではGNU Makeは標準搭載されていません。Makeを導入した場合は同じ`make`コマンドを使用できます。導入しない場合も、次の同等コマンドが使えます。

```bat
scripts\windows\mcq-webapp.bat setup
scripts\windows\mcq-webapp.bat check
scripts\windows\mcq-webapp.bat start
scripts\windows\mcq-webapp.bat stop
scripts\windows\mcq-webapp.bat restart
```

Windows版Maximaは必須ではありません。インストールして`MAXIMA_EXECUTABLE`を設定した場合は、ホストMaximaを優先できます。

### Ubuntu

Ubuntu ServerではGit、Python 3.10以降、GNU Make、Docker Engine、Docker Compose pluginを用意します。Dockerは[公式のUbuntu向け手順](https://docs.docker.com/engine/install/ubuntu/)でインストールし、`docker compose version`と`docker info`が成功する状態にします。

`docker info`がpermission deniedになる場合は、Docker公式のLinux post-install手順に従って実行ユーザーを`docker`グループへ追加し、いったんログアウトして入り直してください。`make check`はリポジトリ内の実行権限を自動修復し、Docker socketのように管理者権限が必要な項目は修復方法が分かるエラーとして報告します。

Workshop参加者が別PCのブラウザから接続する場合は、初回だけ次のように設定します。

```sh
make setup HOST=0.0.0.0 LOCALE=ja
```

ブラウザでは`http://<UbuntuサーバーのIP>:4173/`を開きます。ファイアウォールではTCP 4173だけを必要なネットワークから許可してください。STACK APIの3080番ポートはDocker Composeにより`127.0.0.1`だけへbindされ、WebAppサーバー経由で利用されます。公開サーバーでは、TLSと認証を提供するリバースプロキシを別途設置してください。

### ポート変更

初回setup時に保存します。

```sh
make setup PORT=4174 STACK_API_PORT=3081
```

WebAppのログは`app/mcq-webapp/.local/service/mcq-webapp.log`に保存されます。ローカル設定・PID・ログ・取得物はGit管理されません。

## STACK用Maximaの設定

通常はDocker内のSTACK用Maximaが自動で使われるため、この節の手動設定は不要です。ホストにMaximaをインストールして直接使いたい場合だけ、STACK（`moodle-qtype_stack`）のclone先、または`stackmaxima.mac`が置かれているディレクトリを設定します。WebAppはその場所をローカル設定へ保存し、可能ならリポジトリの`dump.txt`からSTACK用Maxima実行ファイルを生成します。

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

正常な場合は、出力に`STACK code: OK`と、使用中の`STACK読込方式`（Docker goemaxima、ダンプ済み実行ファイル、または評価時の通常読込）が表示されます。Windowsのコマンドプロンプトから手動確認する場合は、次を使用できます。

```bat
py -3 app\mcq-webapp\server.py --check
```

## 困ったとき

- `server.py: No such file or directory`：リポジトリのルートへ移動してから実行するか、OS別ランチャーを使用してください。
- `Address already in use`：同じポートのサーバーがすでに動作しています。ブラウザで`http://127.0.0.1:4173/`を開くか、`--reload`で再起動してください。
- `STACK code: 未読込`：OS別ランチャーを再実行するか、`--install-stack`または`--setup-stack`で設定してください。
- `rand(...)`などが式のまま表示される：`--check`で`STACK code: OK`を確認し、サーバーを`--reload`で再起動してからブラウザを再読み込みしてください。
- ダンプ生成に失敗する：通常は評価時の通常読込へ自動的に切り替わります。手動設定では`--no-dump`を追加できます。
- macOSで「`maxima-stack`は開けません。ゴミ箱に入れますか？」と表示される：`maxima-stack`はホスト固有の生成キャッシュで、Nextcloud経由で別のMacへ同期して使うものではありません。ゴミ箱へ移して構いません。`make check`は隔離属性の付いたキャッシュを実行せず設定から外し、通常読込またはDockerへ切り替えます。
- WindowsでMaximaが見つからない：`MAXIMA_EXECUTABLE`に`maxima.bat`または`maxima.exe`の実際のパスを設定してください。

## ローカルCAS評価

「問題変数を評価」を押すと、ローカルMaximaが次のファイルを読み込んでから問題変数と選択肢のCAS式を評価します。

- `ky_linear_algebra.mac`
- `tex_library.mac`
- `mcq_template_pre.mac`

「定義済み変数」には、問題変数欄のトップレベル代入から抽出した変数名、型、リストの`length`、評価値が表示されます。選択肢がCAS式の場合は入力欄にも評価結果が表示され、リストなら`CASリスト length: 3`のように候補数を確認できます。評価結果がリストだったCAS式は、XML生成時にも候補リスト式として扱われます。

CAS式をまだ評価していない場合、候補数は安全側に1件として扱われます。「問題変数を評価」を押すとリスト長に応じて選択肢数の上限が更新されます。1つのパターン内にCASリスト式を複数置いた場合は、各リストを平坦化した候補リストとして生成します。

問題変数または選択肢を変更すると評価結果は「再評価が必要」になります。ランダム変数を含む場合、表示される値と`length`はその評価時点の1回分です。

このAPIは入力したMaximaコードをローカルで実行します。信頼できる問題コードだけを評価し、外部公開用サーバーとしては使用しないでください。

既存XMLの問題変数が`stack_include`でリポジトリ内の`.txt`または`.mac`を参照している場合、WebAppはローカルサーバー経由でそのファイルを優先して読み込みます。外部公開URLへ接続できない環境でも、clone済みのincludeファイルから問題文と選択肢を復元できます。CAS式を含むXMLは、読込後に問題変数と選択肢を自動評価します。

## STACK APIによる動作確認

`make setup`／`make start`は、公式STACK APIとgoemaximaをDockerで起動します。既定URLは`http://127.0.0.1:3080`で、画面にも自動設定されます。

- 「接続確認」：STACK APIの`/render`へ確認用リクエストを送り、JSON応答を受信できるか確認します。
- 「生成XMLをテスト」：現在画面に生成されている問題XMLをSTACK APIの`/test`へ送り、STACK側のテスト結果を表示します。

API応答の詳細は画面上で展開して確認できます。Workshop公開時のサーバーサイドリクエスト偽装を防ぐため、既定ではセットアップ済みのローカルURL以外へ接続できません。信頼できるローカル環境で別のSTACK APIを使う場合だけ、`server.py`を`--allow-remote-stack-api`付きで直接起動します。

この機能はローカルの`server.py`を経由してSTACK APIへ接続します。

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
qtextL,ja,"次の選択肢について答えよ。__SELPROMPT__"
qtextL,en,"Consider the following options. __SELPROMPT__"
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
- `qtextL`: `qtextL, 言語, 問題文`。言語は `en`, `ja`, `fr`, `it`, `de`, `pt`, `zh`, `ko`, `ru`, `sv` です。
- `qvar`: 第3フィールド以降を Maxima 式として、上から順にそのまま挿入します。末尾に `;` または `$` がなければ `;` を補います。CSVセル内の改行も保持します。
- `config`: 任意です。`question_id`, `mode`, `num_options`, `num_correct` を指定できます。
- `config,random_correct,true`: 正解数をランダムにします。候補は `config,correct_counts,"1, 2, 3"` のように指定します。
- `config,require_pairs,true`: 各パターンに C/W の両方を必須とし、命題の真偽をランダムに割り当てます（既定）。

### 選択指示のプレースホルダー

新規問題では、問題文の独立した文として`__SELPROMPT__`を使用してください。Radio／Checkboxと正解数に応じて、たとえば日本語では次の完全な指示文に置換されるため、文法が周囲の語順に依存しません。

- Radio・正解1個：`正しいものを1つ選べ。`
- Radio・正解候補が複数：`正しいものを1つ選べ（複数ある場合も1つでよい）。`
- Checkbox：`正しいものをすべて選べ。`

英語、フランス語、ドイツ語、イタリア語、ポルトガル語、中国語、韓国語、ロシア語、スウェーデン語にも対応しています。従来の`__SELTYPE__`は既存問題用に残していますが、名詞句の前後に置く断片なので、言語やRadio／Checkboxの組合せによっては文法を完全には保証できません。

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
