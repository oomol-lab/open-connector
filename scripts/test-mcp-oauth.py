#!/usr/bin/env python3
"""MCP OAuth integration checks. Never prints credentials or response bodies.

MCP_TEST_ORIGIN defaults to http://localhost:8787.
Set MCP_TEST_ADMIN_TOKEN or MCP_TEST_ADMIN_TOKEN_FILE. For local use only,
MCP_TEST_ADMIN_TOKEN defaults to test-admin-token. HTTPS uses normal trust and
HTTPS_PROXY/HTTP_PROXY via urllib. No authorization callback is followed.
"""
import base64
import hashlib
import html.parser
import http.cookies
import json
import os
from pathlib import Path
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request

ORIGIN = os.environ.get('MCP_TEST_ORIGIN', 'http://localhost:8787').rstrip('/')
REDIRECT = 'https://chatgpt.com/connector_platform/oauth_redirect'
TAG = 'OAuth Integration Test ' + secrets.token_hex(5)
SCOPE = 'mcp:access offline_access'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

class Session:
    def __init__(self):
        self.cookies = {}
        self.opener = urllib.request.build_opener(NoRedirect())
    def request(self, path, method='GET', data=None, token=None, form=False, origin=False, extra=None):
        url = urllib.parse.urljoin(ORIGIN + '/', path)
        if urllib.parse.urlsplit(url).netloc != urllib.parse.urlsplit(ORIGIN).netloc:
            raise AssertionError('Refusing to request an external URL')
        headers = {"User-Agent": "Mozilla/5.0 OpenConnectorOAuthTest/1.0", **(extra or {})}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        if origin:
            headers['Origin'] = ORIGIN
        if self.cookies:
            headers['Cookie'] = '; '.join(k + '=' + v for k, v in self.cookies.items())
        if data is not None:
            if form:
                data = urllib.parse.urlencode(data).encode()
                headers['Content-Type'] = 'application/x-www-form-urlencoded'
            else:
                data = json.dumps(data).encode()
                headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            response = self.opener.open(req, timeout=90)
        except urllib.error.HTTPError as err:
            response = err
        raw = response.read()
        for value in response.headers.get_all('Set-Cookie', []):
            cookie = http.cookies.SimpleCookie()
            cookie.load(value)
            self.cookies.update({k: v.value for k, v in cookie.items()})
        try:
            body = json.loads(raw)
        except (ValueError, UnicodeError):
            body = raw.decode('utf-8', 'replace')
        return response.status, response.headers, body

class HandleParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.handle = None
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'input' and attrs.get('name') == 'handle':
            self.handle = attrs.get('value')

def check(condition, label):
    if not condition:
        raise AssertionError(label)
    print('PASS ' + label, flush=True)

class Suite:
    def __init__(self, admin):
        self.admin = admin
        self.http = Session()
        self.created = set()
        self.client = None
        self.rpc_id = 0
    def tokens(self):
        status, _, body = self.http.request('/api/runtime-tokens', token=self.admin)
        if status != 200 or not isinstance(body, list):
            raise AssertionError('Cannot list runtime tokens')
        for item in body:
            if TAG in item.get('name', ''):
                self.created.add(item['id'])
        return body
    def cleanup(self):
        try:
            self.tokens()
        except Exception:
            pass
        failures = 0
        for token_id in self.created:
            try:
                status, _, _ = self.http.request('/api/runtime-tokens/' + urllib.parse.quote(token_id), method='DELETE', token=self.admin)
                if status not in (200, 404):
                    failures += 1
            except Exception:
                failures += 1
        print(('FAIL' if failures else 'PASS') + ' cleanup of test runtime tokens', flush=True)
        try:
            status, _, _ = self.http.request('/v1/actions')
            if status != 401:
                print('FAIL anonymous runtime API remains protected after cleanup', flush=True)
                failures += 1
            else:
                print('PASS anonymous runtime API remains protected after cleanup', flush=True)
        except Exception:
            print('FAIL could not verify runtime protection after cleanup', flush=True)
            failures += 1
        return not failures
    def start(self, redirect=REDIRECT):
        verifier = secrets.token_urlsafe(48)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
        state = secrets.token_urlsafe(20)
        params = {'response_type': 'code', 'client_id': self.client, 'redirect_uri': redirect,
                  'scope': SCOPE, 'resource': ORIGIN + '/mcp', 'state': state,
                  'code_challenge': challenge, 'code_challenge_method': 'S256'}
        browser = Session()
        status, headers, page = browser.request('/oauth/mcp/authorize?' + urllib.parse.urlencode(params))
        parser = HandleParser()
        if isinstance(page, str):
            parser.feed(page)
        if status == 200 and parser.handle:
            check(headers.get('Referrer-Policy') == 'same-origin', 'consent referrer policy preserves browser POST origin')
            callback = urllib.parse.urlsplit(redirect)
            callback_origin = callback.scheme + '://' + callback.netloc
            check(callback_origin in headers.get('Content-Security-Policy', ''), 'consent CSP permits validated callback redirect')
        return browser, verifier, state, status, headers, parser.handle
    def consent(self, admin=None, origin=True, decision='approve'):
        browser, verifier, state, status, headers, handle = self.start()
        check(status == 200 and handle is not None, 'consent page and browser handle')
        check('frame-ancestors' in headers.get('Content-Security-Policy', ''), 'consent framing protection')
        data = {'handle': handle, 'decision': decision, 'admin_token': self.admin if admin is None else admin}
        status, headers, body = browser.request('/oauth/mcp/authorize', method='POST', data=data, form=True, origin=origin)
        self.tokens()
        return status, headers, body, verifier, state
    def authorize(self):
        status, headers, _, verifier, state = self.consent()
        check(status in (302, 303), 'explicit administrator approval redirects')
        location = urllib.parse.urlsplit(headers.get('Location', ''))
        check(location.scheme + '://' + location.netloc + location.path == REDIRECT, 'registered callback exact match')
        query = urllib.parse.parse_qs(location.query)
        check(query.get('state') == [state] and query.get('iss') == [ORIGIN], 'callback state and issuer')
        check(bool(query.get('code')), 'authorization code issued')
        return query['code'][0], verifier
    def exchange(self, code, verifier, resource=None):
        return self.http.request('/oauth/mcp/token', method='POST', form=True, data={
            'grant_type': 'authorization_code', 'client_id': self.client, 'redirect_uri': REDIRECT,
            'code': code, 'code_verifier': verifier, 'resource': resource or ORIGIN + '/mcp'})
    def refresh(self, refresh_token):
        return self.http.request('/oauth/mcp/token', method='POST', form=True, data={
            'grant_type': 'refresh_token', 'client_id': self.client, 'refresh_token': refresh_token,
            'resource': ORIGIN + '/mcp'})
    def rpc(self, token, method, params=None):
        self.rpc_id += 1
        status, headers, body = self.http.request('/mcp', method='POST', token=token,
            data={'jsonrpc': '2.0', 'id': self.rpc_id, 'method': method, 'params': params or {}},
            extra={'Accept': 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-03-26'})
        if isinstance(body, str) and 'text/event-stream' in headers.get('Content-Type', ''):
            items = [line[5:].strip() for line in body.splitlines() if line.startswith('data:')]
            for item in items:
                try:
                    candidate = json.loads(item)
                    if candidate.get('id') == self.rpc_id:
                        body = candidate
                        break
                except ValueError:
                    pass
        return status, body
    def initialize(self, token):
        status, body = self.rpc(token, 'initialize', {'protocolVersion': '2025-03-26', 'capabilities': {}, 'clientInfo': {'name': TAG, 'version': '1'}})
        check(status == 200 and isinstance(body, dict) and 'result' in body, 'MCP initialize with token')
    def run(self):
        self.tokens()
        status, _, _ = self.http.request('/v1/actions')
        check(status == 401, 'anonymous runtime API protected before test tokens')
        status, headers, body = self.http.request('/.well-known/oauth-protected-resource')
        check(status == 200 and isinstance(body, dict) and body.get('resource') == ORIGIN + '/mcp', 'protected resource discovery')
        check(body.get('authorization_servers') == [ORIGIN], 'canonical authorization issuer')
        status, _, path_metadata = self.http.request('/.well-known/oauth-protected-resource/mcp')
        check(status == 200 and isinstance(path_metadata, dict) and path_metadata.get('resource') == ORIGIN + '/mcp' and path_metadata.get('authorization_servers') == [ORIGIN], 'path-specific protected resource discovery')
        status, _, metadata = self.http.request('/.well-known/oauth-authorization-server')
        check(status == 200 and isinstance(metadata, dict) and metadata.get('issuer') == ORIGIN, 'authorization server discovery')
        check('S256' in metadata.get('code_challenge_methods_supported', []), 'PKCE S256 advertised')
        check(metadata.get('client_id_metadata_document_supported') is True, 'CIMD support advertised')
        status, headers, _ = self.http.request('/mcp', method='POST', data={'jsonrpc': '2.0', 'id': 1, 'method': 'tools/list'})
        check(status == 401 and 'resource_metadata=' in headers.get('WWW-Authenticate', ''), 'unauthenticated MCP discovery challenge')
        status, _, client = self.http.request('/oauth/mcp/register', method='POST', data={
            'client_name': TAG, 'redirect_uris': [REDIRECT], 'grant_types': ['authorization_code', 'refresh_token'],
            'response_types': ['code'], 'token_endpoint_auth_method': 'none'})
        check(status in (200, 201) and isinstance(client, dict) and bool(client.get('client_id')), 'public client registration')
        self.client = client['client_id']
        _, _, _, status, _, _ = self.start('https://example.invalid/forbidden')
        check(status == 400, 'unregistered redirect rejected')
        for label, admin, origin in [('missing administrator token', '', True), ('incorrect administrator token', 'wrong-' + secrets.token_hex(8), True), ('missing Origin CSRF protection', self.admin, False)]:
            status, _, _, _, _ = self.consent(admin=admin, origin=origin)
            check(status in (400, 401, 403), label + ' rejected')
        _, _, _, status, _, handle = self.start()
        check(status == 200 and bool(handle), 'browser-bound consent transaction created')
        status, _, _ = Session().request('/oauth/mcp/authorize', method='POST', form=True, origin=True, data={
            'handle': handle, 'decision': 'approve', 'admin_token': self.admin})
        check(status in (400, 401, 403), 'consent handle rejected in a different browser')
        self.tokens()
        status, headers, _, _, state = self.consent(decision='deny')
        denied = urllib.parse.parse_qs(urllib.parse.urlsplit(headers.get('Location', '')).query)
        check(status in (302, 303) and denied.get('error') == ['access_denied'] and denied.get('state') == [state] and denied.get('iss') == [ORIGIN], 'denial callback preserves state and issuer')
        code, verifier = self.authorize()
        status, _, body = self.exchange(code, verifier, resource=ORIGIN + '/wrong-resource')
        check(status == 400 and isinstance(body, dict) and body.get('error') == 'invalid_target', 'incorrect resource rejected at code exchange')
        code, verifier = self.authorize()
        status, _, body = self.exchange(code, secrets.token_urlsafe(48))
        check(status == 400 and isinstance(body, dict) and body.get('error') == 'invalid_grant', 'incorrect PKCE verifier rejected')
        code, verifier = self.authorize()
        status, _, body = self.exchange(code, verifier)
        check(status == 200 and bool(body.get('access_token')) and bool(body.get('refresh_token')), 'authorization code exchange')
        access, refresh = body['access_token'], body['refresh_token']
        status, _, body = self.exchange(code, verifier)
        check(status == 400 and body.get('error') == 'invalid_grant', 'authorization code replay rejected')
        status, _ = self.rpc(access, 'tools/list')
        check(status == 401, 'authorization code replay revokes issued grant')
        code, verifier = self.authorize()
        status, _, body = self.exchange(code, verifier)
        check(status == 200 and bool(body.get('access_token')) and bool(body.get('refresh_token')), 'fresh authorization after replay revocation')
        access, refresh = body['access_token'], body['refresh_token']
        self.initialize(access)
        status, body = self.rpc(access, 'tools/list')
        check(status == 200 and any(x.get('name') == 'search_actions' for x in body.get('result', {}).get('tools', [])), 'MCP tools list')
        status, body = self.rpc(access, 'tools/call', {'name': 'search_actions', 'arguments': {'query': 'hackernews', 'limit': 1}})
        check(status == 200 and 'result' in body and not body['result'].get('isError'), 'read-only action search')
        status, _, _ = self.http.request('/api/runtime-tokens', token=access)
        check(status in (401, 403), 'OAuth token cannot administer runtime tokens')
        status, _, _ = self.http.request('/v1/actions', token=access)
        check(status == 401, 'OAuth token cannot access runtime API outside MCP')
        status, _, body = self.refresh(refresh)
        check(status == 200 and bool(body.get('access_token')), 'refresh token exchange')
        access, refresh = body['access_token'], body.get('refresh_token', refresh)
        revocation = metadata.get('revocation_endpoint')
        if revocation:
            status, _, _ = self.http.request(revocation, method='POST', form=True, data={'token': access, 'token_type_hint': 'access_token', 'client_id': self.client})
            check(status == 200, 'OAuth access token revocation endpoint')
            status, _ = self.rpc(access, 'tools/list')
            check(status == 401, 'revoked OAuth access token rejected')
            status, _, body = self.refresh(refresh)
            check(status == 200 and bool(body.get('access_token')), 'refresh after access-only revocation')
            access, refresh = body['access_token'], body.get('refresh_token', refresh)
        backing = [x for x in self.tokens() if TAG in x.get('name', '')]
        check(bool(backing), 'dedicated OAuth backing runtime tokens visible')
        for item in backing:
            status, _, _ = self.http.request('/api/runtime-tokens/' + item['id'], method='DELETE', token=self.admin)
            check(status == 200, 'backing runtime token revoked')
        status, _ = self.rpc(access, 'tools/list')
        check(status == 401, 'backing revocation immediately denies MCP')
        status, _, body = self.refresh(refresh)
        check(status == 400 and body.get('error') == 'invalid_grant', 'backing revocation denies refresh')
        status, _, legacy = self.http.request('/api/runtime-tokens', method='POST', token=self.admin, data={
            'name': TAG + ' Legacy', 'allowedActions': ['*'], 'blockedActions': [], 'allowedProxies': [], 'allowedConnections': []})
        check(status == 200 and bool(legacy.get('token')), 'legacy runtime token creation')
        self.created.add(legacy['record']['id'])
        self.initialize(legacy['token'])
        print('PASS all MCP OAuth integration checks', flush=True)

def main():
    token_file = os.environ.get('MCP_TEST_ADMIN_TOKEN_FILE')
    admin = Path(token_file).read_text().strip() if token_file else os.environ.get('MCP_TEST_ADMIN_TOKEN')
    if not admin:
        if urllib.parse.urlsplit(ORIGIN).hostname in ('localhost', '127.0.0.1', '::1'):
            admin = 'test-admin-token'
        else:
            print('FAIL an administrator token environment variable or file is required', file=sys.stderr)
            return 2
    suite = Suite(admin)
    success = False
    try:
        suite.run()
        success = True
    except AssertionError as err:
        print('FAIL ' + str(err), file=sys.stderr)
    except Exception as err:
        # Exception messages can contain request URLs or bodies; report only type.
        print('FAIL unexpected transport/test error (' + type(err).__name__ + ')', file=sys.stderr)
    finally:
        clean = suite.cleanup()
    return 0 if success and clean else 1

if __name__ == '__main__':
    sys.exit(main())
