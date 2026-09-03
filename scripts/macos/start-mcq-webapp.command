#!/bin/zsh

set -u

SCRIPT_DIR=${0:A:h}
REPO_ROOT=${SCRIPT_DIR:h:h}
MANAGER="${REPO_ROOT}/scripts/mcq-webapp.py"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3.10以降が見つかりません。"
  echo "https://www.python.org/downloads/macos/ からインストールしてください。"
  echo
  read "?Enterキーを押すと終了します。"
  exit 1
fi

cd "${REPO_ROOT}" || exit 1
if ! python3 "${MANAGER}" launch; then
  echo
  read "?Enterキーを押すと終了します。"
  exit 1
fi
