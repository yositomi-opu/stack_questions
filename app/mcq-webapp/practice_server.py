#!/usr/bin/env python3
"""Public practice gateway: trusted catalog only, never accept question code over HTTP."""
from __future__ import annotations

import argparse
import importlib.util
import json
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('mcq_preview', ROOT / 'server.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)
LANGS = {'ja', 'en', 'fr', 'it', 'de', 'pt', 'zh', 'ko', 'ru', 'sv', 'es'}
ASSETS = {
    '/': ('practice.html', 'text/html; charset=utf-8'),
    '/practice.js': ('practice.js', 'text/javascript; charset=utf-8'),
    '/preview.js': ('preview.js', 'text/javascript; charset=utf-8'),
    '/styles.css': ('styles.css', 'text/css; charset=utf-8'),
    '/vendor/mathjax-tex-svg-3.2.2.js': ('vendor/mathjax-tex-svg-3.2.2.js', 'text/javascript'),
    '/vendor/mathjax-boldsymbol-3.2.2.js': ('vendor/mathjax-boldsymbol-3.2.2.js', 'text/javascript'),
}
RENDER_FIELDS = {'questionrender', 'questioninputs', 'questionsamplesolutiontext', 'previewassets', 'iframes', 'isinteractive'}
GRADE_FIELDS = {'isgradable', 'scores', 'score', 'specificfeedback', 'prts', 'previewassets'}


class Practice:
    def __init__(self, catalog, api_url, concurrency=2):
        if catalog.get('schema') != 'mcq-practice-v1' or not isinstance(catalog.get('questions'), list):
            raise ValueError('Invalid practice catalog')
        self.questions = {}
        for q in catalog['questions']:
            if not isinstance(q.get('id'), str) or not q['id'] or q['id'] in self.questions:
                raise ValueError('Duplicate or invalid question ID')
            if not q.get('languages') or not set(q['languages']) <= LANGS:
                raise ValueError('Invalid question languages')
            preview.preview_definition(q['xml'], 1)
            self.questions[q['id']] = q
        self.api_url = api_url
        self.sessions = {}
        self.lock = threading.Lock()
        self.slots = threading.BoundedSemaphore(concurrency)

    def catalog(self):
        return [{k: q[k] for k in ('id', 'title', 'languages')} for q in self.questions.values()]

    def call(self, route, data):
        if not isinstance(data, dict):
            raise ValueError('Expected JSON object / JSONオブジェクトが必要です')
        if not self.slots.acquire(blocking=False):
            raise RuntimeError('Server busy. Retry shortly / 混雑しています。少し待って再試行してください')
        try:
            now = time.monotonic()
            with self.lock:
                self.sessions = {k: v for k, v in self.sessions.items() if now - v[0] < 3600}
            if route == 'preview':
                if set(data) - {'questionId', 'lang', 'seed', 'token'}:
                    raise ValueError('Only registered questions are allowed / 登録済み問題だけ利用できます')
                qid = data.get('questionId')
                if not isinstance(qid, str) or qid not in self.questions:
                    raise ValueError('Unknown question / 問題が見つかりません')
                q = self.questions[qid]
                lang = data.get('lang', q['languages'][0])
                if not isinstance(lang, str) or lang not in q['languages']:
                    raise ValueError('Unavailable language / 未登録の言語です')
                payload = {'questionDefinition': q['xml'], 'seed': data.get('seed', 1), 'lang': lang, 'url': self.api_url}
                response = preview.preview_stack_question(payload)['result']
                payload['questionDefinition'] = response['previewDefinition']
                token = secrets.token_urlsafe(32)
                with self.lock:
                    size = len(payload['questionDefinition'].encode('utf-8'))
                    while self.sessions and (len(self.sessions) >= 1024 or sum(v[2] for v in self.sessions.values()) + size > 32 * 1024 * 1024):
                        del self.sessions[next(iter(self.sessions))]
                    self.sessions[token] = (now, payload, size)
                result = {k: v for k, v in response.items() if k in RENDER_FIELDS}
                result['practiceToken'] = token
            elif route == 'grade':
                if set(data) - {'token', 'answers'}:
                    raise ValueError('Only token and answers are accepted / 回答以外は送信できません')
                token = data.get('token')
                with self.lock:
                    session = self.sessions.get(token) if isinstance(token, str) else None
                if session is None:
                    raise ValueError('Session expired. Reopen the question / 有効期限が切れました。問題を再表示してください')
                answers = data.get('answers')
                if not isinstance(answers, dict) or len(answers) > 100 or any(
                    not isinstance(k, str) or not isinstance(v, str) or len(k) > 100 or len(v) > 4096
                    for k, v in answers.items()
                ):
                    raise ValueError('Invalid answers / 回答の形式が不正です')
                response = preview.preview_stack_question({**session[1], 'answers': answers}, grading=True)['result']
                result = {k: v for k, v in response.items() if k in GRADE_FIELDS}
            else:
                raise ValueError('Unknown operation')
            return {'ok': True, 'result': result}
        finally:
            self.slots.release()


class Handler(BaseHTTPRequestHandler):
    # A separate handler intentionally exposes none of the editor endpoints/files.
    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def reply(self, status, body, content_type='application/json; charset=utf-8'):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/practice/catalog':
            self.reply(200, {'ok': True, 'questions': self.server.practice.catalog()})
        elif path == '/healthz':
            self.reply(200, {'ok': True})
        elif path in ASSETS:
            name, mime = ASSETS[path]
            self.reply(200, (ROOT / name).read_bytes(), mime)
        else:
            self.reply(404, {'ok': False, 'error': 'Not found'})

    def do_POST(self):
        route = {'/api/practice/preview': 'preview', '/api/practice/grade': 'grade'}.get(self.path)
        if route is None:
            self.reply(404, {'ok': False, 'error': 'Not found'})
            return
        # Nginx preserves Host. No CORS, cross-origin form POSTs or arbitrary code.
        origin = self.headers.get('Origin')
        if origin and (urlparse(origin).scheme not in {'http', 'https'} or urlparse(origin).netloc != self.headers.get('Host')):
            self.reply(403, {'ok': False, 'error': 'Origin not allowed'})
            return
        if self.headers.get_content_type() != 'application/json':
            self.reply(415, {'ok': False, 'error': 'Expected application/json'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 65536:
                raise ValueError('Invalid request size')
            data = json.loads(self.rfile.read(size))
            self.reply(200, self.server.practice.call(route, data))
        except (ValueError, UnicodeError) as exc:
            self.reply(400, {'ok': False, 'error': str(exc)})
        except RuntimeError:
            # Detailed STACK diagnostics belong in the operator log, not the public response.
            import traceback
            traceback.print_exc()
            self.reply(503, {'ok': False, 'error': 'Cannot process question. Retry shortly / 処理できませんでした。しばらく待って再試行してください'})
        except Exception:
            import traceback
            traceback.print_exc()
            self.reply(500, {'ok': False, 'error': 'Server error / サーバーエラー'})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', required=True, type=Path)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=4174)
    parser.add_argument('--stack-api-url', default='http://127.0.0.1:3080')
    args = parser.parse_args()
    preview.ACTIVE_STACK_API_URL = preview.normalize_stack_api_url(args.stack_api_url)
    app = Practice(json.loads(args.catalog.read_text()), preview.ACTIVE_STACK_API_URL)
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    httpd.practice = app
    print(f'Practice: http://{args.host}:{args.port}/ ({len(app.questions)} questions)', flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == '__main__':
    main()
