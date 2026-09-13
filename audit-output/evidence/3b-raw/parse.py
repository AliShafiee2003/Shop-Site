import re, json, os, html as htmlmod

RAW = '/tmp/audit-v4/3b/raw'
HDR = '/tmp/audit-v4/3b/hdr'
labels = [l.split('|')[0] for l in open('/tmp/audit-v4/3b/urls.txt').read().splitlines() if l.strip()]

def parse_page(label):
    fp = os.path.join(RAW, label + '.html')
    if not os.path.exists(fp): return None
    doc = open(fp, encoding='utf-8', errors='replace').read()
    hfp = os.path.join(HDR, label + '.txt')
    headers = open(hfp, encoding='utf-8', errors='replace').read() if os.path.exists(hfp) else ''
    code = open(os.path.join(HDR, label + '.code')).read().split('|')[0]
    out = {'label': label, 'status': code, 'bytes': len(doc)}
    m = re.search(r'<title[^>]*>(.*?)</title>', doc, re.S)
    out['title'] = htmlmod.unescape(m.group(1)).strip() if m else None
    m = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', doc)
    out['desc'] = htmlmod.unescape(m.group(1)) if m else None
    out['desc_len'] = len(out['desc']) if out['desc'] else 0
    out['canonical'] = (re.search(r'<link\s+rel="canonical"\s+href="([^"]*)"', doc) or [None,None])[1] if 'rel="canonical"' in doc else None
    out['hreflang'] = re.findall(r'<link\s+rel="alternate"\s+hreflang="([^"]*)"\s+href="([^"]*)"', doc)
    m = re.search(r'<meta\s+name="robots"\s+content="([^"]*)"', doc)
    out['robots'] = m.group(1) if m else None
    og = {}
    for k in ['og:title','og:description','og:image','og:url','og:type','og:site_name','og:locale','article:published_time']:
        mm = re.search(r'<meta\s+property="' + re.escape(k) + r'"\s+content="([^"]*)"', doc)
        og[k] = htmlmod.unescape(mm.group(1)) if mm else None
    out['og'] = og
    out['twitter'] = {k: (re.search(r'<meta\s+name="twitter:'+k+r'"\s+content="([^"]*)"', doc) or [None,None])[1] for k in ['card','title','description','image']}
    h1s = re.findall(r'<h1(?:\s[^>]*)?>(.*?)</h1>', doc, re.S)
    out['h1_count'] = len(h1s)
    out['h1_texts'] = [htmlmod.unescape(re.sub(r'<[^>]+>', '', t)).strip()[:80] for t in h1s]
    heads = re.findall(r'<h([1-6])(?:\s[^>]*)?>', doc)
    out['headings_seq'] = ''.join(heads)
    # skip detection
    seq = [int(c) for c in out['headings_seq']]
    skips = [(a,b) for a,b in zip(seq, seq[1:]) if b > a + 1]
    out['heading_skips'] = skips
    m = re.search(r'<html\s+lang="([^"]*)"\s+dir="([^"]*)"', doc)
    out['html_lang_dir'] = m.groups() if m else None
    # JSON-LD
    lds = []
    for mm in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', doc, re.S):
        try: lds.append(json.loads(mm.group(1).replace('\\u003c','<')))
        except Exception as e: lds.append({'_PARSE_ERROR': str(e)})
    out['ldjson_count'] = len(lds)
    out['ldjson_types'] = [p.get('@type') if isinstance(p, dict) else '?' for p in lds]
    out['ldjson'] = lds
    out['ldjson_duplicated'] = len(lds) != len({json.dumps(p, sort_keys=True) for p in lds})
    out['n_links'] = len(re.findall(r'<a\s', doc))
    out['x_robots_header'] = (re.search(r'(?im)^x-robots-tag:\s*(.*)$', headers) or [None,None])[1]
    out['cache_header'] = (re.search(r'(?im)^cache-control:\s*(.*)$', headers) or [None,None])[1]
    return out

res = {}
for l in labels:
    res[l] = parse_page(l)
json.dump(res, open('/tmp/audit-v4/3b/parsed.json', 'w'), ensure_ascii=False, indent=1)
# compact print
for l, r in res.items():
    if not r: print(l, 'MISSING'); continue
    print(f"{l:20s} {r['status']} title={str(r['title'])[:60]!r} descLen={r['desc_len']} canon={str(r['canonical'])[:70]} robots={r['robots']} h1={r['h1_count']} lang={r['html_lang_dir']} ld={r['ldjson_types']}")
