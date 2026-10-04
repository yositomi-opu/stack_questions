# ログイン不要の練習サイト（Ubuntu VPS）

教員が登録したCSV/XMLから、問題表示・回答・採点・解説・別バリエーションを提供します。
Moodleと学生アカウントは不要です。成績・回答の永続保存はありません。
既存エディターとは別のサーバーで、編集・問題アップロード・AI翻訳・任意のMaxima評価APIは公開しません。
問題へのリンクは `https://practice.example.org/?q=問題ID` です。問題を選択するとURLへIDが入ります。
UIは日本語／English、問題本文は登録されている言語をプレビュー内で選べます。

## 構成と準備

- Ubuntu 24.04 amd64。Docker上でSTACK API・Maxima、Pythonで練習サイト、NginxでHTTPSを提供します。
- 最初の目安は2 vCPU・4 GB RAM。これは同時利用人数を保証する値ではありません。授業前に実問題・予定人数で負荷確認してください。
- DNSのAレコードをVPSに向けるサブドメインを用意します。IPv6を使わない場合は不要なAAAAを設定しません。
- 公開するポートはSSHとHTTP/HTTPSだけ。3080・4173・4174は外部公開しません。
- 教員が作成・確認した問題だけ登録します。学生はファイルやURLをサーバーに渡せません。
- まずMac等の既存アプリで問題を確認し、XMLを保存して転送すると、CSVの動的リスト評価の追加設定を省けます。

以下は新しい専用VPSで、sudo権限を持つ管理ユーザーが作業する例です。
実際のVPSへの導入、DNS/TLS、STACKの実採点、負荷確認は別途実施します。

```sh
sudo apt update
sudo apt install git make python3 nodejs docker.io docker-compose-v2 nginx certbot python3-certbot-nginx
sudo systemctl enable --now docker
sudo git clone https://github.com/yositomi-opu/stack_questions.git /opt/stack_questions
sudo adduser --system --group --home /var/lib/mcq-practice mcq-practice
sudo install -d -m 0750 -o root -g mcq-practice /var/lib/mcq-practice
sudo install -d -m 0750 -o root -g mcq-practice /var/lib/mcq-practice/source
```

STACK APIを起動します。既存のFreeBSD VPSを変更する必要はありません。

```sh
cd /opt/stack_questions
sudo env MCQ_REPO_ROOT=/opt/stack_questions docker compose -p stack-mcq-webapp -f deploy/stack-api/compose.yaml up -d --pull missing
```

ここでは `make setup` は不要です（編集用WebAppも起動するため）。Composeの再起動ポリシーにより、Docker起動時にコンテナが再開します。

## 問題の登録

教員のCSV/XMLをSSH/SCPで転送し、`/var/lib/mcq-practice/source/` に置きます。
問題1問につき1ファイルです。ファイル名は重複させないでください。CSVにはNode.js 18以上が必要です。

```sh
cd /opt/stack_questions
sudo sh -c 'python3 scripts/mcq_practice_catalog.py /var/lib/mcq-practice/source/*.xml -o /var/lib/mcq-practice/catalog.json --check-api'
sudo chown root:mcq-practice /var/lib/mcq-practice/catalog.json
sudo chmod 0640 /var/lib/mcq-practice/catalog.json
```

CSVの場合は `*.xml` を `*.csv` に変えます。混在の場合はファイルを列挙します。
指定したファイル一式でカタログを置き換えます。追加時も、残す問題を含めて指定してください。
変換や `--check-api` の確認に失敗した場合は、既存カタログを置き換えません。
`--check-api` は各問題の全登録言語をseed=1で描画確認します。すべての乱数・採点を保証する検査ではありません。

CSV中のリスト変数で長さ評価が必要な場合は、既存エディターで評価してXML保存する方法を推奨します。
または信頼できるローカルの編集サーバーを起動し、登録コマンドへ `--evaluate --webapp-url http://127.0.0.1:4173` を加えます。
編集サーバーは公開しないでください。

`stack_include` は登録時にclone内のファイルへ展開し、問題のコピーへ埋め込みます。
GitHub Pagesの既定URLと従来のライブラリURLは、対応するclone内ファイルを使います。
**GitHubで公開しているだけでは十分ではなく、VPSのcloneにも同じファイルが必要です。**
登録時には外部URLをダウンロードしません。cloneにないファイルや動的なincludeは登録エラーになります。
問題変数の別ファイルを使用する場合は、同じ相対パスで配置してください。
ライブラリを更新したらカタログを再生成して再起動します。

カタログは問題ソース・正解を含むためWeb公開ディレクトリには置きません。
IDは入力ファイル名から生成するので、内容を直してもリンクは維持されます。ファイル名変更・CSVからXMLへの変更でIDは変わります。

## 起動・HTTPS

```sh
sudo cp deploy/practice/mcq-practice.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mcq-practice
curl --fail http://127.0.0.1:4174/healthz
sudo cp deploy/practice/nginx.conf /etc/nginx/sites-available/mcq-practice
sudoedit /etc/nginx/sites-available/mcq-practice
```

設定中の `practice.example.org` を実際のホスト名に変えた後:

```sh
sudo ln -s /etc/nginx/sites-available/mcq-practice /etc/nginx/sites-enabled/mcq-practice
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d practice.example.org
```

最後のコマンドも実際のホスト名に置き換えてください。さくらのパケットフィルター等で80/443を許可します。
ドメインとHTTPS設定が終わってから学生へURLを案内します。
Nginx設定はドメインのルート配置用です。サブディレクトリ配置は対象外です。

## 確認と運用

- 登録した各問題で正答・誤答・未回答、解説、別バリエーション、言語切替、数式表示を確認。
- `/api/maxima/evaluate`、`/api/ai/settings`、`/server.py`、`/.local-config.json` が404になることを確認。
- 乱数・言語・出題時XMLはサーバー側に保持し、採点時のクライアント指定では変更できません。
- セッションは1時間で失効。再起動や容量上限でも失効するので、問題を再表示してください。
- 計算は同時2件まで。混雑時は再試行を案内します。NginxはIP単位の頻度制限もします。学内NAT等で多数が同一IPになる場合は、負荷試験後に制限値を調整してください。
- 成績・回答は永続保存しませんが、通常のWebアクセスログと障害診断ログは残ります。
- JSXGraph等の対話型コンテンツは既存プレビューと同じく対象外です。
- `/healthz` はWebサーバーの稼働だけを確認します。STACKの確認は登録時検査や実問題の表示・採点で行います。

```sh
sudo systemctl restart mcq-practice
sudo systemctl status mcq-practice
sudo journalctl -u mcq-practice -n 100 --no-pager
sudo docker compose -p stack-mcq-webapp -f /opt/stack_questions/deploy/stack-api/compose.yaml logs --tail=100
```

更新時は `sudo git -C /opt/stack_questions pull --ff-only` し、カタログを再生成・権限を設定してから練習サービスを再起動します。
ライブラリの変更は実行中の問題には反映されません。Dockerイメージの更新は別途計画してください。

## ローカルで準備する場合

```sh
python3 scripts/mcq_practice_catalog.py app/mcq-webapp/sample.csv -o /tmp/mcq-practice.json
python3 app/mcq-webapp/practice_server.py --catalog /tmp/mcq-practice.json
```

`http://127.0.0.1:4174/` で確認します。問題の実表示・採点には3080番のSTACK APIが必要です。
