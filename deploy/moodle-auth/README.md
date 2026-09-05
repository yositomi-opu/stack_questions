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
