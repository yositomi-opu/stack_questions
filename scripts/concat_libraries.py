#!/usr/bin/env python3
"""Concatenate UTF-8 libraries in the specified order, preserving their contents."""

import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    parser.add_argument("sources", type=Path, nargs="+")
    args = parser.parse_args()
    parts = [path.read_text(encoding="utf-8") for path in args.sources]
    # A missing final newline must not merge two source lines.
    content = "".join(part if part.endswith("\n") else part + "\n" for part in parts)
    args.destination.write_text(content, encoding="utf-8")
    print(f"Generated: {args.destination}")


if __name__ == "__main__":
    main()
