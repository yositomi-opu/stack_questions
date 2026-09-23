import importlib.util
import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('ai', ROOT / 'app/mcq-webapp/ai_translation.py')
ai = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ai)

class TranslationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path_patch = patch.object(ai, 'CONFIG_PATH', Path(self.tmp.name) / 'private' / 'ai.json')
        self.path_patch.start()
        self.env_patch = patch.dict(os.environ, {}, clear=True)
        self.env_patch.start()
        self.source = {'source_language': 'ja', 'question_text': '選べ __SELPROMPT__',
                       'rows': [{'id': 'option1C_0', 'choice': r'数式 \(x^2\) {@a@}', 'feedback': None}]}
        self.result = {'question_text': 'Choose __SELPROMPT__', 'rows': [{'id': 'option1C_0', 'choice': r'Formula \(x^2\) {@a@}', 'feedback': None}]}
    def tearDown(self):
        self.path_patch.stop(); self.env_patch.stop(); self.tmp.cleanup()
    def register(self, provider='openai'):
        ai.save_settings({'provider': provider, 'model': 'test-model', 'key': 'secret-test-key'})
    def test_settings_never_return_key_and_permissions(self):
        self.register()
        self.assertNotIn('secret-test-key', json.dumps(ai.public_settings()))
        self.assertEqual(stat.S_IMODE(ai.CONFIG_PATH.stat().st_mode), 0o600)
        ai.save_settings({'provider': 'openai', 'model': 'updated', 'key': ''})
        self.assertTrue(ai.public_settings()['profiles']['openai']['configured'])
        ai.save_settings({'provider': 'openai', 'model': 'updated', 'remove_key': True})
        self.assertFalse(ai.public_settings()['profiles']['openai']['configured'])
    def test_environment_key(self):
        os.environ['GEMINI_API_KEY'] = 'environment-secret'
        self.assertTrue(ai.public_settings()['profiles']['gemini']['configured'])
        self.assertNotIn('environment-secret', json.dumps(ai.public_settings()))
    def test_all_providers(self):
        masked, maps, prefix = ai.protect_source(self.source)
        translated = {'question_text': masked['question_text'].replace('選べ', 'Choose'),
                      'rows': [{**masked['rows'][0], 'choice': masked['rows'][0]['choice'].replace('数式', 'Formula')}]}
        encoded = json.dumps(translated)
        responses = {'openai': {'status': 'completed', 'output': [{'content': [{'type': 'output_text', 'text': encoded}]}]},
                     'claude': {'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': encoded}]},
                     'gemini': {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': encoded}]}}]}}
        for provider, result in responses.items():
            with self.subTest(provider=provider):
                self.register(provider)
                with patch.object(ai, 'protect_source', return_value=(masked, maps, prefix)), patch.object(ai, 'send_request', return_value=result) as send:
                    value = ai.translate({'target': 'en', 'source': self.source})
                self.assertEqual(value['translations']['en'], self.result)
                req = send.call_args.args[0]
                body = json.loads(req.data)
                self.assertEqual(body['model'] if provider != 'gemini' else 'test-model', 'test-model')
                self.assertNotIn('secret-test-key', req.full_url)
                if provider == 'openai': self.assertEqual(body['text']['format']['type'], 'json_schema')
                if provider == 'claude': self.assertEqual(body['output_config']['format']['type'], 'json_schema')
                if provider == 'gemini': self.assertEqual(body['generationConfig']['responseFormat']['text']['mimeType'], 'application/json')
    def test_mask_restore_and_tampering(self):
        source = {'source_language':'ja', 'question_text': r'<b>次の \(x<2\) と {@a@} __SELTYPE__</b>',
                  'rows':[{'id':'option1C_0','choice':'[[if a]]本文[[/if]]','feedback':None}]}
        masked, maps, prefix = ai.protect_source(source)
        self.assertNotIn('x<2', masked['question_text'])
        self.assertNotIn('{@a@}', masked['question_text'])
        result = {k:masked[k] for k in ('question_text','rows')}
        self.assertEqual(ai.validate_result(source, ai.restore_result(json.loads(json.dumps(result)),maps,prefix))['question_text'],source['question_text'])
        token = next(iter(maps['question_text']))
        for replacement in ['',token+token,token.lower()]:
            broken=json.loads(json.dumps(result)); broken['question_text']=broken['question_text'].replace(token,replacement)
            with self.assertRaisesRegex(ValueError,'question_text'):
                ai.restore_result(broken,maps,prefix)
        broken=json.loads(json.dumps(result)); broken['rows'][0]['choice'] += token
        with self.assertRaisesRegex(ValueError,'option1C_0.choice'):
            ai.restore_result(broken,maps,prefix)
        with self.assertRaisesRegex(ValueError,'option1C_0.choice'):
            ai.validate_result(self.source, {**self.result,'rows':[{**self.result['rows'][0],'choice':'changed'}]})

    def test_incomplete(self):
        for provider, result in [('openai', {'status': 'incomplete'}), ('claude', {'stop_reason': 'max_tokens'}), ('gemini', {'candidates': [{'finishReason': 'MAX_TOKENS'}]})]:
            with self.assertRaises(ValueError): ai.response_text(provider, result)
    def test_omitted_duplicate_changed_and_extra_rows(self):
        for rows in [[], self.result['rows']*2, [{'id': 'unknown', 'choice':'x', 'feedback':None}]]:
            with self.assertRaises(ValueError): ai.validate_result(self.source, {**self.result, 'rows': rows})
    def test_protected_content(self):
        for value in [r'Formula \(x^3\) {@a@}', r'Formula \(x^2\) {@b@}', '', None]:
            with self.assertRaises(ValueError): ai.check_text(self.source['rows'][0]['choice'], value)
        for before, after in [('__SELTYPE__', '__SELPROMPT__'), ('[[if a]]x[[/if]]', 'x'), ('<b>x</b>', 'x')]:
            with self.assertRaises(ValueError): ai.check_text(before, after)
    def test_input_validation_before_network(self):
        self.register()
        with patch.object(ai, 'send_request') as send:
            for data in [{'target':'bad','source':self.source}, {'target':'en','source':{**self.source,'rows':self.source['rows']*5}}]:
                with self.assertRaises(ValueError): ai.translate(data)
            send.assert_not_called()
    def test_errors_do_not_leak(self):
        from urllib.error import HTTPError
        with patch.object(ai, 'build_opener') as opener:
            opener.return_value.open.side_effect = HTTPError('https://example.org',401,'secret-test-key',{},None)
            with self.assertRaises(ValueError) as caught: ai.send_request(ai.make_request('openai','test','secret','test'))
        self.assertNotIn('secret-test-key',str(caught.exception))
    def test_local_route_guard(self):
        spec = importlib.util.spec_from_file_location('server_ai_test', ROOT/'app/mcq-webapp/server.py')
        server = importlib.util.module_from_spec(spec); spec.loader.exec_module(server)
        handler = object.__new__(server.McqRequestHandler)
        handler.client_address = ('127.0.0.1',123)
        handler.headers = {'Host':'localhost:4173','Origin':'http://localhost:4173'}
        self.assertTrue(handler.ai_local_request())
        handler.headers['Origin']='https://evil.example'
        self.assertFalse(handler.ai_local_request())
        handler.headers={'Host':'evil.example'}
        self.assertFalse(handler.ai_local_request())
        handler.headers={'Host':'localhost:4173'}; handler.client_address=('192.168.1.2',123)
        self.assertFalse(handler.ai_local_request())

if __name__ == '__main__': unittest.main()
