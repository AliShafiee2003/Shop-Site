/** Shared DTO types matching /api contracts. */

export type Locale = 'en' | 'fa'

export interface ContributorRef { name: string; slug: string; role: string }

export interface ProductCard {
  id: string
  slug: string
  title: string
  subtitle?: string | null
  shortDescription?: string | null
  coverUrl?: string | null
  priceMinor: number
  /** original list price — present only while a sitewide promotion reduces this price */
  listPriceMinor?: number | null
  format?: string
  isFeatured?: boolean
  inStock: boolean
  isLowStock?: boolean
  rating?: { avg: number; count: number }
  contributors?: ContributorRef[]
  publicationDate?: string | null
  series?: string | null
  /** catalog recency (New releases ordering) — present on fresh API payloads */
  publishAt?: string | null
  createdAt?: string
}

export interface ProductVariantDTO {
  id: string
  sku: string
  isbn13?: string | null
  format: string
  bookLanguage: string
  editionLabel?: string | null
  pageCount?: number | null
  widthMm?: number | null
  heightMm?: number | null
  depthMm?: number | null
  weightG?: number | null
  priceMinor: number
  /** effective (promotion) price — present only while a promotion reduces the list price */
  salePriceMinor?: number | null
  stock: number
  isActive: boolean
  isLowStock?: boolean
  countryOfPrinting?: string | null
}

export interface ReviewDTO {
  id: string
  rating: number
  title?: string | null
  body: string
  authorName: string
  createdAt: string
  isVerifiedPurchase: boolean
  locale: string
}

export interface ProductDetail extends ProductCard {
  longDescription?: Block[] | null
  translations?: Record<string, { title: string; subtitle?: string | null; shortDescription?: string | null }>
  variants: ProductVariantDTO[]
  contributors: ContributorRef[]
  categories: { slug: string; name: string }[]
  gallery: { url: string; alt?: string | null }[]
  related: ProductCard[]
  reviews: { avg: number; count: number; items: ReviewDTO[] }
  safetyNote?: string | null
  fixedPrice?: boolean
  audience?: string | null
  publisher?: string
  series?: string | null
  seoTitle?: string | null
  seoDesc?: string | null
  /** active sitewide promotion (if any) with preformatted badge, e.g. "−10%" */
  promotion?: { name: string; badge: string; noteEn: string | null; noteFa: string | null; excludedCount?: number } | null
  /** true when the live promotion explicitly exempts this product (stays at list price) */
  promoExcluded?: boolean
}

export type Block =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'quote'; text: string; attribution?: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'callout'; title?: string; text: string }
  | { type: 'image'; src: string; alt?: string; caption?: string }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'divider' }

export interface CategoryDTO {
  slug: string
  name: string
  description?: string | null
  icon?: string | null
  iconUrl?: string | null
  color?: string | null
  productCount: number
}

export interface PersonDTO {
  slug: string
  name: string
  profession?: string | null
  portraitUrl?: string | null
  birthYear?: number | null
  roles: string[]
  shortBio?: string | null
  quote?: string | null
}

export interface PersonDetail extends PersonDTO {
  fullBio?: string | null
  nationality?: string | null
  quoteSource?: string | null
  socialLinks: { platform: string; url: string }[]
  books: { product: ProductCard; role: string }[]
  articles: { slug: string; title: string; heroUrl?: string | null; publishedAt?: string | null; excerpt?: string | null }[]
}

export interface ArticleListItem {
  slug: string
  title: string
  excerpt?: string | null
  heroUrl?: string | null
  publishedAt?: string | null
  readingMinutes?: number | null
  categories: { slug: string; name: string }[]
  featured?: boolean
}

export interface ArticleDetail extends ArticleListItem {
  body: Block[]
  byline?: string | null
  updatedAt?: string | null
  relatedProducts: ProductCard[]
  relatedPeople: { slug: string; name: string; portraitUrl?: string | null }[]
  relatedArticles: ArticleListItem[]
}

export interface SearchResults {
  query: string
  products: ProductCard[]
  people: { slug: string; name: string; portraitUrl?: string | null; profession?: string | null }[]
  articles: { slug: string; title: string }[]
  counts?: { products: number; people: number; articles: number }
}

/* Homepage */
export type HeroSlide = {
  image: string
  /** mobile-only image (portrait 9:16) — shown <768px; falls back to `image` when empty */
  imageMobile?: string
  eyebrowEn: string; eyebrowFa: string
  titleEn: string; titleFa: string
  bodyEn?: string; bodyFa?: string
  /** optional mobile text overrides — shorter copy so the image stays visible on phones; empty = web text */
  eyebrowMobileEn?: string; eyebrowMobileFa?: string
  titleMobileEn?: string; titleMobileFa?: string
  bodyMobileEn?: string; bodyMobileFa?: string
  ctaEn?: string; ctaFa?: string
  href?: string
  textColor?: 'light' | 'dark'
  position?: 'left' | 'center' | 'right'
  bg?: string
}
export type HomeSection =
  | { id: string; type: 'HERO'; sortOrder: number; enabled: boolean; settings: { autoplayMs?: number; motion?: string; heightPreset?: string; slides: HeroSlide[] } }
  | { id: string; type: 'PRODUCT_SHELF'; sortOrder: number; enabled: boolean; settings: { headingEn: string; headingFa: string; descriptionEn?: string; descriptionFa?: string; source: string; layout: 'grid' | 'carousel' | 'featured'; limit: number; hideOutOfStock?: boolean; hideWhenEmpty?: boolean; flashHours?: number; ctaEn?: string; ctaFa?: string; ctaHref?: string; categorySlug?: string } }
  | { id: string; type: 'CATEGORY_CAROUSEL'; sortOrder: number; enabled: boolean; settings: { headingEn: string; headingFa: string; descriptionEn?: string; descriptionFa?: string; slugs: string[] } }
  | { id: string; type: 'POSTER_GRID'; sortOrder: number; enabled: boolean; settings: { template: string; posters: { image: string; eyebrowEn?: string; eyebrowFa?: string; titleEn?: string; titleFa?: string; textEn?: string; textFa?: string; ctaEn?: string; ctaFa?: string; href?: string; bg?: string; textColor?: 'light' | 'dark'; span?: string }[] } }
  | { id: string; type: 'EDITORIAL_FEATURE'; sortOrder: number; enabled: boolean; settings: { layout: 'image-left' | 'image-right' | 'stacked'; bg: string; minH?: number; accentOrange?: boolean; image?: string; eyebrowEn?: string; eyebrowFa?: string; titleEn?: string; titleFa?: string; quoteEn?: string; quoteFa?: string; textEn?: string; textFa?: string; attributionEn?: string; attributionFa?: string; ctaEn?: string; ctaFa?: string; ctaHref?: string } }
  | { id: string; type: 'FOR_YOU'; sortOrder: number; enabled: boolean; settings: { headingEn?: string; headingFa?: string; limit?: number } }
  | { id: string; type: 'RECENTLY_VIEWED'; sortOrder: number; enabled: boolean; settings: { headingEn?: string; headingFa?: string; limit?: number } }
  | { id: string; type: 'ARTICLES'; sortOrder: number; enabled: boolean; settings: { headingEn: string; headingFa: string; descriptionEn?: string; descriptionFa?: string; limit?: number; bg?: string; ctaEn?: string; ctaFa?: string; ctaHref?: string } }
  | { id: string; type: 'SCROLL_STORY'; sortOrder: number; enabled: boolean; settings: { eyebrowEn?: string; eyebrowFa?: string; /** optional shorter module eyebrow for phones; empty = web eyebrow */ eyebrowMobileEn?: string; eyebrowMobileFa?: string; ctaEn?: string; ctaFa?: string; ctaHref?: string; heightPreset?: 'compact' | 'classic' | 'cinematic'; /** split = text beside image (classic); backdrop = full-bleed scene background + overlaid text + small floating cover */ layout?: 'split' | 'backdrop'; /** backdrop layout only — the ONE book's small cover image floating over the morphing scenes */ coverImage?: string; /** mobile variant of the floating cover (<768px); falls back to coverImage */ coverImageMobile?: string; slides: { image: string; /** mobile-only image (portrait 9:16) — shown <768px; falls back to `image` when empty */ imageMobile?: string; eyebrowEn?: string; eyebrowFa?: string; titleEn?: string; titleFa?: string; textEn?: string; textFa?: string; /** optional mobile text overrides — shorter copy for phones; empty = web text */ eyebrowMobileEn?: string; eyebrowMobileFa?: string; titleMobileEn?: string; titleMobileFa?: string; textMobileEn?: string; textMobileFa?: string }[] } }

/* Cart */
export interface CartItemDTO {
  id: string
  variantId: string
  productId: string
  slug: string
  title: string
  subtitle?: string | null
  coverUrl?: string | null
  sku?: string
  isbn13?: string | null
  format?: string | null
  bookLanguage?: string | null
  unitPriceMinor: number
  /** original list price — present only while a sitewide promotion reduces this item's price */
  listPriceMinor?: number | null
  quantity: number
  stock: number
  maxQuantity?: number
  inStock?: boolean
  isLowStock?: boolean
  lineTotalMinor: number
}
export interface CartDTO {
  items: CartItemDTO[]
  count: number
  subtotalMinor: number
  currency: string
  vatRatePct: number
  vatIncluded: boolean
  /** sitewide promotion currently applied to cart prices, if any */
  promotion?: { name: string; badge: string; noteEn: string | null; noteFa: string | null; savedMinor: number } | null
}

/* Checkout */
export interface ShippingMethodDTO {
  id: string
  label: string
  desc?: string
  priceMinor: number
  freeOverMinor: number | null
  freeApplied?: boolean
  effectivePriceMinor: number
  etaDays: { min: number; max: number }
  etaLabel?: string
}
export interface QuoteDTO {
  methods: ShippingMethodDTO[]
  subtotalMinor: number
  /** sitewide promotion applied to cart prices (if any) */
  promotion?: { name: string; badge: string; noteEn: string | null; noteFa: string | null; savedMinor: number } | null
  discount?: { code: string; type: 'PERCENT' | 'FIXED'; value: number; discountMinor: number; minSubtotalMinor: number; noteEn: string | null; noteFa: string | null } | null
  discountMinor?: number
  /** gift wrap service fee for the whole order (0 when not requested/disabled) */
  giftWrapMinor?: number
  itemsCount: number
  vatRatePct: number
  currency: string
}

export interface DiscountPublic {
  code: string
  type: 'PERCENT' | 'FIXED'
  value: number
  discountMinor: number
  minSubtotalMinor: number
  noteEn: string | null
  noteFa: string | null
}

export interface OrderPublicDTO {
  orderNumber: string
  status: string
  paymentStatus: string
  fulfillmentStatus: string
  totalMinor: number
  discountCode?: string | null
  giftWrap?: boolean
  giftWrapMinor?: number
  giftMessage?: string | null
  currency: string
  createdAt: string
  items: { title: string; quantity: number; unitPriceMinor: number; coverUrl?: string | null }[]
  shipment: { carrier: string; trackingNumber?: string | null; trackingUrl?: string | null; status: string; estimatedDeliveryAt?: string | null } | null
}

export interface UserDTO { id: string; email: string; name?: string | null; role: string; preferredLocale: string; avatarUrl?: string | null; googleLinked?: boolean }

export interface AddressDTO {
  id: string
  label?: string | null
  recipient: string
  line1: string
  line2?: string | null
  city: string
  region?: string | null
  postalCode: string
  countryCode: string
  phone?: string | null
  isDefaultShipping: boolean
  isDefaultBilling: boolean
}

export interface OrderItemSnapshot {
  titleEn: string
  titleFa: string
  quantity: number
  unitPriceMinor: number
  totalMinor: number
  coverUrl?: string | null
  sku: string
  isbn?: string | null
  format?: string | null
  authorsEn?: string[]
  authorsFa?: string[]
}

export interface OrderFullDTO {
  orderNumber: string
  status: string
  paymentStatus: string
  fulfillmentStatus: string
  currency: string
  subtotalMinor: number
  shippingMinor: number
  taxMinor: number
  totalMinor: number
  discountMinor?: number
  discountCode?: string | null
  giftWrap?: boolean
  giftWrapMinor?: number
  giftMessage?: string | null
  shippingMethodName?: string | null
  shippingAddress: AddressSnapshot
  billingAddress?: AddressSnapshot | null
  createdAt: string
  items: OrderItemSnapshot[]
  payment?: { brand?: string | null; last4?: string | null; status: string } | null
  shipment?: { carrier: string; trackingNumber?: string | null; trackingUrl?: string | null; status: string; shippedAt?: string | null; estimatedDeliveryAt?: string | null } | null
  events?: { type: string; message: string; createdAt: string }[]
  returns?: { id: string; status: string; reason: string; createdAt: string; items: { quantity: number }[] }[]
}
export interface AddressSnapshot {
  recipient: string; line1: string; line2?: string | null; city: string; region?: string | null; postalCode: string; countryCode: string
}

export interface TicketMessageDTO { id: string; senderType: string; senderName: string; body: string; createdAt: string }
export interface TicketDTO {
  id: string
  ticketNumber: string
  subject: string
  category: string
  status: string
  relatedOrderNumber?: string | null
  createdAt: string
  messages: TicketMessageDTO[]
}

export interface StoreSettings {
  name: string; nameFa: string; legalName: string; email: string; phone: string; address: string
  currency: string; vatRatePct: number; vatIncluded: boolean; freeShippingThresholdMinor: number
  /** Social profiles (Task 50) — rendered in footer + contact page only when non-empty. */
  instagram?: string; x?: string; youtube?: string
}
export interface ShippingSettings {
  customsNote: string; customsNoteFa: string
  methods: { id: string; zone: string; labelEn: string; labelFa: string; descEn: string; descFa: string; priceMinor: number; freeOverMinor: number | null; minDays: number; maxDays: number; countries: string[] }[]
}
