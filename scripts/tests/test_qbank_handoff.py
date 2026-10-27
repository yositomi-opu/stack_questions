import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('mcq_handoff_test',ROOT/'app/mcq-webapp/qbank_handoff.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)


class HandoffTests(unittest.TestCase):
    def test_content_only_edit_retains_case_and_placeholders(self):
        original='<quiz><question type="stack"><name><text>Old</text></name><questionvariables><text>X:1;</text></questionvariables><questiontext><text>{@X@} [[input:ans1]]</text></questiontext><input><type>radio</type></input><prt><name>p1</name></prt></question></quiz>'
        changed=original.replace('Old','New').replace('X:1;','X:2;')
        fields=h.safe_fields(original,changed)
        self.assertEqual(fields['questionvariables'],'X:2;');self.assertEqual(fields['questiontext'],'{@X@} [[input:ans1]]');self.assertEqual(fields['name'],'New')
    def test_structural_edit_and_unsafe_xml_are_rejected(self):
        original='<quiz><question type="stack"><input><type>radio</type></input></question></quiz>'
        with self.assertRaisesRegex(ValueError,'structural replacement'):h.safe_fields(original,original.replace('radio','checkbox'))
        for xml in ('<!DOCTYPE quiz><quiz/>','<quiz><question type="stack"/><question type="stack"/></quiz>'):
            with self.assertRaises(ValueError):h.question(xml)
