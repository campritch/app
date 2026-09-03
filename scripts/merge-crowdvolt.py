#!/usr/bin/env python3
"""Merge CrowdVolt's investor lists into vc-fund-data.js.

Max Hamer (CrowdVolt co-founder) is a super-strong connector for Cam.
Rules from Cam:
- Max-list rows marked dead: only usable when the intro ran through
  Brickyard (Cam Doody / Matt Patterson), Austin (Goliath, ex Coast),
  or Mitchell (Electrokare) - those guys can 100% intro regardless.
- Non-dead rows: Max can open the door.
- General list = CrowdVolt's current Series A targets. Cross-check against
  existing funds (no duplicates); later-stage-only firms get stage0 'future'.
- CrowdVolt's friends/family and individual angels are skipped - that's
  their personal network, not an intro surface for SpotsNow.
"""
import csv, json, re, unicodedata

MAX_CSV = "/Users/campbell/Downloads/Crowdvolt Intros - Max Hamer Intros (1).csv"
GEN_CSV = "/Users/campbell/Downloads/Crowdvolt Intros - General Crowdvolt list.csv"
DATA = "vc-fund-data.js"

def slug(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

STOP = {'ventures','venture','capital','partners','partner','fund','vc','the','group','company','llc','lp'}
def norm_org(s):
    s = re.sub(r'\([^)]*\)', ' ', s or '')          # strip parentheticals
    s = re.sub(r'[^a-z0-9 ]', ' ', s.lower())
    return ' '.join(w for w in s.split() if w and w not in STOP)

src = open(DATA).read()
m = re.search(r'window\.SN_DATA\s*=\s*', src)
data = json.loads(src[m.end():].rstrip().rstrip(';'))
funds, connectors = data['funds'], data['connectors']
by_norm = {}
for f in funds:
    by_norm.setdefault(norm_org(f['name']), f)

ALIASES = {  # csv name -> existing fund name (when norm differs)
    'M13': 'M13 Company', 'Bessemer (BVP)': 'Bessemer Venture Partners',
    'Uncork Capital': 'Uncork', 'The Twenty Minute VC (20VC)': '20VC',
    'Courtside Ventures': 'CourtsideVC',
}
by_name = {f['name']: f for f in funds}
def find_fund(name):
    if name in ALIASES and ALIASES[name] in by_name: return by_name[ALIASES[name]]
    return by_norm.get(norm_org(name))

# ── connector via detection ────────────────────────────────────────────
def vias_in(text):
    t = (text or '').lower()
    v = []
    if re.search(r'cam doody|brickyard \(cam', t): v.append('Cam Doody')
    if re.search(r'matt pat+erson|brickyard \(matt', t): v.append('Matt Patterson')
    if re.search(r'aust[io]n (pager|@ goliath)|austin @ goliath', t): v.append('Austin Pager')
    if re.search(r'mitchell @ electrokare', t): v.append('Mitchell Leshchiner')
    return v

def is_firmish(name, typ):
    if typ in ('Fund', 'VC', 'Seed', 'Syndicate'): return True
    return bool(re.search(r'ventures?|capital|partners|fund|angels|\.vc|collective|vc$| vc |asset management', (name or '').lower()))

def add_path(f, via, note):
    paths = f.setdefault('paths', [])
    key = slug(via)
    if any(slug(p.get('via','')) == key for p in paths): return False
    paths.append({'via': via, 'kind': 'existing', 'note': note})
    return True

def add_ctx(f, label, text):
    ctx = f.setdefault('ctx', [])
    if any(c[0] == label for c in ctx): return
    ctx.append([label, text[:300]])

def parse_people(raw, cap=3):
    out = []
    for seg in re.split(r'[;\n]', raw or ''):
        seg = re.sub(r'\([^)]*\)', '', seg)
        for part in seg.split(','):
            p = part.strip().strip('?').strip()
            words = p.split()
            if 2 <= len(words) <= 3 and all(w[0].isupper() for w in words if w[0].isalpha()) \
               and not re.search(r'via |avoid|target|verify|note|ex-|@', p.lower()):
                if p not in out: out.append(p)
            if len(out) >= cap: return out
        if len(out) >= cap: break
    return out

stats = dict(max_paths=0, gen_paths=0, new_funds=0, ctx=0, skipped_dead=0, skipped_people=0)
max_matches, doody_matches, patt_matches, austin_matches, mitch_matches = [], [], [], [], []

def people_ids(f, cap=2):
    out = []
    for p in f.get('people', [])[:cap]:
        if p.get('n'): out.append(f['id'] + '_' + slug(p['n']))
    return out

# ── Max Hamer seed-era list ────────────────────────────────────────────
for r in csv.DictReader(open(MAX_CSV)):
    name = (r['Investor'] or '').strip()
    if not name: continue
    role = (r.get('Role') or '').strip()
    typ = (r.get('Type') or '').strip()
    if 'friends' in role.lower() or typ in ('Individual', 'Friends / Family'):
        stats['skipped_people'] += 1; continue
    if not is_firmish(name, typ):
        stats['skipped_people'] += 1; continue
    status = (r.get('Seed Status') or '').strip()
    notes = ' '.join(filter(None, [r.get('Notes'), r.get('Next Steps (seed-era)')]))
    dead = status.startswith('9')
    vias = vias_in(notes)
    if dead and not vias:
        stats['skipped_dead'] += 1; continue
    f = find_fund(name)
    if not f: continue   # new funds come from the general list; seed-era leftovers skipped
    hist = f"CrowdVolt seed: {status}" + (f" · {notes.strip()[:180]}" if notes.strip() else '')
    if not dead:
        if add_path(f, 'Max Hamer', 'Max (CrowdVolt) knows them from his seed - will go out of his way to intro'):
            stats['max_paths'] += 1
        max_matches.extend(people_ids(f))
    for v in vias:
        note = f"{v} made this intro for CrowdVolt - can 100% intro us"
        if add_path(f, v, note): stats['max_paths'] += 1
        {'Cam Doody': doody_matches, 'Matt Patterson': patt_matches,
         'Austin Pager': austin_matches, 'Mitchell Leshchiner': mitch_matches}[v].extend(people_ids(f))
    add_ctx(f, 'CrowdVolt seed', hist); stats['ctx'] += 1

# ── General (Series A) list ────────────────────────────────────────────
SKIP_SEG = re.compile(r'fintech|payments|deep tech|frontier|gaming|esports|b2b saas|infrastructure|open source|bank innovation|healthcare', re.I)
KEEP_SEG = re.compile(r'consumer|marketplace|media|creator|culture|entertainment|generalist|network', re.I)

gen_new = []
for r in csv.DictReader(open(GEN_CSV)):
    name = (r['Firm'] or '').strip()
    if not name: continue
    seg = (r.get('Segment') or '').strip()
    leads = (r.get('Leads A? (check size)') or '').strip()
    srcs = (r.get('Intro source') or '') + ' ' + (r.get('Owner') or '')
    status = (r.get('Status') or '').strip()
    champ = (r.get('Champion') or '').strip()
    seedh = (r.get('Seed-Era History') or '').strip()
    thesis = (r.get('Thesis Relevance (incl. conflict reason if applicable)') or '').strip()
    hq = (r.get('HQ') or '').strip()
    vias = vias_in(srcs)
    cv_owned = bool(re.search(r'\bCV\b|\bMH\b', srcs)) or (r.get('Owner') or '').strip() == 'MH' \
               or (champ and not status.startswith('1'))
    f = find_fund(name)
    note_bits = [b for b in [f"CrowdVolt A-list: {status}", f"champion {champ}" if champ else '',
                             f"seed-era {seedh[:60]}" if seedh else ''] if b]
    if f is not None:
        if cv_owned and add_path(f, 'Max Hamer', 'CrowdVolt is in their Series A process - Max can intro'):
            stats['gen_paths'] += 1; max_matches.extend(people_ids(f))
        for v in vias:
            if add_path(f, v, f'{v} is a live intro path (per CrowdVolt A-list)'):
                stats['gen_paths'] += 1
                {'Cam Doody': doody_matches, 'Matt Patterson': patt_matches,
                 'Austin Pager': austin_matches, 'Mitchell Leshchiner': mitch_matches}[v].extend(people_ids(f))
        add_ctx(f, 'CrowdVolt A-list', ' · '.join(note_bits)); stats['ctx'] += 1
    else:
        if SKIP_SEG.search(seg) and not KEEP_SEG.search(seg): continue
        a_only = bool(re.match(r'^\s*yes', leads, re.I)) and not re.search(r'seed', (seg + ' ' + leads).lower())
        fid = 'cv-' + slug(name)
        if any(x['id'] == fid for x in funds): continue
        ppl = [{'n': p, 't': 'Partner'} for p in parse_people(r.get('Key Partner(s)') or champ)]
        nf = {'id': fid, 'name': re.sub(r'\s*\([^)]*\)\s*$', '', name),
              'type': 'Series A' if a_only else 'Seed',
              'region': hq.split(',')[0].strip() if hq else '—',
              'sectors': [seg.split('-')[0].split('/')[0].strip()[:24]] if seg else ['Generalist'],
              'tier': 'CrowdVolt A-list import',
              'people': ppl or [],
              'looking': (thesis or seg)[:240],
              'ctx': [['CrowdVolt A-list', ' · '.join(note_bits)[:300]]],
              'paths': []}
        if a_only: nf['stage0'] = 'future'
        if cv_owned:
            nf['paths'].append({'via': 'Max Hamer', 'kind': 'existing',
                                'note': 'CrowdVolt is in their Series A process - Max can intro'})
        for v in vias:
            nf['paths'].append({'via': v, 'kind': 'existing',
                                'note': f'{v} is a live intro path (per CrowdVolt A-list)'})
        funds.append(nf); by_norm.setdefault(norm_org(name), nf); by_name[nf['name']] = nf
        if cv_owned: max_matches.extend(people_ids(nf))
        for v in vias:
            {'Cam Doody': doody_matches, 'Matt Patterson': patt_matches,
             'Austin Pager': austin_matches, 'Mitchell Leshchiner': mitch_matches}[v].extend(people_ids(nf))
        gen_new.append(nf['name']); stats['new_funds'] += 1

# ── connectors ─────────────────────────────────────────────────────────
def upsert_connector(cid, name, role, rapport, matches):
    ex = next((c for c in connectors if c['name'] == name), None)
    if ex is None:
        ex = {'id': cid, 'name': name, 'role': role, 'rapport': rapport, 'matches': []}
        connectors.append(ex)
    else:
        if role not in (ex.get('role') or ''): ex['role'] = role
        ex['rapport'] = rapport
    for pid in matches:
        if pid not in ex['matches']: ex['matches'].append(pid)
    return ex

upsert_connector('c_cv_max-hamer', 'Max Hamer', 'Co-Founder, CrowdVolt (YC)',
    'Super strong - knows Cam really well and will go out of his way to introduce us. His seed + Series A investor lists are mapped here.', max_matches)
upsert_connector('c_nfx_cam-doody', 'Cam Doody', 'GP, Brickyard',
    'Brickyard GP - super well connected. Has personally made many of these intros for CrowdVolt; if Max cannot intro, Cam Doody 100% can.', doody_matches)
upsert_connector('c_nfx_matt-patterson', 'Matt Patterson', 'GP, Brickyard',
    'Brickyard GP - made a stack of CrowdVolt intros. Direct line for Cam.', patt_matches)
upsert_connector('c_cv_austin-pager', 'Austin Pager', 'Goliath (ex-Coast)',
    'Really good intro for us - made many CrowdVolt intros at Coast, now at Goliath with live paths into a16z, Accel, Benchmark-tier firms.', austin_matches)
upsert_connector('c_nfx_mitchell-leshchiner', 'Mitchell Leshchiner', 'Electrokare',
    'Live intro paths across the CrowdVolt A-list (Courtside, Founders Fund, Bessemer, NFX, Upfront...).', mitch_matches)

print(json.dumps(stats, indent=1))
print('new funds:', gen_new)
open(DATA, 'w').write('window.SN_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('funds now:', len(funds), '| connectors:', len(connectors))
