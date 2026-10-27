#!/usr/bin/env python3
"""Manage authoring apps together without stopping unrelated listeners."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from urllib.request import build_opener,ProxyHandler

ROOT=Path(__file__).resolve().parents[1]
STATE=ROOT/'app/prt-template-webapp/.local/services'
APPS=(('prt-template-webapp','PRT_WEBAPP_PORT',4175),('stack-edit-webapp','STACK_EDIT_PORT',4176))


def health(port):
    try:
        with build_opener(ProxyHandler({})).open(f'http://127.0.0.1:{port}/api/health',timeout=1) as response:
            return json.loads(response.read(4096))
    except (OSError,ValueError):return None


def start_app(app,port,preview,api):
    import socket
    live=health(port)
    if live:
        if live.get('app')!=app:raise ValueError(f'Port {port} belongs to another application')
        print(f'{app}: running on {port}');return
    with socket.socket() as sock:
        sock.settimeout(.5)
        if sock.connect_ex(('127.0.0.1',port))==0:raise ValueError(f'Port {port} is occupied; no process was replaced')
    STATE.mkdir(parents=True,exist_ok=True)
    options={'start_new_session':True} if os.name!='nt' else {'creationflags':subprocess.CREATE_NEW_PROCESS_GROUP|subprocess.DETACHED_PROCESS}
    with (STATE/(app+'.log')).open('ab') as log:
        p=subprocess.Popen([sys.executable,str(ROOT/'app'/app/'server.py'),'--port',str(port),'--preview-server',preview,'--stack-api',api],cwd=ROOT,stdin=subprocess.DEVNULL,stdout=log,stderr=log,**options)
    for _ in range(100):
        if p.poll() is not None:raise ValueError(f'{app} exited; see its local service log')
        live=health(port)
        if live and live.get('app')==app and live.get('pid')==p.pid:
            (STATE/(app+'.json')).write_text(json.dumps({'pid':p.pid,'port':port}));print(f'{app}: http://127.0.0.1:{port}/');return
        time.sleep(.1)
    raise ValueError(f'{app} did not become ready; no existing service was stopped')


def stop_app(app):
    path=STATE/(app+'.json')
    if not path.exists():print(f'{app}: no managed process');return
    record=json.loads(path.read_text());live=health(record['port'])
    if live is None:
        path.unlink();print(f'{app}: not listening');return
    if live.get('app')!=app or live.get('pid')!=record['pid']:raise ValueError('Process identity changed; refusing to stop '+app)
    os.kill(record['pid'],signal.SIGTERM)
    for _ in range(100):
        if health(record['port']) is None:path.unlink();print(f'{app}: stopped');return
        time.sleep(.1)
    raise ValueError(app+' did not stop; no forced kill performed')


def main(args):
    if not args or args[0] not in ('setup','start','stop','restart','status'):raise ValueError('Use setup/start/stop/restart/status')
    action,*extra=args
    if action in ('stop','restart'):
        for app,_,_ in reversed(APPS):stop_app(app)
    mcq_action='stop' if action=='restart' else action
    result=subprocess.run([sys.executable,str(ROOT/'scripts/mcq-webapp.py'),mcq_action,*extra])
    if result.returncode and action!='status':return result.returncode
    if action=='restart':
        result=subprocess.run([sys.executable,str(ROOT/'scripts/mcq-webapp.py'),'start',*extra])
        if result.returncode:return result.returncode
    spec=importlib.util.spec_from_file_location('mcq_manager',ROOT/'scripts/mcq-webapp.py');manager=importlib.util.module_from_spec(spec);spec.loader.exec_module(manager)
    config=manager.runtime_config()
    for app,env,default in APPS:
        port=int(os.environ.get(env,default))
        if not 1024<=port<=65535:raise ValueError('Invalid app port')
        if action in ('setup','start','restart'):start_app(app,port,manager.local_web_url(config),config['stack_api_url'])
        elif action=='status':print(app+': '+str(health(port) or 'not listening'))
    return result.returncode


if __name__=='__main__':
    try:sys.exit(main(sys.argv[1:]))
    except (ValueError,OSError) as error:sys.exit(str(error))
