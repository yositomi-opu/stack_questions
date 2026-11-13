#!/usr/bin/env python3
"""Cross-platform setup and service manager for app/mcq-webapp."""

from __future__ import annotations

import argparse
import importlib.util
import json
import locale as locale_module
import os
import platform
import shlex
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
_console_spec = importlib.util.spec_from_file_location('authoring_console', REPO_ROOT / 'scripts/console_locale.py')
_console = importlib.util.module_from_spec(_console_spec)
_console_spec.loader.exec_module(_console)
console_text = _console.console_text
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
        raise ManagerError(console_text(f"{label}は整数で指定してください: {value}", f'{label} must be an integer: {value}')) from exc
    if not 1 <= port <= 65535:
        raise ManagerError(console_text(f"{label}は1〜65535で指定してください: {port}", f'{label} must be between 1 and 65535: {port}'))
    return port


def normalize_include_base_url(value: str) -> str:
    candidate = value.strip()
    if not candidate:
        raise ManagerError(console_text("INCLUDE_BASE_URLを入力してください", 'Enter INCLUDE_BASE_URL'))
    if any(character in candidate for character in ('"', "\r", "\n")):
        raise ManagerError(console_text("INCLUDE_BASE_URLに引用符や改行は使用できません", 'INCLUDE_BASE_URL cannot contain quotes or newlines'))
    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ManagerError(console_text("INCLUDE_BASE_URLはhttp://またはhttps://で始まるURLを指定してください", 'INCLUDE_BASE_URL must start with http:// or https://'))
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ManagerError(console_text("INCLUDE_BASE_URLに認証情報、クエリ、フラグメントは指定できません", 'INCLUDE_BASE_URL cannot contain credentials, a query or a fragment'))
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
        console_text("MCQ WebAppポート", 'MCQ WebApp port'),
    )
    stack_api_port = positive_port(
        environment_value("STACK_API_PORT") or config.get("stack_api_port") or str(DEFAULT_STACK_API_PORT),
        console_text("STACK APIポート", 'STACK API port'),
    )
    locale_mode = environment_value("MCQ_WEBAPP_LOCALE") or config.get("ui_locale_mode") or "auto"
    if locale_mode not in {"auto", "ja", "en"}:
        raise ManagerError(console_text("MCQ_WEBAPP_LOCALEはauto、ja、enのいずれかで指定してください", 'MCQ_WEBAPP_LOCALE must be auto, ja or en'))
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
        raise ManagerError(console_text(f"コマンドが失敗しました（終了コード {completed.returncode}）: {subprocess.list2cmdline(command)}", f'Command failed (exit code {completed.returncode}）: {subprocess.list2cmdline(command)}'))
    return completed


def executable_permissions(path: Path) -> bool:
    if os.name == "nt" or not path.is_file():
        return False
    mode = path.stat().st_mode
    if mode & stat.S_IXUSR:
        return False
    path.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    print(console_text(f"実行権限を修復しました: {path.relative_to(REPO_ROOT)}", f'Repaired executable permissions: {path.relative_to(REPO_ROOT)}'))
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
        console_text("同期されたmaxima-stackにはmacOSの隔離属性があるため無効化しました。"
        f"通常のMaximaまたはDockerへ切り替えます: {dumped}", f'Disabled the synced maxima-stack because of macOS quarantine attributes; using another Maxima or Docker: {dumped}')
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
            console_text("macOSではDocker CLIだけでなくDocker Desktopが必要です。\n"
            "未導入の場合: brew install --cask docker-desktop\n"
            "導入後の起動: open -a Docker\n"
            "Docker Desktopの起動完了後に docker info を確認してください。Maximaの個別導入は任意です。", 'macOS requires Docker Desktop, not only the Docker CLI.\nInstall: brew install --cask docker-desktop\nStart: open -a Docker\nWait for Docker Desktop, then check docker info. Installing Maxima separately is optional.')
        )
    if system == "Windows":
        return console_text("Docker Desktop（Linux containers、Docker Composeを含む）をインストールして起動してください。", 'Install and start Docker Desktop with Linux containers and Docker Compose.')
    return (
        console_text("Docker Engine + Docker Compose plugin、Python 3.10以降、GNU Make、Gitを"
        "インストールしてください。Maximaの個別導入は任意です。", 'Install Docker Engine, the Docker Compose plugin, Python 3.10+, GNU Make and Git. Installing Maxima separately is optional.')
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
        console_text(f"Python: {'OK' if python_ok else '要更新'} "
        f"({platform.python_version()}, {sys.executable})", f"Python: {('OK' if python_ok else 'update required')} ({platform.python_version()}, {sys.executable})")
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
        qualifier = "" if required else console_text("（Windowsでは任意）", ' (optional on Windows)')
        print(console_text(f"{label}: {f'OK ({version})' if version else f'未検出{qualifier}'}", f"{label}: {(f'OK ({version})' if version else f'not found{qualifier}')}"))
        if required and not version:
            missing.append(command)

    brew_version = command_version("brew", "--version") if platform.system() == "Darwin" else None
    if platform.system() == "Darwin":
        print(console_text(f"Homebrew: {f'OK ({brew_version})' if brew_version else '未検出（任意のインストール手段）'}", f"Homebrew: {(f'OK ({brew_version})' if brew_version else 'not found (optional installation method)')}"))

    compose_version = None
    try:
        prefix = compose_prefix()
        compose_version = command_version(prefix[0], *prefix[1:], "version")
    except ManagerError:
        pass
    print(console_text(f"Docker Compose: {f'OK ({compose_version})' if compose_version else '未検出'}", f"Docker Compose: {(f'OK ({compose_version})' if compose_version else 'not found')}"))
    if not compose_version:
        missing.append("docker-compose")

    system = platform.system()
    if system == "Darwin":
        desktop_ok = macos_docker_desktop_installed()
        print(console_text(f"Docker Desktop: {'OK' if desktop_ok else '未検出'}", f"Docker Desktop: {('OK' if desktop_ok else 'not found')}"))
        if not desktop_ok:
            missing.append("docker-desktop")
    elif system == "Windows":
        desktop_ok = windows_docker_desktop_installed()
        print(console_text(f"Docker Desktop: {'OK' if desktop_ok else '未検出'}", f"Docker Desktop: {('OK' if desktop_ok else 'not found')}"))
        if not desktop_ok:
            missing.append("docker-desktop")

    maxima = shutil.which("maxima")
    print(console_text(f"Host Maxima: {f'OK ({maxima})' if maxima else '未検出（Docker版を使用するため任意）'}", f"Host Maxima: {(f'OK ({maxima})' if maxima else 'not found (optional; Docker can provide Maxima)')}"))
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
            notes.append(console_text("Homebrewを https://brew.sh/ の公式手順で導入してから再実行してください。", 'Install Homebrew from https://brew.sh/ and retry.'))
            return commands, notes
        if "python" in missing_set:
            commands.append(["brew", "install", "python"])
        if "git" in missing_set:
            commands.append(["brew", "install", "git"])
        if "make" in missing_set:
            notes.append(console_text("makeはXcode Command Line Tools（xcode-select --install）から導入してください。", 'Install make using Xcode Command Line Tools (xcode-select --install).'))
        if docker_missing:
            commands.append(["brew", "install", "--cask", "docker-desktop"])
            notes.append(console_text("インストール後にDocker Desktopを起動し、docker infoが成功するまで待ってください。", 'After installation, start Docker Desktop and wait until docker info succeeds.'))
    elif system == "Windows":
        if not shutil.which("winget"):
            notes.append(console_text("wingetがありません。Python、Git、Docker Desktopを各公式サイトから導入してください。", 'winget is unavailable. Install Python, Git and Docker Desktop from their official websites.'))
            return commands, notes
        common = ["--accept-package-agreements", "--accept-source-agreements"]
        if "python" in missing_set:
            commands.append(["winget", "install", "--exact", "--id", "Python.Python.3.12", *common])
        if "git" in missing_set:
            commands.append(["winget", "install", "--exact", "--id", "Git.Git", *common])
        if docker_missing:
            commands.append(["winget", "install", "--exact", "--id", "Docker.DockerDesktop", *common])
            notes.append(console_text("インストール後にDocker DesktopをLinux containersモードで起動してください。", 'After installation, start Docker Desktop in Linux containers mode.'))
        if "make" in missing_set:
            notes.append(console_text("WindowsではMakeは任意です。scripts\\windows\\mcq-webapp.batを使用できます。", 'Make is optional on Windows. Use scripts\\windows\\mcq-webapp.bat instead.'))
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
            notes.append(console_text(f"OSのパッケージ管理ツールで次を導入してください: {', '.join(packages)}", f"Install the following with your OS package manager: {', '.join(packages)}"))
        if docker_missing:
            notes.append(
                console_text("Docker EngineとDocker Compose pluginは、ディストリビューションに対応する"
                "Docker公式手順で導入してください: https://docs.docker.com/engine/install/", 'Install Docker Engine and the Docker Compose plugin using the official instructions for your distribution: https://docs.docker.com/engine/install/')
            )
    return commands, notes


def install_missing_dependencies(missing: list[str] | None = None) -> None:
    if missing is None:
        print_step(console_text("必須コマンドを診断", 'Check required commands'))
        missing = dependency_diagnostics()
    if not missing:
        print(console_text("不足している必須コマンドはありません。", 'All required commands are available.'))
        return
    print(console_text(f"\n不足: {', '.join(missing)}", f"\nMissing: {', '.join(missing)}"))
    commands, notes = install_plan(missing)
    for note in notes:
        print(f"- {note}")
    if not commands:
        raise ManagerError(console_text("この環境で安全に自動実行できるインストール手順がありません。上記の案内に従ってください", 'Automatic installation is unavailable for this environment. Follow the instructions above.'))
    print(console_text("\n実行予定:", '\nCommands to run:'))
    for command in commands:
        print(f"  {subprocess.list2cmdline(command)}")
    if not sys.stdin.isatty():
        raise ManagerError(console_text("インストールには対話確認が必要です。端末で make install-deps を実行してください", 'Installation requires interactive confirmation. Run make install-deps in a terminal.'))
    answer = input(console_text("上記のシステム変更を実行しますか？ [y/N] ", 'Apply these system changes? [y/N] ')).strip().lower()
    if answer not in {"y", "yes"}:
        print(console_text("インストールを中止しました。", 'Installation cancelled.'))
        return
    for command in commands:
        run(command)
    print(console_text("\nインストール処理が完了しました。端末を開き直し、make checkを再実行してください。", '\nInstallation finished. Reopen your terminal and run make check.'))


def require_basic_dependencies() -> None:
    if sys.version_info < (3, 10):
        raise ManagerError(console_text("Python 3.10以降が必要です。make install-depsで導入方法を確認してください", 'Python 3.10+ is required. Run make install-deps for installation instructions.'))
    missing = [name for name in ("git", "docker") if not shutil.which(name)]
    if missing:
        raise ManagerError(
            console_text(f"必要なコマンドが見つかりません: {', '.join(missing)}\n"
            f"{dependency_help()}\n端末で make install-deps を実行すると、確認後に導入できます。", f"Required commands not found: {', '.join(missing)}\n{dependency_help()}\nRun make install-deps in a terminal to install them after confirmation.")
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
    raise ManagerError(console_text(f"Docker Composeが見つかりません。\n{dependency_help()}", f'Docker Compose was not found.\n{dependency_help()}'))


def snap_docker_installed() -> bool:
    docker = shutil.which("docker") or ""
    return docker.startswith(("/snap/bin/", "/var/lib/snapd/snap/bin/"))


def offer_linux_docker_group_fix() -> None:
    """Offer the appropriate Docker group fix after explicit confirmation."""
    import grp
    import pwd

    account = pwd.getpwuid(os.getuid())
    username = account.pw_name
    try:
        docker_group = grp.getgrnam("docker")
    except KeyError:
        docker_group = None

    group_active = False
    group_configured = False
    if docker_group:
        active_group_ids = set(os.getgroups()) | {os.getgid()}
        group_active = docker_group.gr_gid in active_group_ids
        group_configured = (
            group_active
            or account.pw_gid == docker_group.gr_gid
            or username in docker_group.gr_mem
        )
    if group_configured and not group_active:
        raise ManagerError(
            console_text(f"ユーザー {username} はdockerグループに登録済みですが、現在のログインセッションには未反映です。\n"
            "いったんログアウトしてログインし直した後、docker info と make setup を実行してください。", f'User {username} is already in the docker group, but the current login session has not picked it up.\nLog out and back in, then run docker info and make setup.')
        )
    if group_active:
        restart_command = "sudo snap restart docker.dockerd" if snap_docker_installed() else "sudo systemctl restart docker"
        raise ManagerError(
            console_text(f"ユーザー {username} のdockerグループは有効ですが、Docker socketへ接続できません。\n"
            f"{restart_command} を実行し、ls -l /var/run/docker.sock で所有グループを確認してください。", f'User {username} has an active docker group but cannot access the Docker socket.\n{restart_command} and check the owning group with ls -l /var/run/docker.sock.')
        )

    docker_is_snap = snap_docker_installed()
    if docker_group:
        commands = [["sudo", "usermod", "-aG", "docker", username]]
    elif docker_is_snap:
        commands = [
            ["sudo", "addgroup", "--system", "docker"],
            ["sudo", "adduser", username, "docker"],
            ["sudo", "snap", "disable", "docker"],
            ["sudo", "snap", "enable", "docker"],
        ]
    else:
        commands = [
            ["sudo", "groupadd", "docker"],
            ["sudo", "usermod", "-aG", "docker", username],
            ["sudo", "systemctl", "restart", "docker"],
        ]
    displayed_commands = "\n".join(f"  {shlex.join(command)}" for command in commands)
    installation_label = console_text("Snap版Docker", 'Snap Docker') if docker_is_snap else "Docker Engine"
    instructions = (
        console_text(f"実行コマンド:\n{displayed_commands}\n"
        "実行後はいったんログアウトしてログインし直し、docker info と make setup を実行してください。", f'Commands:\n{displayed_commands}\nAfterwards, log out and back in, then run docker info and make setup.')
    )
    if not sys.stdin.isatty():
        raise ManagerError(
            console_text("Docker socketへのアクセス権限がありません。対話端末ではないため自動修復しません。\n", 'No permission to access the Docker socket. Automatic repair requires an interactive terminal.\n')
            + instructions
        )

    print(
        console_text("\nDockerグループへの所属は、実質的にroot相当の権限をユーザーへ与えます。\n"
        f"{installation_label}用にユーザー {username} のアクセス権限を設定するため、次を実行します。\n"
        f"{displayed_commands}", f'\nMembership of the docker group grants privileges equivalent to root.\n{installation_label} access for user {username} will be configured by running:\n{displayed_commands}')
    )
    answer = input(console_text("sudoを使用して実行しますか？ [y/N] ", 'Run these commands using sudo? [y/N] ')).strip().lower()
    if answer not in {"y", "yes"}:
        raise ManagerError(console_text("Dockerグループの設定を変更しませんでした。\n", 'Docker group settings were not changed.\n') + instructions)
    if not shutil.which("sudo"):
        raise ManagerError(console_text("sudoが見つかりません。rootユーザーに次の実行を依頼してください。\n", 'sudo was not found. Ask an administrator to run:\n') + instructions)
    for command in commands:
        run(command)
    raise ManagerError(
        console_text(f"ユーザー {username} をdockerグループへ追加しました。現在のセッションにはまだ反映されません。\n"
        "いったんログアウトしてログインし直した後、docker info と make setup を実行してください。", f'User {username} was added to the docker group. The current session is unchanged.\nLog out and back in, then run docker info and make setup.')
    )


def docker_daemon_probe(*, timeout: float = 10) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            ["docker", "info"], cwd=REPO_ROOT, stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE, text=True, check=False, timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(["docker", "info"], 1, stderr="Docker connection timed out")


def start_macos_docker_desktop() -> None:
    print_step(console_text("Docker Desktopを自動起動しています（最大120秒待ちます）", 'Starting Docker Desktop (waiting up to 120 seconds)'))
    try:
        completed = subprocess.run(
            ["open", "-g", "-a", "Docker"], capture_output=True,
            text=True, check=False, timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ManagerError(console_text(f"Docker Desktopを自動起動できませんでした。手動で起動してください: {exc}", f'Could not start Docker Desktop automatically. Start it manually: {exc}')) from exc
    if completed.returncode:
        raise ManagerError(console_text(f"Docker Desktopを自動起動できませんでした: {completed.stderr.strip()}", f'Could not start Docker Desktop automatically: {completed.stderr.strip()}'))
    deadline = time.monotonic() + 120
    while (remaining := deadline - time.monotonic()) > 0:
        if docker_daemon_probe(timeout=min(10, remaining)).returncode == 0:
            print(console_text("Docker Desktop: 起動完了", 'Docker Desktop: ready'), flush=True)
            return
        time.sleep(min(2, max(0, deadline - time.monotonic())))
    raise ManagerError(
        console_text("Docker Desktopの起動を120秒待ちましたが、接続できませんでした。\n"
        "Docker Desktop画面で初回設定やエラーを確認し、起動完了後に再実行してください。", 'Docker Desktop did not become ready within 120 seconds.\nCheck its setup screen or errors, then retry once it is running.')
    )


def require_docker_daemon(*, offer_group_fix: bool = False, auto_start: bool = False) -> None:
    completed = docker_daemon_probe()
    if completed.returncode:
        diagnostics = completed.stderr.strip().lower()
        if platform.system() == "Darwin":
            if not macos_docker_desktop_installed():
                raise ManagerError(
                    console_text("Dockerコマンドは見つかりましたが、Docker Desktop本体が見つかりません。\n"
                    f"{dependency_help()}", f'Docker CLI was found, but Docker Desktop was not found.\n{dependency_help()}')
                )
            if auto_start:
                start_macos_docker_desktop()
                return
            raise ManagerError(
                console_text("Docker Desktopはインストールされていますが、Docker daemonへ接続できません。\n"
                "make start または make setup でDocker Desktopを自動起動できます。", 'Docker Desktop is installed, but the Docker daemon is unavailable.\nRun make start or make setup to start Docker Desktop automatically.')
            )
        if platform.system() == "Linux" and ("permission denied" in diagnostics or "connect: permission" in diagnostics):
            if offer_group_fix and hasattr(os, "getuid") and os.geteuid() != 0:
                offer_linux_docker_group_fix()
            raise ManagerError(
                console_text("Docker socketへのアクセス権限がありません。次を実行してからログインし直してください。\n"
                'sudo usermod -aG docker "$USER"', 'No permission to access the Docker socket. Run the following, then log in again:\nsudo usermod -aG docker "$USER"')
            )
        raise ManagerError(console_text(f"Docker daemonへ接続できません。Docker DesktopまたはDocker Engineを起動してください。\n{dependency_help()}", f'Cannot connect to the Docker daemon. Start Docker Desktop or Docker Engine.\n{dependency_help()}'))


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
        raise ManagerError(console_text("STACK APIの応答がJSONオブジェクトではありません", 'STACK API did not return a JSON object'))
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
    raise ManagerError(console_text(f"STACK APIが{STACK_API_WAIT_SECONDS}秒以内に起動しませんでした: {last_error}", f'STACK API did not become ready within {STACK_API_WAIT_SECONDS} seconds: {last_error}'))


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
            print(console_text(f"MCQ WebApp: 起動済み (PID {status.get('pid', '?')})", f"MCQ WebApp: already running (PID {status.get('pid', '?')})"))
            return
        print(console_text("MCQ WebAppの起動設定が変わったため再起動します", 'Restarting MCQ WebApp because its settings changed'))
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
    raise ManagerError(console_text(f"MCQ WebAppが起動しませんでした。ログ: {LOG_FILE}\n{tail}", f'MCQ WebApp did not start. Log: {LOG_FILE}\n{tail}'))


def stop_web(config: dict[str, Any]) -> None:
    status = web_status(config)
    if not status:
        PID_FILE.unlink(missing_ok=True)
        print(console_text("MCQ WebApp: 停止済み", 'MCQ WebApp: stopped'))
        return
    request = Request(f"{local_web_url(config)}/api/server/shutdown", data=b"", method="POST")
    try:
        with urlopen(request, timeout=3) as response:
            response.read()
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise ManagerError(console_text(f"MCQ WebAppを安全に停止できませんでした: {exc}", f'Could not stop MCQ WebApp safely: {exc}')) from exc
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if not web_status(config):
            PID_FILE.unlink(missing_ok=True)
            return
        time.sleep(0.2)
    raise ManagerError(console_text("MCQ WebAppの停止が10秒でタイムアウトしました", 'Stopping MCQ WebApp timed out after 10 seconds'))


def check_maxima_evaluation() -> None:
    print_step(console_text("Maxima／STACKコードを確認", 'Check Maxima / STACK code'))
    checked = run(python_command("--check"), check=False)
    if checked.returncode == 0:
        return
    raise ManagerError(
        console_text("Maxima評価を設定できませんでした。直前のMaxima diagnosticsとDocker側のmaximaサービスを確認してください。\n"
        "evaluate.mac not found の場合は、使用するcloneで make repair-docker を実行してください。\n"
        f"ログ確認: {subprocess.list2cmdline(compose_command(runtime_config(), 'logs', 'maxima'))}", f"Could not configure Maxima evaluation. Check the preceding Maxima diagnostics and Docker maxima service.\nFor evaluate.mac not found, run make repair-docker in the clone you intend to use.\nView logs: {subprocess.list2cmdline(compose_command(runtime_config(), 'logs', 'maxima'))}")
    )


def start_services(config: dict[str, Any], *, recreate: bool = False) -> None:
    run([sys.executable, str(REPO_ROOT / "scripts" / "sync_mcq_templates.py")])
    require_basic_dependencies()
    require_docker_daemon(auto_start=True)
    print_step(console_text("STACK APIを起動", 'Start STACK API'))
    run(
        compose_command(config, "up", "-d", "--pull", "missing", *(["--force-recreate"] if recreate else [])),
        env=compose_environment(config),
    )
    wait_for_stack_api(config)
    print(f"STACK API: OK ({config['stack_api_url']})")
    print_step(console_text("作問アプリを起動", "Start authoring apps") if environment_value("AUTHORING_APPS_GROUP") == "1" else console_text("MCQ WebAppを起動", "Start MCQ WebApp"))
    start_web(config)
    print(f"MCQ WebApp: OK ({local_web_url(config)}/)")
    if config["host"] not in {"127.0.0.1", "localhost", "::1"}:
        print(console_text(f"ネットワーク公開: http://<このサーバーのIP>:{config['web_port']}/", f"Network access: http://<server-IP>:{config['web_port']}/"))


def stop_services(config: dict[str, Any]) -> None:
    print_step(console_text("MCQ WebAppを停止", 'Stop MCQ WebApp'))
    stop_web(config)
    if shutil.which("docker"):
        if platform.system() == "Darwin" and docker_daemon_probe().returncode:
            print(console_text(
                "Dockerに接続できないため、STACK APIの停止をスキップします。",
                "Docker is unavailable. Skipping STACK API stop.",
            ), flush=True)
            return
        try:
            prefix = compose_prefix()
        except ManagerError:
            prefix = []
        if prefix:
            print_step(console_text("STACK APIを停止", 'Stop STACK API'))
            run(
                [*prefix, "-p", COMPOSE_PROJECT, "-f", str(COMPOSE_FILE), "stop"],
                env=compose_environment(config),
            )


def repair_docker(config: dict[str, Any]) -> None:
    """Recreate containers with this checkout mounted, then verify evaluation."""
    repair_permissions()
    require_basic_dependencies()
    require_docker_daemon(auto_start=True)
    stop_web(config)
    print_step(console_text("Dockerコンテナを再作成し、現在のcloneを共有し直します", 'Recreate Docker containers with the current clone mounted'))
    start_services(config, recreate=True)
    check_maxima_evaluation()
    print(console_text("Dockerの再作成とMaxima評価の確認が完了しました。", 'Docker recreation and Maxima evaluation checks finished.'))


def setup(config: dict[str, Any]) -> None:
    print(f"OS: {platform.system()} {platform.machine()}")
    print(f"UI locale: {config['locale']} ({config['locale_mode']})")
    print(f"MCQ WebApp bind: {config['host']}:{config['web_port']}")
    print(f"include URL base: {config['include_base_url']}")
    repair_permissions()
    print_step(console_text("必須コマンド", 'Required commands'))
    missing = dependency_diagnostics()
    if missing:
        install_missing_dependencies(missing)
    require_basic_dependencies()
    require_docker_daemon(offer_group_fix=True, auto_start=True)
    compose_prefix()
    print_step(console_text("未取得のSTACK API・Maximaイメージのみ取得（取得済みは再利用）", 'Download missing STACK API / Maxima images (reuse cached images)'))
    run(compose_command(config, "pull", "--policy", "missing"), env=compose_environment(config))
    stop_web(config)
    start_services(config)
    check_maxima_evaluation()
    print(console_text("\nセットアップが完了しました。以後は make start / stop / restart / check を使用できます。", '\nSetup finished. Use make start / stop / restart / check from now on.'))


def check(config: dict[str, Any]) -> None:
    failures: list[str] = []
    print(f"OS: {platform.system()} {platform.machine()}")
    print(f"UI locale: {config['locale']} ({config['locale_mode']})")
    print(f"include URL base: {config['include_base_url']}")
    print_step(console_text("必須コマンド", 'Required commands'))
    missing = dependency_diagnostics()
    if missing:
        failures.append(
            console_text(f"必須コマンドが不足しています: {', '.join(missing)}。"
            "make install-depsでOS別の導入手順を確認できます", f"Missing required commands: {', '.join(missing)}. Run make install-deps for OS-specific instructions.")
        )
    sys.stdout.flush()
    try:
        repair_permissions()
        print(console_text("権限・ローカル書込: OK", 'Permissions / local writes: OK'))
    except OSError as exc:
        failures.append(console_text(f"権限・ローカル書込: {exc}", f'Permissions / local writes: {exc}'))
    docker_ready = False
    if not set(missing) & {"docker", "docker-compose", "docker-desktop"}:
        try:
            require_docker_daemon(offer_group_fix=True)
            docker_ready = True
        except ManagerError as exc:
            failures.append(f"Docker: {exc}")
    else:
        failures.append(console_text("Docker: 必須コンポーネントが不足しているため接続確認を省略しました", 'Docker: connection check skipped because required components are missing'))

    saved_config = load_config()
    setup_complete = all(
        saved_config.get(key)
        for key in ("server_host", "server_port", "stack_api_port", "ui_locale_mode")
    )
    if not setup_complete:
        print(console_text("ローカルMaxima／STACKコード: 初回セットアップ前のため確認を省略", 'Local Maxima / STACK: skipped before initial setup'))
        print(console_text("STACK API: 初回セットアップ前のため確認を省略", 'STACK API: skipped before initial setup'))
        print(console_text("MCQ WebApp: 初回セットアップ前のため確認を省略", 'MCQ WebApp: skipped before initial setup'))
        if failures:
            raise ManagerError("\n".join(f"- {failure}" for failure in failures))
        if not docker_ready:
            raise ManagerError(console_text("Docker daemonへ接続できません", 'Cannot connect to the Docker daemon'))
        print(console_text("事前チェック: OK", 'Preflight checks: OK'))
        print(console_text("次の操作: make setup", 'Next: make setup'))
        return

    host_stack_configured = bool(saved_config.get("stack_maxima_dir"))
    if docker_ready or host_stack_configured:
        if run(python_command("--check"), check=False).returncode:
            failures.append(console_text("ローカルMaxima／STACKコードの評価に失敗", 'Local Maxima / STACK evaluation failed'))
    else:
        print(console_text("ローカルMaxima／STACKコード: Docker権限を解決するまで確認を省略", 'Local Maxima / STACK: skipped until Docker permissions are fixed'))
    if docker_ready:
        try:
            run(compose_command(config, "ps"), env=compose_environment(config))
            stack_api_request(config["stack_api_url"])
            print(f"STACK API: OK ({config['stack_api_url']})")
        except (ManagerError, HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            failures.append(f"STACK API: {exc}")
    else:
        print(console_text("STACK API: Dockerへ接続できないため確認を省略", 'STACK API: skipped because Docker is unavailable'))
    status = web_status(config)
    if status:
        print(f"MCQ WebApp: OK ({local_web_url(config)}/, PID {status.get('pid', '?')})")
        if status.get("locale") != config["locale"]:
            failures.append(console_text("MCQ WebAppの起動ロケールが現在の設定と一致しません。make restartを実行してください", 'MCQ WebApp locale differs from the current settings. Run make restart.'))
        if status.get("stackApiUrl") != config["stack_api_url"]:
            failures.append(console_text("MCQ WebAppのSTACK API URLが現在の設定と一致しません。make restartを実行してください", 'MCQ WebApp STACK API URL differs from the current settings. Run make restart.'))
        if status.get("includeBaseUrl") != config["include_base_url"]:
            failures.append(console_text("MCQ WebAppのinclude URLベースが現在の設定と一致しません。make restartを実行してください", 'MCQ WebApp include URL base differs from the current settings. Run make restart.'))
    else:
        failures.append(console_text("MCQ WebAppが起動していません", 'MCQ WebApp is not running'))
    if failures:
        raise ManagerError("\n".join(f"- {failure}" for failure in failures))
    print(console_text("総合チェック: OK", 'Overall checks: OK'))


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=console_text("MCQ WebAppとローカルSTACK APIを管理します", 'Manage MCQ WebApp and the local STACK API'))
    parser.add_argument(
        "command",
        choices=("setup", "check", "install-deps", "start", "stop", "restart", "repair-docker", "status", "launch"),
    )
    parser.add_argument("--host", help=console_text("MCQ WebAppのbind address（setup時に保存）", 'MCQ WebApp bind address (saved during setup)'))
    parser.add_argument("--port", help=console_text("MCQ WebAppのポート（setup時に保存）", 'MCQ WebApp port (saved during setup)'))
    parser.add_argument("--stack-api-port", help=console_text("ローカルSTACK APIのポート（setup時に保存）", 'Local STACK API port (saved during setup)'))
    parser.add_argument("--locale", choices=("auto", "ja", "en"), help=console_text("UIロケール（setup時に保存）", 'Editor UI locale (saved during setup)'))
    parser.add_argument("--include-base-url", help=console_text("stack_include用の公開URLベース（setup時に保存）", 'Published stack_include URL base (saved during setup)'))
    return parser.parse_args()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    if sys.version_info < (3, 10):
        print(console_text("Python 3.10以降が必要です", 'Python 3.10+ is required'), file=sys.stderr)
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
        elif args.command == "repair-docker":
            repair_docker(config)
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
        print(console_text(f"エラー: {exc}", f'Error: {exc}'), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
