#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE_DIR="$SCRIPT_DIR/local/mcqwebapp"
MOODLE_ROOT=${1:-/home/www/htdocs/moodle}
WEB_USER=${MOODLE_WEB_USER:-www-data}
WEB_GROUP=${MOODLE_WEB_GROUP:-www-data}
PHP_BIN=${PHP_BIN:-/usr/bin/php}
DEST_DIR="$MOODLE_ROOT/local/mcqwebapp"

if [ "$MOODLE_ROOT" = "/" ] || [ ! -f "$MOODLE_ROOT/config.php" ] || [ ! -f "$MOODLE_ROOT/admin/cli/upgrade.php" ]; then
    echo "Moodle rootではありません: $MOODLE_ROOT" >&2
    echo "使用法: $0 /path/to/moodle" >&2
    exit 1
fi
if [ ! -x "$PHP_BIN" ]; then
    echo "PHP CLIが見つかりません: $PHP_BIN" >&2
    exit 1
fi
if ! command -v sudo >/dev/null 2>&1; then
    echo "sudoが必要です。rootの場合もsudoを導入するか、下記READMEの手動手順を使用してください。" >&2
    exit 1
fi
if [ -e "$DEST_DIR" ] && ! grep -q "local_mcqwebapp" "$DEST_DIR/version.php" 2>/dev/null; then
    echo "別のファイルが既に存在するため上書きしません: $DEST_DIR" >&2
    exit 1
fi

echo "Moodle local pluginを配置: $DEST_DIR"
sudo install -d -o root -g "$WEB_GROUP" -m 0755 "$DEST_DIR"
sudo cp -R "$SOURCE_DIR/." "$DEST_DIR/"
sudo chown -R root:"$WEB_GROUP" "$DEST_DIR"
sudo find "$DEST_DIR" -type d -exec chmod 0755 {} +
sudo find "$DEST_DIR" -type f -exec chmod 0644 {} +

echo "Moodleデータベースを更新"
sudo -u "$WEB_USER" "$PHP_BIN" "$MOODLE_ROOT/admin/cli/upgrade.php" --non-interactive
sudo -u "$WEB_USER" "$PHP_BIN" "$MOODLE_ROOT/admin/cli/purge_caches.php"

echo "local_mcqwebapp のインストールが完了しました。"
echo "次にサイト管理 > プラグイン > ローカルプラグイン > MCQ WebAppアクセスを設定してください。"
