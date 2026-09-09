#!/usr/bin/env python3
"""Fold the prior-pitch history from SpotsNow_TierA_DraftQueue.xlsx into
vc-fund-data.js. These are 68 VCs Cam ALREADY pitched; the valuable signal is
the far-right 'Notes / Flags' column - why they passed, the objection, the real
partner + email, and the status. The email/opener columns are the VC-partner
program and are IGNORED per Cam.

Only fills genuine GAPS: 32 of these funds already carry prior-pitch context
(Pass reason / They said / Re-approach) from an earlier ingest, so we skip those
and only enrich the ~35 that are missing it, plus create the 1 new fund
(newfundcap). Never clobbers existing people, ctx, stage, or warmth.
"""
import sys, re, json
sys.path.insert(0, '/private/tmp/claude-501/-Users-campbell-Desktop-Cursor-Work-Newsletter-page/c167016d-629e-4d2b-b5d4-3672fb69afc7/scratchpad/pylib')
import openpyxl

XLSX = '/Users/campbell/Desktop/SpotsNow_TierA_DraftQueue.xlsx'
DATA = 'vc-fund-data.js'
STOP = {'ventures','venture','capital','partners','partner','fund','funds','vc','the','group','company','llc','lp','co','management','holdings','collective'}
PRIOR_LABELS = {'pass reason','they said','re-approach','prior pitch','pitched as','last contact'}

def norm(s):
    s = re.sub(r'\([^)]*\)', ' ', s or ''); s = re.sub(r'[^a-z0-9 ]', ' ', s.lower())
    return ' '.join(w for w in s.split() if w and w not in STOP)
def slug(s): return re.sub(r'[^a-z0-9]+', '-', (s or '').lower()).strip('-')
def firstn(s): return (s or '').strip().split()[0].lower() if (s or '').strip() else ''

def clean_note(n):
    """Strip the opener-bracket prefix, gmail-link noise, mojibake and empty
    'DEAL NOTES:  |' stubs; keep the human-readable history."""
    n = n or ''
    n = re.sub(r'^\[[^\]]*OPENER[^\]]*\]\s*', '', n)          # [GENERIC/SPECIFIC OPENER ...]
    n = n.replace('ð\x9f\x94\x25', '').replace('ð¥', '')       # busted fire emoji
    n = re.sub(r'[\U0001F300-\U0001FAFF]', '', n)              # any stray emoji
    n = re.sub(r'DEAL NOTES:\s*\|', '', n)                     # empty deal-notes stub
    n = re.sub(r'\s*\|\s*', ' | ', n)
    n = re.sub(r'\s{2,}', ' ', n).strip(' |').strip()
    return n

# Best-effort objection extraction for a quick-scan 'Pass reason' tag.
OBJ = [
    (r'concerns? about tam|tam\b', 'TAM concerns'),
    (r"did.?n.?t think we had pmf|no pmf|lack.*pmf", 'Doubted PMF'),
    (r'market siz', 'Market sizing questions'),
    (r'more traction|need.*traction', 'Wanted more traction'),
    (r'monetization|revenue', 'Wanted monetization/revenue proof'),
    (r'too early', 'Too early for them'),
    (r'timing', 'Timing'),
    (r'consumer facing not saas|not saas', 'Wanted SaaS, not consumer'),
    (r'not relevant|not their area|off.?thesis', 'Out of thesis'),
    (r'not enthusiastic.*category|category', 'Not excited by the category'),
    (r'missing the creator economy|starting at podcasts', 'Worried we start at podcasts, miss creator economy'),
    (r'fund 1 is full|little allocation|full\b', 'No allocation / fund full'),
    (r'mandate', 'Mandate mismatch'),
]
def pass_reason(note):
    low = note.lower()
    for pat, label in OBJ:
        if re.search(pat, low): return label
    return ''

WARMTH_MAP = {'warm':'warm', 'lukewarm':'cool', 'scheduled (hot)':'warm'}
def stage_seed(warmth):
    w = (warmth or '').lower()
    if w.startswith('passed') or w == 'too early': return 'future'
    return None

ws = openpyxl.load_workbook(XLSX, data_only=True)['Draft Queue']
src = open(DATA).read(); m = re.search(r'window\.SN_DATA\s*=\s*', src)
doc = json.loads(src[m.end():].rstrip().rstrip(';')); funds = doc['funds']
bn = {}
for f in funds: bn.setdefault(norm(f['name']), f)
have_ids = {f['id'] for f in funds}

st = dict(gap_enriched=0, skipped_have=0, new=0, emails_added=0, people_added=0, warmth_set=0, stage_set=0, passreason=0)

for r in ws.iter_rows(min_row=2, values_only=True):
    if not r or not r[1]: continue
    name, contact, email, warmth, last, notes = r[1], r[2], r[3], r[5], r[6], r[11]
    note = clean_note(str(notes) if notes else '')
    f = bn.get(norm(name))

    if f is None:  # new fund (newfundcap)
        fid = 'ta-' + slug(name)
        while fid in have_ids: fid += '-x'
        ctx = [['Prior pitch', note]] if note else []
        pr = pass_reason(note)
        if pr: ctx.insert(0, ['Pass reason', pr])
        people = []
        if email:
            nm = contact if (contact and '[' not in contact) else email.split('@')[0].title()
            people.append({'n': nm, 't': 'Partner', 'email': email})
        fund = {'id': fid, 'name': name, 'type': 'Seed', 'region': '—', 'check': None,
                'sectors': [], 'tier': 'Previously pitched (Tier A)', 'looking': '',
                'people': people, 'ctx': ctx}
        s = stage_seed(warmth)
        if s: fund['stage0'] = s
        if (warmth or '').lower() in WARMTH_MAP: fund['warmth0'] = WARMTH_MAP[warmth.lower()]
        funds.append(fund); have_ids.add(fid); bn[norm(name)] = fund
        st['new'] += 1
        continue

    # existing fund: skip if it already carries prior-pitch context
    labels = {(c[0].lower() if isinstance(c, list) and c and isinstance(c[0], str) else '') for c in f.get('ctx', [])}
    if labels & PRIOR_LABELS:
        st['skipped_have'] += 1
    else:
        f.setdefault('ctx', [])
        pr = pass_reason(note)
        if pr:
            f['ctx'].insert(0, ['Pass reason', pr]); st['passreason'] += 1
        if note:
            f['ctx'].append(['Prior pitch', note])
        if last:
            f['ctx'].append(['Last contact', str(last)[:10]])
        st['gap_enriched'] += 1
        # warmth / stage seeds only when unset
        if not f.get('warmth0') and (warmth or '').lower() in WARMTH_MAP:
            f['warmth0'] = WARMTH_MAP[warmth.lower()]; st['warmth_set'] += 1
        s = stage_seed(warmth)
        if s and not f.get('stage0'):
            f['stage0'] = s; st['stage_set'] += 1

    # contact enrichment applies to gap funds too (not the already-have set,
    # which came from the same source and is complete)
    if email and not (labels & PRIOR_LABELS):
        emails = {(p.get('email') or '').lower() for p in f.get('people', [])}
        if email.lower() not in emails:
            fn = firstn(contact) if (contact and '[' not in contact) else ''
            match = next((p for p in f.get('people', []) if fn and firstn(p.get('n','')) == fn), None)
            if match and not match.get('email'):
                match['email'] = email; st['emails_added'] += 1
            elif fn:
                f.setdefault('people', []).append({'n': contact, 't': 'Partner', 'email': email}); st['people_added'] += 1
            else:
                blank = next((p for p in f.get('people', []) if not p.get('email')), None)
                if blank: blank['email'] = email; st['emails_added'] += 1

print(json.dumps(st, indent=1))
print('funds now:', len(funds))
open(DATA, 'w').write('window.SN_DATA = ' + json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + ';\n')
