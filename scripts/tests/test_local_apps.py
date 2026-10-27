import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('authoring_apps_test',ROOT/'scripts/local_apps.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)


class LocalAppsTests(unittest.TestCase):
    def test_start_manages_both_editors_after_existing_mcq_manager(self):
        with patch.object(a.subprocess,'run',return_value=SimpleNamespace(returncode=0)) as run,patch.object(a,'start_app') as start:
            self.assertEqual(a.main(['start']),0)
            self.assertIn('mcq-webapp.py',run.call_args.args[0][1]);self.assertEqual(run.call_args.args[0][2],'start')
            self.assertEqual([call.args[0] for call in start.call_args_list],['prt-template-webapp','stack-edit-webapp'])
    def test_setup_passes_options_then_starts_both_editors(self):
        with patch.object(a.subprocess,'run',return_value=SimpleNamespace(returncode=0)) as run,patch.object(a,'start_app') as start:
            self.assertEqual(a.main(['setup','--locale','ja']),0)
            self.assertEqual(run.call_args.args[0][2:],['setup','--locale','ja'])
            self.assertEqual([call.args[0] for call in start.call_args_list],['prt-template-webapp','stack-edit-webapp'])

    def test_restart_stops_editors_then_restarts_all_apps(self):
        with patch.object(a.subprocess,'run',return_value=SimpleNamespace(returncode=0)) as run,patch.object(a,'start_app') as start,patch.object(a,'stop_app') as stop:
            self.assertEqual(a.main(['restart']),0)
            self.assertEqual([call.args[0] for call in stop.call_args_list],['stack-edit-webapp','prt-template-webapp'])
            self.assertEqual([call.args[0][2] for call in run.call_args_list],['stop','start'])
            self.assertEqual(start.call_count,2)

    def test_failed_mcq_start_does_not_launch_editors(self):
        with patch.object(a.subprocess,'run',return_value=SimpleNamespace(returncode=1)),patch.object(a,'start_app') as start:
            self.assertEqual(a.main(['start']),1);start.assert_not_called()
    def test_stop_refuses_pid_or_application_mismatch(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'prt-template-webapp.json').write_text(json.dumps({'pid':123,'port':4175}))
            with patch.object(a,'STATE',root),patch.object(a,'health',return_value={'app':'another','pid':123}),patch.object(a.os,'kill') as kill:
                with self.assertRaises(ValueError):a.stop_app('prt-template-webapp')
                kill.assert_not_called()
