#!/usr/bin/env python3
"""Generate a .mac file by removing block comments from a source .txt file."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path, nargs="?")
    args = parser.parse_args()
    destination = args.destination or args.source.with_suffix(".mac")
    source = args.source.read_text(encoding="utf-8")
    generated = re.sub(r"/\*.*?\*/", "", source, flags=re.DOTALL).rstrip()
    destination.write_text(generated + "\n", encoding="utf-8")
    print(f"出力しました: {destination}")


if __name__ == "__main__":
    main()
