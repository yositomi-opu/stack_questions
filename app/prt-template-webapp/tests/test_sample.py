import json
from pathlib import Path
import unittest
import csv_codec
import server

class SampleTests(unittest.TestCase):
    def test_shipped_csv_retains_exact_xml_and_matrix_source(self):
        folder=Path(server.__file__).parent/'samples'
        source,fields=csv_codec.loads((folder/'BasisDimNullSpace.csv').read_bytes())
        self.assertEqual(source,(folder/'011.PRT_template-ch.xml').read_bytes())
        self.assertEqual(fields['name'],'BasisDimNullSpace')
        m=json.loads(fields['template'])
        self.assertEqual(len(m['inputs']),7);self.assertEqual(len(m['checks']),7)
        self.assertIn('randechelon(3, 5, pv',fields['questionvariables'])
        self.assertIn('%_chkfunc(ansL):=[false, true, true, false, false, true, false, true]',fields['questionvariables'])
        self.assertEqual(m['inputs'][3]['type'],'algebraic')
        xml=server.edited(source,fields)
        self.assertIn('%_Num_Nodes:7;',server.parse(xml)[1].findtext('questionvariables/text'))
        self.assertEqual(csv_codec.loads(csv_codec.dumps(source,fields)),(source,fields))
