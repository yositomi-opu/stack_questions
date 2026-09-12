# STACK MCQ XML Generator

開発を再開する場合は、[開発引き継ぎ](../../HANDOFF.md)と[開発ルール](../../AGENTS.md)を確認してください。

`001.MCQ-rb.xml` / `001.MCQ-cb.xml` をもとに、CSV または XLSX から MCQ 用 XML を生成するローカル WebApp です。

画面で編集した内容は「CSV保存」で再編集可能なCSVとして保存できます。「CSV見本」は現在選択中の正解・不正解ペアモードに対応した固定サンプルを保存します。保存するCSVと同梱サンプルにはUTF-8 BOMを付けているため、Excelから直接開いても日本語が文字化けしません。

選択肢数の最大値は、文字列1件を1候補、評価済みCASリストをその`length`件として、利用可能な候補数に合わせて自動調整されます。同じパターンのCASリストから複数の選択肢を生成できます。問題文は右欄の選択肢設定の下に表示されます。見出し右端の「？」にカーソルを置くか、キーボードでフォーカスすると、`__SELPROMPT__`による指示文の自動挿入と、手動での指示文入力についての説明が表示されます。生成XML欄は起動時には非表示で、縦の「XML」タブで開閉でき、境界線をドラッグして幅を調整できます。左右の初期幅は4:6です。境界線のドラッグや「表示設定」で左欄をさらに広げられます。「表示設定」ではXML列の表示・非表示と、設定欄・選択肢欄の幅も変更できます。

## 編集用サンプル

[samples.ja](samples.ja/)には、日本語の正解・不正解一対型サンプルを60問収録しています。看護学、民法、経済学基礎、統計リテラシー、研究倫理、情報・AIリテラシーを各10問用意しており、個々のCSVを画面へ読み込んで編集できます。内容と利用上の注意は[サンプル一覧](samples.ja/README.md)を参照してください。

## 初めて使う場合

Git、Python 3.10以降、Docker EngineとDocker Composeを用意してから、このリポジトリをcloneします。macOS／WindowsではDocker Desktopを使うのが簡単です。macOSでは、Docker Desktopが停止していれば起動操作時に自動起動します。他のOSではDockerを起動した状態にしてください。

```sh
git clone https://github.com/yositomi-opu/stack_questions.git
cd stack_questions
make check
make setup
```

clone直後の`make check`はセットアップ前診断として動作します。必要なコマンドとDocker接続を確認し、問題がなければ`次の操作: make setup`と表示します。`make setup`はOSを判別し、権限を修復し、公式STACK API Dockerイメージを取得して、STACK APIとMCQ WebAppをバックグラウンド起動します。2回目以降は`make start`を使用します。ホストにMaximaがありSTACKコードが設定済みならそれを優先し、そうでなければDocker内のSTACK用Maximaで問題変数を評価します。

セットアップ後、[http://127.0.0.1:4173/](http://127.0.0.1:4173/)を開きます。画面では、問題変数・問題文・選択肢を入力し、「問題変数を評価」でSTACK/Maximaの評価結果を確認してから「XML保存」でファイルを保存します。

GitHub Pages上でも静的な入力・CSV保存・XML生成は動作しますが、PagesではPython／Maxima／Dockerを実行できません。そのため、問題変数の評価、CAS式の`length`取得、STACK APIテストには、この手順で起動したローカル版を使用してください。

## 管理コマンド

リポジトリのルートで実行します。

```sh
make setup    # 初回設定、Dockerイメージ取得、両サービスの起動
make check    # 必須コマンド、権限、Maxima、STACK API、WebAppの総合診断
make install-deps  # 不足コマンドのOS別導入案を表示し、確認後に導入
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

`make check`はPython 3.10以降、Git、Make、Docker CLI、Docker Compose、Docker Desktop（Mac／Windows）を個別に確認します。macOSではHomebrew、全OSでホストMaximaも表示しますが、これら2つは必須ではありません。不足がある場合、`make setup`または`make install-deps`は実行予定のOS別コマンドを先に表示し、端末で明示的に許可された場合だけ実行します。LinuxのDocker Engine自体は、リポジトリ設定と管理者権限を伴うため自動インストールしません。Docker socketの権限不足だけは、`make check`と`make setup`が内容と注意点を表示し、端末で明示的に許可された場合に限り`sudo usermod -aG docker <ユーザー名>`を実行します。Python自体がない場合は管理スクリプトを実行できないため、先にOSのPython 3を導入してください。

## stack_includeの公開URL

問題変数をXMLへ直接記述する方式が既定です。「問題変数を別ファイルに保存する」を有効にした場合だけ、別ファイルと`stack_include(...)`を生成します。一般ユーザーは、Moodle／STACKサーバーから取得できる公開URLを初回setupで指定してください。

```sh
make setup INCLUDE_BASE_URL=https://username.github.io/repository/
```

末尾の`/`は自動的に補われ、設定は`app/mcq-webapp/.local-config.json`へ保存されます。画面の「include URLベース」でも一時的に変更できます。このURLは、生成XML内の`ky_linear_algebra.mac`、`tex_library.mac`、各`mcq_template_*.mac`と、別保存した問題変数ファイルのすべてに適用されます。公開先にはリポジトリのこれらのファイルを同じ相対配置で置いてください。たとえば問題名が`NurseSample001`なら、問題変数の生成URLは次のようになります。

```text
https://username.github.io/repository/001/NurseSample001.txt
```

設定を省略した場合は、後方互換性のため`https://yositomi-opu.github.io/stack_questions/`を使用します。自分で作成したincludeファイルをこのURLへ配置することはできないため、別ファイル方式を使うユーザーは自分のGitHub PagesまたはWebサーバーを設定する必要があります。`localhost`は通常Moodleサーバー自身を指すため、MoodleとWebAppが同一ホストでない限り指定しないでください。

画面右上の`English`／`日本語`ボタンで表示を切り替えられます。表示言語と、左欄で選んだ基本言語・展開先言語はブラウザのlocalStorageに保存され、同じブラウザ・同じURLのサイトで次回起動時に復元されます。保存済みの表示言語はサーバーの初期言語設定より優先されます。問題文、選択肢、生成XML、STACK API応答の内容は切替対象外です。

## OS別の起動

### macOS

Docker Desktop、Git、Python 3.10以降をインストールします。ターミナルでは`make setup`を実行します。Finderからは`scripts/macos/start-mcq-webapp.command`をダブルクリックでき、未設定ならsetup、設定済みならstartを自動実行してブラウザを開きます。

Homebrewが利用できる場合、Docker Desktopは次のコマンドでインストールして起動できます。

```sh
brew install --cask docker-desktop
open -a Docker
```

macOSでは`make setup`、`make start`、`make restart`、Finderからのランチャー起動時にDockerへ接続できなければ、インストール済みのDocker Desktopを自動起動し、最大120秒待ってから処理を続けます。すでにDockerが動作していればそのまま使用します。初回設定画面が表示された場合は画面の案内に従ってください。時間内に起動しなければ理由と再実行の案内を表示します。`make check`は接続診断のみを行います。`make setup`はOSを自動判別し、macOSでDocker Desktop本体が見つからない場合には上記のインストール方法を表示します。

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

`docker info`がpermission deniedになる場合、`make check`は実行ユーザーが`docker`グループに未登録か、登録済みだが現在のセッションへ未反映なのかを判別します。未登録の場合は、dockerグループがroot相当の権限を持つことと実行予定のコマンドを表示し、確認を得た場合だけ実行します。通常版Dockerでは`groupadd`／`usermod`、`/snap/bin/docker`で検出されるSnap版では`addgroup`／`adduser`とDocker Snapの無効化・再有効化を使用します。実行後はいったんログアウトしてログインし直し、`docker info`を確認してから`make setup`を実行してください。`sudo make check`や`sudo make setup`は、リポジトリ内にroot所有ファイルを作る可能性があるため使用しないでください。

Workshop参加者が別PCのブラウザから接続する場合は、初回だけ次のように設定します。

```sh
make setup HOST=0.0.0.0 LOCALE=ja
```

ブラウザでは`http://<UbuntuサーバーのIP>:4173/`を開きます。ファイアウォールではTCP 4173だけを必要なネットワークから許可してください。STACK APIの3080番ポートはDocker Composeにより`127.0.0.1`だけへbindされ、WebAppサーバー経由で利用されます。公開サーバーでは、TLSと認証を提供するリバースプロキシを別途設置してください。

同じUbuntuホストのMoodleへログインした教員だけに公開する場合は、4173番を直接公開せず、Moodleと同じNginx経由で認証する構成を推奨します。この場合は`HOST=127.0.0.1`を使用してください。Moodle 4.5用localプラグイン、Nginx設定例、導入・確認手順は[deploy/moodle-auth/README.ja.md](../../deploy/moodle-auth/README.ja.md)にあります。これはLTIではなく、WebApp本体とMoodleを疎結合のまま保つ同一ホスト用の認証ゲートです。

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

- macOSで「Docker Desktop本体が見つかりません」：`brew install --cask docker-desktop`で導入し、`open -a Docker`で起動します。Dockerメニューの表示後、起動完了まで待ってから`make setup`を再実行してください。
- `server.py: No such file or directory`：リポジトリのルートへ移動してから実行するか、OS別ランチャーを使用してください。
- `Address already in use`：同じポートのサーバーがすでに動作しています。ブラウザで`http://127.0.0.1:4173/`を開くか、`--reload`で再起動してください。
- clone直後の`STACK code: 未読込`：Docker権限を反映して`make setup`を実行すると、Docker内のSTACK用Maximaが自動的に使われます。ホストMaximaを使う場合だけ、`--install-stack`または`--setup-stack`で設定してください。
- `rand(...)`などが式のまま表示される：`--check`で`STACK code: OK`を確認し、サーバーを`--reload`で再起動してからブラウザを再読み込みしてください。
- ダンプ生成に失敗する：通常は評価時の通常読込へ自動的に切り替わります。手動設定では`--no-dump`を追加できます。
- macOSで「`maxima-stack`は開けません。ゴミ箱に入れますか？」と表示される：`maxima-stack`はホスト固有の生成キャッシュで、Nextcloud経由で別のMacへ同期して使うものではありません。ゴミ箱へ移して構いません。`make check`は隔離属性の付いたキャッシュを実行せず設定から外し、通常読込またはDockerへ切り替えます。
- WindowsでMaximaが見つからない：`MAXIMA_EXECUTABLE`に`maxima.bat`または`maxima.exe`の実際のパスを設定してください。

## バリアント用パラメータ

「パラメータ」見出し右端の「？」にカーソルを置くかフォーカスすると、共通includeを使う際の用途と実行順を確認できます。問題文の上の「パラメータ」欄には、`%_rk:2;` など問題変数本体より先に実行する調整値を入力します。既存XMLのメイン問題変数欄で `stack_include(...)` の前に書かれた設定を読み込み、選択肢数・正解数は画面の選択肢設定へ、それ以外はパラメータ欄へ復元します。XML側の選択肢設定はinclude先の既定値より優先します。

保存するXMLでは、メイン問題変数を次の順に出力します。

```maxima
%_MCQ_NUM_OPTS:8;
%_MCQ_NUM_COPTS:rand([2, 3, 4, 4]);
%_rk:2;
stack_include("https://example.org/001/GaussElimMatrixGivenRank-A.txt");
```

`rand([2, 3, 4, 4])` の重複値は抽選の重みとして保持します。選択肢数・正解数は選択肢設定欄で指定し、パラメータ欄へ二重に書かないでください。include先では `if not numberp(%_rk) then %_rk:1;` のような既定値の定義にすれば、同じファイルをrank違いの問題で共有できます。

パラメータはXMLの再編集用データとCSVの `config,parameters,...` にも保存されます。複数行は通常のCSV引用セルで保持します。古い再編集用データやCSVにパラメータがなければ空欄になります。ローカルCAS評価とCAS検証用コピーも同じ実行順を使います。パラメータは共有includeファイルには埋め込まず、各問題のXMLに保持します。問題変数を直接XMLへ保存する場合も、選択肢設定・パラメータ・問題変数本体の順です。

## ローカルCAS評価

「問題変数を評価」を押すと、ローカルMaximaが次のファイルを読み込んでから問題変数と選択肢のCAS式を評価します。

- `ky_linear_algebra.mac`
- `tex_library.mac`
- `mcq_template_pre.mac`

「定義済み変数」には、問題変数欄のトップレベル代入から抽出した変数名、型、リストの`length`、評価値が表示されます。選択肢の`cas_list`は入力欄にも評価結果が表示され、`CASリスト length: 3`のように候補数を確認できます。`cas_list`の評価結果がリストでなければエラーにします。一方、型が`cas`の値は、評価結果がリストの形でも1個の選択肢として扱います。

`cas_list`をまだ評価していない場合、生成可否の検証では候補数を安全側に1件として扱いますが、選択肢数の入力値は変更しません。上限は未確定とし、評価成功後に実際の候補数から更新します。候補が足りない設定も自動で書き換えず、生成時にエラーを表示します。「問題変数を評価」を押すとリスト長に応じて選択肢数の上限が更新されます。1つのパターン内にCASリスト式を複数置いた場合は、各リストを平坦化した候補リストとして生成します。

問題変数または選択肢を変更すると評価結果は「再評価が必要」になります。ランダム変数を含む場合、表示される値と`length`はその評価時点の1回分です。

このAPIは入力したMaximaコードをローカルで実行します。信頼できる問題コードだけを評価し、外部公開用サーバーとしては使用しないでください。

既存XMLの問題変数が`stack_include`でリポジトリ内の`.txt`または`.mac`を参照している場合、WebAppはローカルサーバー経由でそのファイルを優先して読み込みます。外部公開URLへ接続できない環境でも、clone済みのincludeファイルから問題文と選択肢を復元できます。CAS式を含むXMLは、読込後に問題変数と選択肢を自動評価します。 再編集用メタデータのない既存XMLでは、`%__CoptL1`／`%__Copt1L`などの正解候補と対応する`%__Wopt...`への代入を、式全体の`cas_list`として復元します。`[aa, bb]`、リスト変数、`map(...)`などを個々の`cas`へ分解せず保持し、多言語の場合は各言語の候補リストを保持します。

## STACK APIによる動作確認

`make setup`／`make start`は、公式STACK APIとgoemaximaをDockerで起動します。既定URLは`http://127.0.0.1:3080`で、画面にも自動設定されます。

- 「接続確認」：STACK APIの`/render`へ確認用リクエストを送り、JSON応答を受信できるか確認します。
- 「生成XMLをテスト」：現在画面に生成されている問題XMLをSTACK APIの`/test`へ送り、STACK側のテスト結果を表示します。

API応答の詳細は画面上で展開して確認できます。Workshop公開時のサーバーサイドリクエスト偽装を防ぐため、既定ではセットアップ済みのローカルURL以外へ接続できません。信頼できるローカル環境で別のSTACK APIを使う場合だけ、`server.py`を`--allow-remote-stack-api`付きで直接起動します。

この機能はローカルの`server.py`を経由してSTACK APIへ接続します。

## インポート前のプレビュー

画面上部の「プレビュー」で、編集中の問題をMoodleへインポートせずに表示できます。選択肢を選んで「回答を採点」を押すと、得点とフィードバックを確認できます。「解説を表示」は問題に設定された全般的な解説を表示します。

「別バリエーション」で乱数の種を変えられます。特定の種を再現する場合は数値を入力し、「この種で表示」を押してください。種を変えた直後は、再表示するまで採点できません。

プレビューには、表示時点の選択肢設定・パラメータ・編集中の問題変数を使います。別ファイル形式でも、編集中のinclude内容を反映するために公開ファイルを先に更新する必要はありません。共通ライブラリはこのclone内のファイルを使用し、表示した問題のコピーで採点します。編集後はプレビューを閉じ、再度開いてください。CASリストが未評価の場合は、先に「問題変数を評価」を実行します。

- 起動中のSTACK APIが必要です。通常は `make start` で起動します。APIへ接続できない場合はプレビュー内にエラーを表示します。
- プレビュー操作はCSV・保存用XML・共有includeファイルを変更しません。
- 数式表示用のMathJaxを同梱しており、外部CDNへの接続は不要です。
- Moodleのテーマによる見た目の違いは残ります。JavaScriptを使う対話型の図（JSXGraphなど）はこのプレビューの対象外です。
- clone内に存在しないincludeは、取得できない旨を表示します。公開先で使うライブラリとclone内の版が異なる場合は、Moodle側でも最終確認してください。

## CSV / XLSX 形式

ヘッダーは付けず、`config`行は従来どおり「項目、値」の3列、データ行は「項目、型、言語、値」の4列で記述します。新規保存では`csv_schema=2`を出力しますが、従来形式のCSVも読み込めます。

```csv
config,csv_schema,2
config,question_id,000.sample-mcq
config,mode,rb
config,num_options,2
config,num_correct,1
config,random_correct,false
config,correct_counts,"1, 2"
config,require_pairs,true
config,feedback_by_truth,mixed
config,base_language,ja
qtextL,string,ja,"次の各記述を検討せよ。__SELPROMPT__"
qvar,cas,n/a,"aa1:rand([1, 2, 3])"
option1C,string,ja,"パターン1が正解の場合の文"
option1W,string,ja,"パターン1が不正解の場合の文"
feedback1,string,ja,"パターン1に共通のフィードバック"
option2C,cas_list,n/a,"makelist(castext(i^2),i,1,5)"
option2W,string,ja,"パターン2が不正解の場合の文"
feedback2C,string,ja,"パターン2の正解の場合のフィードバック"
feedback2W,string,ja,"パターン2の不正解の場合のフィードバック"
```

- 第2列の型は`string`、`cas`、`cas_list`です。`string`と`cas`は1個の選択肢、`cas_list`は評価結果のリストを複数候補として使います。`qtextL`と`feedback`では`cas_list`を使用できません。読込時は旧表記の`caslist`も認識しますが、保存時は`cas_list`へ統一します。
- 第3列は言語コードです。`en`, `ja`, `fr`, `it`, `de`, `pt`, `zh`, `ko`, `ru`, `sv`を使用できます。空欄または`n/a`は言語非依存として読み込み、保存時は`n/a`へ統一します。
- 同じ項目を`n/a`と個別の言語コードの両方で定義することはできません。どちらか一方へ統一してください。
- `option1C`と`option1W`はパターン1の正解・不正解の選択肢です。同一項目・同一言語は1行だけにし、複数候補は`cas_list`で記述します。
- `feedback1`はパターン1のC/W共通フィードバック、`feedback1C`と`feedback1W`は正解・不正解別フィードバックです。パターンごとに共通と正解・不正解別を混在できます。
- `qtextL`は問題文、`qvar,cas,n/a,...`は問題変数です。問題変数は上から順に挿入し、末尾に`;`または`$`がなければ`;`を補います。CSVセル内の改行も保持します。
- `config`: 任意です。`question_id`, `mode`, `num_options`, `num_correct` を指定できます。
- `config,random_correct,true`: 正解数をランダムにします。候補は `config,correct_counts,"1, 2, 3"` のように指定します。
- `config,require_pairs,true`: 各パターンに C/W の両方を必須とし、正解・不正解の選択肢をランダムに割り当てます（既定）。
- `config,feedback_by_truth`は`false`、`true`、`mixed`のいずれかです。各`feedback...`行が実際のパターン別設定として優先されます。

正解・不正解一対モードの「行追加」は、新しい同一パターンのC行とW行を1行ずつ追加します。「追加時は正解・不正解別フィードバック」は新しいパターンの既定値です。各パターンの「正解・不正解別」で個別に切り替えられます。共通から正解・不正解別へ変えると同じ内容をC/Wへコピーします。異なるC/Wを共通へ戻そうとした場合は、内容を失わないよう変更せず警告します。

```csv
feedback1C,string,ja,"正解の場合のフィードバック"
feedback1W,string,ja,"不正解の場合のフィードバック"
```

`require_pairs=true`のCSVを読み込んだとき、`option1C`または`option1W`の片方がなければ、アプリは欠けた側の空欄行を追加して警告します。`cas_list`はローカルMaximaでリストであることと`length`を検査します。同じ項目を複数言語で指定した場合は、言語間のリスト長も一致する必要があります。

### 選択指示のプレースホルダー

初期サンプルは、選択対象を問題文側で指定する`__SELTYPE__`を使います。日本語では「間違っているものを __SELTYPE__。」「rankが1であるものを __SELTYPE__。」のように書けます。日本語の置換は「1つ選べ」「すべて選べ」、複数正解のRadio形式では「1つ選べ（正解が複数あっても1つでよい）」です。英語では `__SELTYPE__ matrices of rank 1.` のように語順を変えます。

指示文全体を自動挿入する場合は、独立した文として`__SELPROMPT__`を使用します。Radio／Checkboxと正解数に応じて、たとえば日本語では次の完全な指示文に置換されるため、文法が周囲の語順に依存しません。

- Radio・正解1個：`正しいものを1つ選べ。`
- Radio・正解候補が複数：`正しいものを1つ選べ（複数ある場合も1つでよい）。`
- Checkbox：`正しいものをすべて選べ。`

英語、フランス語、ドイツ語、イタリア語、ポルトガル語、中国語、韓国語、ロシア語、スウェーデン語にも対応しています。`__SELTYPE__`は名詞句の前後に置く断片なので、言語やRadio／Checkboxの組合せによっては文法を完全には保証できません。

「多言語展開」はChatGPTへ渡す翻訳依頼を作成します。この時点のJSONの `question_text` と `rows` は翻訳元なので、基本言語が日本語なら日本語のままです。返答JSONの `translations.pt` などに目的言語の訳文が入っていることを確認してから「結果を反映」を押してください。

CAS式の問題文・選択肢・フィードバックも翻訳依頼に含めます。式内の人が読む文章だけを翻訳し、変数名・関数名・数式・プレースホルダーを保持した式全体を返す方式です。反映時もCAS式／CASリストの型を維持します。「言語に依存しない」項目は翻訳対象外です。依頼の作成だけで、既存の他言語のCAS式を日本語で上書きすることはありません。

多言語の選択肢とフィードバックは、言語を追加フィールドにします。

```csv
option1C,string,ja,"日本語"
option1C,string,en,"English"
feedback1,string,ja,"日本語のフィードバック"
feedback1,string,en,"English feedback"
```

## ランダム化

命題パターンを STACK/Maxima の `random_permutation` で並べ替えます。その先頭から `num_correct` 個を C 文による正答パターンにし、続く `num_options - num_correct` 個を W 文による誤答パターンにします。同一パターンの C/W が同じ問題内に同時出現することはありません。

## 正解・不正解を固定するモード

数学問題など、パターンごとに C/W の対を作らない場合は、画面の「各パターンは正解・不正解1対以上を必須とする」をオフにするか、CSVに次を書きます。

```csv
config,require_pairs,false
```

このモードでは画面が「正解選択肢」と「誤答選択肢」の2表に分かれます。各行でパターン番号、候補、フィードバックを編集します。複数候補は`cas_list`で記述します。

```csv
option1C,cas_list,ja,"[""正解候補1"",""正解候補2""]"
feedback1C,string,ja,"パターン1のフィードバック"
option2W,cas_list,ja,"[""誤答候補1"",""誤答候補2""]"
feedback2W,string,ja,"パターン2のフィードバック"
```

CSV/XLSXはパターン、正解・不正解、言語を列として検査しやすいため、入力形式として維持しています。Markdownは説明文や利用ガイドに使用します。

### 正解・不正解の入れ替えと評価ログ

正解・不正解一対モードでは、各パターンの「正↔不」でそのパターンを、表の上の「全体：正↔不」で全パターンの選択肢とフィードバックの内容を入れ替えられます。正解・不正解の表示位置は維持します。両側の候補行数が異なる場合は、入れ替え後の候補数に合わせて各側の行数が変わります。全言語の選択肢とフィードバック、入力形式をまとめて保持します。共通フィードバックはそのままです。もう一度押すと元に戻ります。CAS評価結果はクリアされるので必要に応じて再評価してください。問題文の選択条件は自動変更しません。

問題変数やCAS選択肢の評価に失敗すると「評価ログ（エラー詳細）」が開きます。Maximaの出力と、評価に送ったコードを行番号付きで確認できます。include先で起きたエラーはログのファイル名も確認してください。Maximaが行番号を出さないエラーもあり、問題箇所の自動特定を保証するものではありません。

構文エラーでは、文末の `;`／`$`、引用符、括弧、コメントの閉じ忘れを調べ、推定原因と評価コード内の行・内容を表示します。複数行の式を考慮し、各行へのセミコロン追加は行いません。内部の評価マーカーを除いたエラー出力を先に表示し、元の出力は「Maximaの生ログ」から確認できます。推定は簡易的なものであり、include先や複雑な構文では該当行を特定できないことがあります。

フィードバック欄の「正解・不正解別」は、オンにすると両者のフィードバックを個別に設定できます。「言語に依存しない」は、そのフィードバックを多言語翻訳の対象外にします。各チェック欄にカーソルを合わせると説明を表示します。

### 特殊選択肢と採点方式

「形式」の下で「選択肢に正解はない」「わからない」を追加できます。既定ではどちらもオフです。通常の選択肢数には含めず、末尾へ追加します。「選択肢に正解はない」の正誤は設定された正解数が0かどうかで決まり、「わからない」の得点は0です。

Checkboxのときだけ、形式の右に採点方式を表示します。Radioは従来方式に固定して正解1点・不正解0点とし、Checkboxへ戻すと選んでいた方式を復元します。採点方式は `1: Jaccard`（従来・既定）、`2: MTF`、`3: φ係数`、`4: CFG` から選択します。設定はXMLのメタデータとCSVの `config,nocorrectopt`、`config,noidea`、`config,scmethod` に保存されます。旧CSV/XMLでは既定値を使います。手書きの問題ではpreテンプレート読込後に `%__mcq_scmethod:3;` などを指定してください。

通常の正解候補数を `cN`、不正解候補数を `wN`、選んだ正解候補数を `cAN`、選んだ不正解候補数を `wAN` とすると、部分点の計算式は次のとおりです（ATCM 2022論文 §2.4）。

| 番号 | 方式 | 計算式 |
| --- | --- | --- |
| 1 | Jaccard | `cAN/(cN+wAN)` |
| 2 | MTF | `(cAN+wN-wAN)/(cN+wN)` |
| 3 | φ係数 | `(cAN*(wN-wAN)-(cN-cAN)*wAN)/sqrt(cN*wN*(cAN+wAN)*(cN+wN-cAN-wAN))` |
| 4 | CFG | `2*(cAN+wN-wAN)/(cN+wN)-1` |

部分点を無効にしている場合は従来どおり `sc=0` です。φ係数の分母が0になる全選択・未選択などでは0とします。通常の正解候補が0のときは、完全正答なら1、そうでなければ0とし、ゼロ除算を避けます。特殊選択肢に関する既存の0点判定も維持します。Radio形式で正解を1つ選んだときの満点処理など、PRTの分岐は変更しません。

**負点について:** φ係数・CFGの `sc` は負になる場合があります。検証したSTACK APIでは `sc=-1` がフィードバックに表示されても最終得点は0%でした。この変更だけでは、Moodleの成績に負点が記録されることは保証できません。最終得点として負点を使う場合は、STACK／Moodle側の採点処理・問題動作の対応が別途必要です。
