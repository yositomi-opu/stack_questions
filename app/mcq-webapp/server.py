#!/usr/bin/env python3
"""Serve mcq-webapp and evaluate trusted local Maxima expressions."""

from __future__ import annotations

import argparse
import json
import locale as locale_module
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlparse, urlunparse
from urllib.request import Request, urlopen


WEB_ROOT = Path(__file__).resolve().parent
REPO_ROOT = WEB_ROOT.parents[1]
LOCAL_CONFIG = WEB_ROOT / ".local-config.json"
LOCAL_DIR = WEB_ROOT / ".local"
DUMP_TEMPLATE = REPO_ROOT / "dump.txt"
MAX_BODY_BYTES = 512 * 1024
MAX_EXPRESSIONS = 300
MAXIMA_TIMEOUT_SECONDS = 12
STACK_API_TIMEOUT_SECONDS = 30
MAX_STACK_API_RESPONSE_BYTES = 2 * 1024 * 1024
MAX_REPOSITORY_FILE_BYTES = 2 * 1024 * 1024
REPOSITORY_INCLUDE_SUFFIXES = {".txt", ".mac", ".mc"}
NAME_RE = re.compile(r"^[%A-Za-z_][%A-Za-z0-9_]*$")
STACK_INCLUDE_RE = re.compile(
    r"stack_include\s*\(\s*\"([^\"\r\n]+)\"\s*\)\s*[;$]?",
    re.IGNORECASE,
)
MARKER = "__MCQ_EVAL_71C59D__"
SERVER_NAME = "stack-mcq-webapp"
STACK_REPOSITORY = "https://github.com/maths/moodle-qtype_stack.git"
STACK_API_COMPOSE = REPO_ROOT / "deploy" / "stack-api" / "compose.yaml"
STACK_API_COMPOSE_PROJECT = "stack-mcq-webapp"
DOCKER_STACK_MAXIMA = "docker://stack-mcq-webapp/maxima"
ACTIVE_UI_LOCALE = "ja"
ACTIVE_STACK_API_URL = "http://127.0.0.1:3080"
DEFAULT_INCLUDE_BASE_URL = "https://yositomi-opu.github.io/stack_questions/"
ACTIVE_INCLUDE_BASE_URL = DEFAULT_INCLUDE_BASE_URL
ALLOW_REMOTE_STACK_API = False
_DUMP_VALIDITY: dict[str, bool] = {}
_DUMP_WARNED: set[str] = set()


def resolve_ui_locale(value: str) -> str:
    normalized = (value or "auto").strip().lower().replace("-", "_")
    if normalized in {"ja", "en"}:
        return normalized
    if normalized != "auto":
        raise ValueError("localeはauto、ja、enのいずれかで指定してください")
    candidates: list[str] = []
    if sys.platform == "darwin" and shutil.which("defaults"):
        try:
            completed = subprocess.run(
                ["defaults", "read", "-g", "AppleLocale"],
                capture_output=True,
                text=True,
                timeout=3,
                check=False,
            )
            if completed.returncode == 0:
                candidates.append(completed.stdout.strip())
        except (OSError, subprocess.TimeoutExpired):
            pass
    language_name, _encoding = locale_module.getlocale()
    if language_name:
        candidates.append(language_name)
    candidates.extend(os.environ.get(name, "").strip() for name in ("LC_ALL", "LC_MESSAGES", "LANG"))
    language = next(
        (item.lower() for item in candidates if item and item.lower() not in {"c", "c.utf-8", "posix"}),
        "",
    )
    return "ja" if language.startswith("ja") else "en"


def normalize_include_base_url(value: str) -> str:
    candidate = (value or "").strip()
    if not candidate:
        raise ValueError("include URLベースを入力してください")
    if any(character in candidate for character in ('"', "\r", "\n")):
        raise ValueError("include URLベースに引用符や改行は使用できません")
    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("include URLベースはhttp://またはhttps://で始まるURLを指定してください")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("include URLベースに認証情報、クエリ、フラグメントは指定できません")
    path = parsed.path.rstrip("/") + "/"
    return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))


def server_command(*arguments: str) -> str:
    command = [sys.executable, str(Path(__file__).resolve()), *arguments]
    return subprocess.list2cmdline(command) if os.name == "nt" else shlex.join(command)


def load_local_config() -> dict[str, str]:
    try:
        payload = json.loads(LOCAL_CONFIG.read_text(encoding="utf-8"))
        return {str(key): str(value) for key, value in payload.items()} if isinstance(payload, dict) else {}
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return {}


def save_local_config(config: dict[str, str]) -> None:
    LOCAL_CONFIG.write_text(
        json.dumps(config, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def find_system_maxima() -> str | None:
    """Find the regular command-line Maxima executable."""
    configured = os.environ.get("MAXIMA_EXECUTABLE", "").strip().strip('"')
    if configured:
        configured_path = Path(configured).expanduser()
        if configured_path.is_file():
            return str(configured_path.resolve())
        resolved = shutil.which(configured)
        if resolved:
            return resolved
        raise RuntimeError(f"MAXIMA_EXECUTABLEで指定されたファイルが見つかりません: {configured}")

    resolved = shutil.which("maxima")
    if resolved:
        return resolved

    if os.name != "nt":
        return None

    search_roots: list[Path] = []
    for variable in ("MAXIMA_HOME", "ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
        value = os.environ.get(variable)
        if value:
            search_roots.append(Path(value))
    system_drive = os.environ.get("SystemDrive", "C:")
    search_roots.append(Path(system_drive + "\\"))

    candidates: list[Path] = []
    for root in search_roots:
        candidates.extend(root.glob("Maxima*/bin/maxima.bat"))
        candidates.extend(root.glob("Maxima*/bin/maxima.exe"))
        candidates.extend(root.glob("maxima-*/bin/maxima.bat"))
        candidates.extend(root.glob("maxima-*/bin/maxima.exe"))
        candidates.extend((root / "bin" / name) for name in ("maxima.bat", "maxima.exe"))
    existing = sorted({path.resolve() for path in candidates if path.is_file()}, reverse=True)
    return str(existing[0]) if existing else None


def find_maxima() -> str | None:
    """Prefer the STACK-enabled local Maxima image, then regular Maxima."""
    configured = os.environ.get("MAXIMA_EXECUTABLE", "").strip()
    if configured:
        return find_system_maxima()
    dumped = load_local_config().get("dumped_maxima", "")
    if dumped:
        dumped_path = Path(dumped).expanduser().resolve()
        if dumped_path.is_file():
            ensure_executable(dumped_path, "STACK用Maxima")
            if dumped_maxima_works(dumped_path):
                return str(dumped_path)
            warning_key = str(dumped_path)
            if warning_key not in _DUMP_WARNED:
                reason = (
                    "（macOSの隔離属性が付いています。同期先では再生成してください）"
                    if has_macos_quarantine(dumped_path)
                    else ""
                )
                print(
                    f"保存済みSTACK用Maximaを使用せず別の実行方式へ切り替えます{reason}: {dumped_path}",
                    file=sys.stderr,
                )
                _DUMP_WARNED.add(warning_key)
    system_maxima = find_system_maxima()
    if configured_stack_maxima_directory() and system_maxima:
        return system_maxima
    if docker_stack_maxima_available():
        return DOCKER_STACK_MAXIMA
    return system_maxima


def ensure_executable(path: Path, label: str) -> None:
    if os.name == "nt" or os.access(path, os.X_OK):
        return
    try:
        path.chmod(path.stat().st_mode | 0o111)
    except OSError as exc:
        raise RuntimeError(
            f"{label}に実行権限がありません: {path}\n"
            f"修復方法: chmod +x {shlex.quote(str(path))}"
        ) from exc
    if not os.access(path, os.X_OK):
        raise RuntimeError(
            f"{label}に実行権限を付けられませんでした: {path}\n"
            f"修復方法: chmod +x {shlex.quote(str(path))}"
        )


def has_macos_quarantine(path: Path) -> bool:
    """Detect a synced/downloaded executable without asking Gatekeeper to launch it."""
    if sys.platform != "darwin" or not shutil.which("xattr"):
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


def dumped_maxima_works(path: Path) -> bool:
    cache_key = str(path)
    if cache_key in _DUMP_VALIDITY:
        return _DUMP_VALIDITY[cache_key]
    # A Nextcloud-synchronised Mach-O file commonly receives quarantine metadata.
    # Launching it just to perform a health check opens a scary Gatekeeper dialog,
    # so reject it before execution and use the source-loading/Docker fallback.
    if has_macos_quarantine(path):
        _DUMP_VALIDITY[cache_key] = False
        return False
    marker = "__MCQ_DUMP_HEALTH_OK__"
    try:
        completed = subprocess.run(
            maxima_command(str(path), "--very-quiet", "--batch-string", f'print("{marker}")$ quit()$'),
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
            timeout=15,
            check=False,
        )
        valid = completed.returncode == 0 and marker in completed.stdout
    except (OSError, subprocess.TimeoutExpired):
        valid = False
    _DUMP_VALIDITY[cache_key] = valid
    return valid


def check_startup_maxima() -> None:
    try:
        maxima = find_maxima()
    except RuntimeError as exc:
        print(f"Maxima: 設定エラー - {exc}", file=sys.stderr)
        return
    if maxima:
        label = "Docker STACK Maxima" if maxima == DOCKER_STACK_MAXIMA else maxima
        print(f"Maxima: OK ({label})")
    else:
        print(
            "Maxima: 未検出 - 問題変数の評価を使うにはPATHを設定するか"
            "MAXIMA_EXECUTABLEを指定してください",
            file=sys.stderr,
        )


def configured_stack_maxima_directory() -> Path | None:
    configured = load_local_config().get("stack_maxima_dir", "")
    path = Path(configured).expanduser().resolve() if configured else None
    return path if path and (path / "stackmaxima.mac").is_file() else None


def using_dumped_maxima(maxima: str) -> bool:
    if maxima == DOCKER_STACK_MAXIMA:
        return False
    dumped = load_local_config().get("dumped_maxima", "")
    return bool(dumped and Path(dumped).is_file() and Path(maxima).resolve() == Path(dumped).resolve())


def maxima_command(maxima: str, *arguments: str) -> list[str]:
    """Build a subprocess command, including the Windows batch-file wrapper."""
    if maxima == DOCKER_STACK_MAXIMA:
        return [
            *docker_compose_prefix(),
            "-p",
            STACK_API_COMPOSE_PROJECT,
            "-f",
            str(STACK_API_COMPOSE),
            "exec",
            "-T",
            "maxima",
            "/opt/maxima/bin/maxima-optimised",
            *arguments,
        ]
    command = [maxima, *arguments]
    if os.name == "nt" and Path(maxima).suffix.lower() in {".bat", ".cmd"}:
        return [os.environ.get("COMSPEC", "cmd.exe"), "/d", "/s", "/c", subprocess.list2cmdline(command)]
    return command


def maxima_string(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def docker_compose_prefix() -> list[str]:
    for candidate in (["docker", "compose"], ["docker-compose"]):
        if not shutil.which(candidate[0]):
            continue
        try:
            completed = subprocess.run(
                [*candidate, "version"],
                cwd=REPO_ROOT,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=3,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            continue
        if completed.returncode == 0:
            return list(candidate)
    raise RuntimeError("Docker Composeが見つかりません")


def docker_environment() -> dict[str, str]:
    environment = os.environ.copy()
    environment["MCQ_REPO_ROOT"] = str(REPO_ROOT)
    parsed = urlparse(ACTIVE_STACK_API_URL)
    environment["STACK_API_PORT"] = str(parsed.port or 3080)
    return environment


def docker_stack_maxima_available() -> bool:
    if not STACK_API_COMPOSE.is_file() or not shutil.which("docker"):
        return False
    try:
        completed = subprocess.run(
            [
                *docker_compose_prefix(),
                "-p",
                STACK_API_COMPOSE_PROJECT,
                "-f",
                str(STACK_API_COMPOSE),
                "exec",
                "-T",
                "maxima",
                "true",
            ],
            cwd=REPO_ROOT,
            env=docker_environment(),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5,
            check=False,
        )
        return completed.returncode == 0
    except (OSError, RuntimeError, subprocess.TimeoutExpired):
        return False


def path_for_maxima(path: Path, maxima: str) -> str:
    resolved = path.resolve()
    if maxima != DOCKER_STACK_MAXIMA:
        return str(resolved)
    try:
        relative = resolved.relative_to(REPO_ROOT)
    except ValueError as exc:
        raise RuntimeError(f"Docker Maximaから参照できないパスです: {resolved}") from exc
    return "/workspace/" + relative.as_posix()


def stack_maxima_directory(stack_path: Path) -> Path | None:
    candidates = [stack_path / "stack" / "maxima", stack_path]
    return next((candidate for candidate in candidates if (candidate / "stackmaxima.mac").is_file()), None)


def validate_stack_path(value: str) -> Path:
    stack_path = Path(value).expanduser().resolve()
    if not stack_maxima_directory(stack_path):
        raise ValueError(
            "STACKの場所が正しくありません"
            f"（{stack_path}/stack/maxima/stackmaxima.mac または {stack_path}/stackmaxima.mac が見つかりません）"
        )
    return stack_path


def build_dumped_maxima(stack_path: Path) -> Path:
    maxima = find_system_maxima()
    if not maxima:
        raise RuntimeError("ダンプ生成に使用する通常版Maximaが見つかりません")
    if not DUMP_TEMPLATE.is_file():
        raise RuntimeError(f"ダンプ設定が見つかりません: {DUMP_TEMPLATE}")
    dump_source = DUMP_TEMPLATE.read_text(encoding="utf-8")
    maxima_dir = stack_maxima_directory(stack_path)
    if not maxima_dir:
        raise RuntimeError("STACK Maximaディレクトリを特定できません")
    if "__STACK_MAXIMA_DIR__" not in dump_source or "__MAXIMA_OPTIMISED__" not in dump_source:
        raise RuntimeError("dump.txtに必要な置換項目がありません")

    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    executable = LOCAL_DIR / ("maxima-stack.exe" if os.name == "nt" else "maxima-stack")
    generated = LOCAL_DIR / f".{executable.name}.{os.getpid()}.new"
    generated.unlink(missing_ok=True)
    configured_dump = (
        dump_source
        .replace("__STACK_MAXIMA_DIR__", str(maxima_dir).replace("\\", "\\\\"))
        .replace("__MAXIMA_OPTIMISED__", str(generated).replace("\\", "\\\\"))
    )
    try:
        completed = subprocess.run(
            maxima_command(maxima, "--very-quiet"),
            cwd=REPO_ROOT,
            input=configured_dump,
            text=True,
            capture_output=True,
            timeout=180,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("STACK用Maximaの生成が180秒でタイムアウトしました") from exc
    if completed.returncode != 0 or not generated.is_file():
        diagnostics = (completed.stdout + "\n" + completed.stderr).strip()[-5000:]
        generated.unlink(missing_ok=True)
        raise RuntimeError(f"STACK用Maximaを生成できませんでした\n{diagnostics}")
    generated.chmod(generated.stat().st_mode | 0o111)
    generated.replace(executable)
    config = load_local_config()
    config.update(
        {
            "stack_path": str(stack_path),
            "stack_maxima_dir": str(maxima_dir),
            "dumped_maxima": str(executable.resolve()),
        }
    )
    save_local_config(config)
    return executable.resolve()


def configure_stack(stack_path: Path, build_dump: bool = True) -> tuple[str, str]:
    maxima_dir = stack_maxima_directory(stack_path)
    if not maxima_dir:
        raise ValueError("STACK Maximaディレクトリを特定できません")
    config = load_local_config()
    config.update(
        {
            "stack_path": str(stack_path),
            "stack_maxima_dir": str(maxima_dir),
            "stack_runtime_mode": "load",
        }
    )
    if not build_dump:
        config.pop("dumped_maxima", None)
        save_local_config(config)
        return "load", "STACKコードを評価時に通常読込します"
    save_local_config(config)
    try:
        executable = build_dumped_maxima(stack_path)
        config = load_local_config()
        config["stack_runtime_mode"] = "dump"
        save_local_config(config)
        return "dump", f"STACK用Maximaを生成しました: {executable}"
    except (OSError, RuntimeError) as exc:
        config = load_local_config()
        config.pop("dumped_maxima", None)
        config["stack_runtime_mode"] = "load"
        save_local_config(config)
        return "load", f"ダンプ生成を利用できないため通常読込を使用します（{exc}）"


def install_stack_repository() -> Path:
    destination = LOCAL_DIR / "moodle-qtype_stack"
    if stack_maxima_directory(destination):
        return destination.resolve()
    if destination.exists():
        raise RuntimeError(
            f"STACK取得先がすでに存在しますが、正しいcloneではありません: {destination}"
        )
    git = shutil.which("git")
    if not git:
        raise RuntimeError("gitが見つかりません。Gitをインストールするか、既存のSTACK clone先を指定してください")
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    temporary = LOCAL_DIR / f".moodle-qtype_stack.{os.getpid()}.new"
    if temporary.exists():
        shutil.rmtree(temporary)
    try:
        completed = subprocess.run(
            [git, "clone", "--depth", "1", STACK_REPOSITORY, str(temporary)],
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
            timeout=300,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        shutil.rmtree(temporary, ignore_errors=True)
        raise RuntimeError("STACKのgit cloneが300秒でタイムアウトしました") from exc
    if completed.returncode != 0 or not stack_maxima_directory(temporary):
        diagnostics = (completed.stdout + "\n" + completed.stderr).strip()[-3000:]
        shutil.rmtree(temporary, ignore_errors=True)
        raise RuntimeError(f"STACKをgit cloneできませんでした\n{diagnostics}")
    temporary.replace(destination)
    return destination.resolve()


def resolve_stack_include(reference: str) -> Path:
    parsed = urlparse(reference)
    relative = unquote(parsed.path if parsed.scheme else reference).lstrip("/")
    if relative.startswith("stack_questions/"):
        relative = relative.removeprefix("stack_questions/")
    candidate = (REPO_ROOT / relative).resolve()
    try:
        candidate.relative_to(REPO_ROOT)
    except ValueError as exc:
        raise ValueError(f"許可されていないincludeパスです: {reference}") from exc
    if not candidate.is_file():
        raise ValueError(f"ローカルに存在しないincludeです: {reference}")
    return candidate


def rewrite_stack_includes(source: str, maxima: str) -> str:
    def replace(match: re.Match[str]) -> str:
        path = resolve_stack_include(match.group(1))
        return f"batchload({maxima_string(path_for_maxima(path, maxima))})$"

    return STACK_INCLUDE_RE.sub(replace, source)


def result_block(kind: str, index: int, expression: str) -> str:
    begin = f"{MARKER}BEGIN:{kind}:{index}"
    end = f"{MARKER}END:{kind}:{index}"
    evaluation = f"__mcq_eval_result:errcatch(ev(parse_string({maxima_string(expression)}),eval))$"
    return f"""
printf(true, "~%{begin}~%")$
{evaluation}
if __mcq_eval_result=[] then (
  printf(true, "{MARKER}STATUS:error~%")
) else (
  __mcq_eval_value:first(__mcq_eval_result),
  printf(true, "{MARKER}STATUS:ok~%"),
  printf(true, "{MARKER}TYPE:~a~%", if matrixp(__mcq_eval_value) then "matrix" else if listp(__mcq_eval_value) then "list" else if numberp(__mcq_eval_value) then "number" else if stringp(__mcq_eval_value) then "string" else if atom(__mcq_eval_value) then "symbol" else "expression"),
  if listp(__mcq_eval_value) then printf(true, "{MARKER}LENGTH:~a~%", length(__mcq_eval_value)),
  printf(true, "{MARKER}VALUE_BEGIN~%"),
  grind(__mcq_eval_value),
  printf(true, "{MARKER}VALUE_END~%")
)$
printf(true, "{end}~%")$
"""


def stack_runtime_program(maxima: str) -> list[str]:
    if maxima == DOCKER_STACK_MAXIMA:
        return ["__mcq_stack_loaded:true$"]
    if using_dumped_maxima(maxima):
        return []
    maxima_dir = configured_stack_maxima_directory()
    if not maxima_dir:
        return []
    maxima_pattern = maxima_string(str(maxima_dir / "###.{mac,mc}"))
    lisp_pattern = maxima_string(str(maxima_dir / "###.{lisp}"))
    contrib_maxima_pattern = maxima_string(str(maxima_dir / "contrib" / "###.{mac,mc}"))
    contrib_lisp_pattern = maxima_string(str(maxima_dir / "contrib" / "###.{lisp}"))
    return [
        f"file_search_maxima:append([{maxima_pattern}],file_search_maxima)$",
        f"file_search_lisp:append([{lisp_pattern}],file_search_lisp)$",
        f"file_search_maxima:append([{contrib_maxima_pattern}],file_search_maxima)$",
        f"file_search_lisp:append([{contrib_lisp_pattern}],file_search_lisp)$",
        f"batchload({maxima_string(str(maxima_dir / 'stackmaxima.mac'))})$",
        "load(stats)$",
        "load(distrib)$",
        "load(descriptive)$",
        "alias(stack_include_contrib,load)$",
        "__mcq_stack_loaded:true$",
    ]


def build_maxima_program(
    maxima: str,
    variable_file: Path,
    variable_names: list[str],
    expressions: list[dict[str, str]],
) -> str:
    libraries = [
        REPO_ROOT / "ky_linear_algebra.mac",
        REPO_ROOT / "tex_library.mac",
        REPO_ROOT / "mcq_template_pre.mac",
    ]
    lines = [
        "display2d:false$",
        "linel:100000$",
        'load("stringproc")$',
        f'%_STACK_LANG:{maxima_string(ACTIVE_UI_LOCALE)}$',
        f'%__STACK_LANG:{maxima_string(ACTIVE_UI_LOCALE)}$',
        "%_MCQ_FLAGS:[true,true,false,false,false,true]$",
    ]
    lines.extend(stack_runtime_program(maxima))
    lines.extend(
        f"batchload({maxima_string(path_for_maxima(path, maxima))})$"
        for path in libraries
        if path.is_file()
    )
    lines.extend(
        [
            f'printf(true, "~%{MARKER}QVARS_BEGIN~%")$',
            f"__mcq_qvars_result:errcatch(batchload({maxima_string(path_for_maxima(variable_file, maxima))}))$",
            f'printf(true, "{MARKER}QVARS_STATUS:~a~%", if __mcq_qvars_result=[] then "error" else "ok")$',
            f'printf(true, "{MARKER}QVARS_END~%")$',
        ]
    )
    lines.extend(result_block("VAR", index, name) for index, name in enumerate(variable_names))
    lines.extend(result_block("EXPR", index, item["expression"]) for index, item in enumerate(expressions))
    lines.append("quit()$")
    return "\n".join(lines)


def parse_result_blocks(stdout: str, kind: str, items: list[Any]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for index, item in enumerate(items):
        start = f"{MARKER}BEGIN:{kind}:{index}"
        end = f"{MARKER}END:{kind}:{index}"
        start_at = stdout.find(start)
        end_at = stdout.find(end, start_at + len(start)) if start_at >= 0 else -1
        base = {"id": item["id"]} if isinstance(item, dict) else {"name": item}
        if start_at < 0 or end_at < 0:
            results.append({**base, "ok": False, "error": "Maximaから評価結果を取得できませんでした"})
            continue
        block = stdout[start_at + len(start) : end_at]
        status = re.search(re.escape(MARKER) + r"STATUS:(ok|error)", block)
        if not status or status.group(1) != "ok":
            results.append({**base, "ok": False, "error": "Maxima式を評価できませんでした"})
            continue
        value_match = re.search(
            re.escape(MARKER) + r"VALUE_BEGIN\s*(.*?)\s*" + re.escape(MARKER) + r"VALUE_END",
            block,
            re.DOTALL,
        )
        type_match = re.search(re.escape(MARKER) + r"TYPE:([^\r\n]+)", block)
        length_match = re.search(re.escape(MARKER) + r"LENGTH:(\d+)", block)
        value = value_match.group(1).strip() if value_match else ""
        if value.endswith("$"):
            value = value[:-1].rstrip()
        results.append(
            {
                **base,
                "ok": True,
                "type": type_match.group(1).strip() if type_match else "expression",
                "length": int(length_match.group(1)) if length_match else None,
                "value": value,
            }
        )
    return results


def evaluate_payload(payload: dict[str, Any]) -> dict[str, Any]:
    maxima = find_maxima()
    if not maxima:
        raise RuntimeError(
            "Maximaが見つかりません。PATHを設定するか、MAXIMA_EXECUTABLEに実行ファイルのパスを指定してください"
        )

    variables = payload.get("variables", "")
    variable_names = payload.get("variableNames", [])
    expressions = payload.get("expressions", [])
    if not isinstance(variables, str):
        raise ValueError("variablesは文字列で指定してください")
    if not isinstance(variable_names, list) or any(not isinstance(name, str) or not NAME_RE.fullmatch(name) for name in variable_names):
        raise ValueError("variableNamesに使用できない変数名があります")
    if not isinstance(expressions, list) or len(expressions) > MAX_EXPRESSIONS:
        raise ValueError(f"expressionsは最大{MAX_EXPRESSIONS}件です")

    normalized_expressions: list[dict[str, str]] = []
    for item in expressions:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not isinstance(item.get("expression"), str):
            raise ValueError("expressionsの形式が正しくありません")
        expression = item["expression"].strip()
        if not expression:
            continue
        normalized_expressions.append({"id": item["id"][:200], "expression": expression})

    rewritten_variables = rewrite_stack_includes(variables, maxima)
    if maxima == DOCKER_STACK_MAXIMA:
        LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    temp_parent = str(LOCAL_DIR) if maxima == DOCKER_STACK_MAXIMA else None
    with tempfile.TemporaryDirectory(prefix="mcq-maxima-", dir=temp_parent) as temp_dir:
        temp = Path(temp_dir)
        variable_file = temp / "variables.mac"
        program_file = temp / "evaluate.mac"
        variable_file.write_text(rewritten_variables + "\n", encoding="utf-8")
        program_file.write_text(
            build_maxima_program(maxima, variable_file, variable_names, normalized_expressions),
            encoding="utf-8",
        )
        evaluation_timeout = MAXIMA_TIMEOUT_SECONDS if using_dumped_maxima(maxima) else 60
        try:
            completed = subprocess.run(
                maxima_command(
                    maxima,
                    "--very-quiet",
                    "--batch-string",
                    f"batchload({maxima_string(path_for_maxima(program_file, maxima))})$",
                ),
                cwd=REPO_ROOT,
                env=docker_environment() if maxima == DOCKER_STACK_MAXIMA else None,
                text=True,
                capture_output=True,
                timeout=evaluation_timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"Maxima評価が{evaluation_timeout}秒でタイムアウトしました") from exc

    output = completed.stdout + "\n" + completed.stderr
    qvars_status = re.search(re.escape(MARKER) + r"QVARS_STATUS:(ok|error)", output)
    qvars_ok = bool(qvars_status and qvars_status.group(1) == "ok")
    response = {
        "ok": qvars_ok,
        "variables": parse_result_blocks(output, "VAR", variable_names),
        "expressions": parse_result_blocks(output, "EXPR", normalized_expressions),
    }
    if not qvars_ok:
        response["error"] = "問題変数の評価に失敗しました"
        response["diagnostics"] = output[-4000:]
    return response


def normalize_stack_api_url(value: str) -> str:
    """Normalize a STACK API base URL while retaining an optional path prefix."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("STACK APIのURLを入力してください")
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("STACK APIのURLは http:// または https:// で指定してください")
    if parsed.username or parsed.password:
        raise ValueError("ユーザー名やパスワードを含むURLは使用できません")
    path = parsed.path.rstrip("/")
    for suffix in ("/stack.php", "/render", "/test", "/validate", "/grade", "/diff", "/download"):
        if path.endswith(suffix):
            path = path[: -len(suffix)]
            break
    return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))


def require_allowed_stack_api_url(normalized_url: str) -> None:
    if ALLOW_REMOTE_STACK_API:
        return
    configured = normalize_stack_api_url(ACTIVE_STACK_API_URL)
    if normalized_url != configured:
        raise ValueError(
            f"このサーバーではSTACK API接続先を {configured} に固定しています。"
            "別サーバーを許可する場合だけ --allow-remote-stack-api を付けて再起動してください"
        )


def request_stack_api(base_url: str, route: str, payload: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    normalized_url = normalize_stack_api_url(base_url)
    require_allowed_stack_api_url(normalized_url)
    endpoint = f"{normalized_url}{route}"
    request = Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=STACK_API_TIMEOUT_SECONDS) as response:
            body = response.read(MAX_STACK_API_RESPONSE_BYTES + 1)
    except HTTPError as exc:
        body = exc.read(MAX_STACK_API_RESPONSE_BYTES + 1)
        detail = body.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"STACK APIがHTTP {exc.code}を返しました: {detail[:1000]}") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(f"STACK APIへ接続できません: {exc}") from exc
    if len(body) > MAX_STACK_API_RESPONSE_BYTES:
        raise RuntimeError("STACK APIの応答が大きすぎます")
    try:
        result = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("STACK APIからJSON以外の応答が返されました") from exc
    if not isinstance(result, dict):
        raise RuntimeError("STACK APIの応答形式を確認できませんでした")
    return normalized_url, result


def check_stack_api(base_url: str) -> dict[str, Any]:
    sample_xml = '<quiz><question type="stack"></question></quiz>'
    normalized_url, result = request_stack_api(
        base_url,
        "/render",
        {
            "questionDefinition": sample_xml,
            "renderInputs": "",
            "fullRender": [],
            "readOnly": True,
        },
    )
    return {
        "ok": True,
        "url": normalized_url,
        "message": "STACK APIの /render からJSON応答を受信しました",
        "result": result,
    }


def test_stack_question(base_url: str, question_definition: str) -> dict[str, Any]:
    if not isinstance(question_definition, str) or not question_definition.strip():
        raise ValueError("テストする問題XMLがありません")
    normalized_url, result = request_stack_api(
        base_url,
        "/test",
        {"questionDefinition": question_definition},
    )
    return {"ok": True, "url": normalized_url, "result": result}


def read_repository_include(raw_path: str) -> tuple[str, bytes]:
    path_text = unquote(raw_path).replace("\\", "/").lstrip("/")
    relative = Path(path_text)
    if (
        not path_text
        or relative.is_absolute()
        or any(part in {"", ".", ".."} or part.startswith(".") for part in relative.parts)
        or relative.suffix.lower() not in REPOSITORY_INCLUDE_SUFFIXES
    ):
        raise ValueError("includeファイルのパスが不正です")
    target = (REPO_ROOT / relative).resolve()
    try:
        target.relative_to(REPO_ROOT)
    except ValueError as exc:
        raise ValueError("リポジトリ外のファイルは取得できません") from exc
    if not target.is_file():
        raise FileNotFoundError(path_text)
    if target.stat().st_size > MAX_REPOSITORY_FILE_BYTES:
        raise ValueError("includeファイルが大きすぎます")
    return path_text, target.read_bytes()


class McqRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/config.js":
            body = (
                "window.MCQ_WEBAPP_CONFIG = "
                + json.dumps(
                    {
                        "locale": ACTIVE_UI_LOCALE,
                        "stackApiUrl": ACTIVE_STACK_API_URL,
                        "includeBaseUrl": ACTIVE_INCLUDE_BASE_URL,
                    },
                    ensure_ascii=False,
                )
                + ";\n"
            ).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path == "/api/server/status":
            self.send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "service": SERVER_NAME,
                    "pid": os.getpid(),
                    "locale": ACTIVE_UI_LOCALE,
                    "stackApiUrl": ACTIVE_STACK_API_URL,
                    "includeBaseUrl": ACTIVE_INCLUDE_BASE_URL,
                },
            )
            return
        if parsed.path == "/api/repository/include":
            try:
                path = parse_qs(parsed.query).get("path", [""])[0]
                _filename, body = read_repository_include(path)
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
            except ValueError as exc:
                self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})
            except FileNotFoundError:
                self.send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "includeファイルが見つかりません"})
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        if self.path == "/api/server/shutdown":
            if self.client_address[0] not in {"127.0.0.1", "::1"}:
                self.send_json(HTTPStatus.FORBIDDEN, {"ok": False, "error": "ローカル接続だけが停止できます"})
                return
            self.send_json(HTTPStatus.OK, {"ok": True})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        if self.path not in {"/api/maxima/evaluate", "/api/stack/check", "/api/stack/test"}:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                raise ValueError("リクエストサイズが不正です")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("JSONオブジェクトを送信してください")
            if self.path == "/api/maxima/evaluate":
                result = evaluate_payload(payload)
            elif self.path == "/api/stack/check":
                result = check_stack_api(payload.get("url", ""))
            else:
                result = test_stack_question(
                    payload.get("url", ""),
                    payload.get("questionDefinition", ""),
                )
            self.send_json(HTTPStatus.OK, result)
        except (ValueError, json.JSONDecodeError) as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})
        except RuntimeError as exc:
            self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"ok": False, "error": str(exc)})
        except Exception as exc:  # pragma: no cover - last-resort local diagnostic
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": f"評価サーバー内部エラー: {exc}"})

    def send_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def local_server_url(host: str, port: int) -> str:
    connect_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
    if ":" in connect_host and not connect_host.startswith("["):
        connect_host = f"[{connect_host}]"
    return f"http://{connect_host}:{port}"


def running_server(url: str) -> dict[str, Any] | None:
    try:
        with urlopen(f"{url}/api/server/status", timeout=0.8) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return payload if payload.get("service") == SERVER_NAME else None
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError):
        try:
            with urlopen(f"{url}/", timeout=0.8) as response:
                page = response.read(64 * 1024).decode("utf-8", errors="replace")
            if "<title>STACK MCQ XML Generator</title>" in page:
                return {"ok": True, "service": SERVER_NAME, "legacy": True}
        except (HTTPError, URLError, TimeoutError, OSError):
            pass
        return None


def reload_running_server(url: str) -> bool:
    status = running_server(url)
    if not status:
        return False
    if status.get("legacy"):
        raise RuntimeError(
            "旧バージョンのMCQ WebAppサーバーが動作中です。"
            "起動したターミナルでCtrl+Cを押して終了した後、もう一度起動してください"
        )
    request = Request(f"{url}/api/server/shutdown", data=b"", method="POST")
    try:
        with urlopen(request, timeout=2) as response:
            response.read()
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(f"動作中のサーバーを停止できませんでした: {exc}") from exc
    for _ in range(50):
        if not running_server(url):
            return True
        time.sleep(0.1)
    raise RuntimeError("動作中のサーバーの停止が5秒でタイムアウトしました")


def main() -> None:
    global ACTIVE_INCLUDE_BASE_URL, ACTIVE_STACK_API_URL, ACTIVE_UI_LOCALE, ALLOW_REMOTE_STACK_API
    parser = argparse.ArgumentParser(description="STACK MCQ WebアプリとローカルMaxima評価APIを起動します")
    parser.add_argument("--host", default="127.0.0.1", help="bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=4173, help="port (default: 4173)")
    parser.add_argument(
        "--locale",
        choices=("auto", "ja", "en"),
        default=os.environ.get("MCQ_WEBAPP_LOCALE", load_local_config().get("ui_locale_mode", "auto")),
        help="起動時UIロケール: auto, ja, en (default: auto)",
    )
    parser.add_argument(
        "--stack-api-url",
        default=os.environ.get(
            "MCQ_STACK_API_URL",
            load_local_config().get("stack_api_url", "http://127.0.0.1:3080"),
        ),
        help="既定のSTACK API URL (default: http://127.0.0.1:3080)",
    )
    parser.add_argument(
        "--include-base-url",
        default=os.environ.get(
            "INCLUDE_BASE_URL",
            load_local_config().get("include_base_url", DEFAULT_INCLUDE_BASE_URL),
        ),
        help=f"stack_include用の公開URLベース (default: {DEFAULT_INCLUDE_BASE_URL})",
    )
    parser.add_argument(
        "--allow-remote-stack-api",
        action="store_true",
        help="既定URL以外のSTACK APIへのプロキシを許可します（信頼できる環境専用）",
    )
    parser.add_argument("--check", action="store_true", help="Maxima評価環境を診断して終了します")
    parser.add_argument(
        "--setup-stack",
        metavar="PATH",
        help="STACKのgit clone先を保存し、dump.txtからSTACK用Maximaを生成します",
    )
    parser.add_argument(
        "--install-stack",
        action="store_true",
        help="STACKをGitHubからローカル領域へcloneして設定します",
    )
    parser.add_argument(
        "--rebuild-stack-maxima",
        action="store_true",
        help="保存済みのSTACK clone先を使ってSTACK用Maximaを再生成します",
    )
    parser.add_argument(
        "--no-dump",
        action="store_true",
        help="STACK用実行ファイルを生成せず、評価時の通常読込を使用します",
    )
    parser.add_argument("--reload", action="store_true", help="動作中のMCQ WebAppサーバーを停止して再起動します")
    parser.add_argument("--open-browser", action="store_true", help="起動後にブラウザを開きます")
    args = parser.parse_args()
    try:
        ACTIVE_UI_LOCALE = resolve_ui_locale(args.locale)
        ACTIVE_STACK_API_URL = normalize_stack_api_url(args.stack_api_url)
        ACTIVE_INCLUDE_BASE_URL = normalize_include_base_url(args.include_base_url)
        ALLOW_REMOTE_STACK_API = args.allow_remote_stack_api
    except ValueError as exc:
        parser.exit(2, f"起動設定が不正です: {exc}\n")
    if args.setup_stack or args.install_stack or args.rebuild_stack_maxima:
        try:
            if args.install_stack:
                print(f"STACKを取得しています: {STACK_REPOSITORY}")
                stack_path = install_stack_repository()
            elif args.setup_stack:
                stack_path = validate_stack_path(args.setup_stack)
            else:
                configured_path = load_local_config().get("stack_path", "")
                if not configured_path:
                    raise ValueError(
                        "STACKのclone先が未設定です。先に --setup-stack PATH を実行してください"
                    )
                stack_path = validate_stack_path(configured_path)
            print(f"STACK: {stack_path}")
            if not args.no_dump:
                print("dump.txtを読み込み、STACK用Maximaを生成しています...")
            mode, message = configure_stack(stack_path, build_dump=not args.no_dump)
            print(message)
            print(f"STACK読込方式: {'ダンプ済み実行ファイル' if mode == 'dump' else '評価時の通常読込'}")
            print(f"設定確認: {server_command('--check')}")
            return
        except (OSError, ValueError, RuntimeError) as exc:
            parser.exit(1, f"STACK用Maximaの設定に失敗しました: {exc}\n")

    if args.check:
        try:
            maxima = find_maxima()
            if not maxima:
                raise RuntimeError(
                    "Maximaが見つかりません。PATHを設定するか、MAXIMA_EXECUTABLEを指定してください"
                )
            result = evaluate_payload(
                {
                    "variables": "__mcq_environment_check:1$",
                    "variableNames": ["__mcq_environment_check"],
                    "expressions": [{"id": "stack-check", "expression": "__mcq_stack_loaded"}],
                }
            )
            if not result.get("ok") or not result.get("variables", [{}])[0].get("ok"):
                raise RuntimeError(result.get("error", "Maximaによるテスト評価に失敗しました"))
            stack_result = result.get("expressions", [{}])[0]
            stack_loaded = stack_result.get("ok") and stack_result.get("value") == "true"
            config = load_local_config()
            print(f"Python: OK")
            print(f"Maxima: OK ({maxima})")
            if config.get("stack_path"):
                print(f"STACK path: {config['stack_path']}")
            if config.get("stack_maxima_dir"):
                print(f"STACK Maxima: {config['stack_maxima_dir']}")
            print(f"STACK code: {'OK' if stack_loaded else '未読込'}")
            if not stack_loaded:
                print(f"設定方法: {server_command('--setup-stack', '/path/to/moodle-qtype_stack')}")
                parser.exit(1, "STACKコードを読み込めないため、ローカルCAS評価の設定が未完了です\n")
            if maxima == DOCKER_STACK_MAXIMA:
                mode = "Docker goemaxima"
            else:
                mode = "ダンプ済み実行ファイル" if using_dumped_maxima(maxima) else "評価時の通常読込"
            print(f"STACK読込方式: {mode}")
            print("MCQ WebAppのローカルCAS評価を利用できます")
            return
        except (OSError, RuntimeError) as exc:
            parser.exit(1, f"環境チェックに失敗しました: {exc}\n")

    url = local_server_url(args.host, args.port)
    if args.reload:
        try:
            if reload_running_server(url):
                print("動作中のMCQ WebAppサーバーを停止しました。再起動します")
        except RuntimeError as exc:
            parser.exit(1, f"{exc}\n")
    elif status := running_server(url):
        print(f"STACK MCQ XML Generator はすでに動作しています: {url}/")
        if status.get("legacy"):
            print("旧バージョンを初回だけ再起動する場合は、起動したターミナルでCtrl+Cを押してから起動してください")
        else:
            print(f"再起動する場合: {server_command('--port', str(args.port), '--reload')}")
        print(f"引数の一覧: {server_command('--help')}")
        return

    try:
        server = ThreadingHTTPServer((args.host, args.port), McqRequestHandler)
    except OSError as exc:
        if exc.errno in {48, 98, 10048}:
            parser.exit(
                1,
                f"ポート {args.port} は別のプロセスが使用しています。\n"
                f"別のポートで起動する場合: {server_command('--port', str(args.port + 1))}\n"
                f"引数の一覧: {server_command('--help')}\n",
            )
        raise
    print(f"STACK MCQ XML Generator: {url}/")
    print(f"UI locale: {ACTIVE_UI_LOCALE} ({args.locale})")
    print(f"STACK API: {ACTIVE_STACK_API_URL}")
    print(f"include URL base: {ACTIVE_INCLUDE_BASE_URL}")
    check_startup_maxima()
    print("終了するには Ctrl-C を押してください")
    if args.open_browser:
        threading.Timer(0.5, webbrowser.open, args=(f"{url}/",)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
