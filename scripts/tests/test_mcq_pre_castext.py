"""Check that the legacy strings and their literal CASText counterparts agree."""
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
LANGS = ['en', 'ja', 'fr', 'it', 'de', 'pt', 'zh', 'ko', 'ru', 'sv']
NAMES = ['%__mcq_nocoptSL', '%__mcq_noidSL', '%__mcq_noidea_checkedL']


class McqPreCastextTests(unittest.TestCase):
    def test_all_languages_and_exact_castext_counterparts(self):
        source = (ROOT / 'mcq_template_pre.txt').read_text()
        for name in NAMES:
            with self.subTest(name=name):
                plain = json.loads(re.search(re.escape(name) + r':(\[[\s\S]*?\n\]);', source)[1])
                cas = re.search(re.escape(name) + r':(\[[\s\S]*?\n\]);', (ROOT / 'mcq_template_pre_cas.txt').read_text())[1]
                entries = re.findall(r'\["([a-z]+)", castext\(("(?:\\.|[^"\\])*")\)\]', cas)
                self.assertEqual([lang for lang, _ in plain], LANGS)
                self.assertEqual([[lang, json.loads(text)] for lang, text in entries], plain)
                self.assertTrue(all(text for _, text in plain))

    def test_generated_mac_is_current(self):
        source = (ROOT / 'mcq_template_pre.txt').read_text()
        expected = re.sub(r'/\*.*?\*/', '', source, flags=re.S).rstrip() + '\n'
        self.assertEqual((ROOT / 'mcq_template_pre.mac').read_text(), expected)

    def test_existing_consumers_still_use_string_arrays(self):
        source = (ROOT / 'mcq_template_pre.txt').read_text()
        for target, array, lang in [('%__mcq_nocoptS', NAMES[0], '%__STACK_LANG'),
                                    ('%__mcq_noidS', NAMES[1], '%__STACK_LANG'),
                                    ('%__mcq_noidea_checked', NAMES[2], '%_STACK_LANG')]:
            self.assertIn(f'{target}:%__mcq_lang({array}, {lang});', source)

    def test_template_family_is_separate(self):
        import xml.etree.ElementTree as ET
        for stem in ['pre', 'post', 'fvar']:
            source = (ROOT / f'mcq_template_{stem}_cas.txt').read_text()
            expected = re.sub(r'/\*.*?\*/', '', source, flags=re.S).rstrip() + '\n'
            self.assertEqual((ROOT / f'mcq_template_{stem}_cas.mac').read_text(), expected)
            if stem != 'pre':
                self.assertEqual(source, (ROOT / f'mcq_template_{stem}.txt').read_text())
        for mode in ['rb', 'cb']:
            source = (ROOT / f'001.MCQ_cas-{mode}.xml').read_text()
            ET.fromstring(source)
            self.assertEqual(source, (ROOT / f'app/mcq-webapp/templates/001.MCQ_cas-{mode}.xml').read_text())
            for stem in ['pre', 'post', 'fvar']:
                self.assertIn(f'mcq_template_{stem}_cas.mac', source)
                self.assertNotIn(f'mcq_template_{stem}.mac', source)
