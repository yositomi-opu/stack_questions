"""Check that the legacy strings and their literal CASText counterparts agree."""
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
LANGS = ['en', 'es', 'ja', 'fr', 'it', 'de', 'pt', 'zh', 'ko', 'ru', 'sv']
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
        for mode in ['rb', 'cb']:
            source = (ROOT / f'001.MCQ_cas-{mode}.xml').read_text()
            ET.fromstring(source)
            self.assertEqual(source, (ROOT / f'app/mcq-webapp/templates/001.MCQ_cas-{mode}.xml').read_text())
            for stem in ['pre', 'post', 'fvar']:
                self.assertIn(f'mcq_template_{stem}_cas.mac', source)
                self.assertNotIn(f'mcq_template_{stem}.mac', source)

    def test_standard_and_cas_pattern_nodes_match(self):
        import xml.etree.ElementTree as ET
        for mode in ['rb', 'cb']:
            standard = ET.parse(ROOT / f'001.MCQ-{mode}.xml').find('question')
            cas = ET.parse(ROOT / f'001.MCQ_cas-{mode}.xml').find('question')
            nodes = {node.findtext('name'): node for node in standard.findall('prt/node')}
            self.assertEqual(len(nodes), 32)
            for node in cas.findall('prt/node'):
                name = node.findtext('name')
                if int(name) >= 2:
                    fields = lambda item: [(el.tag, (el.text or '').strip()) for el in item.iter()]
                    self.assertEqual(fields(nodes[name]), fields(node))
            for node in nodes.values():
                for branch in ['truenextnode', 'falsenextnode']:
                    self.assertIn(node.findtext(branch), set(nodes) | {'-1'})
            self.assertIn('mcq_template_fvar.mac', standard.findtext('prt/feedbackvariables/text'))
            self.assertNotIn('%__mcq_langcode', ''.join(standard.find('prt').itertext()))
            self.assertIn('{@%__mcq_noidea_checked@}', standard.findtext('prt/node/truefeedback/text'))
