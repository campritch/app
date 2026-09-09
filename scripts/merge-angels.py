#!/usr/bin/env python3
"""Merge the VetVerifi/PPindoria Angel Network into vc-fund-data.js.
Header row 6: First, Last, Company, Job Title, LinkedIn, Areas of Interest,
What's Important, [opt-out]. Each angel -> a fund-shaped record (type 'Angel',
named after the person). Respect the sheet's "don't spam everyone" note by
adding ONLY angels whose stated interests actually hit SpotsNow's surfaces;
respect the opt-out column; dedupe against angels/people already present.
Left ungraded on purpose - the AI 'Grade the funds' brain scores on demand.
"""
import sys, re, json, unicodedata
sys.path.insert(0, '/private/tmp/claude-501/-Users-campbell-Desktop-Cursor-Work-Newsletter-page/c167016d-629e-4d2b-b5d4-3672fb69afc7/scratchpad/pylib')
import openpyxl

XLSX = '/Users/campbell/Downloads/Copy of VetVerifi - PPindoria - Angel Network.xlsx'
DATA = 'vc-fund-data.js'

def slug(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')
def cond(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]', '', s)
def cleanli(s):
    s = (s or '').strip()
    return s if '/in/' in s else ''

# Core SpotsNow surfaces - tighter than the broad net (drop bare AI/SaaS/enterprise).
ONTHESIS = re.compile(
    r'marketplace|creator|\bmedia\b|entertain|podcast|advertis|adtech|ad tech|martech|'
    r'consumer|commerce|ecommerce|e-commerce|retail|\bbrand|content|social|gaming|\bgames?\b|'
    r'sports|music|influencer|d2c|dtc|network effect|two.?sided|streaming', re.I)

ws = openpyxl.load_workbook(XLSX, data_only=True)['Sheet1']
rows = [r for r in ws.iter_rows(values_only=True)]
hi = next(i for i, r in enumerate(rows) if r and str(r[0]).strip() == 'First Name')
data = [r for r in rows[hi+1:] if any(c not in (None, '') for c in r) and (r[0] or r[1])]

src = open(DATA).read()
m = re.search(r'window\.SN_DATA\s*=\s*', src)
doc = json.loads(src[m.end():].rstrip().rstrip(';'))
funds = doc['funds']
have_ids = {f['id'] for f in funds}
# existing angels/people index for dedupe: (condensed name) present as an Angel-type fund or as a person
angel_names = {cond(f['name']) for f in funds if (f.get('type') == 'Angel')}
person_names = set()
for f in funds:
    for p in f.get('people', []):
        if p.get('n'): person_names.add(cond(p['n']))

st = dict(considered=len(data), added=0, skip_offthesis=0, skip_optout=0, skip_dupe=0, skip_noname=0)

def g(r, i): return (str(r[i]).strip() if len(r) > i and r[i] else '')

for r in data:
    if g(r, 7):  # opt-out column populated = do not contact
        st['skip_optout'] += 1; continue
    first, last = g(r, 0), g(r, 1)
    name = (first + ' ' + last).strip()
    if len(name) < 3:
        st['skip_noname'] += 1; continue
    areas = g(r, 5); important = g(r, 6); company = g(r, 2); title = g(r, 3)
    if not ONTHESIS.search(areas):
        st['skip_offthesis'] += 1; continue
    cn = cond(name)
    if cn in angel_names or cn in person_names:
        st['skip_dupe'] += 1; continue
    fid = 'ang-' + slug(name)
    while fid in have_ids: fid += '-x'
    sectors = [p.strip() for p in re.split(r'[,;/]', areas) if p.strip()][:3]
    ctx = []
    if company: ctx.append(['Angel at', company + (f' · {title}' if title else '')])
    if important: ctx.append(['What they look for', important[:280]])
    ctx.append(['Source note', 'VetVerifi angel network (PPindoria)'])
    person = {'n': name, 't': title or 'Angel investor'}
    li = cleanli(g(r, 4))
    if li: person['li'] = li
    funds.append({
        'id': fid, 'name': name, 'type': 'Angel', 'region': '—', 'check': [10, 100],
        'sectors': sectors, 'tier': 'Angel network', 'looking': areas,
        'people': [person], 'ctx': ctx,
    })
    have_ids.add(fid); angel_names.add(cn)
    st['added'] += 1

print(json.dumps(st, indent=1))
print('funds now:', len(funds))
open(DATA, 'w').write('window.SN_DATA = ' + json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + ';\n')
