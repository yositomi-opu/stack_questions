import importlib.util
from contextlib import ExitStack
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("manager", Path(__file__).resolve().parents[1] / "mcq-webapp.py")
manager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manager)


def result(code=0):
    return subprocess.CompletedProcess([], code, stderr="unavailable" if code else "")


class DockerStartupTests(unittest.TestCase):
    def test_setup_and_start_reuse_cached_images(self):
        config = {"locale": "ja", "locale_mode": "auto", "host": "127.0.0.1",
                  "web_port": 4173, "include_base_url": "https://example.org/",
                  "stack_api_url": "http://127.0.0.1:3080"}
        with ExitStack() as mocks:
            for name in ["repair_permissions", "require_basic_dependencies", "require_docker_daemon",
                         "compose_prefix", "stop_web", "start_web", "wait_for_stack_api",
                         "check_maxima_evaluation"]:
                mocks.enter_context(patch.object(manager, name))
            mocks.enter_context(patch.object(manager, "dependency_diagnostics", return_value=[]))
            mocks.enter_context(patch.object(manager, "compose_environment", return_value={}))
            mocks.enter_context(patch.object(manager, "compose_command", side_effect=lambda config, *args: ["compose", *args]))
            run = mocks.enter_context(patch.object(manager, "run"))
            manager.setup(config)
            self.assertEqual([call.args[0] for call in run.call_args_list], [
                ["compose", "pull", "--policy", "missing"],
                [manager.sys.executable, str(manager.REPO_ROOT / "scripts" / "sync_mcq_templates.py")],
                ["compose", "up", "-d", "--pull", "missing"],
            ])

    def test_running_docker_is_not_launched_again(self):
        with patch.object(manager, "docker_daemon_probe", return_value=result()), patch.object(manager, "start_macos_docker_desktop") as launch:
            manager.require_docker_daemon(auto_start=True)
            launch.assert_not_called()

    def test_mac_start_launches_but_check_does_not(self):
        with patch.object(manager, "docker_daemon_probe", return_value=result(1)), patch.object(manager.platform, "system", return_value="Darwin"), patch.object(manager, "macos_docker_desktop_installed", return_value=True), patch.object(manager, "start_macos_docker_desktop") as launch:
            with self.assertRaises(manager.ManagerError):
                manager.require_docker_daemon()
            launch.assert_not_called()
            manager.require_docker_daemon(auto_start=True)
            launch.assert_called_once()

    def test_other_platforms_do_not_launch_desktop(self):
        for system in ("Linux", "Windows"):
            with self.subTest(system=system), patch.object(manager, "docker_daemon_probe", return_value=result(1)), patch.object(manager.platform, "system", return_value=system), patch.object(manager, "start_macos_docker_desktop") as launch:
                with self.assertRaises(manager.ManagerError):
                    manager.require_docker_daemon(auto_start=True)
                launch.assert_not_called()

    def test_missing_desktop(self):
        with patch.object(manager, "docker_daemon_probe", return_value=result(1)), patch.object(manager.platform, "system", return_value="Darwin"), patch.object(manager, "macos_docker_desktop_installed", return_value=False), patch.object(manager, "start_macos_docker_desktop") as launch:
            with self.assertRaisesRegex(manager.ManagerError, "本体が見つかりません"):
                manager.require_docker_daemon(auto_start=True)
            launch.assert_not_called()

    def test_waits_until_ready(self):
        with patch.object(manager.subprocess, "run", return_value=result()) as run, patch.object(manager, "docker_daemon_probe", side_effect=[result(1), result()]) as probe, patch.object(manager.time, "sleep"):
            manager.start_macos_docker_desktop()
            self.assertEqual(run.call_args.args[0], ["open", "-g", "-a", "Docker"])
            self.assertEqual(probe.call_count, 2)

    def test_launch_failure(self):
        with patch.object(manager.subprocess, "run", return_value=result(1)):
            with self.assertRaisesRegex(manager.ManagerError, "自動起動できません"):
                manager.start_macos_docker_desktop()

    def test_startup_deadline(self):
        with patch.object(manager.subprocess, "run", return_value=result()), patch.object(manager.time, "monotonic", side_effect=[0, 0, 121, 121]), patch.object(manager.time, "sleep"), patch.object(manager, "docker_daemon_probe", return_value=result(1)):
            with self.assertRaisesRegex(manager.ManagerError, "120秒"):
                manager.start_macos_docker_desktop()

    def test_hung_probe_returns_failure(self):
        with patch.object(manager.subprocess, "run", side_effect=subprocess.TimeoutExpired("docker", 10)):
            self.assertNotEqual(manager.docker_daemon_probe().returncode, 0)


if __name__ == "__main__":
    unittest.main()
