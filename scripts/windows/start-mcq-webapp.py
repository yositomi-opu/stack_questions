#!/usr/bin/env python3
"""Start the cross-platform mcq-webapp service manager."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> int:
    if sys.version_info < (3, 10):
        print("Python 3.10以降が必要です。")
        return 1
    repo_root = Path(__file__).resolve().parents[2]
    manager = repo_root / "scripts" / "mcq-webapp.py"
    return subprocess.call([sys.executable, str(manager), "launch"], cwd=repo_root)


if __name__ == "__main__":
    raise SystemExit(main())
