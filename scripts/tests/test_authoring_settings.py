"""Probe actual HTTP text files without executing retrieved code."""
import importlib.util
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import threading
import unittest
spec=importlib.util.spec_from_file_location('settings',Path(__file__).resolve().parents[2]/'app/mcq-webapp/authoring_settings.py')
settings=importlib.util.module_from_spec(spec);spec.loader.exec_module(settings)
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        if self.path.startswith('/missing/'):self.send_error(404);return
        self.send_response(200);self.send_header('Content-Type','text/html' if self.path.startswith('/html/') else 'text/plain');self.end_headers();self.wfile.write(b'<html>error</html>' if self.path.startswith('/html/') else b'/* library */\na:1;')
class SettingsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start();cls.base=f'http://127.0.0.1:{cls.server.server_port}/'
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.thread.join()
    def test_required_and_selected_files(self):
        result=settings.validate_base({'baseUrl':self.base,'libraries':['trans_mat','trans_mat']});self.assertEqual(result['checked'],['multilang_library','trans_mat'])
    def test_mcq_required_helpers(self):
        result=settings.validate_base({'baseUrl':self.base,'libraries':['trans_mat']},mcq=True)
        self.assertEqual(result['checked'],['mcq_template_pre_cas','mcq_template_post_cas','mcq_template_fvar_cas','tex_library','trans_mat'])
    def test_missing_html_and_unknown_rejected(self):
        for path in ('missing/','html/'):
            with self.assertRaises(ValueError):settings.validate_base({'baseUrl':self.base+path,'libraries':[]})
        with self.assertRaises(ValueError):settings.validate_base({'baseUrl':self.base,'libraries':['../secret']})
    def test_invalid_urls(self):
        for value in ('file:///tmp/','https://u:p@example.com/','https://example.com/?q=1','https://example.com/#x','https://example.com/"','https://example.com/\na'):
            with self.assertRaises(ValueError):settings.normalize_base(value)
if __name__=='__main__':unittest.main()
