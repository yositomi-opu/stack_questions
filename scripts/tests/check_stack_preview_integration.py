"""Opt-in check against a running WebApp and STACK API (no Moodle import)."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:4173')
    parser.add_argument('--stack-url', default='http://127.0.0.1:3080')
    args = parser.parse_args()

    def call(route, payload):
        request = Request(args.url.rstrip('/') + '/api/stack/' + route,
                          data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
        try:
            with urlopen(request, timeout=90) as response:
                data = json.load(response)
        except HTTPError as exc:
            raise RuntimeError(exc.read().decode()) from exc
        assert data['ok'], data
        return data['result']

    with tempfile.TemporaryDirectory(prefix='mcq-preview-check-') as tmp:
        subprocess.run(['node', str(ROOT / 'scripts/tests/test_variant_parameters.cjs')], check=True,
                       env={**os.environ, 'MCQ_PREVIEW_FIXTURE_DIR': tmp})
        files = [ROOT / 'app/mcq-webapp/samples/001.mcq_sample01.xml', *sorted(Path(tmp).glob('rank*.xml'))]
        for path in files:
            for seed in [1, 2]:
                payload = {'url': args.stack_url, 'questionDefinition': path.read_text(), 'seed': seed, 'lang': 'ja'}
                rendered = call('preview', payload)
                assert rendered['questionrender'] and rendered['questionseed'] == seed
                assert 'stack_include(' not in rendered['previewDefinition']
                answers = {name + suffix: value for name, config in rendered['questioninputs'].items()
                           for suffix, value in config['samplesolution'].items()}
                graded = call('grade', {**payload, 'questionDefinition': rendered['previewDefinition'], 'answers': answers})
                assert graded['isgradable'] and graded['score'] == 1, graded
                print(f'{path.name}: seed {seed}, model answer 100%', flush=True)
        print('PASS: real rendering and frozen-copy grading for all 8 cases')


if __name__ == '__main__':
    main()
