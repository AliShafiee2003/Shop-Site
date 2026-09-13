# گزارش ممیزی پایگاه داده — Task 2-b (Phase 9)

**پروژه:** Persepix (`/home/z/my-project`) — Next.js 16 + Prisma 6 + SQLite
**ممیّز:** Database Architect auditor
**تاریخ:** 2026-09-13
**DB زنده:** `db/custom.db` — sha256 `039ae1d6cc6409b4…` (تمام بررسی‌های داده روی کپی یک‌بارمصرف `/tmp/audit-v4/db-copy.custom.db` با همان هش انجام شد؛ DB زنده فقط با اتصال read-only لمس شد)
**سایز DB:** ۹۷۰٬۷۵۲ بایت (۲۳۷ صفحه × ۴۰۹۶) — `integrity_check = ok`
**مدل‌ها:** ۵۵ مدل / ۵۱ رابطه اعلان‌شده / ۸۴ ایندکس صریح + ۵۵ ایندکس خودکار PK/UNIQUE
**شواهد:** `audit-output/evidence/2b-*.log|.json` + `2b-data-quality.py` (اسکریپت بازتولیدپذیر)

> ⚠️ یادداشت انحراف از صورت‌تسک: schema.prisma ۹۸۷ خط است (نه ۳۰۰۰+)؛ همین به‌تنهایی یافته نیست — کل فایل خوانده و مستند شد.

---

## ۱) بررسی کامل schema.prisma (۵۵ مدل)

### ۱.۱ پوشش روابط و رفتار Cascade
۵۱ رابطهٔ `@relation` اعلان شده و همگی دارای FK در DB هستند (بررسی با `PRAGMA foreign_key_list` روی کپی: ۴۸ رابطه FK بین‌جدولی + جداول تک‌FK — پوشش ۱۰۰٪؛ هیج جدول یتیم ساختاری وجود ندارد).

**onDelete صریح** در ۴۰ رابطه: `Cascade` برای کل اشیاء مالکیت (Session, Address, Cart/CartItem, Product→Translation/Variant/Media/Contributor/Category, Article→Translation/Link/Relation, HomepageVersion→Section, Review votes, توکن‌ها…)، `SetNull` صریح فقط برای `MailMessage.order` (خط ۹۶۶).
**روابط بدون onDelete صریح (۱۱ مورد)** — رفتار پیش‌فرض Prisma (برای رابطهٔ اختیاری = SetNull، برای الزامی = Restrict):
| رابطه | خط | نوع | اثر پیش‌فرض | ارزیابی |
|---|---|---|---|---|
| `Order.user` | ۴۹۸ | اختیاری | SetNull | ✅ سفارش پس از حذف کاربر می‌ماند (مناسب حقوق تجاری) |
| `OrderItem.variant` | ۵۳۲ | اختیاری | SetNull | ✅ اسنپ‌شات آیتم سفارش مستقل می‌ماند |
| `Refund.payment` | ۵۶۷ | اختیاری | SetNull | ✅ |
| `ReturnRequest.user` | ۶۱۴ | اختیاری | SetNull | ✅ |
| `Review.user` | ۶۵۲ | اختیاری | SetNull | ⚠️ رفرش/حذف کاربر ردیف نقد را یتیم می‌کند (مدیریت‌شده با anonymize) |
| `Ticket.user` / `Ticket.order` | ۶۸۶–۶۸۷ | اختیاری | SetNull | ✅ |
| `ReturnItem.orderItem` | ۶۲۷ | الزامی | **Restrict** | ⚠️ حذف OrderItem با ReturnItem باز مسدود می‌شود (قابل‌قبول؛ سفارش‌ها Cascade نمی‌شوند چون Order.user SetNull است) |
| سه رابطهٔ back-relation (`Product.related[]` و…) | ۱۹۶–۱۹۷، ۴۷۲ | — | — | فقط سمت many؛ بلااثر |

**حذف Order** = Cascade همهٔ Payment/Refund/Shipment/OrderEvent → **تخریب تاریخچهٔ مالی** (یافته DB-429؛ هرچند هیچ مسیر کد سفارش را حذف نمی‌کند، حذف دستی/مدیر خطرناک است).

### ۱.۲ Unique constraints (شمارش: ۲۸ ایندکس UNIQUE)
`User.email`, `User.googleSub`, `Session.tokenHash`, `Product.slug`, `Variant.sku`, `Variant.isbn13`, `Category.slug`, `Person.slug`, `Article.slug`, `ArticleCategory.slug`, `ProductTranslation[productId,locale]`, `CategoryTranslation[categoryId,locale]`, `PersonTranslation[personId,locale]`, `ArticleTranslation[articleId,locale]`, `ArticleCategoryTranslation[…,locale]`, `ProductContributor[productId,personId,role]`, `ProductCategory[productId,categoryId]`, `RelatedProduct[productId,relatedProductId]`, `ArticleCategoryLink[articleId,articleCategoryId]`, `Cart.token`, `CartItem[cartId,variantId]`, `Order.orderNumber`, `Order.publicRef`, `Payment.providerIntentId`, `Refund.providerRef`, `ReviewVote[reviewId,userId]`, `Ticket.ticketNumber`, `LegalDocument[type,locale,version]`, `Settings.key`, `NewsletterSubscriber.email`, `DiscountCode.code`, `BackInStockSubscriber[variantId,email]`, `WishlistItem[userId,productSlug]`, `PasswordResetToken/EmailVerificationToken/EmailChangeToken.tokenHash`.
پوشش درست است؛ چیدمان ترتیب ستون‌ها در ترکیبی‌ها (child-first) برای lookup هم درست است (EQP بخش ۲).

### ۱.۳ فیلدهای «Enum به‌شکل String» (یافته DB-403)
SQLite enum پشتیبانی نمی‌کند؛ تمام مقادیر وضعیت `String` با کامنت اتحادیه در schema. فهرست کامل (۳۵ فیلد در ۲۵ مدل):

| مدل.فیلد | خط schema | مقادیر مشاهده‌شده در DB |
|---|---|---|
| User.role | ۲۸ | `CUSTOMER(1)`, `OWNER(1)` |
| User.status | ۲۹ | `ACTIVE(2)` |
| User.preferredLocale | ۳۰ | `en(2)` |
| ConsentRecord.policyType / .source | ۹۳/۹۷ | — (۰ ردیف) |
| Person.status | ۱۳۸ | `PUBLISHED(12)` |
| Product.status | ۱۷۷ | `PUBLISHED(10)` |
| ProductTranslation.publishedState | ۲۱۴ | `READY(20)` |
| Variant.format | ۲۳۰ | `HARDCOVER(4)`, `PAPERBACK(7)` |
| Variant.currency / .taxClass | ۲۴۰/۲۴۱ | `EUR` / `REDUCED_BOOK` |
| ProductContributor.role | ۲۶۲ | (AUTHOR و…) |
| ProductMedia.mediaType | ۲۸۷ | `IMAGE` |
| Article.status | ۳۲۷ | `PUBLISHED(4)` |
| ArticleRelation.targetType | ۳۹۳ | PRODUCT/PERSON/ARTICLE |
| HomepageVersion.status | ۴۰۷ | `PUBLISHED(2)` + DRAFT/ARCHIVED |
| HomepageSection.type | ۴۲۰ | HERO/PRODUCT_SHELF/… |
| Cart.status | ۴۳۸ | `ACTIVE(8)` |
| Order.status | ۴۶۹ | `DELIVERED(1)`, `PAID(1)`, `SHIPPED(1)` |
| Order.paymentStatus | ۴۷۳ | `SUCCEEDED(3)` |
| Order.fulfillmentStatus | ۴۷۴ | UNFULFILLED/PARTIAL/… |
| Payment.provider / .status | ۵۴۱/۵۴۵ | `PERSEPIX_SANDBOX` / `SUCCEEDED(3)` |
| Refund.status | ۵۶۲ | SUCCEEDED/FAILED |
| Shipment.status | ۵۷۶ | PREPARING/SHIPPED/DELIVERED |
| OrderEvent.type | ۵۹۰ | CREATED/PAID/… |
| ReturnRequest.status / .resolution | ۶۰۴/۶۰۷ | — (۰ ردیف) |
| ReturnItem.condition | ۶۲۳ | — |
| Review.moderationState | ۶۴۲ | `APPROVED(12)`, `PENDING(2)` |
| Ticket.category / .status / .priority | ۶۷۹–۶۸۲ | OPEN… |
| TicketMessage.senderType | ۶۹۶ | CUSTOMER/SUPPORT |
| LegalDocument.type | ۷۱۰ | PRIVACY/TERMS/… (۶ نوع) |
| AuditLog.action / .entityType | ۷۲۶/۷۲۷ | ۴ ردیف |
| AnalyticsEvent.type | ۷۶۰ | — (۰ ردیف) |
| NewsletterSubscriber.source / .status | ۷۷۶/۷۷۷ | — (۰ ردیف) |
| DiscountCode.type / Promotion.type | ۷۹۰/۸۱۶ | — (۰ ردیف) |
| TasteSignal.kind | ۸۷۴ | — |
| CookieConsent.source / .action | ۸۹۸/۸۹۹ | banner/custom |
| MailMessage.kind | ۹۶۰ | PASSWORD_RESET/… |

**همهٔ مقادیر مشاهده‌شده در دامنهٔ موردانتظار هستند (۰ مقدار خارج از دامنه)** — اعتبار الان سمت اپلیکیشن (zod + ثابت‌های TS) تضمین می‌شود؛ در سطح DB هیچ CHECKی نیست (DB-404).

### ۱.۴ JSON-in-String (یافته DB-405)
۱۰ ستون: `Person.socialLinks` (۱۴۵)، `ProductTranslation.longDescription` (۲۱۱، بلوک‌های ساخت‌یافته)، `ArticleTranslation.body` (۳۴۷)، `HomepageSection.settingsJson` (۴۲۳)، `Order.shippingAddressJson` (۴۸۹)، `Order.billingAddressJson` (۴۹۰)، `Order.consentsJson` (۴۹۴)، `DiscountCode.scopeJson` (۸۰۴)، `Promotion.excludedProductIds` (۸۲۵)، `Settings.valueJson` (۷۳۸).
**اعتبارسنجی با json.loads روی ۸۲ مقدار موجود: ۰ نامعتبر.** لایهٔ اپ همه را تولید/تجزیه می‌کند؛ در cutover به Postgres باید `Json` شوند.

### ۱.۵ پول (Money)
همهٔ مبالغ **Int minor units** هستند: `Variant.priceMinor` (۲۳۹)، `Order.subtotalMinor/shippingMinor/taxMinor/totalMinor/discountMinor/promoSavedMinor/giftWrapMinor` (۴۷۶–۴۸۵)، `OrderItem.unitPriceMinor/taxMinor/totalMinor` (۵۲۷–۵۲۹)، `Payment.amountMinor` (۵۴۳)، `Refund.amountMinor` (۵۵۹)، `DiscountCode.value` (۷۹۱)، `Promotion.value` (۸۱۷)، `AnalyticsEvent.valueMinor` (۷۶۴). ✅ هیچ `Float` پولی وجود ندارد — الگوی درست.

### ۱.۶ Timestamps
همه `DateTime` Prisma (در SQLite به‌صورت INTEGER میلی‌ثانیه ذخیره می‌شود — بررسی شد: `typeof(createdAt)=integer`). `createdAt/updatedAt` با `@default(now())/@updatedAt` در همهٔ مدل‌های اصلی. هیچ رشتهٔ ISO دستی برای زمان وجود ندارد. ✅

### ۱.۷ Soft-delete
هیچ `deletedAt`ای وجود ندارد. جایگزین‌ها: `User.status=ANONYMIZED`، `Product/Article.status=ARCHIVED`، `Cart.status=ABANDONED/CONVERTED`، `Session.revokedAt`. حذف واقعی فقط مسیر GDPR است (`deletion-request`). طراحی سازگار و یکدست است.

### ۱.۸ Auditability
`AuditLog` (۷۲۳–۷۳۳) با `actorEmail/action/entityType/entityId/summary` + ایندکس `(entityType,entityId)` — append-only، بدون FK. `OrderEvent` تایم‌لاین سفارش (۵۸۷). `CookieConsent` و `ConsentRecord` دفتر رضایت. ✅ معماری درست؛ ضعف: AuditLog بدون FK → dangling ممکن (اکنون ۰).

### ۱.۹ اسنپ‌شات تغییرناپذیر
`OrderItem` دارای اسنپ‌شات کامل است (۵۱۸–۵۲۹: titleEn/titleFa/sku/isbn/coverUrl/format/bookLanguage/unitPrice/tax/total) ✅. `Order.discountCode` به‌صورت رشتهٔ نرمال‌شده (نه FK) + `promoName/promoSavedMinor` + `consentsJson` — همهٔ attribution در سطح سفارش مصون از تغییر کاتالوگ است. ✅ (نکتهٔ جزئی: list-price لحظهٔ خرید فقط جمعاً در `promoSavedMinor` حفظ می‌شود، نه per-item — DB-415 در یافته‌ها نیامده چون فروشگاه list-price را در UI با promotions زنده بازسازی می‌کند.)

### ۱.۱۰ PII و نگهداشت
PII: `User.email/passwordHash/googleSub/name`, `Address.*` (Cascade با کاربر — با حذف حساب پاک می‌شود ✅), `Order.email + shippingAddressJson/billingAddressJson/giftMessage/customerNote` (اسنپ‌شات تجاری — باید می‌ماند؛ در مسیر anonymize با placeholder جایگزین می‌شود — `deletion-request/route.ts:68-78` ✅), `Ticket.email`, `Review.authorName` (نقد شدن در anonymize ✅), `NewsletterSubscriber.email`, `BackInStockSubscriber.email`, `MailMessage.to`. توکن‌ها فقط hash (sha256) ذخیره می‌کنند ✅.

---

## ۲) ایندکس‌ها — الگوهای واقعی کوئری در برابر @@index + EXPLAIN QUERY PLAN

**الگوهای خواندن اصلی کد** (`src/lib/server/*`, `src/app/api/**`):
- نشست: `session.findUnique({tokenHash})` — `auth.ts:98` → ✅ `Session_tokenHash_key`
- سبد: `cart.findUnique({token})` — `cart.ts:85,91,101` → ✅ `Cart_token_key`
- آیتم‌های سبد: `cartItem.findMany({cartId, orderBy addedAt,id})` — `cart.ts:142-145` → ⚠️ از prefix ایندکس `(cartId,variantId)` + TEMP B-TREE برای sort (EQP زیر)
- سفارش با شماره: `order.findUnique({orderNumber})` و `publicRef` — `api/orders/[orderNumber]/route.ts:60,66` → ✅ UNIQUE
- کاتالوگ: `product.findMany({where status=PUBLISHED + فیلترها, include ۵ رابطه})` — `catalog.ts:148` → ✅ `Product_status_idx` برای WHERE؛ ولی **بدون take/skip در SQL** (یافته DB-416)
- جستجو: `contains` روی title/subtitle/shortDescription + sku/isbn13 + person name — `product-list.ts:71-88` → ⚠️ LIKE '%q%' ایندکس‌پذیر نیست
- صف ادمین سفارش: `{status, createdAt desc}` → ✅ `Order_status_createdAt_idx`
- REVIEWS محصول: `{productId, moderationState}` + orderBy → ✅ ایندکس دوستونه؛ sort با TEMP B-TREE
- خانه‌سازی: sweepهای `Session.expiresAt`, `Cart.status+updatedAt`, `MailMessage.sentAt` → ✅ همگی ایندکس دارند

### EXPLAIN QUERY PLAN (روی کپی، sqlite3 read-only — نقل دقیق از `2b-data-quality.log`)
```
published_listing_scan  => SEARCH Product USING INDEX Product_status_idx (status=?)
product_by_slug         => SEARCH Product USING INDEX Product_slug_key (slug=?)
order_by_orderNumber    => SEARCH Order USING INDEX Order_orderNumber_key (orderNumber=?)
session_by_tokenHash    => SEARCH Session USING INDEX Session_tokenHash_key (tokenHash=?)
cart_by_token           => SEARCH Cart USING INDEX Cart_token_key (token=?)
orderitems_by_order     => SEARCH OrderItem USING INDEX OrderItem_orderId_idx (orderId=?)
reviews_by_product      => SEARCH Review USING INDEX Review_productId_moderationState_idx
cartitems_by_cart       => SEARCH CartItem USING INDEX CartItem_cartId_variantId_key (cartId=?) | USE TEMP B-TREE FOR ORDER BY
review_sort (createdAt) => SEARCH Review USING INDEX Review_productId_moderationState_idx | USE TEMP B-TREE FOR ORDER BY
search_contains_title   => SEARCH ProductTranslation USING INDEX ProductTranslation_locale_idx (locale=?)   [سپس فیلتر LIKE روی همهٔ ردیف‌های locale]
search_contains_variants=> SCAN Variant
storefront_category_filter => SEARCH p USING Product_status_idx + correlated subquery با Category_slug_key و COVERING INDEX ProductCategory[productId,categoryId]  ✅
order_status_created    => SEARCH Order USING INDEX Order_status_createdAt_idx
variant_by_product_active => SEARCH Variant USING INDEX Variant_productId_isActive_stock_idx
auditlog_by_entity      => SEARCH AuditLog USING INDEX AuditLog_entityType_entityId_idx
analytics_by_type_time  => SEARCH AnalyticsEvent USING INDEX AnalyticsEvent_type_createdAt_idx
mail_outbox_sweep       => SEARCH MailMessage USING INDEX MailMessage_sentAt_createdAt_idx
payment_by_order        => SCAN Payment            ❌
refund_by_order         => SCAN Refund             ❌
shipment_by_order       => SCAN Shipment           ❌
returnreq_by_order      => SCAN ReturnRequest      ❌
returnitem_by_return    => SCAN ReturnItem         ❌
orderitem_by_variant    => SCAN OrderItem          ❌
pricehist_by_variant    => SCAN PriceHistory       ❌
```
۹ کوئری داغ حیاتی ✅ همگی SEARCH با ایندکس مناسب؛ ۷ فرزند بدون ایندکس ❌ (یافته DB-406).

### ایندکس‌های پیشنهادی جاافتاده
| مدل | الگوی کوئری | ایندکس پیشنهادی | trade-off |
|---|---|---|---|
| Payment | detail صفحهٔ سفارش، refund route (`take:1 orderBy createdAt`) | `@@index([orderId, createdAt])` | +۱ ایندکس روی جدولی که فقط در پرداخت رشد می‌کند؛ نوشتن پرداخت نادر است — تقریباً رایگان |
| Refund | جمع بازپرداخت در refund/oversight | `@@index([orderId])` | همان بالا |
| Shipment | صفحهٔ سفارش/لیست ادمین | `@@index([orderId])` | کم‌هزینه |
| ReturnRequest / ReturnItem | مسیر بازگشت کالا | `@@index([orderId])` / `@@index([returnId])` | کم‌هزینه |
| OrderItem | recompute soldCount/گزارش‌ها بر اساس variant | `@@index([variantId])` | حجم OrderItem بزرگ‌ترین جدول تراکنشی؛ هزینهٔ نوشتن +۱ ایندکس |
| PriceHistory | پنل ادمین `where variantId` (`admin/products/[id]/route.ts:131`) | `@@index([variantId])` | کم‌هزینه |
| Review | sort «جدیدترین» | گسترش به `@@index([productId, moderationState, createdAt])` | رشد ایندکس؛ حذف TEMP B-TREE در PDP پربازدید |
| CartItem | payload سبد با `ORDER BY addedAt` | `@@index([cartId, addedAt, id])` | جدول کوچک؛ برای صفحات پرمسافر ارزشمند |

همه اختیاری-به‌جز گروه Payment/Refund/Shipment که رشدشان با تعداد سفارش خطی است و صفحهٔ جزئیات سفارش (پرتکرارترین کوئری ادمین) را SCAN می‌کند.

---

## ۳) مایگریشن‌ها

| # | دایرکتوری | خط | ارزیابی |
|---|---|---|---|
| ۱ | `0_init` | ۱۰۴۷ | ✅ تولید Prisma (CRC-format، CreateIndex/CreateTable/FK constraintها) شامل جدول‌های اکنون-مرده Redirect/PaymentEvent/SavedPaymentMethod |
| ۲ | `20260912133904_hot_path_indexes` | ۱۱ | ✅ ۴ CreateIndex (Order(status,createdAt), TasteSignal×۲, MailMessage(sentAt,createdAt)) |
| ۳ | `20260912141836_persepix_defaults` | ۶۲ | ✅ الگوی استاندارد Prisma برای تغییر DEFAULT (12-step redefine با `PRAGMA defer_foreign_keys`) |
| ۴ | `20260912200000_drop_dead_tables` | ۶ | ⚠️ دست‌نویس ولی موجه: `DROP TABLE IF EXISTS` ×۳ + کامنت Audit P2؛ معادل خروجی Prisma هم همین است |
| ۵ | `20260913040000_session_idle_timeout` | ۴ | ⚠️ دست‌نویس ولی موجه: `ALTER TABLE "Session" ADD COLUMN "lastSeenAt" DATETIME` — دقیقاً معادل db push |

`migration_lock.toml` = provider sqlite. ✅

### وضعیت درشت: DB با `db push` ساخته شده، نه `migrate` (یافته DB-401 — High)
- جدول **`_prisma_migrations` در DB وجود ندارد** (`no such table`) → این فایل هرگز migrate نشده.
- `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma` → **«No difference detected.»** (زنجیرهٔ مایگریشن با schema کاملاً هم‌گام است).
- `prisma migrate diff --from-url <کپی DB> --to-schema-datamodel schema.prisma` → **«No difference detected.»** (DB زنده دقیقاً = schema).
- نتیجه: محتوای DB و زنجیره هر دو سالم‌اند؛ فقط **سابقهٔ اجرا گم است**. `prisma migrate deploy` روی همین فایل (مثلاً در کانتینر prod که volume قدیمی را می‌آورد) fail می‌شود چون جداول از قبل هست ولی baseline ثبت نشده. راه‌حل ۳۰دقیقه‌ای: `prisma migrate resolve --applied 20260913040000_session_idle_timeout` روی DB فعلی (بعد از یک baseline deploy روی DB خام) یا استاندارد کردن «deploy فقط روی DB تازه + push ممنوع».

---

## ۴) کیفیت داده — شمارش‌های دقیق (کپیِ `039ae1d6…`؛ PII ماسک شده)

اسکریپت: `audit-output/evidence/2b-data-quality.py` → خروجی کامل `2b-data-quality.json` / متن `2b-data-quality.log`.

| چک | نتیجه |
|---|---|
| `PRAGMA integrity_check` | **ok** |
| ایمیل/کاربر تکراری | **۰** (۴۸ رابطه FK چک شد) |
| googleSub تکراری | ۰ (۲ NULL — مجاز: حساب فقط-ایمیل) |
| slug تکراری (product/category/article/person/articleCategory) | **۰/۰/۰/۰/۰** |
| SKU / ISBN13 / ISBN10 / barcode تکراری | **۰** (isbn13 روی چند محصول: ۰) |
| ردیف یتیم (۳۲ جدول فرزند، ۴۸ رابطه) | **۰ یتیم در کل DB** |
| soft-ref یتیم | WishlistItem/TasteSignal/AnalyticsEvent.productSlug = **۰**؛ `Product.seriesSlug`→slug محصول: ۳ (موردانتظار — series متن آزاد است، DB-410) |
| AuditLog dangling | **۰ از ۴ ردیف** |
| موجودی منفی (Variant.stock<0) | **۰** |
| قیمت ≤ ۰ (کل / published+active) | **۰ / ۰** |
| ارز غیر EUR | **۰** (Variant/Cart/Order/Payment همگی فقط EUR) |
| locale خارج از {en,fa} | **۰** (۱۳ ستون locale بررسی شد) |
| ترجمهٔ ناقص (missing en / missing fa) | products **۰/۰**، articles **۰/۰**، categories **۰/۰**، persons **۰/۰**، articleCategories **۰/۰** |
| محصول published بدون variant فعال / بدون ترجمه / بدون توضیح / بدون seoTitle / بدون seoDesc / بدون تصویر | **۰ / ۰ / ۰ / ۰ / ۰ / ۰** (از ۱۰ محصول published) |
| محصول published با تمام variantها stock=۰ | **۱** (قفسهٔ «ناموجود» — مجاز ولی فروش‌ناپذیر) |
| قیمت‌گذاری: مجموع آیتم‌ها=subtotal | **۰ مغایرت از ۳ سفارش** |
| فرمول total (subtotal−discount+shipping+giftWrap=total) | **۰ مغایرت** |
| total خط آیتم (unit×qty) | **۰ مغایرت از ۵ آیتم** |
| مبالغ منفی در سفارش | **۰** |
| PAID بدون Payment موفق / بالعکس / amount≠total | **۰ / ۰ / ۰** |
| بازپرداخت بیش از پرداخت / Refund بدون Payment موفق | **۰ / ۰** (Refund=۰ ردیف) |
| return qty > ordered qty | **۰** (ReturnItem=۰) |
| سبد بدون expiresAt | **۸ از ۸ (۱۰۰٪)** — ستون مرده، DB-407 |
| سبد مهمان خالی (ACTIVE) | **۷ از ۸** (ساخت SEC-005 جلوی تولید برای ربات‌ها را گرفته؛ housekeeping بعد ۷روز پاک می‌کند) |
| Session منقضی‌شده / revoked / idle-expired | **۰ / ۱ / ۰** |
| رضایت stale | **۰** (ConsentRecord=۰ ردیف — seed از API checkout نگذشته، DB-409؛ CookieConsent=۱) |
| ردیف QA/demo | **۱ کاربر** `c***@example.com` + **۳ سفارش** با ایمیل example.com (دیتای seed — DB-428) |
| JSON نامعتبر در ۱۰ ستون JSON-as-String | **۰ از ۸۲ مقدار** (Settings ۳، HomepageSection ۳۲، Order ۷، Person ۱۲، longDescription ۲۰، article body ۸) |
| PII برای کاربران anonymized | **۰ کاربر anonymized → ۰ ردیف باقی‌مانده** (مسیر حذف، همهٔ فیلدها را پاک می‌کند — تأیید کد) |
| شمارنده‌های ناسازگار | **Variant.soldCount: ۱۱ از ۱۱ مغایرت** (ذخیره ۳۸–۱۴۲ vs محاسبه‌شده ۰–۱ — اعداد نمایشی seed، DB-415)؛ DiscountCode.timesUsed: ۰ از ۰ |
| سفارش مهمان بدون publicRef | **۱ از ۱ سفارش مهمان** (هر ۳ سفارش seed فاقد publicRef — قبل از C6؛ DB-418 در فهرست) |

**جمع‌بندی: صفر خطای جامدیت واقعی.** تنها موارد غیرصفر: ستون مردهٔ expiresAt، اعداد نمایشی soldCount، و ردیف‌های demo.

---

## ۵) شمار ردیف‌ها (Scale Picture — DB seed)

| جدول | ردیف | جدول | ردیف |
|---|---|---|---|
| User | ۲ | Product | ۱۰ |
| Variant | ۱۱ | ProductTranslation | ۲۰ |
| Order | ۳ | OrderItem | ۵ |
| Cart / CartItem | ۸ / ۱ | Review | ۱۴ |
| Session | ۳ | Payment | ۳ |
| Shipment | ۲ | OrderEvent | ۱۰ |
| AuditLog | ۴ | ConsentRecord | ۰ |
| NewsletterSubscriber | ۰ | Article | ۴ |
| Address | ۲ | MailMessage | ۲ |
| Person | ۱۲ | HomepageSection/Version | ۳۲/۴ |
| LegalDocument | ۱۲ | AnalyticsEvent/TasteSignal | ۰/۰ |

DB = ~۹۴۸KB؛ بزرگ‌ترین محتوا: HomepageSection.settingsJson + longDescription بلوک‌ها. Analytics/TasteSignal خالی (فقط کد سمت کلاینت — تاکنون ترافیکی ثبت نشده یا پاک شده).

---

## ۶) آمادگی SQLite-خاص

| مورد | وضعیت |
|---|---|
| `PRAGMA integrity_check` | ok |
| `journal_mode` | **delete** (نه WAL) — DB-402 |
| `foreign_keys` | Prisma engine برای SQLite همیشه FK را ON اجرا می‌کند (سطح engine، نه اتصال اپ)؛ در DB فایل‌محور Prisma هر اتصال را با foreign_keys=ON می‌سازد ✅ — ولی DB مستقل (python/raw sqlite) پیش‌فرض OFF دارد |
| busy_timeout / tuning در `src/lib/db.ts` | **هیچ PRAGMA یا connection-optionای ست نشده** (`db.ts` فقط log config دارد) — DB-402 |
| فایل | ۹۷۰,۷۵۲ بایت، ۲۳۷ صفحه، freelist=۳ (~۱۲KB فضای آزاد — سالم) |
| WAL فایل‌های `-wal/-shm` | وجود ندارد (مد delete) |
| هم‌زمانی | SQLite تک‌نویسنده؛ checkout در `$transaction` تعاملی کوتاه + idempotency cache؛ ریسک `SQLITE_BUSY` زیر ترافیک موازی واقعی |

---

## ۷) جمع‌بندی مقیاس‌پذیری (ارزیابی — Assessment، نه اندازه‌گیری)

**فرض‌ها:** رشد فروشگاه کتاب؛ محصول=۱ ردیف + ~۲ ترجمه + ~۳ variant + چند review؛ اتصال پرسیست برای یک پروسهٔ Next.js.

| محور | مرز تخمینی شکست | چرا |
|---|---|---|
| کاتالوگ/صفحه‌بندی در حافظه (`fetchCards` بدون take/skip — DB-416) | **~۱۰۰۰–۳۰۰۰ محصول published** (یا ~۵۰–۱۰۰هزار review تجمیع‌شده در کارت‌ها) | هر درخواست لیست/PDP-شبکی همهٔ published + ۵ include را می‌کشد؛ در ~۱۰ محصول الان ~۱ms، رشد خطی تا سقف حافظه/CPU؛ ناگهان نه — به‌تدریج (p95 بالا، GC) |
| جستجوی `contains` (LIKE '%q%') — DB-417 | **~۱۰–۵۰ هزار ردیف ترجمه** | full-scan per locale؛ در ۲۰ ردیف الان نامرئی؛ بعد از آن پرس‌وجوی جستجو ۱۰۰ms+ روی دیسک سرد |
| تک‌نویسنده SQLite (بدون WAL — DB-402) | **ده‌ها write هم‌زمان** (چک‌اوت + analytics + lastSeenAt write/hour/session) | با WAL فقط خواننده‌ها موازی می‌شوند؛ بدون آن هر write ریدرها را قفل می‌کند |
| حجم DB | ~۱۰۰MB+ (میلیون‌ها ردیف) هنوز کار می‌کند ولی بکاپ/restore کند | تک‌فایل؛ VACUUM دوره‌ای لازم |
| Postgres cutover | طراحی آماده است (minor units, UUID-cuid, SQL استاندارد؛ `DB-001` already has pg branch) | موارد DB-404/405/403 با Postgres حل می‌شود؛ schema تغییری جز Json/enum نمی‌خواهد |

**حکم:** برای launch و ماه‌های اول (~صدها سفارش/هزاران ردیف) پیکربندی فعلی کافی است. دو کار پیش از «رشد واقعی»: ① WAL + ایندکس‌های FK-فرزند (نیم‌روز)، ② SQL-side pagination/aggregate برای کاتالوگ (PERF-001، ۱–۳ روز، نیازمند تغییر schema برای price-sortable ستون denormalized).

---

## ۸) یاقته‌ها (Findings) — DB-401 تا DB-429

قالب هر یافته: شناسه / عنوان / شدت / وضعیت / اطمینان / مکان دقیق / توضیح و تریگر / سناریوی خرابی / شواهد / رفع / زمان / ریسک رگرسیون / تست پذیرش.

---

**DB-401 — پایگاه‌داده با `db push` ساخته شده؛ جدول `_prisma_migrations` وجود ندارد (drift سابقهٔ اجرا)**
- **شدت:** High | **وضعیت:** Confirmed | **اطمینان:** قطعی
- **مکان:** `db/custom.db` (کل DB)؛ `prisma/migrations/` (۵ دایرکتوری)؛ `worklog.md` P0-r1 («ran `bunx prisma db push`»)
- **توضیح/تریگر:** فایل DB هرگز از طریق `prisma migrate` نشده؛ سابقهٔ اجرا ثبت نیست. زنجیرهٔ migrations با schema هم‌گام است (diff تمیز) ولی این DB «بساز» است نه «اجرا».
- **سناریوی خرابی:** اولین `prisma migrate deploy` روی همین volume (استاندارد Dockerfile/prod) چون جداول از قبل وجود دارند fail می‌شود؛ CI/CD قفل می‌شود؛ تیم دوباره به db push پناه می‌برد و چرخه تکرار می‌شود.
- **شواهد:** `sqlite3: SELECT * FROM _prisma_migrations` → `no such table`؛ `prisma migrate diff --from-url <copy> --to-schema-datamodel` → No difference؛ `--from-migrations` → No difference (`evidence/2b-diff-db-vs-schema.log`, `2b-diff-migrations-vs-schema.log`)
- **رفع:** روی DB فعلی فقط یک‌بار: `bunx prisma migrate resolve --applied 20260913040000_session_idle_timeout` (بس‌است چون DB==زنجیره)؛ سپس حکم «push ممنوع در prod، فقط migrate deploy». برای DB تازهٔ prod: `migrate deploy`.
- **زمان:** ۰.۵–۱ ساعت (شامل اصلاح مستند deploy) | **ریسک رگرسیون:** کم (فقط ثبت سابقه) 
- **تست پذیرش:** `bunx prisma migrate status` → «Database schema is up to date!»؛ دومی روی کپی DB انجام شود.

**DB-402 — journal_mode=delete (بدون WAL) و هیچ busy_timeout/tuning در `src/lib/db.ts`**
- **شدت:** Medium | **وضعیت:** Confirmed (مقدار pragma) / Likely (اثر زیر بار) | **اطمینان:** بالا
- **مکان:** `db/custom.db` (pragma)؛ `src/lib/db.ts:22-28` (فقط `log:` پاس می‌شود)
- **توضیح/تریگر:** مد journal فایل delete است؛ خواننده‌ها هنگام write بلاک می‌شوند. اپ هیچ PRAGMA/connection param ای ست نمی‌کند.
- **سناریوی خرابی:** چند چک‌اوت/نوشتن analytics/lastSeenAt هم‌زمان → `SQLITE_BUSY` → ۵۰۲های پراکنده در ساعات ترافیک.
- **شواهد:** `PRAGMA journal_mode` → `delete`؛ `PRAGMA page_count=237`؛ grep در db.ts ← بدون tuning.
- **رفع:** یک‌بار: `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;` (ماندگار روی فایل به‌جز synchronous) + در `DATABASE_URL` پارامترهای Prisma (`?connection_limit=5&socket_timeout=15`)؛ بازبینی healthz برای `PRAGMA wal_checkpoint`.
- **زمان:** ۱–۲ ساعت + یک restore-drill | **ریسک رگرسیون:** کم (WAL روی شبکه/فایل‌سیستم غیرمحلی ممنوع — در Docker volume محلی مشکلی نیست)
- **تست پذیرش:** `PRAGMA journal_mode` → `wal`؛ تست موازی ۵۰ ریدر + ۵ رایت بدون BUSY.

**DB-403 — ۳۵ فیلد enum-like بدون enforcement در DB (String آزاد)**
- **شدت:** Medium | **وضعیت:** Confirmed | **اطمینان:** قطعی (لیست کامل در §۱.۳)
- **مکان:** نمونه‌های کلیدی: `User.role:28`, `User.status:29`, `Product.status:177`, `Variant.format:230`, `Order.status:469`, `Order.paymentStatus:473`, `Review.moderationState:642`, …
- **توضیح/تریگر:** محدودیت SQLite؛ مقدار خارج از دامنه فقط از مسیر باگ/raw write وارد می‌شود. دادهٔ فعلی ۱۰۰٪ سالم است (جدول §۱.۳).
- **سناریوی خرابی:** یک PATCH ادمین با string غلط → وضعیت غیرقابل‌رندر در UI/گزارش‌ها؛ در switchهای TS ساکت به شاخهٔ default می‌افتد.
- **شواهد:** grep `// [A-Z_]+ \|` در schema؛ مقادیر distinct در `2b-data-quality.json → value_domains`.
- **رفع:** در SQLite فعلی: zod enum در همهٔ ورودی‌های ادمین (بیشترش هست) + تست مرز. در cutover Postgres: `enum` واقعی یا CHECK. (Prisma اخیراً CHECK را برای SQLite پشتیبانی نمی‌کند — DB-404.)
- **زمان:** cutover جزو همان کار | **ریسک:** کم | **تست:** تلاش برای نوشتن status='WIP' باید 400 بگیرد.

**DB-404 — هیچ CHECK constraintای در هیچ جدول نیست (SQLite)**
- **شدت:** Medium | **وضعیت:** Confirmed | **اطمینان:** قطعی
- **مکان:** کل `prisma/migrations/0_init/migration.sql` (۱۰۴۷ خط، بدون CHECK) + schema.prisma
- **توضیح/تریگر:** حتی invariantهای ارزان مثل `stock >= 0`, `priceMinor > 0`, `rating BETWEEN 1 AND 5`, `quantity > 0` در DB تضمین نمی‌شوند.
- **سناریوی خرابی:** باگ در مسیر stock-adjust/سید → موجودی منفی/قیمت صفر بی‌سروصدا ذخیره می‌شود (اکنون ۰ است چون مسیرهای اپ درست‌اند).
- **شواهد:** `rg -i "CHECK" prisma/migrations` → ۰؛ مقدارهای دامنه سالم (§۴).
- **رفع:** در cutover Postgres CHECKهای فوق را در migration دستی اضافه کن (SQLite: بازنویسی جدول لازم دارد — ارزشش را در sandbox ندارد). لایهٔ اپ اکنون جبران می‌کند (checkout همهٔ مبالغ را خودش می‌سازد).
- **زمان:** ۲–۳ ساعت در cutover | **ریسک:** کم | **تست:** INSERT با priceMinor=0 باید fail کند.

**DB-405 — ۱۰ ستون JSON-in-String بدون تضمین ساختار در DB**
- **شدت:** Low | **وضعیت:** Confirmed | **اطمینان:** قطعی
- **مکان:** §۱.۴ (سطرها + خط‌های schema)
- **توضیح/تریگر:** همهٔ ۸۲ مقدار فعلی JSON معتبرند؛ ریسک فقط از مسیر کدِ آینده است. خواندن نیازمند `JSON.parse` در اپ؛ کوئری‌پذیری صفر (فیلتر sale/fixed روی `excludedProductIds` در حافظه انجام می‌شود — `product-list.ts:131-135`).
- **سناریوی خرابی:** پس از cutover بدون تبدیل به `Json`، فیلترهای promotion-exclusion به‌صورت حافظه‌ای می‌مانند و در مقیاس کاتالوگ گران می‌شوند.
- **شواهد:** `json_string_validity` در JSON خروجی (۰ invalid).
- **رفع:** در cutover: `Json` + GIN در صورت نیاز؛ اکنون: هیچ (بلوک‌ها renderer اعتبارسنج دارند).
- **زمان:** ۰ (جزو cutover) | **ریسک:** — | **تست:** migrate diff پس از تبدیل تیپ‌ها.

**DB-406 — ۷ رابطهٔ FK فرزند بدون ایندکس (SCAN در کوئری‌های صفحهٔ سفارش/بازگشت)**
- **شدت:** Medium (در مقیاس فعلی Informational؛ با رشد سفارش Medium) | **وضعیت:** Confirmed | **اطمینان:** قطعی (EQP)
- **مکان:** `Payment.orderId:540`, `Refund.orderId:557`, `Shipment.orderId:572`, `ReturnRequest.orderId:602`, `ReturnItem.returnId:620 / orderItemId:621`, `OrderItem.variantId:517`, `PriceHistory.variantId:311` (+ اختیاری: `Order.discountCode:481`)
- **توضیح/تریگر:** SQLite FK ایندکس خودکار نمی‌سازد. کوئری‌های `WHERE orderId=?`/`variantId=?` SCAN می‌شوند (EQP §۲).
- **سناریوی خرابی:** در ۱۰۰k سفارش، هر بازِ صفحهٔ جزئیات سفارش ادمین ۳–۵ full-scan انجام می‌دهد؛ پنل کند می‌شود.
- **شواهد:** EQP: `payment_by_order => SCAN Payment` و ۶ مورد دیگر.
- **رفع:** ایندکس‌های جدول §۲ (یک migration سادهٔ CreateIndex).
- **زمان:** ۱–۲ ساعت | **ریسک:** کم (فقط ایندکس) | **تست:** EQP پس از migration → SEARCH.

**DB-407 — `Cart.expiresAt` ستون مرده (۰ نویسنده، ۰ خواننده) + ۸/۸ سبد NULL**
- **شدت:** Low | **وضعیت:** Confirmed (مستند v3 هم DB-002 بود) | **اطمینان:** قطعی
- **مکان:** `schema.prisma:439`؛ `cart.ts` (هیچ استفاده‌ای)؛ داده: ۸/۸ NULL
- **توضیح/تریگر:** انقضای سبد عملاً با `status` (ACTIVE/ABANDONED) و housekeepingِ `updatedAt` مدیریت می‌شود (housekeeping.ts:31-39).
- **سناریوی خرابی:** سوت‌فهمی توسعه‌دهندهٔ بعدی («انقضا داریم!»)؛ ستون بی‌استفاده در cutover منتقل می‌شود.
- **رفع:** حذف ستون در migration بعدی (SQLite: redefine) یا شروع به نوشتن `now+30d` در `getOrCreateCart`.
- **زمان:** ۰.۵ ساعت | **ریسک:** کم | **تست:** `migrate diff` تمیز؛ `/api/cart` سالم.

**DB-408 — `PriceHistory` هرگز پر نمی‌شود (۰ ردیف) و بدون ایندکس است**
- **شدت:** Informational | **وضعیت:** Confirmed | **اطمینان:** بالا
- **مکان:** `schema.prisma:309-320`؛ نویسنده: `admin/products/[id]/route.ts:435+` (فقط ویرایش ادمین)؛ seed قیمت را مستقیم می‌گذارد.
- **توضیح/تریگر:** برای ۱۰ محصول seed، تاریخ قیمت خالی است — گزارش «تغییر قیمت» ادمین خالی نمایش داده می‌شود.
- **رفع:** هیچ (ماهیت seed) یا یک ردیف baseline در seed بنویس. ایندکسش را DB-406 پوشش می‌دهد.
- **زمان:** ۰–۰.۵ ساعت | **تست:** ویرایش قیمت از پنل → ۱ ردیف PriceHistory.

**DB-409 — `ConsentRecord` خالی (۰) در حالی که checkout می‌نویسد؛ اسنپ‌شات رضایت فقط در `Order.consentsJson`**
- **شدت:** Informational | **وضعیت:** Confirmed | **اطمینان:** بالا
- **مکان:** `schema.prisma:88-101`؛ `checkout/route.ts:314 (tx.consentRecord.createMany)`؛ داده: ۳ سفارش دارای consentsJson، ۰ ConsentRecord
- **توضیح/تریگر:** سفارش‌های فعلی از seed هستند (نه API checkout)؛ در اولین چک‌اوت واقعی rows ساخته می‌شوند. ناسازگاری ظاهری، نه خطا.
- **رفع:** هیچ. (در تست پذیرشِ چک‌اوت، شمارش ConsentRecord را چک کن.)
- **تست:** POST /api/checkout موفق → ConsentRecord +۲ (terms,privacy).

**DB-410 — «series» مدل‌سازی نشده: متن آزاد `Product.series/seriesSlug` (بدون جدول Series)**
- **شدت:** Informational | **وضعیت:** Confirmed | **اطمینان:** بالا
- **مکان:** `schema.prisma:181-182`؛ فیلتر `product-list.ts:98` (`{OR:[{seriesSlug},{series}]}`)؛ داده: ۳ مقدار seriesSlug که به هیچ slug محصولی اشاره نمی‌کنند (طبیعی — به «سری» اشاره می‌کنند نه محصول)
- **توضیح/تریگر:** صفحهٔ series از فیلتر رشته‌ای می‌آید؛ rename دستی می‌تواند سری‌ها را بشکند (slug مستقل ندارند).
- **رفع:** بعد از launch (اگر سری مهم شد): جدول Series + FK. اکنون: هیچ.
- **تست:** تغییر یک series در ادمین → صفحهٔ سری همان گروه را نشان دهد.

**DB-411 — ارجاع‌های slug-based بدون FK (`WishlistItem.productSlug`, `TasteSignal/AnalyticsEvent.productSlug`)**
- **شدت:** Low | **وضعیت:** Confirmed | **اطمینان:** قطعی
- **مکان:** `schema.prisma:855`, `873`, `763`
- **توضیح/تریگر:** rename محصول (ادمین می‌تواند slug را عوض کند) ردیف‌های wishlist/taste را بی‌صدا یتیم می‌کند (اکنون ۰ یتیم).
- **سناریوی خرابی:** کاربر wishlist دارد؛ ادمین slug را عوض می‌کند → آیتم wishlist دیگر resolve نمی‌شود.
- **رفع:** کوتاه‌مدت: redirect map یا ممنوعیت تغییر slug؛ بلندمدت: تبدیل به productId FK.
- **زمان:** ۱–۲ ساعت | **ریسک:** کم | **تست:** rename slug → wishlist کاربر سالم بماند.

**DB-412 — `Variant.isbn10` و `barcode` بدون UNIQUE (برخلاف sku/isbn13)**
- **شدیت:** Low | **وضعیت:** Confirmed | **اطمینان:** قطعی
- **مکان:** `schema.prisma:228-229` | دادهٔ فعلی: ۰ تکراری
- **سناریوی خرابی:** ورود دوبارهٔ همان ISBN10/barcode در نسخهٔ دیگر یک کتاب → جستجوی سرویس‌های بیرونی/انبار گیج می‌شود.
- **رفع:** `@unique` روی isbn10 (data-check قبل از اعمال)؛ barcode ممکن است واقعاً تکرار شود (EAN مشترک) → شاید فقط ایندکس.
- **زمان:** ۰.۵ ساعت | **ریسک:** کم | **تست:** migrate diff + تلاش درج تکراری → خطا.

**DB-413 — `AuditLog` بدون FK (entityType/entityId رشته‌ای) — ۰ dangling فعلی**
- **شدت:** Informational | **وضعیت:** Confirmed | **اطمینان:** قطعی
- **مکان:** `schema.prisma:723-733` | چک: entityهای PRODUCT/ORDER/ARTICLE همگی موجودند (۰ dangling از ۴ ردیف)
- **توضیح:** عمدی و رایج (append-only، مستقل از حذف)؛ فقط باید sweep dangling گزارش شود نه fail.
- **رفع:** هیچ (طرح فعلی خوب است)؛ گزارش «refers to deleted entity» در صفحهٔ ادمین audit-log.
- **تست:** حذف یک محصول → لاگ‌هایش می‌مانند و لیبل «حذف‌شده» می‌گیرند.

**DB-414 — `Ticket.order` با `relatedOrderNumber` (FK روی unique غیر-PK)**
- **شدت:** Informational | **وضعیت:** Confirmed | **اطمینان:** قطعی
- **مکان:** `schema.prisma:687` (`references: [orderNumber]`)
- **توضیح:** کار می‌کند (orderNumber unique و immutable است) ولی الگوی غیرمعمول FK-به-کلید-غیر-id؛ SetNull پیش‌فرض با حذف سفارش رفرش می‌شود.
- **رفع:** هیچ اجباری؛ در cutover می‌توان orderId را به مدل اضافه کرد.
- **تست:** تیکت با شمارهٔ سفارش → صفحهٔ ادمین لینک سفارش را نشان دهد.

**DB-415 — `Variant.soldCount` در seed تزریقی و ناسازگار با OrderItem واقعی (۱۱/۱۱ مغایرت)**
- **شدت:** Low | **وضعیت:** Confirmed | **اطمینان:** قطعی
- **مکان:** `schema.prisma:244`؛ داده: ذخیره ۳۸–۱۴۲ vs محاسبه از سفارش‌های موفق ۰–۱ (نمونه‌ها در log)
- **توضیح/تریگر:** seed اعداد «پرفروش» تزریق می‌کند؛ سورت «bestselling» فروشگاه از `rating.count` استفاده می‌کند (`catalog.ts:124`) نه soldCount → تاثیر مشتری صفر؛ مصرف واقعی: پنل ادمین/export.
- **سناریوی خرابی:** گزارش‌ها/داشبورد ادمین اعداد ناسازگار نشان می‌دهند؛ audit «soldCount vs orders» شکست می‌خورد.
- **رفع:** در seed هم soldCount را واقعی بگذار (۱–۳) یا کامنت «display-only» بگذار؛ یا پس از هر پرداخت increment شود (اکنون فقط checkout می‌نویسد؟ — `checkout/route.ts` soldCount را increment می‌کند؛ سفارش‌های seed از مسیر checkout نرفته‌اند).
- **زمان:** ۰.۵ ساعت | **تست:** پس از یک چک‌اوت واقعی، soldCount = soldCount+qty.

**DB-416 — صفحه‌بندی/سورت/فیلتر قیمت کاتالوگ در حافظه (بدون take/skip در SQL)**
- **شدت:** High (برای مقیاس) — در دادهٔ فعلی بی‌اثر | **وضعیت:** Confirmed (کد) / Likely (نقطهٔ شکست) | **اطمینان:** بالا
- **مکان:** `catalog.ts:144-150` (`findMany` بدون take)؛ `product-list.ts:107-146` (فیلتر/سورت/slice در JS)
- **توضیح/تریگر:** هر درخواست لیست، همهٔ published + ۵ رابطه (ترجمه‌ها، variantها، contributors+person+ترجمه، reviewهای approved، categories) را می‌کشد؛ سورت newest/bestselling/price همگی در JS.
- **سناریوی خرابی:** ~۱–۳k محصول: p95 درخواست‌ها چند صد ms تا ثانیه و حافظهٔ process بالا؛ ~۵k+ : timeout/شکست. با contains-search (DB-417) ترکیب می‌شود.
- **شواهد:** کد؛ EQP فقط WHERE را می‌پوشاند؛ پیکربندی فعلی ۱۰ محصول.
- **رفع:** همان PERF-001 مستندشده: ستون denormalized `effectivePriceMinor` در Product (+ ایندکس `status,priceMinor`)، orderBy/take/skip در SQL، شمارش جداگانه؛ فروشگاه نمی‌تواند SQL-side شود مگر سورت‌ها به ستون‌های real تبدیل شوند.
- **زمان:** ۱–۳ روز (سندشده از قبل) | **ریسک:** متوسط (semantics سورت/nulls-last باید حفظ شود) | **تست:** صفحهٔ کاتالوگ با ۵k محصول seed → p95 < 300ms.

**DB-417 — جستجوی `contains` = LIKE '%…%' بدون FTS (SCAN روی ترجمه‌ها و Variant)**
- **شدت:** Medium (مقیاس) | **وضعیت:** Confirmed (کد/EQP) | **اطمینان:** بالا
- **مکان:** `product-list.ts:71-88`؛ EQP: `search_contains_variants => SCAN Variant`، عنوان‌ها فقط با ایندکس locale فیلتر می‌شوند
- **توضیح/تریگر:** طرح مقصد (کامنت schema:864-866) FTS/pg_trgm است؛ SQLite فعلی scan می‌کند.
- **سناریوی خرابی:** ۱۰k+ ردیف ترجمه → جستجو ۱۰۰ms+؛ با ترافیک هم‌زمان ضرب می‌شود.
- **رفع:** کوتاه‌مدت: پیشوندی‌کردن جستجو (q% — ایندکس locale,title را استفاده می‌کند) اختیاری؛ واقعی: FTS5 virtual table یا cutover به pg_trgm/websearch_to_tsquery.
- **زمان:** FTS5: ۱ روز؛ cutover: جزو همان | **ریسک:** متوسط (رفتار فارسی/عربی در FTS5 بدون tokenizer مناسب ضعیف است → cutover ترجیح دارد) | **تست:** ۵k ترجمه → LIKE %x% < 50ms با FTS.

**DB-418 — سفارش‌های legacy بدون `publicRef` (۳/۳) — مسیر ردیابی مهمان C6 برایشان کار نمی‌کند**
- **شدت:** Low | **وضعیت:** Confirmed | **اطمینان:** قطعی
- **مکان:** `schema.prisma:466`؛ داده: هر ۳ سفارش seed بدون publicRef؛ `orders/[orderNumber]/route.ts:66` fallback به orderNumber+email
- **توضیح/تریگر:** سفارش‌های قبل از C6 چنین ستونی نداشتند؛ چک‌اوت واقعی publicRef می‌سازد.
- **سناریوی خرابی:** فقط دیتای demo؛ مشتری واقعی تأثیر نمی‌گیرد.
- **رفع:** backfill در seed یا هیچ.
- **زمان:** ۰.۵ ساعت | **تست:** GET tracking با publicRef برای سفارش تازه → ۲۰۰.

**DB-419 — مرتب‌سازی reviewها با TEMP B-TREE (`createdAt`)**
- **شدت:** Low | **وضعیت:** Confirmed (EQP) | **اطمینان:** قطعی
- **مکان:** `product-detail.ts:179-181`؛ ایندکس فعلی `Review_productId_moderationState_idx:655`
- **رفع:** `@@index([productId, moderationState, createdAt])` (جایگزین دوستونهٔ فعلی)؛ trade-off: ایندکس کمی بزرگ‌تر.
- **زمان:** ۰.۵ ساعت | **تست:** EQP → بدون «USE TEMP B-TREE».

**DB-420 — مرتب‌سازی آیتم‌های سبد با TEMP B-TREE (`addedAt`)**
- **شدت:** Low | **وضعیت:** Confirmed (EQP) | **اطمینان:** قطعی
- **مکان:** `cart.ts:142-145`؛ ایندکس فعلی فقط `(cartId,variantId):458`
- **رفع:** `@@index([cartId, addedAt, id])`؛ trade-off: ناچیز.
- **زمان:** ۰.۵ ساعت | **تست:** EQP → SEARCH بدون B-TREE.

**DB-421 — [نقطه‌قوت تأییدشده] سلامت جامدیت داده: ۰ یتیم، ۰ تکراری، ۰ مغایرت مالی**
- اسکن ۴۸ رابطهٔ FK + ۱۶ چک تکراری + ۱۷ چک مالی روی کل DB: همگی صفر. ✅

**DB-422 — [نقطه‌قوت تأییدشده] پول همه‌جا Int minor units، بدون Float**
- §۱.۵؛ فرمول total در ۳ سفارش + ۵ آیتم بازتولید و تأیید شد.

**DB-423 — [نقطه‌قوت تأییدشده] اسنپ‌شات تغییرناپذیر سفارش**
- OrderItem (title/sku/price) + discountCode رشته‌ای + consentsJson + promo snapshot؛ PDP بعد از تغییر/حذف محصول سفارش را دست‌نخورده نشان می‌دهد (variantId اختیاری + SetNull).

**DB-424 — [نقطه‌قوت تأییدشده] طراحی GDPR حذف حساب کامل است**
- `deletion-request/route.ts:46-95`: scrub ایمیل/آدرس JSON/giftMessage/customerNote سفارش‌ها، حذف Address/Newsletter/BackInStock، scrub Ticket/Review/Consent، revoke همهٔ Sessionها — همه در یک تراکنش. چک DB: ۰ anonymized → ۰ PII باقی‌مانده.

**DB-425 — [نقطه‌قوت] زنجیرهٔ migrations سالم و هم‌گام؛ دو فایل دست‌نویس موجه**
- هر ۵ migration plausibliتهٔ Prisma دارند؛ `migrate diff from-migrations → schema` بدون تفاوت؛ فایل‌های drop/alter دست‌نویس دقیقاً معادل خروجی Prisma هستند. (این نقطه‌قوت به DB-401 گره خورده: فقط سابقهٔ اجرا ثبت نشده.)

**DB-426 — [نقطه‌قوت] توکن‌ها فقط hashed ذخیره می‌شوند (session/reset/verify/change) + چرخش در login**
- `Session.tokenHash @unique`, `PasswordResetToken/EmailVerificationToken/EmailChangeToken.tokenHash @unique` — نشت DB قابل استفادهٔ مجدد نیست.

**DB-427 — [نقطه‌قوت] ایندکس‌گذاری hot-path پیش‌بینی‌شده**
- ۸۴ ایندکس؛ ۹/۹ کوئری داغ حیاتی SEARCH با ایندکس مناسب؛ شواهد EQP §۲.

**DB-428 — ردیف‌های demo/QA پیش از launch باید پاک شوند**
- **شدت:** Low | **وضعیت:** Confirmed | **اطمینان:** قطعی
- **مکان:** داده: ۱ کاربر `c***@example.com`، ۳ سفارش با ایمیل example.com، ۱۴ review بدون userId، ۰ NewsletterSubscriber
- **توضیح/تریگر:** seed در prod اجرا شود → سفارش‌ها/reviewهای ساختگی در پنل واقعی.
- **رفع:** دو seed مجزا (demo/prod) یا gate `NODE_ENV`؛ چک‌لیست launch: «seed فقط demo».
- **زمان:** ۱ ساعت | **تست:** در prod: `SELECT COUNT(*) FROM "Order" WHERE email LIKE '%example.%'` = ۰.

**DB-429 — حذف Order همهٔ Payment/Refund/OrderEvent را Cascade می‌کند (تخریب سابقهٔ مالی)**
- **شدت:** Low (هیچ مسیر کدی سفارش را حذف نمی‌کند) | **وضعیت:** Confirmed (طرح) | **اطمینان:** بالا
- **مکان:** `Order.items/payments/shipments/events/refunds/returns` (۴۹۹–۵۰۵ همگی Cascade سمت فرزند)
- **سناریوی خرابی:** یک پاکسازی دستی DB/باسگ پنل آینده → از بین رفتن اسناد مالی (الزام نگهداری ۱۰سالهٔ تجاری آلمان).
- **رفع:** onDelete: Restrict برای `Refund.order` و `Payment.order` (یا قانون «هرگز Order حذف نکن» در docs + محافظت DB).
- **زمان:** ۰.۵ ساعت + تست | **ریسک:** کم | **تست:** تلاش برای حذف سفارش دارای Payment → خطا.

---

## ۹) نقاط قوت تأییدشده (جمع‌بندی)
1. **صفر خطای جامدیت** در ۴۸ رابطهٔ FK، ۱۶ چک تکراری، ۱۷ چک مالی (DB-421).
2. الگوی پول درست (Int minor، DB-422) و اسنپ‌شات سفارش کامل (DB-423).
3. GDPR حذف/anonymous واقعی و کامل (DB-424) + توکن‌های hashed (DB-426).
4. ایندکس‌گذاری hot-path هوشمند: session/cart/slug/orderNumber/audit همه unique یا مرکب درست (DB-427)؛ EQP ۹/۹ سبز.
5. زنجیرهٔ migrations هم‌گام و قابل‌deploy روی DB تازه (DB-425) — فقط baseline ثبت نشده (DB-401).
6. ترجمهٔ دوزبانه کامل ۱۰۰٪ برای محصول/مقاله/شخص/دسته/دستهٔ مقاله (۰/۰/۰/۰/۰).
7. دامنه‌های مقادیر (status/role/currency/locale/format) ۱۰۰٪ سالم در دادهٔ فعلی.

## ۱۰) اقدامات بعدی پیشنهادی (به‌ترتیب)
1. **DB-401**: baseline مایگریشن (`migrate resolve`) + ممنوعیت db push در prod — ۱ ساعت، اولویت ۱.
2. **DB-402**: فعال‌سازی WAL + پارامترهای اتصال + تست هم‌زمانی — ۱–۲ ساعت.
3. **DB-406/419/420**: migration ایندکس‌ها (۷ FK-فرزند + ۲ سورت) — ۲ ساعت.
4. **DB-428/418/415**: پاکسازی demo-data برای prod (seed جدا + backfill publicRef/soldCount واقعی) — ۲ ساعت.
5. **DB-416/417**: PERF-001/FTS طبق نقشهٔ cutover Postgres — ۱–۳ روز (deferred-by-design قبلی).
6. **DB-429/404/403/405**: سخت‌سازی‌های cutover Postgres (Restrict + CHECK + enum/Json) — در همان migration.

---
*انتهای گزارش — Task 2-b. شواهد: `audit-output/evidence/2b-data-quality.{py,json,log}`, `2b-diff-db-vs-schema.log`, `2b-diff-migrations-vs-schema.log`.*

---
## ۱۱) یادداشت تکمیلی — DB زنده در طول ممیزی «زنده» است (05:29 UTC)
بازهٔ ممیزی (اسنپ‌شات ۰۴:۵۷ با sha256 `039ae1d6…` تا بررسی پایانی ۰۵:۲۹) هش فایل زنده تغییر کرد (`ee4c3212…`). علت: سرور dev (next-server، pid 7401، پورت ۳۰۰۰) در حال اجرا و نوشتن است — دلتای ردیف‌ها نسبت به اسنپ‌شات: User 2→3، Session 3→6، Cart 8→14، MailMessage 2→3، CookieConsent 1→2. این عملاً الگوی write واقعی اپ (نشست/سبد مهمان/کوکی رضایت/کیت‌های mail) را نشان می‌دهد و یافته DB-402 (حالت delete بدون WAL در حین هم‌زمانی واقعی) را ملموس می‌کند. ممیزی 2-b هرگز DB زنده را برای نوشتن باز نکرد: همهٔ کوئری‌ها روی کپی /tmp اجرا شد؛ تنها دسترسی زنده، اتصال read-only (`mode=ro`) برای همین بررسی بود. `_prisma_migrations` در DB زندهٔ فعلی هم غایب است (DB-401 پابرجاست).
