#!/bin/zsh

set -u

SCRIPT_DIR=${0:A:h}
REPO_ROOT=${SCRIPT_DIR:h:h}
SERVER="${REPO_ROOT}/app/mcq-webapp/server.py"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3.10以降が見つかりません。"
  echo "https://www.python.org/downloads/macos/ からインストールしてください。"
  echo
  read "?Enterキーを押すと終了します。"
  exit 1
fi

cd "${REPO_ROOT}" || exit 1

if ! python3 "${SERVER}" --check; then
  echo
  echo "STACKコードの設定が必要です。"
  echo "moodle-qtype_stackのclone先、またはstackmaxima.macがあるフォルダーを入力してください。"
  echo "まだcloneしていない場合は、何も入力せずEnterを押すと自動取得します。"
  read "?STACKの場所: " STACK_PATH
  if [[ -z "${STACK_PATH}" ]]; then
    SETUP_ARGS=(--install-stack)
  else
    SETUP_ARGS=(--setup-stack "${STACK_PATH}")
  fi
  if ! python3 "${SERVER}" "${SETUP_ARGS[@]}"; then
    read "?Enterキーを押すと終了します。"
    exit 1
  fi
  if ! python3 "${SERVER}" --check; then
    read "?Enterキーを押すと終了します。"
    exit 1
  fi
fi

exec python3 "${SERVER}" --open-browser
