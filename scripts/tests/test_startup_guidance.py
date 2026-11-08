import importlib.util
import io
import os
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout

ROOT=Path(__file__).resolve().parents[2]
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
apps=load('startup_apps','local_apps.py')
console=apps._console
manager=load('startup_manager','mcq-webapp.py')

class ConsoleTests(unittest.TestCase):
    def test_environment_precedence_and_english_fallback(self):
        cases=[({'LANG':'ja_JP.UTF-8'},'ja'),({'LANG':'en_US.UTF-8'},'en'),({'LANG':'fr_FR.UTF-8'},'en'),({'LC_ALL':'C','LANG':'ja_JP.UTF-8'},'en'),({'LC_MESSAGES':'ja_JP.UTF-8','LANG':'en_US.UTF-8'},'ja'),({'LC_ALL':'en_US.UTF-8','LC_MESSAGES':'ja_JP.UTF-8'},'en')]
        for env,want in cases:
            with self.subTest(env=env),patch.dict(os.environ,env,clear=True):self.assertEqual(console.console_language(),want)
    def test_locale_and_macos_fallback(self):
        with patch.dict(os.environ,{},clear=True),patch.object(console.locale,'getlocale',return_value=('ja_JP','UTF-8')):self.assertEqual(console.console_language(),'ja')
        with patch.dict(os.environ,{},clear=True),patch.object(console.locale,'getlocale',return_value=(None,None)),patch.object(console.platform,'system',return_value='Darwin'),patch.object(console.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout='ja_JP\n')):self.assertEqual(console.console_language(),'ja')
        with patch.dict(os.environ,{},clear=True),patch.object(console.locale,'getlocale',side_effect=ValueError),patch.object(console.platform,'system',return_value='Darwin'),patch.object(console.subprocess,'run',side_effect=OSError):self.assertEqual(console.console_language(),'en')
    def test_console_is_independent_of_saved_ui_locale(self):
        config=dict(host='127.0.0.1',web_port=4173,stack_api_url='http://127.0.0.1:3080',locale='ja')
        for lang,heading in [('en_US.UTF-8','Start authoring apps'),('ja_JP.UTF-8','作問アプリを起動')]:
            with self.subTest(lang=lang),patch.dict(os.environ,{'LANG':lang,'LC_ALL':'','LC_MESSAGES':'','AUTHORING_APPS_GROUP':'1'}),patch.object(manager,'run'),patch.object(manager,'require_basic_dependencies'),patch.object(manager,'require_docker_daemon'),patch.object(manager,'compose_command'),patch.object(manager,'compose_environment'),patch.object(manager,'wait_for_stack_api'),patch.object(manager,'start_web'),redirect_stdout(io.StringIO()) as out:
                manager.start_services(config);self.assertIn(heading,out.getvalue())

class GuidanceTests(unittest.TestCase):
    def setUp(self):
        self.config=dict(web_port=8413,stack_api_port=8300,stack_api_url='http://127.0.0.1:8300')
        self.ports=[('prt-template-webapp',8415,4175),('stack-edit-webapp',4176,4176),('parsons-webapp',8417,4177)]
    def test_custom_ports_in_index_url(self):
        self.assertEqual(apps.authoring_url(self.config,self.ports),'http://127.0.0.1:8413/authoring.html?prt=8415&parsons=8417')
    def test_macos_explicit_yes_opens_exact_url(self):
        with patch.object(apps.platform,'system',return_value='Darwin'),patch.object(apps.sys.stdin,'isatty',return_value=True),patch.object(apps.sys.stdout,'isatty',return_value=True),patch('builtins.input',return_value='y') as prompt,patch.object(apps.subprocess,'run',return_value=SimpleNamespace(returncode=0)) as run:
            apps.show_authoring_index(self.config,self.ports);prompt.assert_called_once();self.assertEqual(run.call_args.args[0],['open',apps.authoring_url(self.config,self.ports)])
    def test_macos_no_empty_and_eof_do_not_open(self):
        for answer in ('','n','no'):
            with self.subTest(answer=answer),patch.object(apps.platform,'system',return_value='Darwin'),patch.object(apps.sys.stdin,'isatty',return_value=True),patch.object(apps.sys.stdout,'isatty',return_value=True),patch('builtins.input',return_value=answer),patch.object(apps.subprocess,'run') as run:
                apps.show_authoring_index(self.config,self.ports);run.assert_not_called()
        with patch.object(apps.platform,'system',return_value='Darwin'),patch.object(apps.sys.stdin,'isatty',return_value=True),patch.object(apps.sys.stdout,'isatty',return_value=True),patch('builtins.input',side_effect=EOFError),patch.object(apps.subprocess,'run') as run:
            apps.show_authoring_index(self.config,self.ports);run.assert_not_called()
    def test_noninteractive_other_os_and_status_never_prompt(self):
        for system,tty,offer in [('Linux',True,True),('Windows',True,True),('Darwin',False,True),('Darwin',True,False)]:
            with self.subTest(system=system,tty=tty,offer=offer),patch.object(apps.platform,'system',return_value=system),patch.object(apps.sys.stdin,'isatty',return_value=tty),patch('builtins.input') as prompt,patch.object(apps.subprocess,'run') as run:
                apps.show_authoring_index(self.config,self.ports,offer_open=offer);prompt.assert_not_called();run.assert_not_called()
    def test_open_failure_does_not_fail_started_services(self):
        with patch.object(apps.platform,'system',return_value='Darwin'),patch.object(apps.sys.stdin,'isatty',return_value=True),patch.object(apps.sys.stdout,'isatty',return_value=True),patch('builtins.input',return_value='yes'),patch.object(apps.subprocess,'run',side_effect=OSError),redirect_stdout(io.StringIO()) as out:
            apps.show_authoring_index(self.config,self.ports);self.assertIn('http://127.0.0.1:8413/authoring.html',out.getvalue())
    def test_start_restart_setup_announce_after_every_editor(self):
        for action in ('start','restart','setup'):
            events=[]
            fake=SimpleNamespace(runtime_config=lambda:self.config,local_web_url=lambda _: 'http://127.0.0.1:8413')
            with self.subTest(action=action),patch.object(apps,'manager_config',return_value=(fake,self.config)),patch.object(apps,'app_ports',return_value=self.ports),patch.object(apps,'stop_app'),patch.object(apps.subprocess,'run',return_value=SimpleNamespace(returncode=0)),patch.object(apps,'start_app',side_effect=lambda *a:events.append(a[0])),patch.object(apps,'show_authoring_index',side_effect=lambda *a,**k:events.append('index')):
                self.assertEqual(apps.main([action]),0);self.assertEqual(events,[x[0] for x in self.ports]+['index'])
    def test_failed_or_invalid_start_never_announces_or_prompts(self):
        fake=SimpleNamespace(runtime_config=lambda:self.config)
        with patch.object(apps,'manager_config',return_value=(fake,self.config)),patch.object(apps,'app_ports',return_value=self.ports),patch.object(apps.subprocess,'run',return_value=SimpleNamespace(returncode=1)),patch.object(apps,'show_authoring_index') as show:
            self.assertEqual(apps.main(['start']),1);show.assert_not_called()
        ports=self.ports+[('collision',8413,9999)]
        with patch.object(apps,'manager_config',return_value=(fake,self.config)),patch.object(apps,'app_ports',return_value=ports),patch.object(apps.subprocess,'run') as run:
            with self.assertRaises(ValueError):apps.main(['restart'])
            run.assert_not_called()
    def test_port_flags_match_child_and_index_config(self):
        with patch.dict(os.environ,{},clear=True):
            _,cfg=apps.manager_config(['--port','8413','--stack-api-port','8300'])
            self.assertEqual(cfg['web_port'],8413);self.assertEqual(cfg['stack_api_port'],8300)
    def test_bad_auxiliary_port_fails_before_mutations(self):
        with patch.dict(os.environ,{'PRT_WEBAPP_PORT':'bad'}):
            with self.assertRaises(ValueError):apps.app_ports()
    def test_optional_editor_has_index_link_only_when_installed(self):
        url=apps.authoring_url(self.config,[('tf-webapp',4178,4178)])
        self.assertIn('tf=4178',url)

if __name__=='__main__':unittest.main()
