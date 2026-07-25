#!/usr/bin/env python3
"""Check dependencies and start mcq-webapp from the repository root."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def check_environment(server: Path, repo_root: Path) -> bool:
    return subprocess.run(
        [sys.executable, str(server), "--check"],
        cwd=repo_root,
        check=False,
    ).returncode == 0


def configure_stack(server: Path, repo_root: Path) -> bool:
    print()
    print("STACKコードの設定が必要です。")
    print("moodle-qtype_stackのclone先、またはstackmaxima.macがあるフォルダーを入力してください。")
    print("まだcloneしていない場合は、何も入力せずEnterを押すと自動取得します。")
    print("例: C:\\work\\moodle-qtype_stack")
    stack_path = input("STACKの場所: ").strip().strip('"')
    setup_arguments = ["--setup-stack", stack_path] if stack_path else ["--install-stack"]
    result = subprocess.run(
        [sys.executable, str(server), *setup_arguments],
        cwd=repo_root,
        check=False,
    )
    return result.returncode == 0 and check_environment(server, repo_root)


def main() -> int:
    if sys.version_info < (3, 10):
        print("Python 3.10以降が必要です。")
        return 1
    repo_root = Path(__file__).resolve().parents[2]
    server = repo_root / "app" / "mcq-webapp" / "server.py"
    if not check_environment(server, repo_root) and not configure_stack(server, repo_root):
        print()
        print("セットアップを完了できませんでした。")
        print("Maximaをインストールしても検出されない場合は、次のように指定してください:")
        print('  set "MAXIMA_EXECUTABLE=C:\\maxima-5.xx.x\\bin\\maxima.bat"')
        print(f'  "{Path(__file__).with_suffix(".bat")}"')
        return 1
    return subprocess.call([sys.executable, str(server), "--open-browser"], cwd=repo_root)


if __name__ == "__main__":
    raise SystemExit(main())
