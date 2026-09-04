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
from urllib.parse import urlparse, urlunparse
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
DEFAULT_INCLUDE_BASE_URL = "https://yositomi-opu.github.io/stack_questions/"
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


def normalize_include_base_url(value: str) -> str:
    candidate = value.strip()
    if not candidate:
        raise ManagerError("INCLUDE_BASE_URLを入力してください")
    if any(character in candidate for character in ('"', "\r", "\n")):
        raise ManagerError("INCLUDE_BASE_URLに引用符や改行は使用できません")
    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ManagerError("INCLUDE_BASE_URLはhttp://またはhttps://で始まるURLを指定してください")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ManagerError("INCLUDE_BASE_URLに認証情報、クエリ、フラグメントは指定できません")
    path = parsed.path.rstrip("/") + "/"
    return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))


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
    include_base_url = normalize_include_base_url(
        environment_value("INCLUDE_BASE_URL")
        or config.get("include_base_url")
        or DEFAULT_INCLUDE_BASE_URL
    )
    if update:
        config.update(
            {
                "server_host": host,
                "server_port": str(web_port),
                "stack_api_port": str(stack_api_port),
                "stack_api_url": stack_api_url,
                "ui_locale_mode": locale_mode,
                "include_base_url": include_base_url,
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
        "include_base_url": include_base_url,
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
        return (
            "macOSではDocker CLIだけでなくDocker Desktopが必要です。\n"
            "未導入の場合: brew install --cask docker-desktop\n"
            "導入後の起動: open -a Docker\n"
            "Docker Desktopの起動完了後に docker info を確認してください。Maximaの個別導入は任意です。"
        )
    if system == "Windows":
        return "Docker Desktop（Linux containers、Docker Composeを含む）をインストールして起動してください。"
    return (
        "Docker Engine + Docker Compose plugin、Python 3.10以降、GNU Make、Gitを"
        "インストールしてください。Maximaの個別導入は任意です。"
    )


def command_version(command: str, *arguments: str) -> str | None:
    executable = shutil.which(command)
    if not executable:
        return None
    try:
        completed = subprocess.run(
            [executable, *arguments],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    output = (completed.stdout or completed.stderr).strip().splitlines()
    return f"{output[0] if output else executable} ({executable})" if completed.returncode == 0 else None


def macos_docker_desktop_installed() -> bool:
    applications = (Path("/Applications/Docker.app"), Path.home() / "Applications" / "Docker.app")
    return any(application.is_dir() for application in applications)


def windows_docker_desktop_installed() -> bool:
    roots = [os.environ.get(name, "") for name in ("ProgramFiles", "ProgramFiles(x86)")]
    return any(
        (Path(root) / "Docker" / "Docker" / "Docker Desktop.exe").is_file()
        for root in roots
        if root
    )


def dependency_diagnostics() -> list[str]:
    """Print every dependency result and return missing required dependency keys."""
    missing: list[str] = []
    python_ok = sys.version_info >= (3, 10)
    print(
        f"Python: {'OK' if python_ok else '要更新'} "
        f"({platform.python_version()}, {sys.executable})"
    )
    if not python_ok:
        missing.append("python")

    checks = (
        ("git", "Git", ("--version",), True),
        ("make", "Make", ("--version",), platform.system() != "Windows"),
        ("docker", "Docker CLI", ("--version",), True),
    )
    for command, label, arguments, required in checks:
        version = command_version(command, *arguments)
        qualifier = "" if required else "（Windowsでは任意）"
        print(f"{label}: {f'OK ({version})' if version else f'未検出{qualifier}'}")
        if required and not version:
            missing.append(command)

    brew_version = command_version("brew", "--version") if platform.system() == "Darwin" else None
    if platform.system() == "Darwin":
        print(f"Homebrew: {f'OK ({brew_version})' if brew_version else '未検出（任意のインストール手段）'}")

    compose_version = None
    try:
        prefix = compose_prefix()
        compose_version = command_version(prefix[0], *prefix[1:], "version")
    except ManagerError:
        pass
    print(f"Docker Compose: {f'OK ({compose_version})' if compose_version else '未検出'}")
    if not compose_version:
        missing.append("docker-compose")

    system = platform.system()
    if system == "Darwin":
        desktop_ok = macos_docker_desktop_installed()
        print(f"Docker Desktop: {'OK' if desktop_ok else '未検出'}")
        if not desktop_ok:
            missing.append("docker-desktop")
    elif system == "Windows":
        desktop_ok = windows_docker_desktop_installed()
        print(f"Docker Desktop: {'OK' if desktop_ok else '未検出'}")
        if not desktop_ok:
            missing.append("docker-desktop")

    maxima = shutil.which("maxima")
    print(f"Host Maxima: {f'OK ({maxima})' if maxima else '未検出（Docker版を使用するため任意）'}")
    return list(dict.fromkeys(missing))


def install_plan(missing: list[str]) -> tuple[list[list[str]], list[str]]:
    """Return conservative OS-native install commands and manual follow-up notes."""
    commands: list[list[str]] = []
    notes: list[str] = []
    system = platform.system()
    missing_set = set(missing)
    docker_missing = bool(missing_set & {"docker", "docker-compose", "docker-desktop"})

    if system == "Darwin":
        if not shutil.which("brew"):
            notes.append("Homebrewを https://brew.sh/ の公式手順で導入してから再実行してください。")
            return commands, notes
        if "python" in missing_set:
            commands.append(["brew", "install", "python"])
        if "git" in missing_set:
            commands.append(["brew", "install", "git"])
        if "make" in missing_set:
            notes.append("makeはXcode Command Line Tools（xcode-select --install）から導入してください。")
        if docker_missing:
            commands.append(["brew", "install", "--cask", "docker-desktop"])
            notes.append("インストール後にDocker Desktopを起動し、docker infoが成功するまで待ってください。")
    elif system == "Windows":
        if not shutil.which("winget"):
            notes.append("wingetがありません。Python、Git、Docker Desktopを各公式サイトから導入してください。")
            return commands, notes
        common = ["--accept-package-agreements", "--accept-source-agreements"]
        if "python" in missing_set:
            commands.append(["winget", "install", "--exact", "--id", "Python.Python.3.12", *common])
        if "git" in missing_set:
            commands.append(["winget", "install", "--exact", "--id", "Git.Git", *common])
        if docker_missing:
            commands.append(["winget", "install", "--exact", "--id", "Docker.DockerDesktop", *common])
            notes.append("インストール後にDocker DesktopをLinux containersモードで起動してください。")
        if "make" in missing_set:
            notes.append("WindowsではMakeは任意です。scripts\\windows\\mcq-webapp.batを使用できます。")
    else:
        packages: list[str] = []
        if "python" in missing_set:
            packages.append("python3")
        if "git" in missing_set:
            packages.append("git")
        if "make" in missing_set:
            packages.append("make")
        sudo = [] if hasattr(os, "geteuid") and os.geteuid() == 0 else ["sudo"]
        if packages and shutil.which("apt-get"):
            commands.extend([[*sudo, "apt-get", "update"], [*sudo, "apt-get", "install", "-y", *packages]])
        elif packages and shutil.which("dnf"):
            commands.append([*sudo, "dnf", "install", "-y", *packages])
        elif packages and shutil.which("pacman"):
            commands.append([*sudo, "pacman", "-S", "--needed", *packages])
        elif packages:
            notes.append(f"OSのパッケージ管理ツールで次を導入してください: {', '.join(packages)}")
        if docker_missing:
            notes.append(
                "Docker EngineとDocker Compose pluginは、ディストリビューションに対応する"
                "Docker公式手順で導入してください: https://docs.docker.com/engine/install/"
            )
    return commands, notes


def install_missing_dependencies(missing: list[str] | None = None) -> None:
    if missing is None:
        print_step("必須コマンドを診断")
        missing = dependency_diagnostics()
    if not missing:
        print("不足している必須コマンドはありません。")
        return
    print(f"\n不足: {', '.join(missing)}")
    commands, notes = install_plan(missing)
    for note in notes:
        print(f"- {note}")
    if not commands:
        raise ManagerError("この環境で安全に自動実行できるインストール手順がありません。上記の案内に従ってください")
    print("\n実行予定:")
    for command in commands:
        print(f"  {subprocess.list2cmdline(command)}")
    if not sys.stdin.isatty():
        raise ManagerError("インストールには対話確認が必要です。端末で make install-deps を実行してください")
    answer = input("上記のシステム変更を実行しますか？ [y/N] ").strip().lower()
    if answer not in {"y", "yes"}:
        print("インストールを中止しました。")
        return
    for command in commands:
        run(command)
    print("\nインストール処理が完了しました。端末を開き直し、make checkを再実行してください。")


def require_basic_dependencies() -> None:
    if sys.version_info < (3, 10):
        raise ManagerError("Python 3.10以降が必要です。make install-depsで導入方法を確認してください")
    missing = [name for name in ("git", "docker") if not shutil.which(name)]
    if missing:
        raise ManagerError(
            f"必要なコマンドが見つかりません: {', '.join(missing)}\n"
            f"{dependency_help()}\n端末で make install-deps を実行すると、確認後に導入できます。"
        )


def compose_prefix() -> list[str]:
    candidates = [["docker", "compose"], ["docker-compose"]]
    if platform.system() == "Darwin":
        candidates.extend(
            [
                [str(Path("/Applications/Docker.app/Contents/Resources/cli-plugins/docker-compose"))],
                [str(Path.home() / "Applications/Docker.app/Contents/Resources/cli-plugins/docker-compose")],
            ]
        )
    elif platform.system() == "Windows":
        for root in (os.environ.get("ProgramFiles", ""), os.environ.get("ProgramFiles(x86)", "")):
            if not root:
                continue
            docker_root = Path(root) / "Docker" / "Docker" / "resources"
            candidates.extend(
                [
                    [str(docker_root / "cli-plugins" / "docker-compose.exe")],
                    [str(docker_root / "bin" / "docker-compose.exe")],
                ]
            )
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
        if platform.system() == "Darwin":
            applications = (Path("/Applications/Docker.app"), Path.home() / "Applications" / "Docker.app")
            if not any(application.is_dir() for application in applications):
                raise ManagerError(
                    "Dockerコマンドは見つかりましたが、Docker Desktop本体が見つかりません。\n"
                    f"{dependency_help()}"
                )
            raise ManagerError(
                "Docker Desktopはインストールされていますが、Docker daemonへ接続できません。\n"
                "open -a Docker で起動し、起動完了を待ってから再実行してください。"
            )
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
        "--include-base-url",
        str(config["include_base_url"]),
    ]


def start_web(config: dict[str, Any]) -> None:
    if status := web_status(config):
        matches_config = (
            status.get("locale") == config["locale"]
            and status.get("stackApiUrl") == config["stack_api_url"]
            and status.get("includeBaseUrl") == config["include_base_url"]
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
    print(f"include URL base: {config['include_base_url']}")
    repair_permissions()
    print_step("必須コマンド")
    missing = dependency_diagnostics()
    if missing:
        install_missing_dependencies(missing)
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
    print(f"UI locale: {config['locale']} ({config['locale_mode']})")
    print(f"include URL base: {config['include_base_url']}")
    print_step("必須コマンド")
    missing = dependency_diagnostics()
    if missing:
        failures.append(
            f"必須コマンドが不足しています: {', '.join(missing)}。"
            "make install-depsでOS別の導入手順を確認できます"
        )
    sys.stdout.flush()
    try:
        repair_permissions()
        print("権限・ローカル書込: OK")
    except OSError as exc:
        failures.append(f"権限・ローカル書込: {exc}")
    if run(python_command("--check"), check=False).returncode:
        failures.append("ローカルMaxima／STACKコードの評価に失敗")
    if not set(missing) & {"docker", "docker-compose", "docker-desktop"}:
        try:
            require_docker_daemon()
            run(compose_command(config, "ps"), env=compose_environment(config))
            stack_api_request(config["stack_api_url"])
            print(f"STACK API: OK ({config['stack_api_url']})")
        except (ManagerError, HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            failures.append(f"STACK API: {exc}")
    else:
        failures.append("STACK API: Dockerの必須コンポーネントが不足しているため確認を省略しました")
    status = web_status(config)
    if status:
        print(f"MCQ WebApp: OK ({local_web_url(config)}/, PID {status.get('pid', '?')})")
        if status.get("locale") != config["locale"]:
            failures.append("MCQ WebAppの起動ロケールが現在の設定と一致しません。make restartを実行してください")
        if status.get("stackApiUrl") != config["stack_api_url"]:
            failures.append("MCQ WebAppのSTACK API URLが現在の設定と一致しません。make restartを実行してください")
        if status.get("includeBaseUrl") != config["include_base_url"]:
            failures.append("MCQ WebAppのinclude URLベースが現在の設定と一致しません。make restartを実行してください")
    else:
        failures.append("MCQ WebAppが起動していません")
    if failures:
        raise ManagerError("\n".join(f"- {failure}" for failure in failures))
    print("総合チェック: OK")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="MCQ WebAppとローカルSTACK APIを管理します")
    parser.add_argument(
        "command",
        choices=("setup", "check", "install-deps", "start", "stop", "restart", "status", "launch"),
    )
    parser.add_argument("--host", help="MCQ WebAppのbind address（setup時に保存）")
    parser.add_argument("--port", help="MCQ WebAppのポート（setup時に保存）")
    parser.add_argument("--stack-api-port", help="ローカルSTACK APIのポート（setup時に保存）")
    parser.add_argument("--locale", choices=("auto", "ja", "en"), help="UIロケール（setup時に保存）")
    parser.add_argument("--include-base-url", help="stack_include用の公開URLベース（setup時に保存）")
    return parser.parse_args()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
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
            "INCLUDE_BASE_URL": args.include_base_url,
        }
        for name, value in overrides.items():
            if value is not None:
                os.environ[name] = value
        config = runtime_config(update=args.command == "setup")
        if args.command == "setup":
            setup(config)
        elif args.command == "check":
            check(config)
        elif args.command == "install-deps":
            install_missing_dependencies()
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
