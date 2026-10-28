import importlib.util
import io
import json
from pathlib import Path
import sys
import threading
import unittest
import urllib.error
import urllib.request
import zipfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
spec=importlib.util.spec_from_file_location('stack_editor_server',ROOT/'server.py')
server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)


class StandaloneTests(unittest.TestCase):
    def setUp(self):
        self.server=server.create_server(0);self.base=f'http://127.0.0.1:{self.server.server_port}'
        threading.Thread(target=self.server.serve_forever,daemon=True).start()
        self.addCleanup(self.server.server_close);self.addCleanup(self.server.shutdown)
        self.sid=self.post('/api/session',{})['session']
    def post(self,path,data,raw=False,origin=None):
        req=urllib.request.Request(self.base+path,data=data if raw else json.dumps(data).encode(),headers={'Origin':origin or self.base,'X-Qbank-Request':'1','X-Editor-Session':getattr(self,'sid','')})
        with urllib.request.urlopen(req) as r:return json.load(r)
    def get(self,path):
        req=urllib.request.Request(self.base+path,headers={'X-Editor-Session':self.sid})
        with urllib.request.urlopen(req) as r:return r.read()
    def test_expired_session_has_machine_readable_status(self):
        self.server.sessions.clear()
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.get('/api/state')
        self.assertEqual(error.exception.code,410)
        self.assertEqual(json.load(error.exception)['code'],'session_expired')

    def test_project_preserves_original_and_rejects_tampering(self):
        raw=b'<quiz><question type="stack"><name><text>A</text></name><unknown>STACK Case {@X@}</unknown><!--keep--></question></quiz>'
        opened=self.post('/api/open',raw,True)
        self.post('/api/action',dict(revision=opened['revision'],fields=opened['editFields']|{'name':'B'}))
        self.assertEqual(self.get('/api/original'),raw)
        project=self.get('/api/project');self.post('/api/open',project,True)
        self.assertIn(b'STACK Case {@X@}',self.get('/api/xml'));self.assertIn(b'keep',self.get('/api/xml'))
        with zipfile.ZipFile(io.BytesIO(project)) as z:files={n:z.read(n) for n in z.namelist()}
        files['source.xml']=b'changed';out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as z:
            for name,content in files.items():z.writestr(name,content)
        with self.assertRaises(urllib.error.HTTPError):self.post('/api/open',out.getvalue(),True)
        self.assertEqual(self.get('/api/original'),raw)
    def test_rejects_dtd_multiple_questions_and_untrusted_origin(self):
        for raw in (b'<!DOCTYPE quiz><quiz/>',b'<quiz><question type="stack"/><question type="stack"/></quiz>'):
            with self.assertRaises(urllib.error.HTTPError):self.post('/api/open',raw,True)
        with self.assertRaises(urllib.error.HTTPError) as e:self.post('/api/session',{},origin='https://example.org')
        self.assertEqual(e.exception.code,403)


class FileMenuTests(StandaloneTests):
    def test_export_current_edits_without_mutating_session_and_csv_open(self):
        from test_nodes import model
        state=self.post('/api/open',server.default_xml(),True)
        fields=state['editFields']|{'name':'Not applied', 'questionvariables':'taD:1;', 'template':json.dumps(model())}
        req=urllib.request.Request(self.base+'/api/export',data=json.dumps(dict(revision=state['revision'],format='csv',fields=fields)).encode(),headers={'Origin':self.base,'X-Qbank-Request':'1','X-Editor-Session':self.sid})
        with urllib.request.urlopen(req) as r:csv=r.read()
        self.assertEqual(json.loads(self.get('/api/state'))['name'],'New STACK')
        opened=self.post('/api/open',csv,True)
        self.assertEqual(opened['name'],'Not applied');self.assertEqual(self.get('/api/original'),server.default_xml())
        self.assertEqual(json.loads(opened['editFields']['template']),model())
    def test_general_editor_preserves_generated_variables(self):
        from test_nodes import model
        self.server.general=True
        raw=server.edited(server.default_xml(),dict(questionvariables='taD:1;',template=json.dumps(model())))
        opened=self.post('/api/open',raw,True)
        self.assertNotIn('template',opened['editFields'])
        self.assertEqual(opened['editFields']['questionvariables'],server.parse(raw)[1].findtext('questionvariables/text'))
