#!/usr/bin/env python3
"""Convert a True/False editor CSV to Moodle STACK XML."""

import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app' / 'prt-template-webapp'))
from csv_codec import loads
from server import edited


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path, help='CSV saved by the True/False editor')
    parser.add_argument('output', type=Path, help='Destination Moodle XML (must not exist)')
    args = parser.parse_args()
    try:
        with args.input.open('rb') as source:
            raw = source.read(12 * 1024 * 1024 + 1)
        if len(raw) > 12 * 1024 * 1024:
            raise ValueError('TF CSV exceeds 12 MiB')
        original, fields = loads(raw)
        if json.loads(fields['template']).get('mode') != 'truefalse':
            raise ValueError('Expected a CSV saved by the True/False editor')
        xml = edited(original, fields)
        with args.output.open('xb') as destination:
            destination.write(xml)
    except (OSError, ValueError) as error:
        parser.exit(1, f'{parser.prog}: {error}\n')


if __name__ == '__main__':
    main()
