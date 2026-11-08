import copy
import importlib.util
import json
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as E
from urllib.request import Request, build_opener, ProxyHandler
from urllib.error import HTTPError

APP=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('tf_test_server',APP/'server.py')
server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
import truefalse as tf
import csv_codec

class TFTests(unittest.TestCase):
    def setUp(self):
        self.model,self.variables=tf.sample()
        self.source=tf.TEMPLATE.read_bytes()
        self.fields=dict(name='Synthetic TF',questionvariables='A:42;',questiontext='',generalfeedback='',template=json.dumps(self.model,ensure_ascii=False))
    def generate(self,model=None):
        fields=dict(self.fields,template=json.dumps(model or self.model,ensure_ascii=False))
        return server.runtime.edited(self.source,fields)
    def test_template_import_and_compilation(self):
        m=self.model
        self.assertEqual(len(m['correct']),1);self.assertEqual(len(m['wrong']),1)
        self.assertFalse(m['%_noidea']);self.assertEqual(len(m['languages']),10)
        raw=self.generate();q=E.fromstring(raw).find('question');v=q.findtext('questionvariables/text')
        self.assertIn('%_tf:rand([1, 2]);',v);self.assertIn('%_noidea:false;',v)
        self.assertIn('qtext:castext_concat(qtext0, [rand([AssertC1]), rand([AssertW1])][%_tf]);',v)
        self.assertNotIn('castxt(',v);self.assertIn('castext("다음',v)
        self.assertEqual(q.findtext('input/type'),'dropdown');self.assertEqual(q.findtext('prt/node/sans'),'[ans1]')
        self.assertEqual(q.findtext('prt/node/tans'),'ta1');self.assertIn('{@msgT@}',q.findtext('prt/node/truefeedback/text'))
        self.assertIn('{@msgF@}',q.findtext('prt/node/falsefeedback/text'))
    def test_multiple_assertions_shared_and_truth_flags(self):
        m=self.model;m['correct'].append(dict(dependent=False,shared=r'\(1+1=2\)',messages={}))
        m['wrong'].append(copy.deepcopy(m['wrong'][0]))
        for truth,expression in [('true','1'),('false','2')]:
            m['truth']=truth;v=E.fromstring(self.generate(m)).findtext('question/questionvariables/text')
            self.assertIn('%_tf:'+expression+';',v)
            self.assertIn('AssertC2:castext(',v);self.assertNotIn('AssertC2:%__mcq_lang',v)
            self.assertIn('rand([AssertC1, AssertC2])',v);self.assertIn('rand([AssertW1, AssertW2])',v)
    def test_roundtrips_retain_original_variables_and_unknown_content(self):
        root=E.fromstring(self.source);q=root.find('question');E.SubElement(q,'future_field').text='keep';E.SubElement(q.find('input'),'future_input').text='keep'
        source=E.tostring(root);encoded=csv_codec.dumps(source,self.fields)
        self.assertIn(b'%_noidea,false',encoded)
        original,fields=csv_codec.loads(encoded);self.assertEqual(original,source)
        raw=server.runtime.edited(original,fields);parsed=server.runtime.tf_fields(raw)
        self.assertEqual(parsed['questionvariables'],'A:42;');self.assertEqual(json.loads(parsed['template']),self.model)
        self.assertEqual(server.runtime.edited(raw,parsed),raw)
        out=E.fromstring(raw);self.assertEqual(out.findtext('question/future_field'),'keep');self.assertEqual(out.findtext('question/input/future_input'),'keep')
    def test_csv_keeps_untranslated_draft_xml_rejects(self):
        self.model['correct'].append(dict(dependent=True,messages={'ja':'下書き'},shared=''))
        self.fields['template']=json.dumps(self.model)
        _,fields=csv_codec.loads(csv_codec.dumps(self.source,self.fields));self.assertEqual(json.loads(fields['template']),self.model)
        with self.assertRaisesRegex(ValueError,'translation'):self.generate()
    def test_marker_strings_in_user_code_roundtrip_without_truncation(self):
        self.fields['questionvariables']='marker:"/* TF_USER_END */";\nA:42;'
        raw=self.generate();self.assertEqual(server.runtime.tf_fields(raw)['questionvariables'],self.fields['questionvariables'])
        for value in ['/* TF_USER_BEGIN */\nA:42;','/* TF_GENERATED_BEGIN */\nA:42;\n/* TF_GENERATED_END */']:
            self.fields['questionvariables']=value
            with self.assertRaisesRegex(ValueError,'reserved'):self.generate()
    def test_required_pools_and_noidea_unsupported(self):
        for side in ('correct','wrong'):
            m=copy.deepcopy(self.model);m[side]=[]
            with self.assertRaises(ValueError):tf.validate(m)
        m=copy.deepcopy(self.model);m['%_noidea']=True
        with self.assertRaisesRegex(ValueError,'noidea'):tf.validate(m)
    def test_noidea_true_csv_draft_roundtrip_and_xml_guard(self):
        self.model['%_noidea']=True
        self.fields['template']=json.dumps(self.model)
        encoded=csv_codec.dumps(self.source,self.fields)
        self.assertIn(b'%_noidea,true',encoded)
        source,fields=csv_codec.loads(encoded)
        self.assertTrue(json.loads(fields['template'])['%_noidea'])
        with self.assertRaisesRegex(ValueError,'CSV'):server.runtime.edited(source,fields)
        self.model['%_noidea']=False
        self.assertIn('%_noidea:false;',E.fromstring(self.generate()).findtext('question/questionvariables/text'))

    def test_escaping_and_include_urls(self):
        m=self.model;m['correct'][0]['dependent']=False;m['correct'][0]['shared']='" </text> ]]> \\ <img onerror="bad()">'
        raw=self.generate(m);E.fromstring(raw)
        self.assertIn('onerror',raw.decode());self.assertIn('\\"',E.fromstring(raw).findtext('question/questionvariables/text'))
        for invalid in ['file:///secret','javascript:bad','https://user:secret@example.org/a.mac']:
            m=copy.deepcopy(self.model);m['includes'].append(invalid)
            with self.assertRaises(ValueError):tf.validate(m)
    def test_additional_inputs_refused(self):
        root=E.fromstring(self.source);E.SubElement(root.find('question'),'input');source=E.tostring(root)
        with self.assertRaises(ValueError):server.runtime.edited(source,self.fields)
    def test_translation_guards(self):
        import translation
        source={'AssertC1':{'true':r'\(A\) {@CaseSensitive@}','false':''}}
        with self.assertRaises(ValueError):translation.validate(source,{'AssertC1':{'true':r'\(B\) {@CaseSensitive@}','false':''}})
        self.assertEqual(translation.validate(source,source),source)

class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.s=server.create_server(0);threading.Thread(target=self.s.serve_forever,daemon=True).start()
        self.base=f'http://127.0.0.1:{self.s.server_port}';self.sid=''
    def tearDown(self):self.s.shutdown();self.s.server_close()
    def call(self,path,data=None,raw=False,headers=None):
        h={'Origin':self.base,'X-Qbank-Request':'1','X-Editor-Session':self.sid};h.update(headers or {})
        body=None if data is None else data if raw else json.dumps(data).encode()
        return build_opener(ProxyHandler({})).open(Request(self.base+path,data=body,headers=h))
    def test_variable_evaluation_uses_libraries_and_current_draft(self):
        with self.call('/api/session',{}) as r:self.sid=json.load(r)['session']
        with self.call('/api/state') as r:state=json.load(r)
        fields=state['editFields'];fields['questionvariables']='a:42; b:[a];'
        with patch.object(server.runtime.authoring_settings,'evaluate_via_mcq',return_value={'ok':True,'variables':[]}) as evaluate:
            with self.call('/api/variables/evaluate',dict(revision=state['revision'],fields=fields)) as r:self.assertTrue(json.load(r)['ok'])
            base,code,names=evaluate.call_args.args
            self.assertEqual(base,'http://127.0.0.1:4173');self.assertEqual(names,['a','b'])
            self.assertLess(code.index('stack_include('),code.index('a:42;'))
            with self.assertRaises(HTTPError):self.call('/api/variables/evaluate',dict(revision='stale',fields=fields))
            self.assertEqual(evaluate.call_count,1)
        with self.call('/api/state') as r:self.assertEqual(json.load(r)['revision'],state['revision'])

    def test_session_export_open_and_origin(self):
        with self.call('/api/health') as r:self.assertEqual(json.load(r)['app'],'tf-webapp')
        with self.call('/api/session',{}) as r:self.sid=json.load(r)['session']
        with self.call('/api/state') as r:state=json.load(r)
        with self.call('/api/original') as r:self.assertEqual(r.read(),tf.TEMPLATE.read_bytes())
        fields=state['editFields'];fields['name']='HTTP synthetic';fields['questionvariables']='A:42;'
        with self.call('/api/export',dict(revision=state['revision'],format='csv',fields=fields)) as r:csv=r.read()
        with self.call('/api/open',csv,raw=True) as r:loaded=json.load(r)
        self.assertEqual(loaded['editFields']['questionvariables'],'A:42;')
        with self.call('/api/export',dict(revision=loaded['revision'],format='xml',fields=loaded['editFields'])) as r:xml=r.read()
        with self.call('/api/open',xml,raw=True) as r:again=json.load(r)
        self.assertEqual(again['editFields']['questionvariables'],'A:42;')
        with self.call('/api/original') as r:self.assertEqual(r.read(),xml)
        before=again['revision']
        with self.assertRaises(HTTPError):self.call('/api/open',b'<quiz>broken',raw=True)
        with self.call('/api/state') as r:self.assertEqual(json.load(r)['revision'],before)
        with self.assertRaises(HTTPError):self.call('/api/export',dict(revision='stale',format='xml',fields=fields))
        with self.assertRaises(HTTPError):self.call('/api/session',{},headers={'Origin':'http://example.org'})
        with self.assertRaises(HTTPError):self.call('/api/session',{'callback':'https://example.org/api/editor-return'})
        for asset in ('/','/authoring-settings.js','/editor.js','/preview.js','/vendor/mathjax-tex-svg-3.2.2.js'):
            with self.call(asset) as r:self.assertEqual(r.status,200)

if __name__=='__main__':unittest.main()
