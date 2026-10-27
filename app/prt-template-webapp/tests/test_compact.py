import copy
import json
import unittest
import xml.etree.ElementTree as E
import server
import csv_codec
from prt_nodes import compact_fields,DEFAULT_INCLUDE,layout_text
from test_nodes import model

class CompactTests(unittest.TestCase):
    def fields(self):
        m=model();f=server.xml_fields(server.default_xml())|{'questionvariables':'taD:1;\nX:matrix([1]);\nqtext:%__lang([["ja","行列 {@X@} の問題"],["en","Question {@X@}"]]);','questiontext':'<p>{@qtext@}</p><p>[[ansD]]</p>','template':json.dumps(m)}
        return compact_fields(f)
    def test_generate_and_reopen_source_without_internal_fields(self):
        f=self.fields();m=json.loads(f['template']);self.assertEqual(m['layout'],'compact');self.assertIn('%_validate(',f['questionvariables']);self.assertNotIn('qtext:',f['questionvariables'])
        self.assertEqual(m['settings']['questionMessages']['en'],'Question {@X@}')
        raw=server.edited(server.default_xml(),f);q=server.parse(raw)[1];variables=q.findtext('questionvariables/text')
        self.assertIn('multilang_library.mac',variables);self.assertIn('qtext:%__mcq_lang(',variables);self.assertIn('castext("Question {@X@}")',variables)
        self.assertIn('[[input:ansD]][[validation:ansD]]',q.findtext('questiontext/text'));self.assertTrue(q.findtext('questiontext/text').startswith('<p>[[lang code="ja"]][[/lang]][[lang code="en"]][[/lang]]<br></p>'))
        reopened=compact_fields(server.xml_fields(raw));self.assertNotIn('stack_include(',reopened['questionvariables']);self.assertNotIn('PRT_TEMPLATE_GENERATED',reopened['questionvariables']);self.assertIn('%_chkfunc(',reopened['questionvariables']);self.assertNotIn('[[lang code',reopened['questiontext'])
        self.assertEqual(json.loads(reopened['template']),m)
    def test_bundle_and_split_dedup_and_csv_settings_roundtrip(self):
        f=self.fields();m=json.loads(f['template']);m['settings']['libraryIncludes'].update({x:DEFAULT_INCLUDE+x+'.mac' for x in ['ky_linear_algebra','genmatrix_lib','rref_lib']});m['inputs'][0]['options']='allowempty,hideanswer';f['template']=json.dumps(m)
        q=server.parse(server.edited(server.default_xml(),f))[1];code=q.findtext('questionvariables/text');self.assertEqual(code.count('stack_include('),2);self.assertNotIn('/genmatrix_lib.mac',code);self.assertEqual(q.findtext('input/options'),'allowempty,hideanswer')
        source,back=csv_codec.loads(csv_codec.dumps(server.default_xml(),f));self.assertEqual(json.loads(back['template']),m);self.assertEqual(source,server.default_xml())
    def test_missing_translation_rejects_xml_without_losing_csv(self):
        f=self.fields();m=json.loads(f['template']);m['settings']['languages'].append('fr');f['template']=json.dumps(m)
        source,back=csv_codec.loads(csv_codec.dumps(server.default_xml(),f));self.assertEqual(json.loads(back['template']),m)
        with self.assertRaisesRegex(ValueError,'Missing translation: fr'):server.edited(source,back)
    def test_custom_tests_are_not_silently_rewritten(self):
        f=self.fields();m=json.loads(f['template']);m.pop('layout');m.pop('settings');m['checks'][0]['sans']='CUSTOM';f['template']=json.dumps(m)
        self.assertEqual(compact_fields(f),f)
    def test_short_placeholders_header_and_real_language_content(self):
        m=json.loads(self.fields()['template']);text='<p>[[lang code="ja"]][[/lang]][[lang code="en"]][[/lang]]<br></p>\n<p>[[ansD]]</p>'
        result=layout_text(text,m);self.assertEqual(layout_text(result,m),result);self.assertEqual(result.count('<br></p>'),1)
        body='[[lang code="ja"]]内容[[/lang]] [[ansD]]';self.assertIn('内容',layout_text(body,m))
        with self.assertRaisesRegex(ValueError,'Unknown answer'):layout_text('[[ans9]]',m)
    def test_answer_binding_and_extra_feedback_program_are_preserved(self):
        f=self.fields();m=json.loads(f['template']);m['settings']['feedbackVariables']='custom:ansD;\n'+m['settings']['feedbackVariables'];f['template']=json.dumps(m)
        q=server.parse(server.edited(server.default_xml(),f))[1];self.assertTrue(q.findtext('prt/feedbackvariables/text').startswith('custom:ansD;'))

if __name__=='__main__':unittest.main()
