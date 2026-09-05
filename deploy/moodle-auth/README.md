# Protecting MCQ WebApp with a Moodle login

**English** | [日本語](README.ja.md)

This is a same-host authentication gateway, not an LTI integration. Nginx reverse-proxies the MCQ WebApp and authorises every request against the Moodle session. The WebApp itself does not access Moodle APIs or its database; users still import the generated XML in Moodle.

Access requires all of the following:

- a logged-in, non-guest Moodle session;
- the `moodle/question:add` capability in one administrator-configured workshop course;
- access enabled in the local plugin settings.

The deployment expects Moodle 4.5 or later, Nginx with PHP-FPM, and the WebApp on the same Ubuntu host. Keep both the WebApp and STACK API bound to loopback:

```sh
make setup HOST=127.0.0.1
make check
```

Install the bundled Moodle local plugin:

```sh
make install-moodle-auth MOODLE_ROOT=/home/www/htdocs/moodle
```

In **Site administration > Plugins > Local plugins > MCQ WebApp access**, set the workshop course ID and the externally visible WebApp URL. Add the four locations from [nginx-mcq-webapp.conf.example](nginx-mcq-webapp.conf.example) to the existing HTTPS `server {}` block that serves Moodle. One of them explicitly blocks the local service-control endpoint. Then validate and reload Nginx:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Enable access in the plugin only after Nginx is configured. A teacher in the configured course will see **STACK MCQ XML Generator** in course navigation. Logged-out requests are sent through Moodle's normal login flow; users without `moodle/question:add` receive 403.

For the current `stack2.mathedu.jp` workshop deployment, use [nginx-stack2.mathedu.jp.conf](nginx-stack2.mathedu.jp.conf). It is preconfigured for Moodle under `/moodle`, course ID `17`, `/run/php/php-fpm.sock`, and the public WebApp URL `https://stack2.mathedu.jp/moodle/mcq-webapp/`.

If `$CFG->wwwroot` includes a path such as `/moodle`, publish the app at `/moodle/mcq-webapp/`, not at the domain root. The browser must send its `MoodleSession` cookie to the WebApp path. See the [Japanese guide](README.ja.md) for complete installation, path-adjustment, testing, and update instructions.

## Workshop account management

The repository also contains a standalone [workshop_users.php](../../support/moodle/workshop_users.php) CLI for creating anonymous workshop accounts and activating, suspending, or inspecting a numeric range. It is not part of the Moodle local plugin and requires no Moodle plugin installation or database upgrade. Run it only when needed from the repository root on the Ubuntu host:

```sh
make workshop-users MOODLE_ROOT=/home/www/htdocs/moodle \
  WORKSHOP_ARGS='--action=create --courseid=17 --prefix=jspr26 --start=1 --end=100 --activeend=20 --confirm'
```

This creates lowercase Moodle usernames `jspr26001`–`jspr26100` with uppercase ID numbers `JSPR26001`–`JSPR26100`, random policy-compliant passwords, and the `editingteacher` role in course 17. Accounts 001–020 start active; both the site account and course enrolment are suspended for 021–100. Email is disabled and users are not forced to change the generated password.

The command writes a private administrator CSV and printable A4 HTML with ten cut-apart credential cards per page under `<moodledata>/stack_questions/workshop_credentials/`. The directory is mode `0700` and the files are mode `0600`. They contain plaintext passwords and must never be committed to the repository or sent through ordinary email.

Inspect the range without revealing passwords:

```sh
make workshop-users MOODLE_ROOT=/home/www/htdocs/moodle \
  WORKSHOP_ARGS='--action=status --courseid=17 --prefix=jspr26 --start=1 --end=100'
```

Activate 021–030 if more participants arrive, or suspend a used range afterward:

```sh
make workshop-users MOODLE_ROOT=/home/www/htdocs/moodle \
  WORKSHOP_ARGS='--action=activate --courseid=17 --prefix=jspr26 --start=21 --end=30 --confirm'
make workshop-users MOODLE_ROOT=/home/www/htdocs/moodle \
  WORKSHOP_ARGS='--action=suspend --courseid=17 --prefix=jspr26 --start=1 --end=30 --confirm'
```

`--confirm` is required for every mutating action. Creation rejects the whole operation if any username, ID number, or email already exists. Range changes also validate every requested managed account before beginning. Do not reuse accounts that participants have already used; activate only a previously unused suspended range at a later workshop.
