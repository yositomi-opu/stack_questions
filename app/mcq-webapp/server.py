#!/usr/bin/env python3
"""Serve mcq-webapp and evaluate trusted local Maxima expressions."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen


WEB_ROOT = Path(__file__).resolve().parent
REPO_ROOT = WEB_ROOT.parents[1]
MAX_BODY_BYTES = 512 * 1024
MAX_EXPRESSIONS = 300
MAXIMA_TIMEOUT_SECONDS = 12
NAME_RE = re.compile(r"^[%A-Za-z_][%A-Za-z0-9_]*$")
STACK_INCLUDE_RE = re.compile(
    r"stack_include\s*\(\s*\"([^\"\r\n]+)\"\s*\)\s*[;$]?",
    re.IGNORECASE,
)
MARKER = "__MCQ_EVAL_71C59D__"
SERVER_NAME = "stack-mcq-webapp"


def find_maxima() -> str | None:
    """Find the command-line Maxima executable on macOS, Linux, or Windows."""
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


def maxima_command(maxima: str, *arguments: str) -> list[str]:
    """Build a subprocess command, including the Windows batch-file wrapper."""
    command = [maxima, *arguments]
    if os.name == "nt" and Path(maxima).suffix.lower() in {".bat", ".cmd"}:
        return [os.environ.get("COMSPEC", "cmd.exe"), "/d", "/s", "/c", subprocess.list2cmdline(command)]
    return command


def maxima_string(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


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


def rewrite_stack_includes(source: str) -> str:
    def replace(match: re.Match[str]) -> str:
        path = resolve_stack_include(match.group(1))
        return f"batchload({maxima_string(str(path))})$"

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


def build_maxima_program(variable_file: Path, variable_names: list[str], expressions: list[dict[str, str]]) -> str:
    libraries = [
        REPO_ROOT / "ky_linear_algebra.mac",
        REPO_ROOT / "tex_library.mac",
        REPO_ROOT / "mcq_template_pre.mac",
    ]
    lines = [
        "display2d:false$",
        "linel:100000$",
        'load("stringproc")$',
        '%_STACK_LANG:"ja"$',
        '%__STACK_LANG:"ja"$',
        "%_MCQ_FLAGS:[true,true,false,false,false,true]$",
    ]
    lines.extend(f"batchload({maxima_string(str(path))})$" for path in libraries if path.is_file())
    lines.extend(
        [
            f'printf(true, "~%{MARKER}QVARS_BEGIN~%")$',
            f"__mcq_qvars_result:errcatch(batchload({maxima_string(str(variable_file))}))$",
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

    rewritten_variables = rewrite_stack_includes(variables)
    with tempfile.TemporaryDirectory(prefix="mcq-maxima-") as temp_dir:
        temp = Path(temp_dir)
        variable_file = temp / "variables.mac"
        program_file = temp / "evaluate.mac"
        variable_file.write_text(rewritten_variables + "\n", encoding="utf-8")
        program_file.write_text(
            build_maxima_program(variable_file, variable_names, normalized_expressions),
            encoding="utf-8",
        )
        try:
            completed = subprocess.run(
                maxima_command(
                    maxima,
                    "--very-quiet",
                    "--batch-string",
                    f"batchload({maxima_string(str(program_file))})$",
                ),
                cwd=REPO_ROOT,
                text=True,
                capture_output=True,
                timeout=MAXIMA_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"Maxima評価が{MAXIMA_TIMEOUT_SECONDS}秒でタイムアウトしました") from exc

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


class McqRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/api/server/status":
            self.send_json(
                HTTPStatus.OK,
                {"ok": True, "service": SERVER_NAME, "pid": os.getpid()},
            )
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
        if self.path != "/api/maxima/evaluate":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                raise ValueError("リクエストサイズが不正です")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("JSONオブジェクトを送信してください")
            result = evaluate_payload(payload)
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
    parser = argparse.ArgumentParser(description="STACK MCQ WebアプリとローカルMaxima評価APIを起動します")
    parser.add_argument("--host", default="127.0.0.1", help="bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=4173, help="port (default: 4173)")
    parser.add_argument("--check", action="store_true", help="Maxima評価環境を診断して終了します")
    parser.add_argument("--reload", action="store_true", help="動作中のMCQ WebAppサーバーを停止して再起動します")
    parser.add_argument("--open-browser", action="store_true", help="起動後にブラウザを開きます")
    args = parser.parse_args()
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
                    "expressions": [],
                }
            )
            if not result.get("ok") or not result.get("variables", [{}])[0].get("ok"):
                raise RuntimeError(result.get("error", "Maximaによるテスト評価に失敗しました"))
            print(f"Python: OK")
            print(f"Maxima: OK ({maxima})")
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
            print(f"再起動する場合: python3 app/mcq-webapp/server.py --port {args.port} --reload")
        print("引数の一覧: python3 app/mcq-webapp/server.py --help")
        return

    try:
        server = ThreadingHTTPServer((args.host, args.port), McqRequestHandler)
    except OSError as exc:
        if exc.errno in {48, 98, 10048}:
            parser.exit(
                1,
                f"ポート {args.port} は別のプロセスが使用しています。\n"
                f"別のポートで起動する場合: python3 app/mcq-webapp/server.py --port {args.port + 1}\n"
                "引数の一覧: python3 app/mcq-webapp/server.py --help\n",
            )
        raise
    print(f"STACK MCQ XML Generator: {url}/")
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
