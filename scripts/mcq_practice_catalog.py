#!/usr/bin/env python3
"""Build a trusted practice catalog from teacher-provided CSV/XML. No server changes."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('practice', ROOT / 'app/mcq-webapp/practice_server.py')
practice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(practice)


def build(paths, evaluate=False, webapp_url='http://127.0.0.1:4173', check_api=False):
    questions = []
    seen = set()
    for path in paths:
        if path.name in seen:
            raise ValueError(f'Duplicate filename: {path.name}')
        seen.add(path.name)
        if path.suffix.lower() == '.csv':
            command = [sys.executable, str(ROOT / 'scripts/mcq_csv2xml.py'), str(path), '-o', '-']
            if evaluate:
                command += ['--evaluate', '--webapp-url', webapp_url]
            run = subprocess.run(command, text=True, capture_output=True, timeout=150)
            if run.returncode:
                raise ValueError(run.stderr)
            if run.stderr:
                print(run.stderr, file=sys.stderr)
            xml = run.stdout
        elif path.suffix.lower() == '.xml':
            xml = path.read_text(encoding='utf-8-sig')
        else:
            raise ValueError(f'CSV/XML only: {path.name}')
        # Freeze repository includes now, rather than fetching arbitrary URLs at runtime.
        xml = practice.preview.preview_definition(xml, 1)
        root = ET.fromstring(xml)
        for node in root.findall('.//questionvariables/text') + root.findall('.//feedbackvariables/text'):
            code = re.sub(r'/\*[\s\S]*?\*/|"(?:\\.|[^"\\])*"', '', node.text or '')
            if re.search(r'\bstack_include\s*\(', code, re.I):
                raise ValueError(f'Unresolved dynamic stack_include: {path.name}')
        title = root.findtext('question/name/text') or path.stem
        languages = sorted(set(re.findall(r'\[\[lang\s+code=[\'"]([a-z]{2})[\'"]', xml)) & practice.LANGS)
        if not languages:
            languages = ['ja', 'en']
        if 'ja' in languages:
            languages.remove('ja')
            languages.insert(0, 'ja')
        if check_api:
            for lang in languages:
                practice.preview.preview_stack_question({'questionDefinition': xml, 'seed': 1, 'lang': lang,
                                                         'url': practice.preview.ACTIVE_STACK_API_URL})
        questions.append({'id': hashlib.sha256(path.name.encode()).hexdigest()[:16],
                          'title': title, 'languages': languages, 'xml': xml})
    return {'schema': 'mcq-practice-v1', 'questions': questions}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', nargs='+', type=Path)
    parser.add_argument('-o', '--output', required=True, type=Path)
    parser.add_argument('--evaluate', action='store_true', help='Evaluate CSV lists via a local editor server')
    parser.add_argument('--webapp-url', default='http://127.0.0.1:4173')
    parser.add_argument('--check-api', action='store_true', help='Render every question/language at seed 1 before writing')
    parser.add_argument('--stack-api-url', default='http://127.0.0.1:3080')
    args = parser.parse_args()
    try:
        practice.preview.ACTIVE_STACK_API_URL = practice.preview.normalize_stack_api_url(args.stack_api_url)
        catalog = build(args.files, args.evaluate, args.webapp_url, args.check_api)
        output = args.output.resolve()
        if output in {p.resolve() for p in args.files}:
            raise ValueError('Output must not overwrite a source file')
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=output.parent, delete=False) as temp:
            json.dump(catalog, temp, ensure_ascii=False)
            tmp = Path(temp.name)
        try:
            os.replace(tmp, output)
        finally:
            tmp.unlink(missing_ok=True)
        print(f'{len(catalog["questions"])} questions: {output}')
        return 0
    except (ValueError, OSError, RuntimeError, ET.ParseError, subprocess.TimeoutExpired) as exc:
        print(f'Error: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
