#!/usr/bin/env python3
"""Merge Station_Investor_Master_v2.csv into vc-fund-data.js.

Enriches existing funds (person emails, personal LinkedIn URLs, titles, new
people, named NFX top-connector paths with strength, Notion introducer paths,
verdict reasoning into ctx, fund email, site/check backfill) and imports a
small curated set of genuinely-new relevant funds, hand-graded. Specialist
funds (health/bio/climate/aero) stay out, per Cam's rule.
"""
import csv, json, re, unicodedata, sys

SRC = '/Users/campbell/Downloads/Station_Investor_Master_v2.csv'
DATA = 'vc-fund-data.js'

STOP = {'ventures','venture','capital','partners','partner','fund','vc','the','group','company','llc','lp'}
def norm_org(s):
    s = re.sub(r'[^a-z0-9 ]', ' ', (s or '').lower())
    return ' '.join(w for w in s.split() if w and w not in STOP)
def cond(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]', '', s)

# CSV firm name -> existing fund name, for aliases exact/condensed match misses.
ALIASES = {
    'SoftTechVC': 'Uncork',
    'TCG': 'TCG (The Chernin Group)',
    'Courtside Ventures': 'CourtsideVC',
    'https://www.overlookedventures.com/': 'Overlooked Ventures',
    'M13 🚀': 'M13 Company',
}
# Deliberately not imported/matched: wrong geo or arms of funds already covered.
SKIP_FIRMS = {'Accel,Accel India', 'Sequoia Capital,Sequoia Capital India',
              'Global Founders Capital SEA', 'X Fund', 'Communitas Asset Management',
              'Cat Dizon', 'anamitra'}

src = open(DATA).read()
m = re.search(r'window\.SN_DATA\s*=\s*', src)
data = json.loads(src[m.end():].rstrip().rstrip(';'))
funds = data['funds']
by_norm, by_cond, by_name = {}, {}, {}
for f in funds:
    by_norm.setdefault(norm_org(f['name']), f)
    by_cond.setdefault(cond(f['name']), f)
    by_name[f['name']] = f

rows = list(csv.DictReader(open(SRC)))
firms = {}
for r in rows:
    fm = (r['Firm'] or '').strip()
    if fm: firms.setdefault(fm, []).append(r)

def g(r, k): return (r.get(k) or '').strip()

def parse_check(txt):
    # "$500K - $7.0M" -> [500, 7000] (thousands)
    def unit(tok):
        mm = re.match(r'\$?([\d.]+)\s*([KMB]?)', tok.strip(), re.I)
        if not mm: return None
        v = float(mm.group(1)); u = mm.group(2).upper()
        return int(v * {'':0.001,'K':1,'M':1000,'B':1000000}[u])
    parts = re.split(r'\s*-\s*', txt)
    vals = [unit(p) for p in parts if p.strip()]
    vals = [v for v in vals if v]
    return vals[:2] if len(vals) == 2 else None

def clean_reason(t):
    t = re.sub(r'^\s*\*\*(Pitch|Not Relevant|Not relevant)[:\s]*\*\*[:\s]*', '', t.strip())
    t = t.replace('**', '').replace('\n', ' ')
    t = re.sub(r'\s+', ' ', t).strip()
    return t[:380] + ('…' if len(t) > 380 else '')

BAD_NAME_TOKENS = {'fund','ventures','capital','partners','vc','http','https','www','group','llc'}
def is_person(name, firm):
    if not name or name == firm: return False
    toks = name.lower().split()
    if len(toks) < 2 or len(toks) > 4: return False
    return not any(any(b in t for b in BAD_NAME_TOKENS) for t in toks)

stats = dict(matched_firms=0, emails=0, lis=0, titles=0, new_people=0,
             nfx_paths=0, intro_paths=0, verdicts=0, fund_emails=0,
             site_fill=0, check_fill=0, new_funds=0, skipped_firms=0)

def enrich(f, rs):
    stats['matched_firms'] += 1
    people = f.setdefault('people', [])
    pidx = {cond(p.get('n','')): p for p in people if p.get('n')}
    def find_person(name):
        c = cond(name)
        if c in pidx: return pidx[c]
        toks = name.lower().split()
        if len(toks) >= 2:
            fn, ln = cond(toks[0]), cond(toks[-1])
            for p in people:
                pt = (p.get('n') or '').lower().split()
                if len(pt) >= 2 and cond(pt[0]) == fn and cond(pt[-1]) == ln:
                    return p
        return None
    best_conn = {}   # connector -> (strength, npaths)
    for r in rs:
        name = g(r, 'Name')
        if is_person(name, g(r, 'Firm')):
            p = find_person(name)
            email = g(r, 'Email')
            li = g(r, 'LinkedIn')
            li = li if '/in/' in li else ''
            title = g(r, 'Title')
            if p:
                if email and not p.get('email'): p['email'] = email; stats['emails'] += 1
                if li and not p.get('li'): p['li'] = li; stats['lis'] += 1
                if title and not p.get('t'): p['t'] = title; stats['titles'] += 1
            elif email or li or title:
                np = {'n': name, 't': title or 'Investor'}
                if email: np['email'] = email; stats['emails'] += 1
                if li: np['li'] = li; stats['lis'] += 1
                people.append(np); pidx[cond(name)] = np; stats['new_people'] += 1
        conn = g(r, 'Top Connector')
        s = g(r, 'Intro Strength')
        if conn and s.isdigit():
            s = int(s); npaths = g(r, '# Intro Paths')
            if conn not in best_conn or s > best_conn[conn][0]:
                best_conn[conn] = (s, npaths)
    paths = f.setdefault('paths', [])
    have_via = {cond(p.get('via','')) for p in paths}
    for conn, (s, npaths) in sorted(best_conn.items(), key=lambda kv: -kv[1][0])[:3]:
        if cond(conn) in have_via: continue
        note = f'NFX strength {s}' + (f' · {npaths} paths' if npaths else '')
        paths.append({'via': conn, 'kind': 'nfx', 'note': note})
        have_via.add(cond(conn)); stats['nfx_paths'] += 1
    for r in rs:
        for intro in re.split(r'[;,]', g(r, 'Notion Introducers')):
            intro = intro.strip()
            if intro and cond(intro) not in have_via and is_person(intro, ''):
                paths.append({'via': intro, 'kind': 'existing', 'note': 'Introducer (Notion pipeline)'})
                have_via.add(cond(intro)); stats['intro_paths'] += 1
    ctx = f.setdefault('ctx', [])
    labels = {c[0] for c in ctx}
    reason = next((g(r, 'Verdict Reason') for r in rs if g(r, 'Verdict Reason')), '')
    if reason and 'Verdict' not in labels:
        ctx.append(['Verdict', clean_reason(reason)]); stats['verdicts'] += 1
    femail = next((g(r, 'Notion Fund Email') for r in rs if g(r, 'Notion Fund Email')), '')
    if femail and 'Fund email' not in labels:
        ctx.append(['Fund email', femail]); stats['fund_emails'] += 1
    if not f.get('site'):
        site = next((g(r, 'Website') for r in rs if g(r, 'Website')), '')
        if site:
            f['site'] = re.sub(r'^https?://(www\.)?', '', site).rstrip('/'); stats['site_fill'] += 1
    if not f.get('check'):
        for r in rs:
            ck = parse_check(g(r, 'Check Range') or '')
            if ck: f['check'] = ck; stats['check_fill'] += 1; break

# Hand-graded new funds (rubric: thesis .30 / stage .25 / check .20 / portfolio .15 / geo .10)
NEW_FUNDS = {
    'CRV': dict(
        id='sm-crv', name='CRV', site='crv.com', type='Seed', region='Bay Area',
        sectors=['Consumer', 'Marketplaces'],
        dims={'thesis': 75, 'stage': 70, 'check': 75, 'portfolio': 85, 'geo': 90},
        looking='Storied consumer + enterprise firm; backed Patreon and DoorDash, so creator monetization and marketplaces are familiar shapes. Seed through A, larger checks.',
        why='Patreon is in their portfolio - they already believe creators monetizing directly is a venture-scale market.',
        hook='You backed Patreon when creator monetization was a weird idea; host-read podcast ads are the B2B version of that same wedge.'),
    'Big Story': dict(
        id='sm-big-story', name='Big Story', site='bigstory.vc', type='Pre-seed', region='—',
        sectors=['Generalist'],
        dims={'thesis': 65, 'stage': 78, 'check': 70, 'portfolio': 60, 'geo': 65},
        stage0='target',
        looking='Generalist early-stage fund with no hard sector or regional gates - Cam\'s Notion pipeline marked them Pitch in the Station era.',
        why='No thesis gate to fight through; generalist early-stage funds judge on traction, and $500K GMV in months is the argument.'),
    'OpenseedVC': dict(
        id='sm-openseedvc', name='OpenseedVC', site='openseed.vc', type='Pre-seed', region='Europe',
        sectors=['Generalist'],
        dims={'thesis': 62, 'stage': 85, 'check': 75, 'portfolio': 58, 'geo': 55},
        stage0='target',
        looking='Operator-led pre-seed fund (Maria Rotilu) writing first checks into generalist software; Europe/Africa lean is the main friction.',
        why='Operator-angels judge on execution speed, and shipping a working marketplace with $500K GMV on a 5-person team is that story.'),
    'Alliance Technology Ventures': dict(
        id='sm-alliance-technology', name='Alliance Technology Ventures', site='alliancetechventures.com',
        type='Seed', region='Florida', check=[500, 2000],
        sectors=['E-commerce', 'Marketplaces', 'SaaS'],
        dims={'thesis': 70, 'stage': 80, 'check': 85, 'portfolio': 62, 'geo': 70},
        stage0='target',
        people=[{'n': 'Kelly Perdew', 't': 'Managing Partner', 'email': 'kcperdew@gmail.com'}],
        looking='Consumer + marketplace seed checks ($500K-$2M) out of Florida; Kelly Perdew is media-native (TV background) and gets attention businesses.',
        why='Marketplace + consumer thesis at exactly seed check size, and a GP who understands media economics firsthand.'),
    'CoFound Partners': dict(
        id='sm-cofound-partners', name='CoFound Partners', site='cofoundpartners.com',
        type='Pre-seed', region='New York', check=[300, 700],
        sectors=['Marketplaces', 'SaaS'],
        dims={'thesis': 55, 'stage': 82, 'check': 85, 'portfolio': 55, 'geo': 85},
        stage0='disqualified',
        people=[{'n': 'Jordan Wan', 't': 'General Partner', 'email': 'jordan@cofoundpartners.com'}],
        looking='NY pre-seed marketplaces/SaaS fund; Notion verdict was Not Relevant - sector focus too far from media despite a strength-9 intro path.',
        why='Kept for the record: strength-9 NFX path via Riley Rodgers, but the Station-era read was thesis mismatch.'),
}

matched_names = set()
for firm, rs in sorted(firms.items()):
    if firm in SKIP_FIRMS:
        stats['skipped_firms'] += 1; continue
    f = None
    if firm in ALIASES:
        f = by_name.get(ALIASES[firm])
    if f is None:
        f = by_norm.get(norm_org(firm)) or by_cond.get(cond(firm))
    if f is not None:
        enrich(f, rs); matched_names.add(firm)

for firm, spec in NEW_FUNDS.items():
    if norm_org(firm) in by_norm or cond(firm) in by_cond:
        print(f'!! {firm} already exists, skipping import'); continue
    f = dict(spec)
    f.setdefault('people', []); f.setdefault('paths', []); f.setdefault('ctx', [])
    f.setdefault('check', None); f.setdefault('sectors', ['Generalist'])
    if not f['check']: f.pop('check')
    f['tier'] = 'Station master import'
    funds.append(f)
    by_norm[norm_org(firm)] = f; by_cond[cond(firm)] = f; by_name[f['name']] = f
    enrich(f, firms.get(firm, []))
    stats['matched_firms'] -= 1  # enrich() counts it; don't double-count as a match
    stats['new_funds'] += 1

unmatched = [fm for fm in firms if fm not in matched_names and fm not in SKIP_FIRMS
             and fm not in NEW_FUNDS]
print(f'unmatched firms left out (specialists etc): {len(unmatched)}')
print(json.dumps(stats, indent=1))

out = 'window.SN_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(DATA, 'w').write(out)
print(f'wrote {DATA}: {len(funds)} funds')
