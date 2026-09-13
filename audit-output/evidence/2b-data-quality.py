#!/usr/bin/env python3
"""Task 2-b — Database quality audit of /tmp/audit-v4/db-copy.custom.db (disposable copy).
Read-only. Outputs evidence/2b-data-quality.json + human log. PII is redacted in samples."""
import sqlite3, json, sys, os, re
from datetime import datetime, timezone

DB = 'file:/tmp/audit-v4/db-copy.custom.db?mode=ro'
OUT_JSON = '/home/z/my-project/audit-output/evidence/2b-data-quality.json'
OUT_LOG = '/home/z/my-project/audit-output/evidence/2b-data-quality.log'
EXPECTED_LOCALES = {'en', 'fa'}

con = sqlite3.connect(DB, uri=True)
con.row_factory = sqlite3.Row
cur = con.cursor()

def rows(sql, *a):
    return cur.execute(sql, a).fetchall()

def one(sql, *a):
    return cur.execute(sql, a).fetchone()[0]

def redact_email(e):
    if not e: return e
    e = str(e)
    if '@' in e:
        loc, dom = e.split('@', 1)
        return (loc[:1] + '***@' + dom[:20])
    return e[:3] + '***'

def redact(s, n=24):
    if s is None: return None
    s = str(s)
    return s[:n] + '…' if len(s) > n else s

result = {'db_file': 'db/custom.db (copy /tmp/audit-v4/db-copy.custom.db, sha256 039ae1d6cc6409b4…)',
          'generated_at_utc': datetime.now(timezone.utc).isoformat()}

# ── 0. integrity + file facts ────────────────────────────────────────────
result['integrity_check'] = one('PRAGMA integrity_check')
result['journal_mode'] = one('PRAGMA journal_mode')
result['page_count'] = one('PRAGMA page_count')
result['page_size'] = one('PRAGMA page_size')
result['freelist_count'] = one('PRAGMA freelist_count')
result['db_bytes'] = result['page_count'] * result['page_size']
result['foreign_keys_default'] = cur.execute('PRAGMA foreign_keys').fetchone()[0]
tables = [r[0] for r in rows("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
result['table_count'] = len(tables)

# ── 1. row counts ────────────────────────────────────────────────────────
counts = {}
for t in tables:
    counts[t] = one(f'SELECT COUNT(*) FROM "{t}"')
result['row_counts'] = counts

MAIN = ['User','Product','Variant','Order','OrderItem','Cart','CartItem','Review','Session',
        'Payment','Shipment','AuditLog','ConsentRecord','NewsletterSubscriber','Article',
        'Address','OrderEvent','MailMessage']
result['main_row_counts'] = {k: counts[k] for k in MAIN if k in counts}

# ── helpers ──────────────────────────────────────────────────────────────
def is_ms(v):
    return isinstance(v, (int, float))

NOW_MS = int(datetime.now(timezone.utc).timestamp() * 1000)
result['audit_now_utc'] = datetime.now(timezone.utc).isoformat()

# ── 2. duplicates ────────────────────────────────────────────────────────
dup = {}
def dupes(table, col, ci=False):
    expr = f'lower("{col}")' if ci else f'"{col}"'
    return rows(f'SELECT {expr} AS k, COUNT(*) c FROM "{table}" WHERE "{col}" IS NOT NULL GROUP BY {expr} HAVING c>1 ORDER BY c DESC')

for t, c, ci in [('User','email',True), ('User','googleSub',False), ('NewsletterSubscriber','email',True),
                 ('Product','slug',True), ('Category','slug',True), ('Article','slug',True),
                 ('Person','slug',True), ('ArticleCategory','slug',True),
                 ('Variant','sku',True), ('Variant','isbn13',False), ('Variant','isbn10',True),
                 ('Variant','barcode',True), ('Order','orderNumber',False), ('Order','publicRef',False),
                 ('DiscountCode','code',True), ('Ticket','ticketNumber',False)]:
    d = dupes(t, c, ci)
    dup[f'{t}.{c}'] = {'duplicates': len(d),
                       'samples': [{'value': redact(r['k'], 40), 'count': r['c']} for r in d[:5]]}
result['duplicates'] = dup

# same isbn13 on multiple DIFFERENT products (variant-level unique ok)
r = rows('''SELECT isbn13, COUNT(DISTINCT productId) p, COUNT(*) v FROM Variant
            WHERE isbn13 IS NOT NULL GROUP BY isbn13 HAVING p>1''')
result['duplicates']['isbn13_across_products'] = {'count': len(r), 'samples': [{'isbn13': redact(x['isbn13'],20), 'products': x['p']} for x in r[:5]]}

# ── 3. orphan scan via PRAGMA foreign_key_list (generic, all FKs) ────────
orphans = {}
total_orphan_rows = 0
for t in tables:
    fks = rows(f'PRAGMA foreign_key_list("{t}")')
    for fk in fks:
        child_cols = [c.strip() for c in fk['from'].split(',')]
        parent = fk['table']
        parent_cols = [c.strip() for c in (fk['to'] or 'id').split(',')]
        if parent not in tables and parent != 'sqlite_master': continue
        cc = ','.join(f'"{c}"' for c in child_cols)
        pc = ','.join(f'"{c}"' for c in parent_cols)
        nulls = ' OR '.join(f'"{c}" IS NULL' for c in child_cols)
        try:
            n = one(f'SELECT COUNT(*) FROM "{t}" WHERE NOT ({nulls}) AND ({cc}) NOT IN (SELECT {pc} FROM "{parent}")')
        except Exception as e:
            orphans[f'{t}({fk["from"]})→{parent}'] = {'error': str(e)}
            continue
        if n:
            ids = [r[0] for r in rows(f'SELECT id FROM "{t}" WHERE NOT ({nulls}) AND ({cc}) NOT IN (SELECT {pc} FROM "{parent}") LIMIT 5')]
            orphans[f'{t}({fk["from"]})→{parent}'] = {'orphans': n, 'sample_child_ids': ids}
            total_orphan_rows += n
result['orphan_fk_scan'] = {'relations_checked': sum(len(rows(f'PRAGMA foreign_key_list("{t}")')) for t in tables),
                            'total_orphan_rows': total_orphan_rows, 'details': orphans}

# soft slug references (no FK): WishlistItem.productSlug, TasteSignal, AnalyticsEvent, Product.seriesSlug
soft = {}
for t, col, target in [('WishlistItem','productSlug','Product.slug'), ('TasteSignal','productSlug','Product.slug'),
                       ('AnalyticsEvent','productSlug','Product.slug'), ('Product','seriesSlug','Product.slug')]:
    tt, tc = target.split('.')
    n = one(f'SELECT COUNT(*) FROM "{t}" WHERE "{col}" IS NOT NULL AND "{col}" NOT IN (SELECT "{tc}" FROM "{tt}")')
    soft[f'{t}.{col} → {target}'] = n
result['orphan_soft_slug_refs'] = soft

# AuditLog entity references
audit = {'total': counts['AuditLog'], 'dangling': {}}
for et, tbl in [('PRODUCT','Product'),('ORDER','Order'),('ARTICLE','Article'),('HOMEPAGE','HomepageVersion'),('USER','User')]:
    n = one(f'SELECT COUNT(*) FROM AuditLog WHERE entityType="{et}" AND entityId NOT IN (SELECT id FROM "{tbl}")')
    if n: audit['dangling'][et] = n
result['audit_log_integrity'] = audit

# ── 4. value-domain checks ────────────────────────────────────────────────
domains = {}
domains['Variant.stock_negative'] = one('SELECT COUNT(*) FROM Variant WHERE stock < 0')
domains['Variant.stock_negative_samples'] = [{'id': r['id'], 'sku': redact(r['sku'],12), 'stock': r['stock']} for r in rows('SELECT id, sku, stock FROM Variant WHERE stock < 0 LIMIT 5')]
domains['Variant.priceMinor_le0_all'] = one('SELECT COUNT(*) FROM Variant WHERE priceMinor <= 0')
domains['Variant.priceMinor_le0_publishedActive'] = one('''SELECT COUNT(*) FROM Variant v JOIN Product p ON p.id=v.productId
    WHERE p.status='PUBLISHED' AND v.isActive=1 AND v.priceMinor <= 0''')
domains['Variant.soldCount_negative'] = one('SELECT COUNT(*) FROM Variant WHERE soldCount < 0')
domains['OrderItem.quantity_le0'] = one('SELECT COUNT(*) FROM OrderItem WHERE quantity <= 0')
domains['CartItem.quantity_le0'] = one('SELECT COUNT(*) FROM CartItem WHERE quantity <= 0')
domains['Review.rating_out_of_1_5'] = one('SELECT COUNT(*) FROM Review WHERE rating < 1 OR rating > 5')
domains['DiscountCode.timesUsed_negative'] = one('SELECT COUNT(*) FROM DiscountCode WHERE timesUsed < 0')
domains['DiscountCode.value_invalid'] = one('SELECT COUNT(*) FROM DiscountCode WHERE (type="PERCENT" AND (value<1 OR value>90)) OR (type="FIXED" AND value<0)')
domains['User.role_values'] = [dict(r) for r in rows('SELECT role, COUNT(*) c FROM User GROUP BY role')]
domains['User.status_values'] = [dict(r) for r in rows('SELECT status, COUNT(*) c FROM User GROUP BY status')]
domains['Product.status_values'] = [dict(r) for r in rows('SELECT status, COUNT(*) c FROM Product GROUP BY status')]
domains['Article.status_values'] = [dict(r) for r in rows('SELECT status, COUNT(*) c FROM Article GROUP BY status')]
domains['Variant.format_values'] = [dict(r) for r in rows('SELECT format, COUNT(*) c FROM Variant GROUP BY format')]
domains['Order.status_values'] = [dict(r) for r in rows('SELECT status, COUNT(*) c FROM "Order" GROUP BY status')]
domains['Order.paymentStatus_values'] = [dict(r) for r in rows('SELECT paymentStatus, COUNT(*) c FROM "Order" GROUP BY paymentStatus')]
domains['Payment.status_values'] = [dict(r) for r in rows('SELECT status, COUNT(*) c FROM Payment GROUP BY status')]
domains['Review.moderationState_values'] = [dict(r) for r in rows('SELECT moderationState, COUNT(*) c FROM Review GROUP BY moderationState')]
domains['NewsletterSubscriber.status_values'] = [dict(r) for r in rows('SELECT status, COUNT(*) c FROM NewsletterSubscriber GROUP BY status')]
# currency
cur_sets = {}
for t in ['Variant','Cart','Order','Payment']:
    vals = [r[0] for r in rows(f'SELECT DISTINCT currency FROM "{t}"')]
    cur_sets[t] = vals
domains['currency_sets'] = cur_sets
domains['currency_unexpected'] = {k: [v for v in vals if v != 'EUR'] for k, vals in cur_sets.items() if any(v != 'EUR' for v in vals)}
# locale
loc = {}
for t, col in [('User','preferredLocale'),('CategoryTranslation','locale'),('ProductTranslation','locale'),
               ('PersonTranslation','locale'),('ArticleTranslation','locale'),('ArticleCategoryTranslation','locale'),
               ('Cart','locale'),('Order','locale'),('Review','locale'),('ConsentRecord','locale'),
               ('CookieConsent','locale'),('NewsletterSubscriber','locale'),('AnalyticsEvent','locale'),
               ('HomepageVersion','locale'),('LegalDocument','locale'),('BackInStockSubscriber','locale'),('MailMessage','locale')]:
    vals = [r[0] for r in rows(f'SELECT DISTINCT "{col}" FROM "{t}"')]
    bad = sorted(set(v for v in vals if v not in EXPECTED_LOCALES))
    if bad or vals: loc[f'{t}.{col}'] = {'values': vals, 'unexpected': bad}
domains['locale_sets'] = loc
result['value_domains'] = domains

# ── 5. translation completeness ─────────────────────────────────────────
tr = {}
tr['products_missing_en'] = one('''SELECT COUNT(*) FROM Product p WHERE NOT EXISTS (SELECT 1 FROM ProductTranslation t WHERE t.productId=p.id AND t.locale='en')''')
tr['products_missing_fa'] = one('''SELECT COUNT(*) FROM Product p WHERE NOT EXISTS (SELECT 1 FROM ProductTranslation t WHERE t.productId=p.id AND t.locale='fa')''')
tr['articles_missing_en'] = one('''SELECT COUNT(*) FROM Article a WHERE NOT EXISTS (SELECT 1 FROM ArticleTranslation t WHERE t.articleId=a.id AND t.locale='en')''')
tr['articles_missing_fa'] = one('''SELECT COUNT(*) FROM Article a WHERE NOT EXISTS (SELECT 1 FROM ArticleTranslation t WHERE t.articleId=a.id AND t.locale='fa')''')
tr['categories_missing_en'] = one('''SELECT COUNT(*) FROM Category c WHERE NOT EXISTS (SELECT 1 FROM CategoryTranslation t WHERE t.categoryId=c.id AND t.locale='en')''')
tr['categories_missing_fa'] = one('''SELECT COUNT(*) FROM Category c WHERE NOT EXISTS (SELECT 1 FROM CategoryTranslation t WHERE t.categoryId=c.id AND t.locale='fa')''')
tr['persons_missing_en'] = one('''SELECT COUNT(*) FROM Person p WHERE NOT EXISTS (SELECT 1 FROM PersonTranslation t WHERE t.personId=p.id AND t.locale='en')''')
tr['persons_missing_fa'] = one('''SELECT COUNT(*) FROM Person p WHERE NOT EXISTS (SELECT 1 FROM PersonTranslation t WHERE t.personId=p.id AND t.locale='fa')''')
tr['articleCategories_missing_en'] = one('''SELECT COUNT(*) FROM ArticleCategory c WHERE NOT EXISTS (SELECT 1 FROM ArticleCategoryTranslation t WHERE t.articleCategoryId=c.id AND t.locale='en')''')
tr['articleCategories_missing_fa'] = one('''SELECT COUNT(*) FROM ArticleCategory c WHERE NOT EXISTS (SELECT 1 FROM ArticleCategoryTranslation t WHERE t.articleCategoryId=c.id AND t.locale='fa')''')
tr['published_products_missing_en'] = one('''SELECT COUNT(*) FROM Product p WHERE p.status='PUBLISHED' AND NOT EXISTS (SELECT 1 FROM ProductTranslation t WHERE t.productId=p.id AND t.locale='en')''')
tr['published_products_missing_fa'] = one('''SELECT COUNT(*) FROM Product p WHERE p.status='PUBLISHED' AND NOT EXISTS (SELECT 1 FROM ProductTranslation t WHERE t.productId=p.id AND t.locale='fa')''')
tr['published_products_missing_both'] = one('''SELECT COUNT(*) FROM Product p WHERE p.status='PUBLISHED' AND NOT EXISTS (SELECT 1 FROM ProductTranslation t WHERE t.productId=p.id)''')
result['translation_completeness'] = tr

# ── 6. published-product quality gates ──────────────────────────────────
pq = {}
P = "Product p LEFT JOIN ProductTranslation t ON t.productId=p.id AND t.locale='en'"
pq['published_total'] = one("SELECT COUNT(*) FROM Product WHERE status='PUBLISHED'")
pq['published_without_active_variant'] = one('''SELECT COUNT(*) FROM Product p WHERE p.status='PUBLISHED' AND NOT EXISTS (SELECT 1 FROM Variant v WHERE v.productId=p.id AND v.isActive=1)''')
pq['published_without_any_variant'] = one('''SELECT COUNT(*) FROM Product p WHERE p.status='PUBLISHED' AND NOT EXISTS (SELECT 1 FROM Variant v WHERE v.productId=p.id)''')
pq['published_without_en_description'] = one(f'''SELECT COUNT(*) FROM {P} WHERE p.status='PUBLISHED' AND COALESCE(t.shortDescription,'')='' ''')
pq['published_without_longDescription'] = one(f'''SELECT COUNT(*) FROM {P} WHERE p.status='PUBLISHED' AND t.longDescription IS NULL''')
pq['published_without_seoTitle'] = one(f'''SELECT COUNT(*) FROM {P} WHERE p.status='PUBLISHED' AND COALESCE(t.seoTitle,'')='' ''')
pq['published_without_seoDesc'] = one(f'''SELECT COUNT(*) FROM {P} WHERE p.status='PUBLISHED' AND COALESCE(t.seoDesc,'')='' ''')
pq['published_without_coverUrl'] = one('''SELECT COUNT(*) FROM Product p WHERE p.status='PUBLISHED' AND p.coverUrl IS NULL''')
pq['published_without_cover_and_media'] = one('''SELECT COUNT(*) FROM Product p WHERE p.status='PUBLISHED' AND p.coverUrl IS NULL AND NOT EXISTS (SELECT 1 FROM ProductMedia m WHERE m.productId=p.id)''')
pq['published_without_translation_title'] = one('''SELECT COUNT(*) FROM Product p WHERE p.status='PUBLISHED' AND NOT EXISTS (SELECT 1 FROM ProductTranslation t WHERE t.productId=p.id AND COALESCE(t.title,'')<>'')''')
pq['published_zero_stock_all_variants'] = one('''SELECT COUNT(*) FROM Product p WHERE p.status='PUBLISHED' AND NOT EXISTS (SELECT 1 FROM Variant v WHERE v.productId=p.id AND v.isActive=1 AND v.stock>0)''')
pq['published_with_variant_no_price_history'] = one('''SELECT COUNT(*) FROM Product p WHERE p.status='PUBLISHED' AND EXISTS (SELECT 1 FROM Variant v WHERE v.productId=p.id) AND NOT EXISTS (SELECT 1 FROM PriceHistory h JOIN Variant v ON v.id=h.variantId WHERE v.productId=p.id)''')
result['published_product_quality'] = pq

# ── 7. order money integrity ────────────────────────────────────────────
om = {}
om['orders_total'] = counts['Order']
bad_items = rows('''SELECT o.id, o.orderNumber, o.subtotalMinor, SUM(i.totalMinor) s
  FROM "Order" o JOIN OrderItem i ON i.orderId=o.id GROUP BY o.id HAVING s != o.subtotalMinor''')
om['subtotal_vs_sum_items_mismatch'] = len(bad_items)
om['subtotal_mismatch_samples'] = [{'orderNumber': r['orderNumber'], 'stored': r['subtotalMinor'], 'recomputed': r['s']} for r in bad_items[:5]]
bad_tot = rows('''SELECT * FROM (SELECT o.id, o.orderNumber, o.subtotalMinor, o.discountMinor, o.shippingMinor, o.giftWrapMinor, o.totalMinor,
  (o.subtotalMinor - o.discountMinor + o.shippingMinor + o.giftWrapMinor) expected
  FROM "Order" o) WHERE expected != totalMinor''')
om['total_formula_mismatch'] = len(bad_tot)
om['total_mismatch_samples'] = [{'orderNumber': r['orderNumber'], 'expected': r['expected'], 'stored': r['totalMinor']} for r in bad_tot[:5]]
neg = one('SELECT COUNT(*) FROM "Order" WHERE totalMinor < 0 OR subtotalMinor < 0 OR shippingMinor < 0 OR taxMinor < 0 OR discountMinor < 0')
om['negative_amount_orders'] = neg
# item line totals: unit*qty
bad_line = one('SELECT COUNT(*) FROM OrderItem WHERE totalMinor != unitPriceMinor * quantity')
om['item_line_total_mismatch'] = bad_line
# payment consistency
om['paid_without_succeeded_payment'] = one('''SELECT COUNT(*) FROM "Order" o WHERE o.paymentStatus IN ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED')
  AND NOT EXISTS (SELECT 1 FROM Payment p WHERE p.orderId=o.id AND p.status='SUCCEEDED')''')
om['succeeded_payment_on_pending_order'] = one('''SELECT COUNT(*) FROM Payment p JOIN "Order" o ON o.id=p.orderId
  WHERE p.status='SUCCEEDED' AND o.paymentStatus='PENDING' ''')
om['order_total_vs_paid_amount'] = one('''SELECT COUNT(*) FROM Payment p JOIN "Order" o ON o.id=p.orderId
  WHERE p.status='SUCCEEDED' AND p.amountMinor != o.totalMinor''')
om['paid_orders_without_payment_row'] = one('''SELECT COUNT(*) FROM "Order" o WHERE o.paymentStatus IN ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED')
  AND NOT EXISTS (SELECT 1 FROM Payment p WHERE p.orderId=o.id)''')
om['pending_orders_with_succeeded_payment'] = one('''SELECT COUNT(*) FROM "Order" o WHERE o.status='PENDING_PAYMENT'
  AND EXISTS (SELECT 1 FROM Payment p WHERE p.orderId=o.id AND p.status='SUCCEEDED')''')
# refunds
om['refund_sum_exceeds_paid'] = rows('''
  WITH paid AS (SELECT o.id, o.totalMinor, COALESCE((SELECT SUM(amountMinor) FROM Payment p WHERE p.orderId=o.id AND p.status='SUCCEEDED'),0) paid
                FROM "Order" o)
  SELECT paid.id, paid.totalMinor, paid.paid, COALESCE(SUM(r.amountMinor),0) refunded
  FROM paid JOIN Refund r ON r.orderId=paid.id AND r.status='SUCCEEDED'
  GROUP BY paid.id HAVING refunded > paid.paid''')
om['refund_sum_exceeds_paid_count'] = len(om['refund_sum_exceeds_paid'])
om['refund_samples'] = [{'order': redact(r['id'],16), 'paid': r['paid'], 'refunded': r['refunded']} for r in om['refund_sum_exceeds_paid'][:5]]
del om['refund_sum_exceeds_paid']
om['refund_without_succeeded_payment'] = one('''SELECT COUNT(*) FROM Refund r JOIN "Order" o ON o.id=r.orderId
  WHERE r.status='SUCCEEDED' AND NOT EXISTS (SELECT 1 FROM Payment p WHERE p.orderId=o.id AND p.status='SUCCEEDED')''')
# returns
om['return_qty_exceeds_ordered'] = rows('''SELECT oi.id orderItemId, oi.quantity ordered, SUM(ri.quantity) returned
  FROM OrderItem oi JOIN ReturnItem ri ON ri.orderItemId=oi.id GROUP BY oi.id HAVING returned > ordered''')
om['return_qty_exceeds_ordered_count'] = len(om['return_qty_exceeds_ordered'])
del om['return_qty_exceeds_ordered']
om['return_on_unfulfillable_order'] = one('''SELECT COUNT(*) FROM ReturnRequest rr JOIN "Order" o ON o.id=rr.orderId WHERE o.status IN ('PENDING_PAYMENT','CANCELLED')''')
result['order_money_integrity'] = om

# ── 8. carts & sessions ─────────────────────────────────────────────────
cs = {}
cs['carts_total'] = counts['Cart']
cs['carts_expiresAt_null'] = one('SELECT COUNT(*) FROM Cart WHERE expiresAt IS NULL')
cs['carts_expiresAt_null_by_status'] = [dict(r) for r in rows('SELECT status, COUNT(*) c FROM Cart WHERE expiresAt IS NULL GROUP BY status')]
cs['carts_active_user_token_mismatch'] = one('''SELECT COUNT(*) FROM Cart WHERE userId IS NOT NULL AND token != 'u:' || userId''')
cs['carts_converted_with_items'] = one('''SELECT COUNT(*) FROM Cart c WHERE c.status != 'ACTIVE' AND EXISTS (SELECT 1 FROM CartItem i WHERE i.cartId=c.id)''')
cs['carts_active_empty_guest'] = one('SELECT COUNT(*) FROM Cart WHERE status="ACTIVE" AND userId IS NULL AND NOT EXISTS (SELECT 1 FROM CartItem i WHERE i.cartId=Cart.id)')
cs['sessions_total'] = counts['Session']
cs['sessions_expired'] = one('SELECT COUNT(*) FROM Session WHERE expiresAt < ?', NOW_MS)
cs['sessions_revoked'] = one('SELECT COUNT(*) FROM Session WHERE revokedAt IS NOT NULL')
cs['sessions_idle_expired_7d'] = one('''SELECT COUNT(*) FROM Session WHERE expiresAt >= ? AND
  COALESCE(lastSeenAt, createdAt) < ?''', NOW_MS, NOW_MS - 7*24*3600*1000)
cs['sessions_lastSeen_null'] = one('SELECT COUNT(*) FROM Session WHERE lastSeenAt IS NULL')
cs['sessions_expired_not_swept'] = one('SELECT COUNT(*) FROM Session WHERE expiresAt < ?', NOW_MS - 7*24*3600*1000)
cs['reset_tokens_expired'] = one('SELECT COUNT(*) FROM PasswordResetToken WHERE expiresAt < ?', NOW_MS)
cs['reset_tokens_used'] = one('SELECT COUNT(*) FROM PasswordResetToken WHERE usedAt IS NOT NULL')
cs['emailverify_expired'] = one('SELECT COUNT(*) FROM EmailVerificationToken WHERE expiresAt < ?', NOW_MS)
cs['emailchange_expired'] = one('SELECT COUNT(*) FROM EmailChangeToken WHERE expiresAt < ?', NOW_MS)
cs['loginthrottle_locked'] = one('SELECT COUNT(*) FROM LoginThrottle WHERE lockedUntil IS NOT NULL AND lockedUntil >= ?', NOW_MS)
cs['loginthrottle_rows'] = counts.get('LoginThrottle', 0)
result['cart_session_hygiene'] = cs

# ── 9. consents ─────────────────────────────────────────────────────────
cons = {}
cons['consent_records_total'] = counts['ConsentRecord']
cons['consent_policy_versions'] = [dict(r) for r in rows('SELECT policyType, policyVersion, COUNT(*) c FROM ConsentRecord GROUP BY policyType, policyVersion ORDER BY policyType')]
cur_legal = rows('SELECT type, locale, MAX(version) v FROM LegalDocument GROUP BY type')
cons['legal_current_versions'] = [dict(r) for r in cur_legal]
stale = 0
for r in cur_legal:
    stale += one('SELECT COUNT(*) FROM ConsentRecord WHERE policyType=? AND policyVersion != ?', r['type'], r['v'])
cons['stale_consent_vs_current_legal'] = stale
cons['cookie_consents_total'] = counts['CookieConsent']
cons['cookie_consent_distinct_subjects'] = one('SELECT COUNT(DISTINCT subjectKey) FROM CookieConsent')
result['consent_state'] = cons

# ── 10. QA / demo rows ──────────────────────────────────────────────────
qa = {}
qa['users_example_com'] = one('''SELECT COUNT(*) FROM User WHERE email LIKE '%@example.com' OR email LIKE '%@example.org' OR email LIKE '%@test.local' ''')
qa['users_example_com_samples'] = [redact_email(r[0]) for r in rows('''SELECT email FROM User WHERE email LIKE '%@example.com' OR email LIKE '%@example.org' LIMIT 8''')]
qa['newsletter_example'] = one('''SELECT COUNT(*) FROM NewsletterSubscriber WHERE email LIKE '%@example.com' OR email LIKE '%@example.org' ''')
qa['users_test_named'] = one('''SELECT COUNT(*) FROM User WHERE name IS NOT NULL AND (lower(name) LIKE '%test%' OR lower(name) LIKE 'demo%') ''')
qa['orders_test_emails'] = one('''SELECT COUNT(*) FROM "Order" WHERE email LIKE '%@example.com' OR email LIKE '%@example.org' ''')
qa['products_test_slug'] = one('''SELECT COUNT(*) FROM Product WHERE slug LIKE '%test%' OR slug LIKE '%demo%' ''')
qa['mail_to_example'] = one('''SELECT COUNT(*) FROM MailMessage WHERE "to" LIKE '%@example.com' OR "to" LIKE '%@example.org' ''')
qa['products_draft'] = one("SELECT COUNT(*) FROM Product WHERE status='DRAFT'")
qa['products_archived'] = one("SELECT COUNT(*) FROM Product WHERE status='ARCHIVED'")
qa['articles_draft'] = one("SELECT COUNT(*) FROM Article WHERE status='DRAFT'")
qa['users_total'] = counts['User']
qa['admin_users'] = one("SELECT COUNT(*) FROM User WHERE role != 'CUSTOMER'")
result['qa_demo_rows'] = qa

# ── 11. JSON validity in JSON-as-String columns ─────────────────────────
def check_json(table, col, only_nonnull=True):
    where = f'"{col}" IS NOT NULL' if only_nonnull else '1=1'
    bad, total = [], 0
    for r in rows(f'SELECT id, "{col}" v FROM "{table}" WHERE {where}'):
        total += 1
        try: json.loads(r['v'])
        except Exception as e: bad.append({'id': r['id'], 'err': str(e)[:60], 'prefix': redact(r['v'], 40)})
    return {'rows_checked': total, 'invalid': len(bad), 'samples': bad[:3]}

j = {}
j['Settings.valueJson'] = check_json('Settings', 'valueJson')
j['HomepageSection.settingsJson'] = check_json('HomepageSection', 'settingsJson')
j['DiscountCode.scopeJson'] = check_json('DiscountCode', 'scopeJson')
j['Promotion.excludedProductIds'] = check_json('Promotion', 'excludedProductIds')
j['Order.shippingAddressJson'] = check_json('Order', 'shippingAddressJson')
j['Order.billingAddressJson'] = check_json('Order', 'billingAddressJson')
j['Order.consentsJson'] = check_json('Order', 'consentsJson')
j['Person.socialLinks'] = check_json('Person', 'socialLinks')
j['ProductTranslation.longDescription'] = check_json('ProductTranslation', 'longDescription')
j['ArticleTranslation.body'] = check_json('ArticleTranslation', 'body')
result['json_string_validity'] = j

# ── 12. PII vs anonymized users ─────────────────────────────────────────
pii = {}
anon = rows("SELECT id, email, name FROM User WHERE status='ANONYMIZED'")
pii['anonymized_users'] = len(anon)
pii['anonymized_with_email_left'] = sum(1 for u in anon if u['email'])
pii['anonymized_with_name_left'] = sum(1 for u in anon if u['name'])
pii['anonymized_with_passwordHash'] = one("SELECT COUNT(*) FROM User WHERE status='ANONYMIZED' AND passwordHash IS NOT NULL")
pii['anonymized_with_googleSub'] = one("SELECT COUNT(*) FROM User WHERE status='ANONYMIZED' AND googleSub IS NOT NULL")
pii['anonymized_addresses_remaining'] = one('''SELECT COUNT(*) FROM Address a JOIN User u ON u.id=a.userId WHERE u.status='ANONYMIZED' ''')
pii['anonymized_orders_remaining'] = one('''SELECT COUNT(*) FROM "Order" o JOIN User u ON u.id=o.userId WHERE u.status='ANONYMIZED' ''')
pii['anonymized_reviews_with_author'] = one('''SELECT COUNT(*) FROM Review r JOIN User u ON u.id=r.userId WHERE u.status='ANONYMIZED' AND r.authorName IS NOT NULL''')
pii['blocked_users_remaining_sessions'] = one('''SELECT COUNT(*) FROM Session s JOIN User u ON u.id=s.userId WHERE u.status != 'ACTIVE' AND s.revokedAt IS NULL''')
pii['order_emails_of_anonymized'] = [redact_email(r[0]) for r in rows('''SELECT DISTINCT o.email FROM "Order" o JOIN User u ON u.id=o.userId WHERE u.status='ANONYMIZED' LIMIT 5''')]
result['pii_anonymization'] = pii

# ── 13. counters consistency ────────────────────────────────────────────
ct = {}
mismatch = rows('''SELECT v.id, v.sku, v.soldCount, COALESCE(s.q,0) actual FROM Variant v
  LEFT JOIN (SELECT i.variantId vid, SUM(i.quantity) q FROM OrderItem i JOIN "Order" o ON o.id=i.orderId
             WHERE o.paymentStatus IN ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED') AND i.variantId IS NOT NULL
             GROUP BY i.variantId) s ON s.vid=v.id
  WHERE v.soldCount != COALESCE(s.q,0)''')
ct['variant_soldCount_mismatch'] = len(mismatch)
ct['variant_soldCount_samples'] = [{'sku': redact(r['sku'],14), 'stored': r['soldCount'], 'computed': r['actual']} for r in mismatch[:5]]
dmismatch = rows('''SELECT d.code, d.timesUsed, COUNT(o.id) orders FROM DiscountCode d
  LEFT JOIN "Order" o ON UPPER(o.discountCode)=d.code AND o.paymentStatus IN ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED')
  GROUP BY d.id HAVING d.timesUsed != COUNT(o.id)''')
ct['discount_timesUsed_mismatch'] = len(dmismatch)
ct['discount_timesUsed_samples'] = [{'code': redact(r['code'],16), 'stored': r['timesUsed'], 'orders': r['orders']} for r in dmismatch[:5]]
ct['user_marketingConsent_vs_latest'] = one('''SELECT COUNT(*) FROM User u WHERE u.marketingConsent=1 AND u.email NOT IN (SELECT email FROM NewsletterSubscriber)''')
result['counters'] = ct

# ── 14. misc structural facts ───────────────────────────────────────────
misc = {}
misc['products_without_categories'] = one('''SELECT COUNT(*) FROM Product p WHERE p.status='PUBLISHED' AND NOT EXISTS (SELECT 1 FROM ProductCategory pc WHERE pc.productId=p.id)''')
misc['products_without_contributors'] = one('''SELECT COUNT(*) FROM Product p WHERE p.status='PUBLISHED' AND NOT EXISTS (SELECT 1 FROM ProductContributor pc WHERE pc.productId=p.id)''')
misc['homepage_published_versions'] = one("SELECT COUNT(*) FROM HomepageVersion WHERE status='PUBLISHED'")
misc['homepage_sections_per_version'] = [dict(r) for r in rows('SELECT versionId, COUNT(*) c FROM HomepageSection GROUP BY versionId')]
misc['legal_current_flags_per_type_locale'] = [dict(r) for r in rows('''SELECT type, locale, SUM(isCurrent) cur, COUNT(*) versions FROM LegalDocument GROUP BY type, locale HAVING cur != 1''')]
misc['active_promotions'] = one('SELECT COUNT(*) FROM Promotion WHERE isActive=1')
misc['active_discount_codes'] = one('SELECT COUNT(*) FROM DiscountCode WHERE isActive=1')
misc['orders_without_user_and_without_publicRef'] = one('SELECT COUNT(*) FROM "Order" WHERE userId IS NULL AND publicRef IS NULL')
misc['orders_guest'] = one('SELECT COUNT(*) FROM "Order" WHERE userId IS NULL')
misc['reviews_unowned'] = one('SELECT COUNT(*) FROM Review WHERE userId IS NULL')
misc['settings_keys'] = [r['key'] for r in rows('SELECT key FROM Settings')]
result['misc_structure'] = misc

# ── 15. EXPLAIN QUERY PLAN on hot queries ───────────────────────────────
eqp = {}
def explain(name, sql, params=()):
    plan = cur.execute('EXPLAIN QUERY PLAN ' + sql, params).fetchall()
    eqp[name] = ['| '.join(str(x) for x in p) for p in plan]

sample_product_id = one("SELECT id FROM Product WHERE status='PUBLISHED' LIMIT 1")
sample_order_id = one('SELECT id FROM "Order" LIMIT 1')
sample_cart_id = one('SELECT id FROM Cart LIMIT 1')
explain('published_listing_scan', "SELECT * FROM Product WHERE status='PUBLISHED'")
explain('product_by_slug', 'SELECT * FROM Product WHERE slug = ?', ('some-slug',))
explain('order_by_orderNumber', 'SELECT * FROM "Order" WHERE orderNumber = ?', ('SP-2026-00001',))
explain('session_by_tokenHash', 'SELECT * FROM Session WHERE tokenHash = ?', ('x'*64,))
explain('cart_by_token', 'SELECT * FROM Cart WHERE token = ?', ('guest-token',))
explain('orderitems_by_order', 'SELECT * FROM OrderItem WHERE orderId = ?', (sample_order_id,))
explain('reviews_by_product', "SELECT * FROM Review WHERE productId = ? AND moderationState='APPROVED'", (sample_product_id,))
explain('cartitems_by_cart', 'SELECT * FROM CartItem WHERE cartId = ? ORDER BY addedAt ASC, id ASC', (sample_cart_id,))
explain('search_contains_title', "SELECT * FROM ProductTranslation WHERE locale='en' AND title LIKE ?", ('%shah%',))
explain('search_contains_variants', "SELECT * FROM Variant WHERE sku LIKE ? OR isbn13 LIKE ?", ('%978%', '%978%',))
explain('storefront_category_filter', '''SELECT * FROM Product p WHERE p.status='PUBLISHED' AND EXISTS
  (SELECT 1 FROM ProductCategory pc JOIN Category c ON c.id=pc.categoryId
   WHERE pc.productId=p.id AND c.slug='fiction' AND c.isActive=1)''')
explain('order_status_created', "SELECT * FROM \"Order\" WHERE status='PAID' ORDER BY createdAt DESC LIMIT 20")
explain('variant_by_product_active', 'SELECT * FROM Variant WHERE productId = ? AND isActive = 1 AND stock > 0', (sample_product_id,))
explain('auditlog_by_entity', 'SELECT * FROM AuditLog WHERE entityType=? AND entityId=?', ('PRODUCT', sample_product_id))
explain('analytics_by_type_time', "SELECT * FROM AnalyticsEvent WHERE type='view_product' AND createdAt > ? ORDER BY createdAt DESC LIMIT 50", (NOW_MS - 7*86400000,))
explain('mail_outbox_sweep', 'SELECT * FROM MailMessage WHERE sentAt IS NOT NULL AND sentAt < ? LIMIT 100', (NOW_MS - 30*86400000,))
result['explain_query_plan'] = eqp

# ── write outputs ───────────────────────────────────────────────────────
os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
with open(OUT_JSON, 'w') as f:
    json.dump(result, f, indent=2, default=str)

with open(OUT_LOG, 'w') as f:
    def w(s=''):
        f.write(s + '\n')
    w(f"2-b DATA QUALITY — {result['generated_at_utc']}")
    w(f"integrity_check={result['integrity_check']} journal_mode={result['journal_mode']} pages={result['page_count']} size={result['db_bytes']}")
    w('')
    w('MAIN ROW COUNTS: ' + json.dumps(result['main_row_counts']))
    w('')
    for k, v in result['duplicates'].items():
        if isinstance(v, dict) and v.get('duplicates'): w(f"DUP  {k}: {v}")
    w(f"ORPHANS total={total_orphan_rows} (relations checked={result['orphan_fk_scan']['relations_checked']})")
    for k, v in orphans.items():
        if isinstance(v, dict) and 'orphans' in v: w(f"  ORPHAN {k}: {v['orphans']} sample={v['sample_child_ids'][:3]}")
    for k, v in soft.items():
        if v: w(f"  SOFT-REF {k}: {v}")
    w('')
    for k, v in domains.items():
        if not isinstance(v, int) or v: w(f"DOMAIN {k}: {v}")
    w('')
    w('TRANSLATIONS: ' + json.dumps(tr))
    w('PUBLISHED QUALITY: ' + json.dumps(pq))
    w('')
    for k, v in om.items():
        if v not in (0, [], None): w(f"MONEY {k}: {v}")
    w('')
    w('CART/SESSION: ' + json.dumps(cs))
    w('CONSENTS: ' + json.dumps(cons))
    w('QA: ' + json.dumps(qa))
    w('')
    for k, v in j.items():
        if v['invalid']: w(f"JSON-INVALID {k}: {v}")
    w('')
    w('PII: ' + json.dumps(pii))
    w('COUNTERS: ' + json.dumps(ct))
    w('MISC: ' + json.dumps(misc))
    w('')
    for name, plan in eqp.items():
        w(f'EQP {name}:')
        for line in plan:
            w('   ' + line)

print('WROTE', OUT_JSON)
print('WROTE', OUT_LOG)
print('integrity:', result['integrity_check'], '| rows:', {k: result['main_row_counts'][k] for k in list(result['main_row_counts'])[:8]})
