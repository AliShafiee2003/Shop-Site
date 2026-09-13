import os, re
RAW='/tmp/audit-v4/3b/raw'
def visible(l):
    d = open(os.path.join(RAW,l+'.html'),encoding='utf-8',errors='replace').read()
    d = re.sub(r'<script[^>]*>.*?</script>', ' ', d, flags=re.S)      # drop all scripts (RSC flight + JSON-LD)
    d = re.sub(r'<style[^>]*>.*?</style>', ' ', d, flags=re.S)
    d = re.sub(r'<[^>]+>', ' ', d)
    return re.sub(r'\s+', ' ', d)
CHECKS = {
 'person-en':  ['Neda Ahmadi was born in Isfahan','urban surveyor','h3'],
 'person-fa':  ['ندا احمدی','اصفهان'],
 'legal-privacy-en': ['privacy','Privacy','withdrawal','cookies','data'],
 'shipping': ['Austria','€','4.90','7.90','EU'],
 'category-en': ['Fiction','fiction','All books'],
 'cart': ['Your cart','Cart is empty','empty'],
 'checkout': ['Checkout','Email'],
 'series-detail-en': ['The Archivist','volume'],
 'about': ['PersePix','Vienna','Tehran'],
}
for label, needles in CHECKS.items():
    v = visible(label)
    res = {n: (n in v) for n in needles}
    miss = [n for n,val in res.items() if not val]
    print(f"{label:18s} VISIBLE-MISSING: {miss if miss else 'NONE'} | len={len(v)}")
    if label=='person-en':
        i = v.find('Neda Ahmadi'); print('   context:', v[max(0,i-80):i+220])
    if label=='category-en':
        i = v.find('All books'); print('   context:', v[max(0,i-60):i+260])
