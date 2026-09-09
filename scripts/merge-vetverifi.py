#!/usr/bin/env python3
"""Merge the VetVerifi / PPindoria partner-level fund list into vc-fund-data.js.

3,617 rows: Company, First, Last, Job Title, Type (Seed/Institution/Strategic),
Areas of Interest, What's Important. People-level, no check/geo/LinkedIn.

- Match firms to existing funds by normalized name -> add missing partners,
  backfill sectors + a thesis note where the fund has none.
- Create funds for genuinely new firms.
- Dedupe partners within a firm; skip junk company values.
Idempotent-ish: re-running re-checks and won't duplicate people/funds.
"""
import sys, re, json, unicodedata
sys.path.insert(0, '/private/tmp/claude-501/-Users-campbell-Desktop-Cursor-Work-Newsletter-page/c167016d-629e-4d2b-b5d4-3672fb69afc7/scratchpad/pylib')
import openpyxl

XLSX = '/Users/campbell/Downloads/Copy of VetVerifi - PPindoria - Fund List.xlsx'
DATA = 'vc-fund-data.js'
SRC_TAG = 'VetVerifi list (PPindoria)'

def slug(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

STOP = {'ventures','venture','capital','partners','partner','fund','funds','vc','the','group','company','llc','lp','co','management','holdings'}
def norm_org(s):
    s = re.sub(r'\([^)]*\)', ' ', s or '')
    s = re.sub(r'[^a-z0-9 ]', ' ', s.lower())
    return ' '.join(w for w in s.split() if w and w not in STOP)

TYPE_MAP = {'seed': 'Seed', 'institution': 'Institutional', 'strategic': 'Strategic'}

def clean_firm(s):
    s = (s or '').strip()
    s = re.sub(r'^[^A-Za-z0-9]+', '', s)          # strip leading punctuation ("/capital")
    if not re.search(r'[A-Za-z]', s): return ''   # drop pure-number codes ("212.0")
    if re.fullmatch(r'[\d.]+', s): return ''
    return s

def is_person(fn, ln):
    full = (fn + ' ' + ln).strip()
    if not full or len(full) < 3: return False
    return bool(re.search(r'[A-Za-z]', full))

wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb['Sheet1']
rows = [r for r in ws.iter_rows(min_row=2, values_only=True) if any(c not in (None, '') for c in r)]

# group rows by firm
firms = {}
for r in rows:
    firm = clean_firm(str(r[0]) if r[0] else '')
    if not firm: continue
    fn = (str(r[1]).strip() if len(r) > 1 and r[1] else '')
    ln = (str(r[2]).strip() if len(r) > 2 and r[2] else '')
    firms.setdefault(firm, []).append({
        'fn': fn, 'ln': ln,
        'title': (str(r[3]).strip() if len(r) > 3 and r[3] else ''),
        'type': (str(r[4]).strip() if len(r) > 4 and r[4] else ''),
        'areas': (str(r[5]).strip() if len(r) > 5 and r[5] else ''),
        'important': (str(r[6]).strip() if len(r) > 6 and r[6] else ''),
    })

src = open(DATA).read()
m = re.search(r'window\.SN_DATA\s*=\s*', src)
data = json.loads(src[m.end():].rstrip().rstrip(';'))
funds = data['funds']
by_norm = {}
for f in funds:
    by_norm.setdefault(norm_org(f['name']), f)

def sectors_from(areas):
    parts = [p.strip() for p in re.split(r'[,;/]', areas or '') if p.strip()]
    return parts[:3]

st = dict(matched=0, new=0, people_added=0, sectors_filled=0, notes_added=0, skipped_people=0)

for firm, people in firms.items():
    f = by_norm.get(norm_org(firm))
    typ_votes = [TYPE_MAP.get(p['type'].lower()) for p in people if p['type'].lower() in TYPE_MAP]
    ftype = typ_votes[0] if typ_votes else 'Seed'
    areas_all = next((p['areas'] for p in people if p['areas']), '')
    important = next((p['important'] for p in people if p['important']), '')

    if f is None:
        f = {'id': 'vv-' + slug(firm), 'name': firm, 'type': ftype, 'region': '—',
             'check': None, 'sectors': sectors_from(areas_all), 'tier': SRC_TAG,
             'looking': areas_all or '', 'people': [], 'ctx': []}
        while any(x['id'] == f['id'] for x in funds): f['id'] += '-x'
        if important:
            f['ctx'].append(['What they look for', important[:280]])
        funds.append(f); by_norm[norm_org(firm)] = f
        st['new'] += 1
    else:
        st['matched'] += 1
        if not f.get('sectors'):
            sec = sectors_from(areas_all)
            if sec: f['sectors'] = sec; st['sectors_filled'] += 1
        if not f.get('looking') and areas_all:
            f['looking'] = areas_all
        ctx = f.setdefault('ctx', [])
        labels = {c[0] for c in ctx}
        if important and 'What they look for' not in labels:
            ctx.append(['What they look for', important[:280]]); st['notes_added'] += 1

    # add partners, deduped by first+last within the fund
    existing = {slug(p.get('n', '')) for p in f.get('people', []) if p.get('n')}
    have_first = {slug(p.get('n', '').split()[0]) for p in f.get('people', []) if p.get('n')}
    for p in people:
        if not is_person(p['fn'], p['ln']):
            st['skipped_people'] += 1; continue
        full = (p['fn'] + ' ' + p['ln']).strip()
        sg = slug(full)
        if sg in existing: continue
        # replace a "needs name" placeholder if present
        ph = next((x for x in f['people'] if x.get('tbd')), None)
        person = {'n': full, 't': p['title'] or 'Partner'}
        if ph:
            f['people'].remove(ph)
        f['people'].append(person)
        existing.add(sg)
        st['people_added'] += 1

print(json.dumps(st, indent=1))
print('funds now:', len(funds))
open(DATA, 'w').write('window.SN_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
