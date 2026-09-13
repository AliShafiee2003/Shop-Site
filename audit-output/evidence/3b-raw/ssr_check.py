import io, os, re, json
RAW='/tmp/audit-v4/3b/raw'
def doc(l): return open(os.path.join(RAW,l+'.html'),encoding='utf-8',errors='replace').read()
CHECKS = {
 'product1-en': ['Rust and Turquoise','A landmark survey of dye workshops','978-3-011','32.00','In stock','Add to cart','pageCount','256'],
 'product1-fa': ['زنگار و فیروزه','نگاهی شاخص','افزودن به سبد','موجود'],
 'person-en':  ['Neda Ahmadi','born in Isfahan','urban surveyor'],
 'person-fa':  ['ندا احمدی','اصفهان'],
 'article-en': ['Why Translate','Every book we publish crosses at least one border'],
 'article-fa': ['چرا ترجمه','هر کتابی که منتشر می‌کنیم'],
 'catalog-en': ['The Archivist','Rust and Turquoise','Songs for a Burnt Bridge'],
 'category-en': ['The Archivist','fiction','Fiction'],
 'home-en': ['Rust and Turquoise','Vienna','New releases'],
 'home-fa': ['زنگار و فیروزه','تازه‌ها'],
 'legal-privacy-en': ['privacy','Privacy','data protection','Personal data'],
 'about': ['PersePix','independent'],
 'faq': ['ship','Frequently asked'],
 'shipping': ['shipping','Austria','€'],
 'contact': ['contact','email'],
 'cart': ['cart','Cart','empty','Your cart'],
 'checkout': ['checkout','Checkout'],
 'search-en': ['Search results','test'],
 'series-detail-en': ['Contemporary Persian Prose','The Archivist'],
}
for label, needles in CHECKS.items():
    d = doc(label)
    found = {n: (n in d) for n in needles}
    miss = [n for n,v in found.items() if not v]
    print(f"{label:18s} MISSING: {miss if miss else 'NONE — all present'}  (bytes={len(d)})")
