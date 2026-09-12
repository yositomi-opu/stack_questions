import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('mcq_samples',ROOT/'app/mcq-webapp/server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
class SampleTests(unittest.TestCase):
    def test_real_samples(self):
        csv = server.repository_samples('csv')
        self.assertEqual(len(csv),61)
        self.assertTrue(any(item['path'].endswith('/NUR01.csv') for item in csv))
        xml = server.repository_samples('xml')
        self.assertTrue(any('GaussElimMatrixGivenRank-A-rk2-cb.xml' in item['path'] for item in xml))
        self.assertIn(b'config',server.read_repository_sample('csv',csv[0]['path']))
    def test_no_arbitrary_or_cross_format_paths(self):
        for name in ['../README.md','/etc/passwd','HANDOFF.md','app/mcq-webapp/.local/config.json','001/GaussElimMatrixGivenRank-A.txt']:
            with self.assertRaises(ValueError): server.read_repository_sample('xml',name)
        with self.assertRaises(ValueError): server.repository_samples('txt')
        with self.assertRaises(ValueError): server.read_repository_sample('xml','app/mcq-webapp/sample.csv')
    def test_symlinks_and_non_mcq_xml_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); (root/'001').mkdir(); (root/'secret').write_text('%__mcq')
            (root/'001/link.xml').symlink_to(root/'secret')
            (root/'001/other.xml').write_text('<quiz/>')
            (root/'001/mcq.xml').write_text('<quiz>%__mcq</quiz>')
            with patch.object(server,'REPO_ROOT',root):
                self.assertEqual(server.repository_samples('xml'),[{'path':'001/mcq.xml'}])
