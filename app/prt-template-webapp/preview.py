"""Optional loopback MCQ webapp bridge; never fetch imported URLs directly."""
import json
import time
import uuid
from urllib.request import Request, build_opener, HTTPRedirectHandler, ProxyHandler
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit

LIMIT = 4 * 1024 * 1024


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Preview:
    def __init__(self, base='http://127.0.0.1:4173', api='http://127.0.0.1:3080'):
        for url in (base, api):
            parsed = urlsplit(url)
            if parsed.scheme != 'http' or parsed.hostname not in {'127.0.0.1', 'localhost'} or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
                raise ValueError('Preview services must use a local HTTP address')
        self.base, self.api = base.rstrip('/'), api.rstrip('/')
        self.sessions = {}

    def call(self, route, payload):
        body = json.dumps(dict(payload, url=self.api)).encode()
        if len(body) > LIMIT:
            raise ValueError('Preview XML exceeds 4 MiB / プレビューXMLが大きすぎます。')
        request = Request(self.base + '/api/stack/' + route, data=body,
                          headers={'Content-Type': 'application/json', 'Origin': self.base})
        try:
            with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=60) as response:
                raw = response.read(LIMIT + 1)
        except HTTPError as exc:
            raw = exc.read(LIMIT + 1)
            exc.close()
            try:
                error = json.loads(raw).get('error', 'Preview failed')
            except (ValueError, AttributeError):
                error = 'Preview service returned an error'
            raise ValueError(str(error)[:2000]) from None
        except (URLError, OSError, TimeoutError):
            raise ValueError('Start the local MCQ webapp and STACK API to preview / プレビューにはローカルのMCQ webappとSTACK APIを起動してください。') from None
        if len(raw) > LIMIT:
            raise ValueError('Preview response is too large')
        data = json.loads(raw)
        if not isinstance(data, dict) or not data.get('ok') or not isinstance(data.get('result'), dict):
            raise ValueError('Invalid preview response / プレビュー応答を確認できません。')
        return data['result']

    def render(self, definition, seed, lang):
        if type(seed) is not int or not 1 <= seed <= 2147483647 or lang not in {'ja','en','fr','it','de','pt','zh','ko','ru','sv','es'}:
            raise ValueError('Invalid seed or language')
        payload = dict(questionDefinition=definition, seed=seed, lang=lang)
        result = self.call('preview', payload)
        if result.get('isinteractive') or result.get('iframes'):
            raise ValueError('Preview this interactive question in Moodle / この対話型問題はMoodleで確認してください。')
        if not isinstance(result.get('questionrender'), str):
            raise ValueError('No question rendering returned')
        payload = dict(payload, questionDefinition=result.pop('previewDefinition', definition))
        now = time.monotonic()
        self.sessions = {k: v for k, v in self.sessions.items() if now - v[0] < 1800}
        while len(self.sessions) >= 8:
            del self.sessions[next(iter(self.sessions))]
        token = uuid.uuid4().hex
        self.sessions[token] = (now, payload)
        result['practiceToken'] = token
        return result

    def grade(self, token, answers):
        session = self.sessions.get(token)
        if not session or time.monotonic() - session[0] >= 1800:
            raise ValueError('Preview expired; render again / プレビューを再表示してください。')
        if not isinstance(answers, dict) or len(answers) > 500 or any(not isinstance(k, str) or not isinstance(v, str) for k, v in answers.items()):
            raise ValueError('Invalid answers')
        return self.call('grade', dict(session[1], answers=answers))
