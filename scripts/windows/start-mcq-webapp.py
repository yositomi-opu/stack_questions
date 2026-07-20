#!/usr/bin/env python3
"""Check dependencies and start mcq-webapp from the repository root."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> int:
    if sys.version_info < (3, 10):
        print("Python 3.10以降が必要です。")
        return 1
    repo_root = Path(__file__).resolve().parents[2]
    server = repo_root / "app" / "mcq-webapp" / "server.py"
    check = subprocess.run([sys.executable, str(server), "--check"], cwd=repo_root, check=False)
    if check.returncode:
        print()
        print("Maximaをインストールしても検出されない場合は、次のように指定できます:")
        print('  set "MAXIMA_EXECUTABLE=C:\\maxima-5.xx.x\\bin\\maxima.bat"')
        print(f'  "{Path(__file__).with_suffix(".bat")}"')
        return check.returncode
    return subprocess.call([sys.executable, str(server), "--open-browser"], cwd=repo_root)


if __name__ == "__main__":
    raise SystemExit(main())
