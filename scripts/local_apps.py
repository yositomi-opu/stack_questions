#!/usr/bin/env python3
"""Manage authoring apps together without stopping unrelated listeners."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import platform
import signal
import subprocess
import sys
import time
from urllib.parse import urlencode
from urllib.request import build_opener, ProxyHandler

ROOT=Path(__file__).resolve().parents[1]
STATE=ROOT/'app/prt-template-webapp/.local/services'
APPS=(('prt-template-webapp','PRT_WEBAPP_PORT',4175),('stack-edit-webapp','STACK_EDIT_PORT',4176),('parsons-webapp','PARSONS_WEBAPP_PORT',4177))
# Keep optional editors available in checkouts which already contain them.
if (ROOT/'app/tf-webapp/server.py').is_file():APPS+=(('tf-webapp','TF_WEBAPP_PORT',4178),)
_spec=importlib.util.spec_from_file_location('authoring_console',ROOT/'scripts/console_locale.py')
_console=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_console)
t=_console.console_text


def health(port):
    try:
        with build_opener(ProxyHandler({})).open(f'http://127.0.0.1:{port}/api/health',timeout=1) as response:
            return json.loads(response.read(4096))
    except (OSError,ValueError):return None


def start_app(app,port,preview,api):
    import socket
    live=health(port)
    if live:
        if live.get('app')!=app:raise ValueError(t(f'ポート{port}は別のアプリが使用しています',f'Port {port} belongs to another application'))
        print(t(f'{app}: 起動済み http://127.0.0.1:{port}/',f'{app}: already running http://127.0.0.1:{port}/'));return
    with socket.socket() as sock:
        sock.settimeout(.5)
        if sock.connect_ex(('127.0.0.1',port))==0:raise ValueError(t(f'ポート{port}は使用中です。既存のプロセスは変更しません',f'Port {port} is occupied; no process was replaced'))
    STATE.mkdir(parents=True,exist_ok=True)
    options={'start_new_session':True} if os.name!='nt' else {'creationflags':subprocess.CREATE_NEW_PROCESS_GROUP|subprocess.DETACHED_PROCESS}
    with (STATE/(app+'.log')).open('ab') as log:
        p=subprocess.Popen([sys.executable,str(ROOT/'app'/app/'server.py'),'--port',str(port),'--preview-server',preview,'--stack-api',api],cwd=ROOT,stdin=subprocess.DEVNULL,stdout=log,stderr=log,**options)
    for _ in range(100):
        if p.poll() is not None:raise ValueError(t(f'{app}が終了しました。ローカルのサービスログを確認してください',f'{app} exited; see its local service log'))
        live=health(port)
        if live and live.get('app')==app and live.get('pid')==p.pid:
            (STATE/(app+'.json')).write_text(json.dumps({'pid':p.pid,'port':port}));print(f'{app}: http://127.0.0.1:{port}/');return
        time.sleep(.1)
    raise ValueError(t(f'{app}の起動を確認できませんでした。既存のサービスは停止していません',f'{app} did not become ready; no existing service was stopped'))


def stop_app(app):
    path=STATE/(app+'.json')
    if not path.exists():print(app+': '+t('管理対象のプロセスなし','no managed process'));return
    record=json.loads(path.read_text());live=health(record['port'])
    if live is None:
        path.unlink();print(app+': '+t('停止済み','not listening'));return
    if live.get('app')!=app or live.get('pid')!=record['pid']:raise ValueError(t('プロセスが変わっているため停止しません: ','Process identity changed; refusing to stop ')+app)
    os.kill(record['pid'],signal.SIGTERM)
    for _ in range(100):
        if health(record['port']) is None:path.unlink();print(app+': '+t('停止しました','stopped'));return
        time.sleep(.1)
    raise ValueError(app+t('が停止しませんでした。強制終了は行いません',' did not stop; no forced kill performed'))


def app_ports():
    result=[]
    for app,env,default in APPS:
        try:port=int(os.environ.get(env,default))
        except ValueError:raise ValueError(t(f'{env}には整数のポートを指定してください',f'{env} must be an integer port')) from None
        if not 1024<=port<=65535:raise ValueError(t(f'{env}には1024～65535を指定してください',f'{env} must be between 1024 and 65535'))
        result.append((app,port,default))
    return result


def authoring_url(config,ports):
    keys={'prt-template-webapp':'prt','stack-edit-webapp':'stack','parsons-webapp':'parsons','tf-webapp':'tf'}
    query={keys[app]:str(port) for app,port,default in ports if port!=default or app=='tf-webapp'}
    base=f'http://127.0.0.1:{config["web_port"]}/authoring.html'
    return base+('?' + urlencode(query) if query else '')


def show_authoring_index(config,ports,*,offer_open=True):
    url=authoring_url(config,ports)
    print('\n'+t('作問アプリ一覧（種類を選んで開く）: ','Authoring apps (choose a question type): ')+url,flush=True)
    if not offer_open or platform.system()!='Darwin' or not sys.stdin.isatty() or not sys.stdout.isatty():return
    try:answer=input(t('作問アプリ一覧をブラウザーで開きますか？ [y/N] ','Open the authoring index in your browser? [y/N] ')).strip().lower()
    except (EOFError,KeyboardInterrupt):print();return
    if answer not in ('y','yes','はい'):return
    try:
        result=subprocess.run(['open',url],check=False,timeout=15)
        if result.returncode:raise OSError(t('openコマンドが失敗しました','open command failed'))
    except (OSError,subprocess.TimeoutExpired) as error:
        print(t('ブラウザーを開けませんでした。上のURLから開いてください: ','Could not open the browser; use the URL above: ')+str(error))


def manager_config(extra):
    spec=importlib.util.spec_from_file_location('mcq_manager',ROOT/'scripts/mcq-webapp.py');manager=importlib.util.module_from_spec(spec);spec.loader.exec_module(manager)
    parser=argparse.ArgumentParser(add_help=False)
    options={'--host':'MCQ_WEBAPP_HOST','--port':'MCQ_WEBAPP_PORT','--locale':'MCQ_WEBAPP_LOCALE','--stack-api-port':'STACK_API_PORT','--include-base-url':'INCLUDE_BASE_URL'}
    for flag in options:parser.add_argument(flag)
    args=parser.parse_args(extra)
    for flag,env in options.items():
        value=getattr(args,flag[2:].replace('-','_'))
        if value is not None:os.environ[env]=value
    return manager,manager.runtime_config()


def main(args):
    if not args or args[0] not in ('setup','start','stop','restart','status'):raise ValueError('Use setup/start/stop/restart/status')
    action,*extra=args
    manager,config=manager_config(extra)
    ports=app_ports()
    all_ports=[config['web_port'],config['stack_api_port']]+[port for _,port,_ in ports]
    if len(set(all_ports))!=len(all_ports):raise ValueError(t('アプリとSTACK APIには別々のポートを指定してください','Apps and STACK API must use distinct ports'))
    if action in ('stop','restart'):
        print('\n==> '+t('作問アプリを停止','Stop authoring apps'),flush=True)
        for app,_,_ in reversed(APPS):stop_app(app)
    mcq_action='stop' if action=='restart' else action
    child_env=dict(os.environ,AUTHORING_APPS_GROUP='1')
    result=subprocess.run([sys.executable,str(ROOT/'scripts/mcq-webapp.py'),mcq_action,*extra],env=child_env)
    if result.returncode and action!='status':return result.returncode
    if action=='restart':
        result=subprocess.run([sys.executable,str(ROOT/'scripts/mcq-webapp.py'),'start',*extra],env=child_env)
        if result.returncode:return result.returncode
    # Setup may have persisted new settings; reload the effective configuration.
    config=manager.runtime_config()
    for app,port,_ in ports:
        if action in ('setup','start','restart'):start_app(app,port,manager.local_web_url(config),config['stack_api_url'])
        elif action=='status':print(app+': '+str(health(port) or t('停止中','not listening')))
    if action in ('setup','start','restart','status'):show_authoring_index(config,ports,offer_open=action!='status')
    return result.returncode


if __name__=='__main__':
    try:sys.exit(main(sys.argv[1:]))
    except (ValueError,OSError,RuntimeError) as error:sys.exit(str(error))
