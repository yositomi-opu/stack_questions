"""Terminal language, independent of the saved editor UI language."""
import locale
import os
import platform
import subprocess

def console_language():
    for name in ('LC_ALL','LC_MESSAGES','LANG'):
        value=os.environ.get(name,'').strip()
        if value:return 'ja' if value.lower().startswith('ja') else 'en'
    try:
        value=locale.getlocale()[0]
        if value:return 'ja' if value.lower().startswith('ja') else 'en'
    except (ValueError,TypeError):pass
    if platform.system()=='Darwin':
        try:
            result=subprocess.run(['defaults','read','-g','AppleLocale'],capture_output=True,text=True,timeout=3,check=False)
            if result.returncode==0:return 'ja' if result.stdout.lower().startswith('ja') else 'en'
        except (OSError,subprocess.TimeoutExpired):pass
    return 'en'

def console_text(ja,en):
    return ja if console_language()=='ja' else en
