#!/usr/bin/env python3
"""Merge the Goliath (Austin Beveridge) investor/VC network into vc-fund-data.js.
Cols: Fund, Contact, Title, Email, Website, LinkedIn. 347 rows / 258 firms.
Match firms by normalized name -> add/enrich the contact (email + personal
LinkedIn + title) and backfill website; create funds for new firms. Dedupe
people by name; enrich an existing matching partner rather than duplicating.
"""
import sys, re, json, unicodedata
sys.path.insert(0, '/private/tmp/claude-501/-Users-campbell-Desktop-Cursor-Work-Newsletter-page/c167016d-629e-4d2b-b5d4-3672fb69afc7/scratchpad/pylib')
import openpyxl

XLSX = '/Users/campbell/Downloads/[Goliath - Investor _ VC Network.xlsx'
DATA = 'vc-fund-data.js'

def slug(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')
STOP = {'ventures','venture','capital','partners','partner','fund','funds','vc','the','group','company','llc','lp','co','management','holdings'}
def norm_org(s):
    s = re.sub(r'\([^)]*\)', ' ', s or '')
    s = re.sub(r'[^a-z0-9 ]', ' ', s.lower())
    return ' '.join(w for w in s.split() if w and w not in STOP)
def cleanweb(s):
    return re.sub(r'^https?://(www\.)?', '', (s or '').strip()).rstrip('/')
def cleanli(s):
    s = (s or '').strip()
    return s if '/in/' in s else ''

ws = openpyxl.load_workbook(XLSX, data_only=True)['Sheet1']
rows = [r for r in ws.iter_rows(min_row=2, values_only=True) if any(c not in (None, '') for c in r)]
firms = {}
for r in rows:
    fm = (str(r[0]).strip() if r[0] else '')
    if not fm: continue
    firms.setdefault(fm, []).append({
        'contact': (str(r[1]).strip() if len(r) > 1 and r[1] else ''),
        'title': (str(r[2]).strip() if len(r) > 2 and r[2] else ''),
        'email': (str(r[3]).strip() if len(r) > 3 and r[3] else ''),
        'web': cleanweb(str(r[4]) if len(r) > 4 and r[4] else ''),
        'li': cleanli(str(r[5]) if len(r) > 5 and r[5] else ''),
    })

src = open(DATA).read()
m = re.search(r'window\.SN_DATA\s*=\s*', src)
data = json.loads(src[m.end():].rstrip().rstrip(';'))
funds = data['funds']
by_norm = {}
for f in funds:
    by_norm.setdefault(norm_org(f['name']), f)

st = dict(matched=0, new=0, people_added=0, people_enriched=0, sites_filled=0)

for firm, contacts in firms.items():
    f = by_norm.get(norm_org(firm))
    web = next((c['web'] for c in contacts if c['web']), '')
    if f is None:
        f = {'id': 'gl-' + slug(firm), 'name': firm, 'type': 'Seed', 'region': '—',
             'check': None, 'sectors': [], 'tier': 'Goliath network (Austin Beveridge)',
             'looking': '', 'site': web, 'people': [], 'ctx': [['Source note', 'Goliath / Austin Beveridge network']]}
        while any(x['id'] == f['id'] for x in funds): f['id'] += '-x'
        funds.append(f); by_norm[norm_org(firm)] = f
        st['new'] += 1
    else:
        st['matched'] += 1
        if not f.get('site') and web: f['site'] = web; st['sites_filled'] += 1

    for c in contacts:
        if not c['contact']: continue
        sg = slug(c['contact'])
        ex = next((p for p in f.get('people', []) if p.get('n') and slug(p['n']) == sg), None)
        if ex:
            if c['email'] and not ex.get('email'): ex['email'] = c['email']
            if c['li'] and not ex.get('li'): ex['li'] = c['li']
            if c['title'] and not ex.get('t'): ex['t'] = c['title']
            st['people_enriched'] += 1
            continue
        person = {'n': c['contact'], 't': c['title'] or 'Partner'}
        if c['email']: person['email'] = c['email']
        if c['li']: person['li'] = c['li']
        ph = next((p for p in f['people'] if p.get('tbd')), None)
        if ph: f['people'].remove(ph)
        f.setdefault('people', []).append(person)
        st['people_added'] += 1

print(json.dumps(st, indent=1))
print('funds now:', len(funds))
open(DATA, 'w').write('window.SN_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
