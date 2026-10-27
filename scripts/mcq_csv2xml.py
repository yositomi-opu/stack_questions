#!/usr/bin/env python3
"""Convert MCQ CSV to STACK XML using the web editor's JavaScript engine."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path, nargs='+', help='UTF-8 MCQ CSV (schema 1, 2 or 3)')
    parser.add_argument('-o', '--output', help='Output XML path; - for stdout (default: beside CSV, editor filename)')
    parser.add_argument('-f', '--force', action='store_true', help='Replace an existing output file')
    parser.add_argument('--evaluate', action='store_true', help='Evaluate trusted Maxima variables/lists through a running WebApp')
    parser.add_argument('--webapp-url', default='http://127.0.0.1:4173/', help='WebApp URL used with --evaluate (not STACK port 3080)')
    parser.add_argument('--include-base-url', help='Published include directory URL, including 001/ if required')
    parser.add_argument('--node', default='node', help='Node.js 18+ executable')
    parser.add_argument('--output-dir', '--outdir', dest='output_dir', type=Path, help='Batch output directory (must already exist)')
    args = parser.parse_args()
    try:
        node = shutil.which(args.node)
        if not node:
            raise ValueError('Node.js 18+ が必要です。nodeをPATHに追加するか --node で指定してください。')
        if args.output and (len(args.input) != 1 or args.output_dir):
            raise ValueError('--output requires one input and cannot combine with --output-dir')
        sources = [p.resolve() for p in args.input]
        if len(set(sources)) != len(sources):
            raise ValueError('Duplicate input files')
        planned = []
        # Preflight every conversion and destination before writing any output.
        for source in sources:
            csv = source.read_text(encoding='utf-8-sig')
            engine = Path(__file__).resolve().parents[1] / 'app/mcq-webapp/headless.cjs'
            request = {'csv':csv, 'options':{'fallbackTitle':source.stem, 'evaluate':args.evaluate,
                       'webappUrl':args.webapp_url, 'includeBaseUrl':args.include_base_url}}
            result = subprocess.run([node, str(engine)], input=json.dumps(request), text=True,
                                    encoding='utf-8', capture_output=True, timeout=120)
            if result.returncode:
                raise ValueError(result.stderr.strip() or 'CSV conversion failed')
            data = json.loads(result.stdout)
            ET.fromstring(data['xml'])
            for warning in data['warnings']:
                print(f'Warning: {warning}', file=sys.stderr)
            if args.output == '-':
                sys.stdout.write(data['xml'])
                return 0
            destination = (Path(args.output).resolve() if args.output else
                           (args.output_dir or source.parent) / data['filename']).resolve()
            if destination in sources:
                raise ValueError('Output would overwrite an input CSV')
            if any(destination == item[0] for item in planned):
                raise ValueError(f'Duplicate output filename: {destination}')
            if destination.exists() and not args.force:
                raise ValueError(f'Output exists; use --force to replace: {destination}')
            if not destination.parent.is_dir():
                raise ValueError(f'Output directory does not exist: {destination.parent}')
            planned.append((destination, data['xml']))
        for destination, xml in planned:
            # Conversion and XML syntax validation finish before touching output.
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=destination.parent,
                                             prefix='.mcq-', suffix='.xml', delete=False) as temp:
                temp.write(xml)
                temp_path = Path(temp.name)
            try:
                if args.force:
                    os.replace(temp_path, destination)
                else:
                    os.link(temp_path, destination)  # Refuse a concurrent overwrite, too.
            finally:
                temp_path.unlink(missing_ok=True)
            print(destination)
        return 0
    except (OSError, ValueError, ET.ParseError, subprocess.TimeoutExpired) as error:
        print(f'Error: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
