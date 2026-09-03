#!/usr/bin/env python3
"""Cross-platform setup and service manager for app/mcq-webapp."""

from __future__ import annotations

import argparse
import json
import locale as locale_module
import os
import platform
import shutil
import stat
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = REPO_ROOT / "app" / "mcq-webapp"
SERVER = WEB_ROOT / "server.py"
LOCAL_CONFIG = WEB_ROOT / ".local-config.json"
LOCAL_DIR = WEB_ROOT / ".local"
SERVICE_DIR = LOCAL_DIR / "service"
PID_FILE = SERVICE_DIR / "mcq-webapp.pid"
LOG_FILE = SERVICE_DIR / "mcq-webapp.log"
COMPOSE_FILE = REPO_ROOT / "deploy" / "stack-api" / "compose.yaml"
COMPOSE_PROJECT = "stack-mcq-webapp"
DEFAULT_WEB_HOST = "127.0.0.1"
DEFAULT_WEB_PORT = 4173
DEFAULT_STACK_API_PORT = 3080
STACK_API_WAIT_SECONDS = 90
WEB_WAIT_SECONDS = 15


class ManagerError(RuntimeError):
    """A user-actionable setup or service error."""


def print_step(message: str) -> None:
    print(f"\n==> {message}", flush=True)


def load_config() -> dict[str, str]:
    try:
        payload = json.loads(LOCAL_CONFIG.read_text(encoding="utf-8"))
        return {str(key): str(value) for key, value in payload.items()} if isinstance(payload, dict) else {}
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return {}


def save_config(config: dict[str, str]) -> None:
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    LOCAL_CONFIG.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def environment_value(name: str) -> str:
    return os.environ.get(name, "").strip()


def positive_port(value: str, label: str) -> int:
    try:
        port = int(value)
    except ValueError as exc:
        raise ManagerError(f"{label}は整数で指定してください: {value}") from exc
    if not 1 <= port <= 65535:
        raise ManagerError(f"{label}は1〜65535で指定してください: {port}")
    return port


def system_locale() -> str:
    candidates: list[str] = []
    if platform.system() == "Darwin" and shutil.which("defaults"):
        completed = subprocess.run(
            ["defaults", "read", "-g", "AppleLocale"],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
        if completed.returncode == 0:
            candidates.append(completed.stdout.strip())
    language, _encoding = locale_module.getlocale()
    if language:
        candidates.append(language)
    candidates.extend(environment_value(name) for name in ("LC_ALL", "LC_MESSAGES", "LANG"))
    value = next((item.lower() for item in candidates if item and item.lower() not in {"c", "c.utf-8", "posix"}), "")
    return "ja" if value.startswith("ja") else "en"


def runtime_config(update: bool = False) -> dict[str, Any]:
    config = load_config()
    host = environment_value("MCQ_WEBAPP_HOST") or config.get("server_host") or DEFAULT_WEB_HOST
    web_port = positive_port(
        environment_value("MCQ_WEBAPP_PORT") or config.get("server_port") or str(DEFAULT_WEB_PORT),
        "MCQ WebAppポート",
    )
    stack_api_port = positive_port(
        environment_value("STACK_API_PORT") or config.get("stack_api_port") or str(DEFAULT_STACK_API_PORT),
        "STACK APIポート",
    )
    locale_mode = environment_value("MCQ_WEBAPP_LOCALE") or config.get("ui_locale_mode") or "auto"
    if locale_mode not in {"auto", "ja", "en"}:
        raise ManagerError("MCQ_WEBAPP_LOCALEはauto、ja、enのいずれかで指定してください")
    locale = system_locale() if locale_mode == "auto" else locale_mode
    stack_api_url = f"http://127.0.0.1:{stack_api_port}"
    if update:
        config.update(
            {
                "server_host": host,
                "server_port": str(web_port),
                "stack_api_port": str(stack_api_port),
                "stack_api_url": stack_api_url,
                "ui_locale_mode": locale_mode,
            }
        )
        save_config(config)
    return {
        "host": host,
        "web_port": web_port,
        "stack_api_port": stack_api_port,
        "stack_api_url": stack_api_url,
        "locale_mode": locale_mode,
        "locale": locale,
    }


def python_command(*arguments: str) -> list[str]:
    return [sys.executable, str(SERVER), *arguments]


def run(command: list[str], *, check: bool = True, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(command, cwd=REPO_ROOT, env=env, text=True, check=False)
    if check and completed.returncode:
        raise ManagerError(f"コマンドが失敗しました（終了コード {completed.returncode}）: {subprocess.list2cmdline(command)}")
    return completed


def executable_permissions(path: Path) -> bool:
    if os.name == "nt" or not path.is_file():
        return False
    mode = path.stat().st_mode
    if mode & stat.S_IXUSR:
        return False
    path.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    print(f"実行権限を修復しました: {path.relative_to(REPO_ROOT)}")
    return True


def has_macos_quarantine(path: Path) -> bool:
    if platform.system() != "Darwin" or not path.is_file() or not shutil.which("xattr"):
        return False
    try:
        completed = subprocess.run(
            ["xattr", "-p", "com.apple.quarantine", str(path)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=3,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return completed.returncode == 0


def disable_synced_maxima_dump() -> None:
    """Disable host-specific executable caches that macOS quarantined after sync."""
    config = load_config()
    dumped_value = config.get("dumped_maxima", "")
    if not dumped_value:
        return
    dumped = Path(dumped_value).expanduser()
    if not has_macos_quarantine(dumped):
        return
    config.pop("dumped_maxima", None)
    config["stack_runtime_mode"] = "load"
    save_config(config)
    print(
        "同期されたmaxima-stackにはmacOSの隔離属性があるため無効化しました。"
        f"通常のMaximaまたはDockerへ切り替えます: {dumped}"
    )


def repair_permissions() -> None:
    SERVICE_DIR.mkdir(parents=True, exist_ok=True)
    probe = SERVICE_DIR / f".write-check-{os.getpid()}"
    try:
        probe.write_text("ok\n", encoding="utf-8")
    finally:
        probe.unlink(missing_ok=True)
    executable_permissions(REPO_ROOT / "10txt2mac.sh")
    executable_permissions(REPO_ROOT / "scripts" / "macos" / "start-mcq-webapp.command")
    executable_permissions(Path(__file__).resolve())
    disable_synced_maxima_dump()
    dumped = load_config().get("dumped_maxima")
    if dumped:
        executable_permissions(Path(dumped).expanduser())


def dependency_help() -> str:
    system = platform.system()
    if system == "Darwin":
        return "Docker Desktop（Docker Composeを含む）をインストールして起動してください。Maximaの個別導入は任意です。"
    if system == "Windows":
        return "Docker Desktop（Linux containers、Docker Composeを含む）をインストールして起動してください。"
    return (
        "Docker Engine + Docker Compose plugin、Python 3.10以降、GNU Make、Gitを"
        "インストールしてください。Maximaの個別導入は任意です。"
    )


def require_basic_dependencies() -> None:
    if sys.version_info < (3, 10):
        raise ManagerError("Python 3.10以降が必要です")
    missing = [name for name in ("git", "docker") if not shutil.which(name)]
    if missing:
        raise ManagerError(f"必要なコマンドが見つかりません: {', '.join(missing)}\n{dependency_help()}")


def compose_prefix() -> list[str]:
    candidates = [["docker", "compose"], ["docker-compose"]]
    for candidate in candidates:
        if not shutil.which(candidate[0]):
            continue
        completed = subprocess.run(
            [*candidate, "version"],
            cwd=REPO_ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        if completed.returncode == 0:
            return candidate
    raise ManagerError(f"Docker Composeが見つかりません。\n{dependency_help()}")


def require_docker_daemon() -> None:
    completed = subprocess.run(
        ["docker", "info"],
        cwd=REPO_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if completed.returncode:
        diagnostics = completed.stderr.strip().lower()
        if platform.system() == "Linux" and ("permission denied" in diagnostics or "connect: permission" in diagnostics):
            raise ManagerError(
                "Docker socketへのアクセス権限がありません。Docker公式のpost-install手順に従って"
                "実行ユーザーをdockerグループへ追加し、ログインし直してください。"
            )
        raise ManagerError(f"Docker daemonへ接続できません。Docker DesktopまたはDocker Engineを起動してください。\n{dependency_help()}")


def compose_command(config: dict[str, Any], *arguments: str) -> list[str]:
    return [
        *compose_prefix(),
        "-p",
        COMPOSE_PROJECT,
        "-f",
        str(COMPOSE_FILE),
        *arguments,
    ]


def compose_environment(config: dict[str, Any]) -> dict[str, str]:
    environment = os.environ.copy()
    environment["STACK_API_PORT"] = str(config["stack_api_port"])
    environment["MCQ_REPO_ROOT"] = str(REPO_ROOT)
    return environment


def stack_api_request(url: str, timeout: float = 5) -> dict[str, Any]:
    payload = {
        "questionDefinition": '<quiz><question type="stack"></question></quiz>',
        "renderInputs": "",
        "fullRender": [],
        "readOnly": True,
    }
    request = Request(
        f"{url}/render",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=timeout) as response:
        result = json.loads(response.read(2 * 1024 * 1024).decode("utf-8"))
    if not isinstance(result, dict):
        raise ManagerError("STACK APIの応答がJSONオブジェクトではありません")
    return result


def wait_for_stack_api(config: dict[str, Any]) -> None:
    deadline = time.monotonic() + STACK_API_WAIT_SECONDS
    last_error = ""
    while time.monotonic() < deadline:
        try:
            stack_api_request(config["stack_api_url"])
            return
        except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError, ManagerError) as exc:
            last_error = str(exc)
            time.sleep(1)
    raise ManagerError(f"STACK APIが{STACK_API_WAIT_SECONDS}秒以内に起動しませんでした: {last_error}")


def local_web_url(config: dict[str, Any]) -> str:
    return f"http://127.0.0.1:{config['web_port']}"


def web_status(config: dict[str, Any], timeout: float = 1) -> dict[str, Any] | None:
    try:
        with urlopen(f"{local_web_url(config)}/api/server/status", timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return payload if payload.get("service") == "stack-mcq-webapp" else None
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError):
        return None


def server_arguments(config: dict[str, Any]) -> list[str]:
    return [
        "--host",
        str(config["host"]),
        "--port",
        str(config["web_port"]),
        "--locale",
        str(config["locale"]),
        "--stack-api-url",
        str(config["stack_api_url"]),
    ]


def start_web(config: dict[str, Any]) -> None:
    if status := web_status(config):
        matches_config = (
            status.get("locale") == config["locale"]
            and status.get("stackApiUrl") == config["stack_api_url"]
        )
        if matches_config:
            print(f"MCQ WebApp: 起動済み (PID {status.get('pid', '?')})")
            return
        print("MCQ WebAppの起動設定が変わったため再起動します")
        stop_web(config)
    SERVICE_DIR.mkdir(parents=True, exist_ok=True)
    command = python_command(*server_arguments(config))
    creationflags = 0
    popen_options: dict[str, Any] = {}
    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
    else:
        popen_options["start_new_session"] = True
    with LOG_FILE.open("ab") as log:
        process = subprocess.Popen(
            command,
            cwd=REPO_ROOT,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            close_fds=True,
            creationflags=creationflags,
            **popen_options,
        )
    PID_FILE.write_text(f"{process.pid}\n", encoding="ascii")
    deadline = time.monotonic() + WEB_WAIT_SECONDS
    while time.monotonic() < deadline:
        if web_status(config):
            return
        if process.poll() is not None:
            break
        time.sleep(0.25)
    tail = ""
    try:
        tail = LOG_FILE.read_text(encoding="utf-8", errors="replace")[-4000:]
    except OSError:
        pass
    raise ManagerError(f"MCQ WebAppが起動しませんでした。ログ: {LOG_FILE}\n{tail}")


def stop_web(config: dict[str, Any]) -> None:
    status = web_status(config)
    if not status:
        PID_FILE.unlink(missing_ok=True)
        print("MCQ WebApp: 停止済み")
        return
    request = Request(f"{local_web_url(config)}/api/server/shutdown", data=b"", method="POST")
    try:
        with urlopen(request, timeout=3) as response:
            response.read()
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise ManagerError(f"MCQ WebAppを安全に停止できませんでした: {exc}") from exc
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if not web_status(config):
            PID_FILE.unlink(missing_ok=True)
            return
        time.sleep(0.2)
    raise ManagerError("MCQ WebAppの停止が10秒でタイムアウトしました")


def check_maxima_evaluation() -> None:
    print_step("Maxima／STACKコードを確認")
    checked = run(python_command("--check"), check=False)
    if checked.returncode == 0:
        return
    raise ManagerError(
        "Maxima評価を設定できませんでした。Docker側のmaximaサービスとログを確認してください。\n"
        f"{dependency_help()}"
    )


def start_services(config: dict[str, Any]) -> None:
    require_basic_dependencies()
    require_docker_daemon()
    print_step("STACK APIを起動")
    run(
        compose_command(config, "up", "-d"),
        env=compose_environment(config),
    )
    wait_for_stack_api(config)
    print(f"STACK API: OK ({config['stack_api_url']})")
    print_step("MCQ WebAppを起動")
    start_web(config)
    print(f"MCQ WebApp: OK ({local_web_url(config)}/)")
    if config["host"] not in {"127.0.0.1", "localhost", "::1"}:
        print(f"ネットワーク公開: http://<このサーバーのIP>:{config['web_port']}/")


def stop_services(config: dict[str, Any]) -> None:
    print_step("MCQ WebAppを停止")
    stop_web(config)
    if shutil.which("docker"):
        try:
            prefix = compose_prefix()
        except ManagerError:
            prefix = []
        if prefix:
            print_step("STACK APIを停止")
            run(
                [*prefix, "-p", COMPOSE_PROJECT, "-f", str(COMPOSE_FILE), "stop"],
                env=compose_environment(config),
            )


def setup(config: dict[str, Any]) -> None:
    print(f"OS: {platform.system()} {platform.machine()}")
    print(f"UI locale: {config['locale']} ({config['locale_mode']})")
    print(f"MCQ WebApp bind: {config['host']}:{config['web_port']}")
    repair_permissions()
    require_basic_dependencies()
    require_docker_daemon()
    compose_prefix()
    print_step("公式STACK APIイメージを取得")
    run(compose_command(config, "pull"), env=compose_environment(config))
    stop_web(config)
    start_services(config)
    check_maxima_evaluation()
    print("\nセットアップが完了しました。以後は make start / stop / restart / check を使用できます。")


def check(config: dict[str, Any]) -> None:
    failures: list[str] = []
    print(f"OS: {platform.system()} {platform.machine()}")
    print(f"Python: {platform.python_version()} ({sys.executable})")
    print(f"UI locale: {config['locale']} ({config['locale_mode']})")
    try:
        repair_permissions()
        print("権限・ローカル書込: OK")
    except OSError as exc:
        failures.append(f"権限・ローカル書込: {exc}")
    if run(python_command("--check"), check=False).returncode:
        failures.append("ローカルMaxima／STACKコードの評価に失敗")
    try:
        require_basic_dependencies()
        require_docker_daemon()
        run(compose_command(config, "ps"), env=compose_environment(config))
        stack_api_request(config["stack_api_url"])
        print(f"STACK API: OK ({config['stack_api_url']})")
    except (ManagerError, HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        failures.append(f"STACK API: {exc}")
    status = web_status(config)
    if status:
        print(f"MCQ WebApp: OK ({local_web_url(config)}/, PID {status.get('pid', '?')})")
        if status.get("locale") != config["locale"]:
            failures.append("MCQ WebAppの起動ロケールが現在の設定と一致しません。make restartを実行してください")
        if status.get("stackApiUrl") != config["stack_api_url"]:
            failures.append("MCQ WebAppのSTACK API URLが現在の設定と一致しません。make restartを実行してください")
    else:
        failures.append("MCQ WebAppが起動していません")
    if failures:
        raise ManagerError("\n".join(f"- {failure}" for failure in failures))
    print("総合チェック: OK")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="MCQ WebAppとローカルSTACK APIを管理します")
    parser.add_argument("command", choices=("setup", "check", "start", "stop", "restart", "status", "launch"))
    parser.add_argument("--host", help="MCQ WebAppのbind address（setup時に保存）")
    parser.add_argument("--port", help="MCQ WebAppのポート（setup時に保存）")
    parser.add_argument("--stack-api-port", help="ローカルSTACK APIのポート（setup時に保存）")
    parser.add_argument("--locale", choices=("auto", "ja", "en"), help="UIロケール（setup時に保存）")
    return parser.parse_args()


def main() -> int:
    if sys.version_info < (3, 10):
        print("Python 3.10以降が必要です", file=sys.stderr)
        return 1
    args = parse_arguments()
    try:
        overrides = {
            "MCQ_WEBAPP_HOST": args.host,
            "MCQ_WEBAPP_PORT": args.port,
            "STACK_API_PORT": args.stack_api_port,
            "MCQ_WEBAPP_LOCALE": args.locale,
        }
        for name, value in overrides.items():
            if value is not None:
                os.environ[name] = value
        config = runtime_config(update=args.command == "setup")
        if args.command == "setup":
            setup(config)
        elif args.command == "check":
            check(config)
        elif args.command == "start":
            repair_permissions()
            start_services(config)
        elif args.command == "stop":
            stop_services(config)
        elif args.command == "restart":
            stop_services(config)
            start_services(config)
        elif args.command == "launch":
            first_setup = not all(
                load_config().get(key)
                for key in ("server_host", "server_port", "stack_api_port", "ui_locale_mode")
            )
            if first_setup:
                config = runtime_config(update=True)
                setup(config)
            else:
                repair_permissions()
                start_services(config)
            if platform.system() in {"Darwin", "Windows"}:
                webbrowser.open(f"{local_web_url(config)}/")
        else:
            print(json.dumps({"config": config, "web": web_status(config)}, ensure_ascii=False, indent=2))
        return 0
    except (ManagerError, OSError) as exc:
        print(f"エラー: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
