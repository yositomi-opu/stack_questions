# MoodleログインによるMCQ WebAppの保護

[English](README.md) | **日本語**

この構成はLTIではありません。同じUbuntuホストのNginxでMCQ WebAppをリバースプロキシし、すべてのリクエストをMoodleのログイン状態と権限で認証します。WebAppはMoodleのAPIやデータベースへ直接接続せず、生成したXMLのimportは利用者がMoodle上で行います。

アクセスを許可する条件は次のすべてです。

- Moodleへログインしていてguestではない
- 管理者が指定したWorkshopコースで`moodle/question:add`権限を持つ
- localプラグインのアクセス制御が有効になっている

## 前提

- Moodle 4.5以降
- MoodleとMCQ WebAppが同じUbuntuホストにある
- NginxとPHP-FPMを使用している
- MCQ WebAppは`127.0.0.1:4173`だけで待ち受ける
- Moodleの外部公開URLはHTTPSである

MoodleがURLのルートにある場合、WebAppのURLは`https://Moodleのホスト名/mcq-webapp/`とします。`$CFG->wwwroot`が`https://example.org/moodle`のようにサブディレクトリを含む場合は、`https://example.org/moodle/mcq-webapp/`としてください。WebAppをMoodleのセッションcookie path内に置かないと、ブラウザが`MoodleSession` cookieを送らず認証できません。

## 1. WebAppをloopbackで起動

リポジトリのルートで実行します。以前`HOST=0.0.0.0`で設定した場合も、このsetupでloopbackへ戻します。

```sh
make setup HOST=127.0.0.1 LOCALE=ja
make check
```

`MCQ WebApp bind: 127.0.0.1:4173`と表示されることを確認してください。TCP 4173をファイアウォールで公開する必要はありません。STACK APIの3080番もloopbackのままにします。

## 2. Moodle localプラグインをインストール

Ubuntu上のclone済みrepositoryから実行します。

```sh
make install-moodle-auth MOODLE_ROOT=/home/www/htdocs/moodle
```

スクリプトはコピー先を`/home/www/htdocs/moodle/local/mcqwebapp`だけに限定し、配置前にMoodle rootと既存pluginを検査します。必要なファイル操作とMoodle CLIだけを`sudo`で実行し、repository側の所有者は変更しません。

手動で配置する場合は次のとおりです。

```sh
sudo install -d -o root -g www-data -m 0755 \
  /home/www/htdocs/moodle/local/mcqwebapp
sudo cp -R deploy/moodle-auth/local/mcqwebapp/. \
  /home/www/htdocs/moodle/local/mcqwebapp/
sudo chown -R root:www-data /home/www/htdocs/moodle/local/mcqwebapp
sudo find /home/www/htdocs/moodle/local/mcqwebapp \
  -type d -exec chmod 0755 {} +
sudo find /home/www/htdocs/moodle/local/mcqwebapp \
  -type f -exec chmod 0644 {} +
sudo -u www-data /usr/bin/php \
  /home/www/htdocs/moodle/admin/cli/upgrade.php --non-interactive
sudo -u www-data /usr/bin/php \
  /home/www/htdocs/moodle/admin/cli/purge_caches.php
```

## 3. プラグインを設定

Moodleの「サイト管理 > プラグイン > ローカルプラグイン > MCQ WebAppアクセス」を開き、次を設定します。

- WorkshopコースID: コースURLの`course/view.php?id=12`なら`12`
- WebApp URL: 例`https://moodle.example.org/mcq-webapp/`
- 「Moodleアクセス制御を有効にする」: Nginx設定後にオン

先にCLIで設定する場合は、値を実環境に合わせて次のように実行できます。

```sh
sudo -u www-data /usr/bin/php /home/www/htdocs/moodle/admin/cli/cfg.php \
  --component=local_mcqwebapp --name=courseid --set=12
sudo -u www-data /usr/bin/php /home/www/htdocs/moodle/admin/cli/cfg.php \
  --component=local_mcqwebapp --name=toolurl \
  --set=https://moodle.example.org/mcq-webapp/
```

## 4. Nginxで認証付きproxyを追加

まずNginxが`auth_request`を含むことを確認します。Ubuntu公式packageでは通常有効です。

```sh
sudo nginx -V 2>&1 | grep http_auth_request_module
```

Moodleを処理している既存の`server {}`ブロック内へ、[nginx-mcq-webapp.conf.example](nginx-mcq-webapp.conf.example)の4個の`location`を追加します。新しい`server {}`を作るのではなく、Moodleと同じホスト名・HTTPS設定のブロックへ入れてください。4個のうち1個は、Nginx経由でローカル停止APIを呼べないようにするための404設定です。

実環境と異なる場合は次を変更します。

- Moodle root: `/home/www/htdocs/moodle`
- PHP-FPM socket: `/run/php/php8.3-fpm.sock`
- WebApp公開path: `/mcq-webapp/`
- WebApp内部URL: `http://127.0.0.1:4173/`

`$CFG->wwwroot`に`/moodle`が含まれる場合、公開location、ログイン先、`SCRIPT_NAME`、`X-Forwarded-Prefix`を次の形へ揃えます。

```text
/moodle/mcq-webapp/
/moodle/local/mcqwebapp/launch.php
/moodle/local/mcqwebapp/auth.php
```

設定を検査してから反映します。

```sh
sudo nginx -t
sudo systemctl reload nginx
```

最後にプラグイン設定の「Moodleアクセス制御を有効にする」をオンにします。

## 5. 動作確認

次の3条件を別々に確認してください。

1. ログアウト状態でWebApp URLを開くと、Moodleログインへ移動する。
2. Workshopコースで学生権限だけを持つユーザーは403となり、コースに起動リンクが出ない。
3. Workshopコースの教員には「STACK MCQ XML生成」リンクが表示され、WebAppの表示、Maxima評価、STACK APIテスト、XML保存が動く。

サーバー上では次も確認できます。

```sh
curl -I http://127.0.0.1:4173/
curl -I https://moodle.example.org/mcq-webapp/
```

1個目はサーバー内部で`200`、2個目は未ログインcookieなしなのでMoodle launcherへのredirectになるのが正常です。

## stack2.mathedu.jpの確定値

現在のWorkshopサーバーでは、次の値を使用します。

```text
Moodle wwwroot: https://stack2.mathedu.jp/moodle
WorkshopコースID: 17
WebApp URL: https://stack2.mathedu.jp/moodle/mcq-webapp/
PHP-FPM socket: /run/php/php-fpm.sock
```

プラグインをインストールした後、まず次の2項目を設定します。

```sh
sudo -u www-data /usr/bin/php /home/www/htdocs/moodle/admin/cli/cfg.php \
  --component=local_mcqwebapp --name=courseid --set=17
sudo -u www-data /usr/bin/php /home/www/htdocs/moodle/admin/cli/cfg.php \
  --component=local_mcqwebapp --name=toolurl \
  --set=https://stack2.mathedu.jp/moodle/mcq-webapp/
```

Nginxには[nginx-stack2.mathedu.jp.conf](nginx-stack2.mathedu.jp.conf)を使用します。HTTPS側の`server_name stack2.mathedu.jp localhost;`を持つ`server {}`へ4個の`location`を追加し、`nginx -t`が成功してからreloadします。その後、次のコマンドでアクセス制御を有効にします。

```sh
sudo -u www-data /usr/bin/php /home/www/htdocs/moodle/admin/cli/cfg.php \
  --component=local_mcqwebapp --name=enabled --set=1
sudo -u www-data /usr/bin/php \
  /home/www/htdocs/moodle/admin/cli/purge_caches.php
```

## Workshop用アカウントの一括管理

repositoryには、匿名のWorkshop用アカウントを作成し、番号範囲で有効化・停止・確認する単独の管理CLI [workshop_users.php](../../support/moodle/workshop_users.php) が含まれています。このCLIはMoodle localプラグインの一部ではなく、Moodleへの追加installやdatabase upgradeは不要です。Ubuntu上のrepository rootから必要なときだけ実行します。

次のコマンドは、`jspr26001`から`jspr26100`まで100個作成し、コースID 17へ編集権限のある教員として登録します。1–20だけを有効にし、21–100はMoodleアカウントとコース登録の両方を停止状態にします。

```sh
make workshop-users MOODLE_ROOT=/home/www/htdocs/moodle \
  WORKSHOP_ARGS='--action=create --courseid=17 --prefix=jspr26 --start=1 --end=100 --activeend=20 --confirm'
```

これは内部で、Moodleの`config.php`を読める`www-data`ユーザーとして次の単独PHP scriptを実行します。

```sh
sudo -u www-data /usr/bin/php support/moodle/workshop_users.php \
  --moodleroot=/home/www/htdocs/moodle \
  --action=create --courseid=17 --prefix=jspr26 \
  --start=1 --end=100 --activeend=20 --confirm
```

Moodleのlogin usernameは仕様上小文字である必要があるため、利用者が入力するログインIDは`jspr26001`のような小文字です。管理用の「IDナンバー」には対応する大文字の`JSPR26001`を保存します。各アカウントにはMoodleのpassword policyを満たす、紛らわしい文字を除いたランダムpasswordを設定します。password変更の強制とemail通知は行いません。

作成時に次の2ファイルの絶対pathが表示されます。

- 管理用CSV: username、password、初期状態など
- A4印刷用HTML: 2列×5行、1ページ10枚の切り取りカード

どちらもWeb公開領域ではない`/home/www/moodledata/stack_questions/workshop_credentials/`へ保存され、directoryは`0700`、fileは`0600`になります。平文passwordを含むので、repositoryへ追加したり通常のemailへ添付したりしないでください。HTMLを管理者のhomeへ取り出す場合は、CLIが表示した正確なpathを使って、たとえば次のようにコピーします。

```sh
sudo install -o YOUR_ACCOUNT -g YOUR_GROUP -m 0600 \
  /home/www/moodledata/stack_questions/workshop_credentials/jspr26-001-100-DATE.html \
  /home/YOUR_ACCOUNT/jspr26-login-cards.html
```

現在の状態はpasswordを表示せずに確認できます。

```sh
make workshop-users MOODLE_ROOT=/home/www/htdocs/moodle \
  WORKSHOP_ARGS='--action=status --courseid=17 --prefix=jspr26 --start=1 --end=100'
```

当日に21人以上来た場合は、必要な番号だけを範囲指定して有効にします。たとえば21–30は次のとおりです。有効化してもpasswordは変わりません。

```sh
make workshop-users MOODLE_ROOT=/home/www/htdocs/moodle \
  WORKSHOP_ARGS='--action=activate --courseid=17 --prefix=jspr26 --start=21 --end=30 --confirm'
```

使用後は同じ形式で範囲を停止できます。

```sh
make workshop-users MOODLE_ROOT=/home/www/htdocs/moodle \
  WORKSHOP_ARGS='--action=suspend --courseid=17 --prefix=jspr26 --start=1 --end=30 --confirm'
```

`create`、`activate`、`suspend`は変更内容を確認したことを示す`--confirm`が必須です。範囲内に既存IDがある場合、または有効化・停止する範囲に対象アカウントが不足している場合は、途中まで変更せずに失敗します。使用済みアカウントは別のWorkshopで再利用せず、未使用で停止したままの範囲だけを後日有効化してください。

## セキュリティ上の要点

- `HOST=0.0.0.0`にせず、4173と3080を外部へ公開しないでください。
- Nginxの認証はページだけでなく、Maxima評価やSTACK API中継を含む全URLに適用されます。
- ローカル停止APIはNginx設定で404にし、サービス操作はサーバー上の`make stop`／`make restart`だけで行います。
- 認証endpointは個人情報を返さず、HTTP statusだけを返します。アクセス制御機能はplugin独自のユーザーデータベースを持ちません。
- 単独のWorkshopアカウント管理CLIが生成する認証情報fileは`moodledata`の非公開領域に限定し、配布・保管後は不要な複製を残さないでください。
- 権限は固定role名ではなく`moodle/question:add` capabilityで判定するため、role名が日本語・英語のどちらでも動きます。
- Workshop終了後はplugin設定を無効にするか、`make stop`でサービスを止めてください。

## 更新

repositoryを`git pull`した後、pluginに変更がある場合はinstall scriptを再実行します。

```sh
git pull
make install-moodle-auth MOODLE_ROOT=/home/www/htdocs/moodle
make restart
```
