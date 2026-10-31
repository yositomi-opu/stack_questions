import importlib.util
import json
from pathlib import Path
import threading
import unittest
import urllib.request
import urllib.error

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('parsons_app_test',ROOT/'server.py')
app=importlib.util.module_from_spec(spec);spec.loader.exec_module(app)
from parsons import sample,validate,generated_variables,base_variables

class ParsonsAppTests(unittest.TestCase):
    def setUp(self):
        self.server=app.create_server(0);self.url=f'http://127.0.0.1:{self.server.server_port}'
        threading.Thread(target=self.server.serve_forever,daemon=True).start()
        self.addCleanup(self.server.server_close);self.addCleanup(self.server.shutdown)
        self.sid=self.post('/api/session',{})['session']
    def post(self,path,data,raw=False,sid=None):
        headers={'Origin':self.url,'X-Qbank-Request':'1','X-Editor-Session':sid or getattr(self,'sid','')}
        req=urllib.request.Request(self.url+path,data=data if raw else json.dumps(data).encode(),headers=headers)
        with urllib.request.urlopen(req) as r:
            body=r.read();return json.loads(body) if r.headers['Content-Type'].startswith('application/json') else body
    def get(self,path):
        with urllib.request.urlopen(urllib.request.Request(self.url+path,headers={'X-Editor-Session':self.sid})) as r:return r.read()
    def test_default_model_and_csv_original_roundtrip(self):
        state=json.loads(self.get('/api/state'));self.assertEqual(json.loads(state['editFields']['template'])['mode'],'parsons')
        original=self.get('/api/original');fields=state['editFields']|{'name':'Roundtrip'}
        csv=self.post('/api/export',{'revision':state['revision'],'format':'csv','fields':fields})
        reopened=self.post('/api/open',csv,raw=True)
        self.assertEqual(reopened['name'],'Roundtrip');self.assertEqual(self.get('/api/original'),original)
        xml=self.post('/api/export',{'revision':reopened['revision'],'format':'xml','fields':reopened['editFields']})
        self.assertIn(b'parsons_encode(proof_steps)',xml);self.assertIn(b'castext(',xml)
    def test_expired_callback_and_untrusted_origin_rejected(self):
        for callback in ['https://example.invalid/api/editor-return','http://127.0.0.1:4191/wrong']:
            with self.assertRaises(urllib.error.HTTPError):self.post('/api/session',{'callback':callback})
        self.server.sessions[self.sid]['created']-=7201
        with self.assertRaises(urllib.error.HTTPError) as e:self.get('/api/state')
        self.assertEqual(e.exception.code,410)
    def test_project_and_validation_fail_without_losing_original(self):
        state=json.loads(self.get('/api/state'));original=self.get('/api/original');fields=state['editFields']|{'name':'Project'}
        project=self.post('/api/project-export',{'revision':state['revision'],'fields':fields})
        reopened=self.post('/api/open',project,raw=True)
        self.assertEqual(reopened['name'],'Project');self.assertEqual(self.get('/api/original'),original)
        fields['template']=json.dumps(sample()|{'answer':['unknown']})
        with self.assertRaises(urllib.error.HTTPError):self.post('/api/action',{'revision':reopened['revision'],'fields':fields})
        self.assertEqual(self.get('/api/original'),original)
    def test_literal_generated_markers_remain_data(self):
        source='A:"/* PARSONS_GENERATED_BEGIN */ literal /* PARSONS_GENERATED_END */";'
        self.assertEqual(base_variables(generated_variables(source,sample())),source)
