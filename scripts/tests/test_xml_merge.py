import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

SCRIPT = Path(__file__).resolve().parents[1] / 'moodle_xml_merge.py'
spec = importlib.util.spec_from_file_location('merge', SCRIPT)
merge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(merge)


class MergeTests(unittest.TestCase):
    def test_exact_question_bytes_and_markers(self):
        question = b'''<question type="stack"><name><text>A</text></name><questionvariables><text><![CDATA[Msg1T:castext("<p>{@BASE@} [[ans1]]</p>");]]></text></questionvariables><unknown attr='v'/></question>'''
        raw = b'\xef\xbb\xbf<?xml version="1.0"?><!-- provenance --><quiz><!-- inside --><question type="category"/>' + question + b'<question type="category"><category><text>old</text></category></question></quiz>'
        body, count, removed = merge.quiz_body(raw)
        self.assertIn(question, body)
        self.assertIn(b'<!-- provenance -->', body)
        self.assertIn(b'<!-- inside -->', body)
        self.assertEqual((count, removed), (1, 2))
        self.assertNotIn(b'type="category"', body)

    def test_merge_hierarchy_and_safe_failures(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            a, b, out = [root / name for name in ('a.xml', 'b.xml', 'out.xml')]
            original = b'<quiz><question type="category"><category><text>Old/Sub</text></category></question><question type="stack"><name><text>same</text></name></question></quiz>'
            a.write_bytes(original)
            b.write_bytes(original)
            def run(*args):
                return subprocess.run([sys.executable, str(SCRIPT), str(a), str(b), '--category', 'Algebra/Bases & dimension', '-o', str(out), *args], capture_output=True)
            self.assertEqual(run().returncode, 0)
            quiz = ET.fromstring(out.read_bytes())
            self.assertEqual(len(quiz.findall('question')), 3)  # duplicates retained
            self.assertEqual(quiz.findtext('question/category/text'), '$course$/top/Algebra/Bases & dimension')
            self.assertEqual(a.read_bytes(), original)
            self.assertEqual(b.read_bytes(), original)
            self.assertEqual(run().returncode, 1)
            before = out.read_bytes()
            b.write_text('<quiz><unsupported/></quiz>')
            self.assertEqual(run('--force').returncode, 1)
            self.assertEqual(out.read_bytes(), before)

    def test_reject_unsupported(self):
        for raw in (b'<!DOCTYPE quiz><quiz/>', b'<quiz xmlns:x="urn:x"><question type="stack"/></quiz>', b'<quiz>oops<question type="stack"/></quiz>', b'<quiz/>'):
            with self.assertRaises(ValueError):
                merge.quiz_body(raw)


if __name__ == '__main__':
    unittest.main()
