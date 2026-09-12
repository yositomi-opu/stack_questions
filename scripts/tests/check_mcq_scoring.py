"""Run the actual fvar template with native Maxima; verify ATCM 2022 §2.4."""
import math
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
maxima = shutil.which('maxima')
if not maxima:
    raise SystemExit('Native Maxima is required for this integration check')
code = (ROOT / 'mcq_template_fvar.mac').read_text()
setup = '''display2d:false$
load("stringproc")$
%__mcq_cw_delimiter:1000$ %__mcq_max_opts:10$ %__mcq_max_patterns:99$
%__mcq_max_cp:1$ %__mcq_max_wp:1$ %__mcq_CLbase:[]$ %__mcq_WLbase:[]$
%__mcq_nocorrect_id:990$ %__mcq_noidea_flag:991$ %__mcq_fbp:false$
%__mcq_nocorrecttrue:false$ %__mcq_nocorrectopt:false$ %__mcq_ssc:1$
%__mcq_lang(L,s):=second(first(L))$
'''
cases = []
for n in range(2, 7):
    for c in range(1, n+1):
        w = n-c
        for x in range(c+1):
            for y in range(w+1):
                for method in range(1,5):
                    den = c*w*(x+y)*(n-x-y)
                    expected = {1:x/(c+y),2:(x+w-y)/n,3:(x*(w-y)-(c-x)*y)/math.sqrt(den) if den>0 else 0,4:2*(x+w-y)/n-1}[method]
                    cases.append((c,w,x,y,method,1,False,expected))
# Disabling partial credit and explicitly selecting noidea both yield zero.
for method in range(1,5):
    cases += [(3,5,1,4,method,0,False,0), (3,5,0,0,method,1,True,0)]
lines = [setup]
for i,(c,w,x,y,method,ssc,noidea,expected) in enumerate(cases):
    answers = [10+j for j in range(x)] + [1001+j for j in range(y)]
    if noidea: answers=[991000]
    lines += [f'%__mcq_num_copts:{c}$ %__mcq_num_wopts:{w}$ %__mcq_scmethod:{method}$ %__mcq_ssc:{ssc}$',
              f'Cans1:{[10+j for j in range(c)]}$ ans1:{answers}$',code,
              f'if not is(abs(float(sc)-({expected!r}))<1.0e-9) then error("CASE {i}",sc)$']
# No correct ordinary options: avoid Jaccard 0/0 and define the degenerate phi case.
for method in range(1,5):
    for answers,expected in [([1],1),([1001],0),([991000],0)]:
        lines += [f'%__mcq_num_copts:0$ %__mcq_num_wopts:4$ %__mcq_scmethod:{method}$ %__mcq_ssc:1$ %__mcq_nocorrecttrue:true$ %__mcq_nocorrectopt:true$ Cans1:[1]$ ans1:{answers}$',code,
                  f'if not is(sc={expected}) then error("NONE CORRECT",sc)$']
lines += ['print("MCQ_SCORING_ALL_PASSED")$','quit()$']
with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp)/'scoring.mac'
    path.write_text('\n'.join(lines))
    result = subprocess.run([maxima,'--very-quiet','--batch-string',f'batchload("{path}")$'],text=True,capture_output=True,timeout=60)
    if 'MCQ_SCORING_ALL_PASSED' not in result.stdout or ' -- an error.' in result.stdout:
        raise SystemExit(result.stdout[-5000:]+result.stderr[-2000:])
print(f'Passed {len(cases)+12} full-template Maxima scoring cases, including negative scores and zero denominators.')
