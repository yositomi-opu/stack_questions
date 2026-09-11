# stack_questions

[English](README.md) | **日本語**

Moodleの問題タイプSTACKで使う、線形代数・微積分の問題集とMaximaライブラリです。多肢選択問題（MCQ）をCSVや編集画面から作成し、Moodleへ取り込めるXMLとして保存するWebAppも含まれています。

## WebAppを使う

Git、Python 3.10以降、Make、DockerとDocker Composeを用意します。macOS・WindowsではDocker Desktopを使用できます。OS別の導入手順は [WebApp利用ガイド](app/mcq-webapp/README.md) を参照してください。

取得したリポジトリのルートで初回セットアップを実行します。

```sh
make setup
```

セットアップ後、[http://127.0.0.1:4173/](http://127.0.0.1:4173/)を開きます。問題文・選択肢・フィードバックを編集し、CSVで編集内容を保存するか、XMLでMoodleへ取り込みます。数式やランダム変数を使う場合は「問題変数を評価」で確認してください。

2回目以降の起動は `make start`、停止は `make stop`、環境の診断は `make check` です。macOSでは起動時にDocker Desktopも必要に応じて自動起動します。これらのコマンドは `sudo` を付けずに実行してください。

問題変数を `stack_include` で別ファイルから読み込む場合は、そのファイルをMoodleから取得できる場所へ公開します。公開先の指定方法と、rankなどを変えるバリアントの作り方は [WebApp利用ガイド](app/mcq-webapp/README.md) にまとめています。

## サンプルと主なファイル

| 場所 | 内容 |
| --- | --- |
| [app/mcq-webapp](app/mcq-webapp/) | MCQ編集・XML生成WebApp |
| [app/mcq-webapp/samples.ja](app/mcq-webapp/samples.ja/) | 看護学・民法・経済学・統計・研究倫理・情報／AIの日本語CSVサンプル60問 |
| [001](001/) | 数学のMCQ問題と、その問題変数ファイル |
| [005](005/) | 数値や数式を入力するドリル形式の演習 |
| [010](010/) | 授業での利用を想定した解説付き演習 |
| [001.MCQ-rb.xml](001.MCQ-rb.xml) / [001.MCQ-cb.xml](001.MCQ-cb.xml) | Radio／Checkbox形式のXMLテンプレート |

CSVサンプルはWebAppの「CSV/XLSX読込」から開けます。内容を授業の目的に合わせて確認・編集して使ってください。

## 問題を作成する

MCQでは、確認したい概念と、学習者が陥りやすい誤概念を考えて選択肢を作ります。単純な計算ミスだけを区別する問題には、数値・数式を直接入力する形式も適しています。

WebAppでは、真・偽の文を対にしてランダムに出題する形式と、正解候補・誤答候補を別々に用意する形式を選べます。選択条件を自分で書く場合は、たとえば `rankが1であるものを __SELTYPE__。` と記述できます。設定に応じて「1つ選べ」「すべて選べ」などへ置換されます。詳しくは [選択指示の説明](app/mcq-webapp/README.md#選択指示のプレースホルダー) を参照してください。

Maximaコードを直接編集する場合の実装例は [001/Sample.txt](001/Sample.txt) にあります。

### 多言語対応

WebAppでは基本言語で作成した問題を他の言語へ展開し、翻訳結果を確認・修正できます。対応言語は英語・日本語・フランス語・イタリア語・ドイツ語・ポルトガル語・中国語・韓国語・ロシア語・スウェーデン語です。

Maximaで直接記述する場合、問題文やフィードバックを言語コードと文章の組で定義します。たとえば：

```maxima
%__mcq_qtextL:[["ja", "次の主張について正しいものを __SELTYPE__。"],
              ["en", "__SELTYPE__ correct statements."]];
```

言語別の選択肢には `%__CoptL1L`・`%__WoptL1L`、言語に依存しない候補リストには `%__CoptL1`・`%__WoptL1` を使います。これらの記述例も [001/Sample.txt](001/Sample.txt) を参照してください。翻訳後は、文章の意味と数式の表示が保たれていることを確認します。

## サーバー管理者向け

Moodleへログインした教員にWebAppを公開する構成と、Workshop用アカウントの一括作成・管理については [Moodle連携・管理ガイド](deploy/moodle-auth/README.ja.md) を参照してください。

## 開発に参加する

現在の開発状況・検証結果・未完了事項は [HANDOFF.md](HANDOFF.md)、開発エージェント向けのルールは [AGENTS.md](AGENTS.md) に記載しています。ライセンスは [LICENSE](LICENSE) を参照してください。
