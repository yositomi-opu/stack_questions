import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('mcq_diagnostics_server', ROOT / 'app/mcq-webapp/server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

class EvaluationDiagnosticsTests(unittest.TestCase):
    def evaluate(self, output, expressions=None):
        with patch.object(server, 'find_maxima', return_value='/mock/maxima'), patch.object(server, 'rewrite_stack_includes', side_effect=lambda code, maxima: code), patch.object(server, 'build_maxima_program', return_value=''), patch.object(server, 'using_dumped_maxima', return_value=False), patch.object(server, 'maxima_command', return_value=['maxima']), patch.object(server.subprocess, 'run', return_value=SimpleNamespace(stdout=output, stderr='')):
            return server.evaluate_payload({'variables':'x:1/0;', 'variableNames':[], 'expressions':expressions or []})

    def test_first_error_survives_long_later_output(self):
        marker = server.MARKER
        result = self.evaluate(f'{marker}QVARS_BEGIN\nvariables.mac line 1: division by zero\n{marker}QVARS_STATUS:error\n' + 'later output\n' * 4000)
        self.assertFalse(result['ok'])
        self.assertIn('line 1: division by zero', result['diagnostics'])
        self.assertIn('log truncated', result['diagnostics'])

    def test_expression_failure_also_includes_log(self):
        result = self.evaluate(f'{server.MARKER}QVARS_STATUS:ok\ndivision by zero', [{'id':'choice:0:ja','expression':'1/0'}])
        self.assertTrue(result['ok'])
        self.assertFalse(result['expressions'][0]['ok'])
        self.assertIn('division by zero',result['diagnostics'])

    def test_success_does_not_include_error_log(self):
        self.assertNotIn('diagnostics',self.evaluate(f'{server.MARKER}QVARS_STATUS:ok'))
