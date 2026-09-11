import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('mcq_preview_server', ROOT / 'app/mcq-webapp/server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


def question(code):
    return '<quiz><question type="stack"><questionvariables><text>' + code.replace('&', '&amp;').replace('<', '&lt;') + '</text></questionvariables></question></quiz>'


class StackPreviewTests(unittest.TestCase):
    def test_preview_seeds_do_not_change_input(self):
        xml = question('%_rk:2;')
        output = server.preview_definition(xml, 53)
        self.assertNotIn('deployedseed', xml)
        self.assertEqual(ET.fromstring(output).findtext('question/deployedseed'), '53')
        self.assertEqual(ET.fromstring(output).findtext('question/questionvariables/text'), '%_rk:2;')

    def test_resolves_real_legacy_includes(self):
        xml = (ROOT / 'app/mcq-webapp/samples/001.mcq_sample01.xml').read_text()
        output = server.preview_definition(xml, 1)
        self.assertNotIn('stack_include(', ET.fromstring(output).findtext('question/questionvariables/text'))

    def test_comments_strings_and_nested_includes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            (root / 'a.txt').write_text('x:1; stack_include("b.mac");')
            (root / 'b.mac').write_text('y:2;')
            code = '/* stack_include("missing"); */ s:"stack_include(\\"missing\\")"; stack_include("a.txt");'
            with patch.object(server, 'REPO_ROOT', root):
                output = ET.fromstring(server.preview_definition(question(code), 1)).findtext('question/questionvariables/text')
                self.assertIn('x:1;', output)
                self.assertIn('y:2;', output)
                self.assertIn('/* stack_include("missing"); */', output)
                (root / 'b.mac').write_text('stack_include("a.txt");')
                with self.assertRaisesRegex(ValueError, '循環'):
                    server.preview_definition(question(code), 1)

    def test_private_and_outside_paths_are_rejected(self):
        for reference in ['../secret.txt', '.local-config.json', '.git/config']:
            with self.subTest(reference=reference), self.assertRaises(ValueError):
                server.preview_definition(question(f'stack_include("{reference}");'), 1)

    def test_api_payload_and_grading_snapshot(self):
        payload = {'questionDefinition': question('%_rk:2;'), 'seed': 17, 'lang': 'ja', 'url': server.ACTIVE_STACK_API_URL}
        with patch.object(server, 'request_stack_api', return_value=(server.ACTIVE_STACK_API_URL, {'questionrender': 'ok'})) as api:
            server.preview_stack_question(payload)
            args = api.call_args.args
            self.assertEqual(args[1], '/render')
            self.assertEqual(args[2]['renderInputs'], 'mcqpreview_')
            self.assertEqual(args[2]['seed'], 17)
            definition = args[2]['questionDefinition']
            server.preview_stack_question({**payload, 'answers': {'ans1_1': 'true'}}, True)
            args = api.call_args.args
            self.assertEqual(args[1], '/grade')
            self.assertEqual(args[2]['questionDefinition'], definition)
            self.assertEqual(args[2]['answers'], {'ans1_1': 'true'})

    def test_invalid_requests_fail_before_api_call(self):
        for extra in [{'seed': 0}, {'seed': True}, {'seed': 1.5}, {'lang': 'invalid'}, {'questionDefinition': '<bad'}]:
            with self.subTest(extra=extra), patch.object(server, 'request_stack_api') as api:
                with self.assertRaises(ValueError):
                    server.preview_stack_question({'questionDefinition': question(''), **extra})
                api.assert_not_called()

    def test_render_snapshot_survives_later_include_edits(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            include = root / 'shared.txt'
            include.write_text('x:1;')
            payload = {'questionDefinition': question('stack_include("shared.txt");'), 'url': server.ACTIVE_STACK_API_URL}
            with patch.object(server, 'REPO_ROOT', root), patch.object(server, 'request_stack_api', return_value=(server.ACTIVE_STACK_API_URL, {})) as api:
                render = server.preview_stack_question(payload)
                frozen = render['result']['previewDefinition']
                include.write_text('x:2;')
                server.preview_stack_question({**payload, 'questionDefinition': frozen, 'answers': {}}, True)
                graded_xml = api.call_args.args[2]['questionDefinition']
                self.assertIn('x:1;', graded_xml)
                self.assertNotIn('x:2;', graded_xml)


if __name__ == '__main__':
    unittest.main()
