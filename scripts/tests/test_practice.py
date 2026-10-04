import importlib.util
import io
import json
from email.message import Message
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('practice_test', ROOT / 'app/mcq-webapp/practice_server.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
spec = importlib.util.spec_from_file_location('catalog_test', ROOT / 'scripts/mcq_practice_catalog.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
XML = '<quiz><question type="stack"><name><text>Example</text></name><questionvariables><text>a:1;</text></questionvariables></question></quiz>'


def app():
    return module.Practice({'schema': 'mcq-practice-v1', 'questions': [
        {'id': 'one', 'title': 'Example', 'languages': ['ja', 'en'], 'xml': XML}
    ]}, 'http://127.0.0.1:3080')


class PracticeTests(unittest.TestCase):
    def test_only_registered_code_and_server_snapshot_used(self):
        service = app()
        def response(payload, grading=False):
            return {'result': {'previewDefinition': XML, 'questionrender': '<p>a</p>', 'questionvariables': 'secret',
                               'isgradable': True, 'scores': {'total': 1}}}
        with patch.object(module.preview, 'preview_stack_question', side_effect=response) as api:
            rendered = service.call('preview', {'questionId': 'one', 'seed': 17, 'lang': 'en'})['result']
            self.assertNotIn('previewDefinition', rendered)
            self.assertNotIn('questionvariables', rendered)
            token = rendered['practiceToken']
            service.questions['one']['xml'] = 'changed after rendering'
            grade = service.call('grade', {'token': token, 'answers': {'ans1': '2'}})
            payload = api.call_args.args[0]
            self.assertEqual(payload['questionDefinition'], XML)
            self.assertEqual(payload['seed'], 17)
            self.assertEqual(payload['lang'], 'en')
            self.assertEqual(grade['result']['scores']['total'], 1)
            self.assertNotIn('questionrender', grade['result'])
        self.assertEqual(service.catalog(), [{'id': 'one', 'title': 'Example', 'languages': ['ja', 'en']}])

    def test_rejects_arbitrary_xml_url_and_tampered_grading(self):
        service = app()
        with patch.object(module.preview, 'preview_stack_question') as api:
            for data in [{'questionId': '../../etc/passwd'}, {'questionId': 'one', 'url': 'http://evil'},
                         {'questionId': 'one', 'questionDefinition': XML}, {'questionId': 'one', 'lang': []}]:
                with self.subTest(data=data), self.assertRaises(ValueError):
                    service.call('preview', data)
            for data in [{'token': 'missing', 'answers': {}}, {'token': 'x', 'seed': 9}, {'token': [], 'answers': {}}]:
                with self.subTest(data=data), self.assertRaises(ValueError):
                    service.call('grade', data)
            api.assert_not_called()

    def test_expiry_and_busy(self):
        service = app()
        service.sessions['old'] = (-10000, {}, 0)
        with self.assertRaises(ValueError):
            service.call('grade', {'token': 'old', 'answers': {}})
        self.assertNotIn('old', service.sessions)
        service.slots.acquire()
        service.slots.acquire()
        with self.assertRaisesRegex(RuntimeError, 'busy'):
            service.call('preview', {'questionId': 'one'})

    def test_seed_validation_before_stack(self):
        with patch.object(module.preview, 'request_stack_api') as api:
            for seed in [0, -1, True, '2', 2147483648]:
                with self.subTest(seed=seed), self.assertRaises(ValueError):
                    app().call('preview', {'questionId': 'one', 'seed': seed})
            api.assert_not_called()

    def handler(self, path, body=b'', headers=None):
        handler = object.__new__(module.Handler)
        handler.path = path
        handler.headers = Message()
        for k, v in (headers or {}).items():
            handler.headers[k] = v
        handler.rfile = io.BytesIO(body)
        handler.server = SimpleNamespace(practice=app())
        handler.reply = lambda status, body, *args: setattr(handler, 'result', (status, body))
        return handler

    def test_no_editor_api_or_source_files_public(self):
        for path in ['/server.py', '/.local-config.json', '/api/ai/settings', '/api/maxima/evaluate',
                     '/api/stack/preview', '/api/server/shutdown', '/catalog.json', '/../server.py']:
            h = self.handler(path)
            h.do_GET()
            self.assertEqual(h.result[0], 404)
            h.do_POST()
            self.assertEqual(h.result[0], 404)
        h = self.handler('/api/practice/catalog')
        h.do_GET()
        self.assertNotIn('xml', json.dumps(h.result))

    def test_cross_origin_and_large_body_rejected(self):
        h = self.handler('/api/practice/preview', headers={'Host': 'example.org', 'Origin': 'https://evil.org'})
        h.do_POST()
        self.assertEqual(h.result[0], 403)
        h = self.handler('/api/practice/preview', headers={'Content-Type': 'application/json', 'Content-Length': '65537'})
        h.do_POST()
        self.assertEqual(h.result[0], 400)

    def test_catalog_frozen_and_duplicate_files_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'example.xml'
            path.write_text(XML)
            result = builder.build([path])
            self.assertEqual(result['questions'][0]['title'], 'Example')
            self.assertEqual(builder.build([path])['questions'][0]['id'], result['questions'][0]['id'])
            with self.assertRaisesRegex(ValueError, 'Duplicate'):
                builder.build([path, path])
            path.write_text(XML.replace('a:1;', 'stack_include(url);'))
            with self.assertRaisesRegex(ValueError, 'dynamic'):
                builder.build([path])

    def test_failed_registration_preserves_existing_catalog(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'bad.xml'
            output = Path(tmp) / 'catalog.json'
            source.write_text('<invalid')
            output.write_text('old catalog')
            with patch('sys.argv', ['catalog', str(source), '-o', str(output)]), patch('sys.stderr', new_callable=io.StringIO):
                self.assertEqual(builder.main(), 1)
            self.assertEqual(output.read_text(), 'old catalog')

    def test_real_include_and_csv(self):
        result = builder.build([ROOT / 'app/mcq-webapp/samples/001.mcq_sample01.xml'])
        self.assertNotIn('stack_include(', result['questions'][0]['xml'])
        result = builder.build([ROOT / 'app/mcq-webapp/sample.csv'])
        self.assertTrue(result['questions'][0]['xml'].startswith('<quiz>'))


if __name__ == '__main__':
    unittest.main()
