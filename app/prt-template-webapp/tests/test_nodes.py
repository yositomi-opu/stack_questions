import copy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as E
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
import csv_codec
from prt_nodes import compile_nodes, generated_variables, base_variables, import_pattern, validate


def model():
    return dict(version=2,mode='chain',inputs=[dict(name='ansD',type='numerical',tans='taD',options='allowempty')],validationCode='%_validate(ansL):=is(ansL[1]#EMPTYANSWER);',checkCode='%_chkfunc(ansL):=[is(ansL[1]=taD), is(ansL[1]<0), is(ansL[1]=-2)];',validation=dict(answertest='AlgEquiv',sans='chkV',tans='false',testoptions='',feedback='INVALID'),correct=dict(answertest='AlgEquiv',sans='chkL[1]',tans='true',testoptions='',feedback='CORRECT'),checks=[dict(id='c'+str(i),skills='K1,K2',description='Case '+str(i),answertest='AlgEquiv',sans='chkL['+str(i+1)+']',tans='true',testoptions='',weight='0.25',trueMessages={'ja':'数式 {@X@}, "引用"\n\\(x\\)','en':'[[if test="X>0"]]Positive[[/if]]'},falseMessages={'ja':'偽','en':'False'}) for i in range(1,3)])

class NodeTests(unittest.TestCase):
    def test_graph_score_and_language_castext(self):
        m=model();p=compile_nodes(m).find('prt');nodes=p.findall('node')
        self.assertEqual(nodes[1].findtext('falsescoremode'),'=');self.assertEqual(nodes[1].findtext('falsescore'),'sc')
        self.assertEqual(nodes[2].findtext('truenextnode'),'3');self.assertEqual(nodes[2].findtext('falsefeedback/text'),'{@%_fmsg1F@}')
        self.assertIn('if chkV then chkL:',p.findtext('feedbackvariables/text'))
        code=generated_variables('X:2;\n/* keep CASE */\nS:"/* PRT_TEMPLATE_GENERATED_END */";',m)
        self.assertIn('%_Num_Nodes:2;',code);self.assertIn('castext(',code);self.assertIn('\\\\(x\\\\)',code)
        self.assertEqual(generated_variables(code,m),code)
        m['mode']='tree';self.assertEqual(compile_nodes(m).findall('prt/node')[2].findtext('truenextnode'),'-1')
    def test_csv_roundtrip_and_reject_malformed_atomically(self):
        raw=server.default_xml();fields=server.xml_fields(raw)|{'template':json.dumps(model()),'questionvariables':'X:2;\n/* 日本語, "引用" */','questiontext':'<b>{@X@} [[input:ansD]][[validation:ansD]]</b>'}
        data=csv_codec.dumps(raw,fields);source,back=csv_codec.loads(data)
        self.assertEqual(source,raw);self.assertEqual(json.loads(back.pop('template')),json.loads(fields['template']))
        self.assertEqual(back,{k:v for k,v in fields.items() if k!='template'})
        self.assertTrue(data.startswith(b'\xef\xbb\xbf'))
        for bad in (data.replace(b'prt-template-csv-v1',b'unknown'),data+b'question,,name,duplicate\r\n',data.replace(b'inputs,1,',b'inputs,3,')):
            with self.assertRaises(ValueError):csv_codec.loads(bad)
    def test_xml_metadata_reopen_and_unknown_content(self):
        root,q=server.parse(server.default_xml());E.SubElement(q,'custom').text='KEEP {@X@}'
        raw=E.tostring(root);f=server.xml_fields(raw)|{'template':json.dumps(model()),'questionvariables':'taD:1;'}
        one=server.edited(raw,f);r,q=server.parse(one);q.find('prt').append(E.Element('customPrt'));q.find('prt/node').append(E.Element('customNode'))
        one=E.tostring(r);back=server.xml_fields(one);two=server.edited(one,back)
        self.assertEqual(json.loads(back['template']),model());self.assertIn(b'customPrt',two);self.assertIn(b'customNode',two);self.assertIn(b'KEEP {@X@}',two)
        self.assertEqual(base_variables(server.parse(two)[1].findtext('questionvariables/text')),'taD:1;')
    def test_unrecognized_custom_feedback_program_is_not_discarded(self):
        raw=server.edited(server.default_xml(),dict(questionvariables='taD:1;',template=json.dumps(model())))
        _,q=server.parse(raw)
        self.assertIsNotNone(import_pattern(q))
        q.find('prt/feedbackvariables/text').text+='\ncustom_algorithm:42;'
        self.assertIsNone(import_pattern(q))
        self.assertIn('custom_algorithm:42;',q.findtext('prt/feedbackvariables/text'))

    def test_multilingual_preview_grade_uses_render_snapshot(self):
        p=server.Preview('http://127.0.0.1:4173','http://127.0.0.1:3080')
        with patch.object(p,'call',side_effect=[{'questionrender':'<p>Bonjour</p>'},{'score':0.5}]) as call:
            rendered=p.render('<quiz/>',3,'fr');p.grade(rendered['practiceToken'],{'ansD':'2'})
        self.assertEqual(call.call_args.args[1]['lang'],'fr')
        self.assertEqual(call.call_args.args[1]['seed'],3)

    def test_weights_and_identifiers(self):
        for change in ('weight','duplicate','name'):
            m=model()
            if change=='weight':m['checks'][0]['weight']='0.9'
            if change=='duplicate':m['checks'][1]['id']=m['checks'][0]['id']
            if change=='name':m['inputs'][0]['name']='bad'
            with self.assertRaises(ValueError):validate(m)

if __name__=='__main__':unittest.main()
