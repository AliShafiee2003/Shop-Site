'use client'

// FullProductEditor — the missing «کالای جدید» full product form (audit P0-1, Task 27-f).
// Create mode (productId === 'new') POSTs /api/admin/products; edit mode PATCHes
// /api/admin/products/{id}. Six tabs: Content (EN|FA side-by-side), Media,
// Classification, Variants, Related, SEO & details.
//
// longDescription format contract (storefront): the DB stores a JSON array of ProseBlocks
// (see /api/products/[slug] → parseJsonSafe → <ProseBlocks/>). The editor shows a plain-text
// mirror with light prefixes (## h2 · ### h3 · > quote -- attribution · "- " list ·
// "1. " ordered · "! Title :: text" callout · ![](src) image · --- divider; blank line =
// block separator) and — for lossless round-trips — sends the ORIGINAL stored string back
// untouched whenever the textarea was not edited; edited text is re-serialized to blocks JSON.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge, ProseBlocks, Spinner } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { blocksToText, textToBlocks } from '@/lib/markdown'
import { apiGet, apiPost, apiPatch } from '@/lib/api'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Loader2, Plus, Search, Trash2, Upload, UserPlus, X } from 'lucide-react'

export type FullProductEditorProps = {
  /** 'new' → create mode; any other id → edit mode; null → idle (dialog closed). */
  productId: string | null
  open: boolean
  onClose: () => void
  onSaved: (id: string) => void
}

// ─────────────────────────── long-description markdown ───────────────────────────
// The editable markdown grammar (## h2 · ### h3 · > quote -- author · lists ·
// ! Title :: text callout · ![alt](src) image · GFM table · --- divider ·
// **bold** · *italic* · `code`) lives in @/lib/markdown — the SAME module the
// storefront <ProseBlocks/> renderer speaks, so the editor preview can never
// drift from production rendering.

// ─────────────────────────── types & small helpers ───────────────────────────

interface LocaleContent {
  title: string
  subtitle: string
  shortDescription: string
  longDescription: string
  seoTitle: string
  seoDesc: string
}

interface VariantDraft {
  key: string
  id?: string
  sku: string
  format: string
  bookLanguage: string
  price: string
  stock: string
  isbn13: string
  editionLabel: string
  pageCount: string
  widthMm: string
  heightMm: string
  depthMm: string
  weightG: string
  countryOfPrinting: string
  isActive: boolean
}

interface MediaDraft {
  url: string
  altEn: string
  altFa: string
}

interface ContributorDraft {
  key: string
  personId: string
  role: string
}

interface CategoryOpt {
  id: string
  slug: string
  nameEn: string | null
  nameFa: string | null
}

interface PersonOpt {
  id: string
  slug: string
  nameEn: string | null
  nameFa: string | null
}

interface RelatedPick {
  id: string
  title: string
  slug: string
  coverUrl?: string | null
}

type TabKey = 'content' | 'media' | 'classification' | 'variants' | 'related' | 'seo'

const emptyContent = (): LocaleContent => ({
  title: '',
  subtitle: '',
  shortDescription: '',
  longDescription: '',
  seoTitle: '',
  seoDesc: '',
})

const emptyVariant = (key: string): VariantDraft => ({
  key,
  sku: '',
  format: 'PAPERBACK',
  bookLanguage: 'English',
  price: '',
  stock: '0',
  isbn13: '',
  editionLabel: '',
  pageCount: '',
  widthMm: '',
  heightMm: '',
  depthMm: '',
  weightG: '',
  countryOfPrinting: '',
  isActive: true,
})

const intOrNull = (s: string): number | null => {
  const t = s.trim()
  if (!t) return null
  const n = Number.parseInt(t, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

const ROLE_KEYS = ['AUTHOR', 'TRANSLATOR', 'EDITOR', 'ILLUSTRATOR', 'FOREWORD'] as const
const FORMAT_KEYS = ['PAPERBACK', 'HARDCOVER', 'SPECIAL'] as const
/** Book language — a controlled vocabulary (user: «زبان کتاب یا فارسی هست یا انگلیسی»). */
const LANG_KEYS: readonly string[] = ['Persian', 'English']

// ─────────────────────────── component ───────────────────────────

export function FullProductEditor({ productId, open, onClose, onSaved }: FullProductEditorProps) {
  const locale = useApp((s) => s.locale)
  const { toast } = useToast()

  const mode: 'create' | 'edit' | null = !open ? null : productId === 'new' ? 'create' : productId ? 'edit' : null

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [tab, setTab] = useState<TabKey>('content')

  // Core fields
  const [status, setStatus] = useState('DRAFT')
  const [coverUrl, setCoverUrl] = useState('')
  const [content, setContent] = useState<{ en: LocaleContent; fa: LocaleContent }>({
    en: emptyContent(),
    fa: emptyContent(),
  })
  // Original stored longDescription strings — sent back verbatim when untouched (lossless).
  const [longRaw, setLongRaw] = useState<{ en: string | null; fa: string | null }>({ en: null, fa: null })
  const [initialLongText, setInitialLongText] = useState<{ en: string; fa: string }>({ en: '', fa: '' })

  // Details / SEO
  const [slug, setSlug] = useState('')
  const [publisher, setPublisher] = useState('PersePix')
  const [series, setSeries] = useState('')
  const [publicationDate, setPublicationDate] = useState('')
  const [audience, setAudience] = useState('')
  const [safetyNote, setSafetyNote] = useState('')
  const [fixedPrice, setFixedPrice] = useState(false)
  const [isFeatured, setIsFeatured] = useState(false)

  // Classification
  const [categoriesAll, setCategoriesAll] = useState<CategoryOpt[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]) // ordered — first = primary
  const [peopleAll, setPeopleAll] = useState<PersonOpt[]>([])
  const [contributors, setContributors] = useState<ContributorDraft[]>([])
  // Inline person creation — authors/editors/… missing from the list are registered
  // right here (EN+FA name) and auto-selected into the triggering row (Task 50).
  const [npOpen, setNpOpen] = useState(false)
  const [npForRow, setNpForRow] = useState<number | null>(null) // contributor row index to fill (null = just register)
  const [npNameEn, setNpNameEn] = useState('')
  const [npNameFa, setNpNameFa] = useState('')
  const [npProfession, setNpProfession] = useState('')
  const [npBusy, setNpBusy] = useState(false)

  // Media
  const [media, setMedia] = useState<MediaDraft[]>([])
  // Gallery drag & drop reorder + lightbox + multi-upload
  const [galleryUploading, setGalleryUploading] = useState(false)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [armDrag, setArmDrag] = useState<number | null>(null)
  const [lightbox, setLightbox] = useState<MediaDraft | null>(null)
  // Live markdown preview per locale
  const [longPreview, setLongPreview] = useState<{ en: boolean; fa: boolean }>({ en: false, fa: false })

  // Variants
  const [variants, setVariants] = useState<VariantDraft[]>([])
  const keyRef = useRef(0)
  const nextKey = () => `k${++keyRef.current}-${Date.now()}`

  // Related
  const [related, setRelated] = useState<RelatedPick[]>([])
  const [relatedQuery, setRelatedQuery] = useState('')
  const [relatedResults, setRelatedResults] = useState<{ id: string; title: string; slug: string; coverUrl?: string | null }[]>([])
  const [relatedSearching, setRelatedSearching] = useState(false)

  const L = useMemo(() => {
    if (locale === 'fa') {
      return {
        newProduct: 'کالای جدید',
        editProduct: 'ویرایش کالا',
        draft: 'پیش‌نویس',
        published: 'منتشرشده',
        tabContent: 'محتوا',
        tabMedia: 'رسانه',
        tabClassification: 'دسته‌بندی',
        tabVariants: 'واریانت‌ها',
        tabRelated: 'مرتبط',
        tabSeo: 'سئو و جزئیات',
        english: 'انگلیسی',
        persian: 'فارسی',
        title: 'عنوان',
        subtitle: 'زیرعنوان',
        shortDescription: 'توضیح کوتاه',
        longDescription: 'توضیح کامل',
        longHint: 'مارک‌داون: خط خالی = پاراگراف · «## تیتر» (با یا بدون فاصله: ##تیتر هم تیتر است) · «### زیرتیتر» · **پررنگ** · *ایتالیک* · «> نقل‌قول -- گوینده» · «- مورد» فهرست · «1. مورد» شماره‌دار · جدول با «| ستون | ستون |» · «! عنوان :: متن» کادر توجه · «![متن](نشانی)» تصویر · «---» جداکننده.',
        preview: 'پیش‌نمایش',
        hidePreview: 'بستن پیش‌نمایش',
        required: 'الزامی',
        stateReady: 'کامل',
        stateIncomplete: 'ناقص',
        stateMissing: 'بدون ترجمه',
        cover: 'تصویر جلد',
        uploadImage: 'بارگذاری تصویر',
        uploading: 'در حال بارگذاری…',
        uploadGallery: 'بارگذاری تصاویر',
        uploadGalleryHint: 'تصاویر آپلودشده به‌صورت خودکار به انتهای گالری اضافه می‌شوند؛ ترتیب را با کشیدن ✋ یا دکمه‌های ↑↓ تنظیم کنید. تصویر اول، تصویر اصلی کالاست.',
        dragHandle: 'جابه‌جایی با کشیدن',
        viewImage: 'مشاهدهٔ تصویر',
        position: 'جایگاه',
        langPersian: 'فارسی',
        langEnglish: 'انگلیسی',
        langOther: 'سایر (سفارشی)',
        dropHere: 'رها کنید تا اینجا بنشیند',
        add: 'افزودن',
        gallery: 'گالری',
        altEn: 'متن جایگزین (EN)',
        altFa: 'متن جایگزین (FA)',
        remove: 'حذف',
        moveUp: 'بالا',
        moveDown: 'پایین',
        badUrl: 'نشانی باید با «/» شروع شود.',
        categories: 'دسته‌بندی‌ها',
        categoriesHint: 'اولین دستهٔ تیک‌خورده، دستهٔ اصلی کتاب می‌شود.',
        contributors: 'مشارکت‌کنندگان',
        role: 'نقش',
        person: 'شخص',
        addContributor: 'افزودن مشارکت‌کننده',
        newPerson: 'شخص جدید',
        newPersonTitle: 'افزودن شخص جدید',
        newPersonHint: 'اگر نویسنده یا ویراستار یا… در فهرست نیست، همین‌جا نامش را ثبت کنید — بدون خروج از فرم کتاب.',
        nameEn: 'نام (انگلیسی)',
        nameFa: 'نام (فارسی)',
        professionOptional: 'حرفه (اختیاری)',
        personCreating: 'در حال ثبت…',
        personCreated: 'شخص جدید ثبت شد و انتخاب شد',
        personNameRequired: 'نام انگلیسی الزامی است (حداقل ۲ حرف).',
        variants: 'واریانت‌ها',
        addVariant: 'افزودن واریانت',
        sku: 'شناسه (SKU)',
        format: 'قطع',
        language: 'زبان',
        price: 'قیمت (€)',
        stock: 'موجودی',
        isbn: 'شابک (ISBN-13)',
        edition: 'نوبت چاپ / ویراست',
        pages: 'تعداد صفحه',
        dims: 'ابعاد (ع×ر×ق mm)',
        weight: 'وزن (گرم)',
        country: 'کشور چاپ',
        active: 'فعال',
        deactivate: 'غیرفعال‌سازی',
        deactivateConfirm: 'این واریانت غیرفعال شود؟ برای حذف کامل، ردیف‌های تازه را حذف کنید؛ واریانت‌های ثبت‌شده فقط غیرفعال می‌شوند.',
        dupSku: 'شناسهٔ تکراری در فرم',
        missingSku: 'شناسه (SKU) الزامی است.',
        missingPrice: 'قیمت نامعتبر است.',
        related: 'محصولات مرتبط',
        search: 'جست‌وجوی کتاب…',
        noResults: 'نتیجه‌ای یافت نشد',
        seoTitle: 'عنوان سئو',
        seoDesc: 'توضیح سئو',
        slug: 'نشانی (slug)',
        slugHint: 'تغییر نشانی، آدرس عمومی کتاب را تغییر می‌دهد.',
        publisher: 'ناشر',
        series: 'مجموعه',
        publicationDate: 'تاریخ انتشار',
        audience: 'گروه مخاطب',
        safetyNote: 'یادداشت ایمنی (GPSR)',
        fixedPrice: 'قیمت مصوب کتاب (Fixed book price)',
        isFeatured: 'نمایش در منتخب‌ها',
        status: 'وضعیت',
        save: 'ذخیره',
        saving: 'در حال ذخیره…',
        cancel: 'انصراف',
        close: 'بستن',
        saved: 'کالا ذخیره شد.',
        loading: 'در حال بارگذاری…',
        error: 'خطا',
        missingTitle: 'عنوان انگلیسی الزامی است.',
        missingVariant: 'حداقل یک واریانت با شناسه و قیمت معتبر لازم است.',
        faNeedsTitle: 'برای درج محتوای فارسی، عنوان فارسی الزامی است.',
        roleAuthor: 'مؤلف',
        roleTranslator: 'مترجم',
        roleEditor: 'ویراستار',
        roleIllustrator: 'تصویرگر',
        roleForeword: 'پیش‌گفتار',
        formatPaperback: 'شومیز',
        formatHardcover: 'گالینگور',
        formatSpecial: 'ویژه',
      }
    }
    return {
      newProduct: 'New product',
      editProduct: 'Edit product',
      draft: 'Draft',
      published: 'Published',
      tabContent: 'Content',
      tabMedia: 'Media',
      tabClassification: 'Classification',
      tabVariants: 'Variants',
      tabRelated: 'Related',
      tabSeo: 'SEO & details',
      english: 'English',
      persian: 'Persian',
      title: 'Title',
      subtitle: 'Subtitle',
      shortDescription: 'Short description',
      longDescription: 'Long description',
      longHint: 'Markdown: blank line = new block · “## heading” (space after ## optional: ##Heading works) · “### subheading” · **bold** · *italic* · `` `code` `` · “> quote -- attribution” · “- item” list · “1. item” numbered · table via “| col | col |” rows · “! Title :: text” callout · “![alt](src)” image · “---” divider.',
      preview: 'Preview',
      hidePreview: 'Hide preview',
      required: 'required',
      stateReady: 'Complete',
      stateIncomplete: 'Incomplete',
      stateMissing: 'No translation',
      cover: 'Cover image',
      uploadImage: 'Upload image',
      uploading: 'Uploading…',
      uploadGallery: 'Upload images',
      uploadGalleryHint: 'Uploaded files append to the gallery automatically; set the order by dragging ✋ or with ↑↓. The first image is the primary product image.',
      dragHandle: 'Drag to reorder',
      viewImage: 'View image',
      position: 'Position',
      langPersian: 'Persian',
      langEnglish: 'English',
      langOther: 'Other (custom)',
      dropHere: 'Drop to place here',
      add: 'Add',
      gallery: 'Gallery',
      altEn: 'Alt text (EN)',
      altFa: 'Alt text (FA)',
      remove: 'Remove',
      moveUp: 'Up',
      moveDown: 'Down',
      badUrl: 'URL must start with “/”.',
      categories: 'Categories',
      categoriesHint: 'The first checked category becomes the primary one.',
      contributors: 'Contributors',
      role: 'Role',
      person: 'Person',
      addContributor: 'Add contributor',
      newPerson: 'New person',
      newPersonTitle: 'Add a new person',
      newPersonHint: 'Author, editor, translator… not in the list? Register them right here — no need to leave the product form.',
      nameEn: 'Name (English)',
      nameFa: 'Name (Persian)',
      professionOptional: 'Profession (optional)',
      personCreating: 'Creating…',
      personCreated: 'Person created and selected',
      personNameRequired: 'English name is required (min 2 characters).',
      variants: 'Variants',
      addVariant: 'Add variant',
      sku: 'SKU',
      format: 'Format',
      language: 'Language',
      price: 'Price (€)',
      stock: 'Stock',
      isbn: 'ISBN-13',
      edition: 'Edition',
      pages: 'Pages',
      dims: 'Dimensions (W×H×D mm)',
      weight: 'Weight (g)',
      country: 'Country of printing',
      active: 'Active',
      deactivate: 'Deactivate',
      deactivateConfirm: 'Deactivate this variant? Existing variants can only be deactivated, not deleted.',
      dupSku: 'Duplicate SKU in form',
      missingSku: 'SKU is required.',
      missingPrice: 'Invalid price.',
      related: 'Related products',
      search: 'Search books…',
      noResults: 'No results',
      seoTitle: 'SEO title',
      seoDesc: 'SEO description',
      slug: 'Slug',
      slugHint: 'Changing the slug changes the public URL of this book.',
      publisher: 'Publisher',
      series: 'Series',
      publicationDate: 'Publication date',
      audience: 'Audience',
      safetyNote: 'Safety note (GPSR)',
      fixedPrice: 'Fixed book price',
      isFeatured: 'Featured',
      status: 'Status',
      save: 'Save',
      saving: 'Saving…',
      cancel: 'Cancel',
      close: 'Close',
      saved: 'Product saved.',
      loading: 'Loading…',
      error: 'Error',
      missingTitle: 'The English title is required.',
      missingVariant: 'At least one variant with a SKU and a valid price is required.',
      faNeedsTitle: 'A Persian title is required when Persian content is provided.',
      roleAuthor: 'Author',
      roleTranslator: 'Translator',
      roleEditor: 'Editor',
      roleIllustrator: 'Illustrator',
      roleForeword: 'Foreword',
      formatPaperback: 'Paperback',
      formatHardcover: 'Hardcover',
      formatSpecial: 'Special',
    }
  }, [locale])

  const roleLabel = (role: string) =>
    role === 'AUTHOR'
      ? L.roleAuthor
      : role === 'TRANSLATOR'
        ? L.roleTranslator
        : role === 'EDITOR'
          ? L.roleEditor
          : role === 'ILLUSTRATOR'
            ? L.roleIllustrator
            : role === 'FOREWORD'
              ? L.roleForeword
              : role

  const formatLabel = (f: string) =>
    f === 'PAPERBACK' ? L.formatPaperback : f === 'HARDCOVER' ? L.formatHardcover : f === 'SPECIAL' ? L.formatSpecial : f

  /** Register a brand-new person (EN+FA name [+ profession]) without leaving the
   *  product form, then auto-select them in the contributor row that asked for it. */
  const createPerson = async () => {
    if (npNameEn.trim().length < 2) {
      toast({ title: L.personNameRequired, variant: 'destructive' })
      return
    }
    setNpBusy(true)
    try {
      const r = await apiPost<{ person: { id: string; slug: string } }>('/api/admin/people', {
        nameEn: npNameEn.trim(),
        nameFa: npNameFa.trim() || null,
        profession: npProfession.trim() || null,
      })
      const created: PersonOpt = {
        id: r.person.id,
        slug: r.person.slug,
        nameEn: npNameEn.trim(),
        nameFa: npNameFa.trim() || null,
      }
      setPeopleAll((rows) => [created, ...rows])
      if (npForRow !== null) {
        setContributors((rows) => rows.map((row, j) => (j === npForRow ? { ...row, personId: created.id } : row)))
      }
      toast({ title: L.personCreated })
      closeNp()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? 'Error', variant: 'destructive' })
    } finally {
      setNpBusy(false)
    }
  }

  const closeNp = () => {
    setNpOpen(false)
    setNpForRow(null)
    setNpNameEn('')
    setNpNameFa('')
    setNpProfession('')
  }

  // ── Load: fetch detail (edit mode) + categories + people whenever the dialog opens ──
  useEffect(() => {
    if (!open) return
    setTab('content')
    setSaving(false)
    setGalleryUploading(false)
    setDragFrom(null)
    setDragOver(null)
    setArmDrag(null)
    setLightbox(null)
    setLongPreview({ en: false, fa: false })
    setNpOpen(false)
    setNpForRow(null)
    setRelatedQuery('')
    setRelatedResults([])
    keyRef.current = 0

    // Categories + people for the Classification tab (both modes).
    apiGet<{ categories: CategoryOpt[] }>('/api/admin/categories')
      .then((r) => setCategoriesAll(r.categories ?? []))
      .catch(() => setCategoriesAll([]))
    apiGet<{ people: PersonOpt[] }>('/api/admin/people')
      .then((r) => setPeopleAll(r.people ?? []))
      .catch(() => setPeopleAll([]))

    if (productId === 'new') {
      // Blank create form
      setStatus('DRAFT')
      setCoverUrl('')
      setContent({ en: emptyContent(), fa: emptyContent() })
      setLongRaw({ en: null, fa: null })
      setInitialLongText({ en: '', fa: '' })
      setSlug('')
      setPublisher('PersePix')
      setSeries('')
      setPublicationDate('')
      setAudience('')
      setSafetyNote('')
      setFixedPrice(false)
      setIsFeatured(false)
      setSelectedCategories([])
      setContributors([])
      setMedia([])
      setVariants([emptyVariant(`k${++keyRef.current}-new`)])
      setRelated([])
      setLoading(false)
      return
    }

    if (!productId) return
    let cancelled = false
    setLoading(true)
    apiGet<{ product: DetailProduct }>(`/api/admin/products/${productId}`)
      .then((r) => {
        if (cancelled) return
        const p = r.product
        const en = p.translations?.en
        const fa = p.translations?.fa
        const enLong = blocksToText(en?.longDescription ?? null)
        const faLong = blocksToText(fa?.longDescription ?? null)
        setStatus(p.status ?? 'DRAFT')
        setCoverUrl(p.coverUrl ?? '')
        setContent({
          en: {
            title: en?.title ?? '',
            subtitle: en?.subtitle ?? '',
            shortDescription: en?.shortDescription ?? '',
            longDescription: enLong,
            seoTitle: en?.seoTitle ?? '',
            seoDesc: en?.seoDesc ?? '',
          },
          fa: {
            title: fa?.title ?? '',
            subtitle: fa?.subtitle ?? '',
            shortDescription: fa?.shortDescription ?? '',
            longDescription: faLong,
            seoTitle: fa?.seoTitle ?? '',
            seoDesc: fa?.seoDesc ?? '',
          },
        })
        setLongRaw({ en: en?.longDescription ?? null, fa: fa?.longDescription ?? null })
        setInitialLongText({ en: enLong, fa: faLong })
        setSlug(p.slug ?? '')
        setPublisher(p.publisher ?? 'PersePix')
        setSeries(p.series ?? '')
        setPublicationDate(p.publicationDate ? String(p.publicationDate).slice(0, 10) : '')
        setAudience(p.audience ?? '')
        setSafetyNote(p.safetyNote ?? '')
        setFixedPrice(!!p.fixedPrice)
        setIsFeatured(!!p.isFeatured)
        // Ordered: primary first (the PATCH contract treats the first slug as primary).
        setSelectedCategories(
          [...(p.categories ?? [])]
            .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
            .map((c) => c.slug),
        )
        setContributors(
          (p.contributors ?? []).map((c) => ({ key: `${c.personId}-${c.role}-${c.displayOrder}`, personId: c.personId, role: c.role })),
        )
        setMedia((p.media ?? []).map((m) => ({ url: m.url, altEn: m.altEn ?? '', altFa: m.altFa ?? '' })))
        setVariants(
          (p.variants ?? []).map((v) => ({
            key: v.id,
            id: v.id,
            sku: v.sku,
            format: v.format ?? 'PAPERBACK',
            bookLanguage: v.bookLanguage ?? 'English',
            price: (v.priceMinor / 100).toFixed(2),
            stock: String(v.stock ?? 0),
            isbn13: v.isbn13 ?? '',
            editionLabel: v.editionLabel ?? '',
            pageCount: v.pageCount != null ? String(v.pageCount) : '',
            widthMm: v.widthMm != null ? String(v.widthMm) : '',
            heightMm: v.heightMm != null ? String(v.heightMm) : '',
            depthMm: v.depthMm != null ? String(v.depthMm) : '',
            weightG: v.weightG != null ? String(v.weightG) : '',
            countryOfPrinting: v.countryOfPrinting ?? '',
            isActive: v.isActive,
          })),
        )
        setRelated((p.related ?? []).map((r2) => ({ id: r2.id, title: r2.title, slug: r2.slug, coverUrl: (r2 as { coverUrl?: string | null }).coverUrl ?? null })))
        setLoading(false)
      })
      .catch((e: { message?: string }) => {
        if (cancelled) return
        setLoading(false)
        toast({ title: e.message ?? 'Failed to load product', variant: 'destructive' })
        onClose()
      })
    return () => {
      cancelled = true
    }
     
  }, [open, productId])

  // ── Related search (debounced) ──
  useEffect(() => {
    if (!open || tab !== 'related') return
    const timer = setTimeout(async () => {
      setRelatedSearching(true)
      try {
        const q = relatedQuery.trim()
        const r = await apiGet<{ items: { id: string; slug: string; title: string }[] }>(
          `/api/admin/products?locale=en${q ? `&q=${encodeURIComponent(q)}` : ''}`,
        )
        setRelatedResults((r.items ?? []).slice(0, 10).map((it) => ({ id: it.id, title: it.title, slug: it.slug, coverUrl: (it as { coverUrl?: string | null }).coverUrl ?? null })))
      } catch {
        setRelatedResults([])
      } finally {
        setRelatedSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [open, tab, relatedQuery])

  const relatedFiltered = useMemo(() => {
    const taken = new Set(related.map((r) => r.id))
    if (productId && productId !== 'new') taken.add(productId)
    return relatedResults.filter((r) => !taken.has(r.id)).slice(0, 8)
  }, [relatedResults, related, productId])

  // ── Validation helpers ──
  const dupSkuKeys = useMemo(() => {
    const seen = new Map<string, number>()
    for (const v of variants) {
      const s = v.sku.trim().toUpperCase()
      if (!s) continue
      seen.set(s, (seen.get(s) ?? 0) + 1)
    }
    const dups = new Set([...seen.entries()].filter(([, n]) => n > 1).map(([s]) => s))
    return new Set(variants.filter((v) => dups.has(v.sku.trim().toUpperCase())).map((v) => v.key))
  }, [variants])

  const faHasContent =
    content.fa.title.trim() !== '' ||
    content.fa.subtitle.trim() !== '' ||
    content.fa.shortDescription.trim() !== '' ||
    content.fa.longDescription.trim() !== '' ||
    content.fa.seoTitle.trim() !== '' ||
    content.fa.seoDesc.trim() !== ''

  /** longDescription payload for a locale — untouched ⇒ original stored string (lossless). */
  const longPayload = (loc: 'en' | 'fa'): string | null => {
    const current = content[loc].longDescription
    if (current === initialLongText[loc]) return longRaw[loc]
    if (!current.trim()) return null
    return JSON.stringify(textToBlocks(current))
  }

  // ── Save ──
  const save = async () => {
    if (!mode) return
    // Client-side guards (server re-validates everything).
    if (!content.en.title.trim()) {
      setTab('content')
      toast({ title: L.missingTitle, variant: 'destructive' })
      return
    }
    if (faHasContent && !content.fa.title.trim()) {
      setTab('content')
      toast({ title: L.faNeedsTitle, variant: 'destructive' })
      return
    }
    for (const v of variants) {
      const price = Number.parseFloat(v.price.replace(',', '.'))
      if (!v.sku.trim() || !Number.isFinite(price) || price <= 0) {
        setTab('variants')
        toast({ title: v.sku.trim() ? L.missingPrice : L.missingSku, variant: 'destructive' })
        return
      }
    }
    if (dupSkuKeys.size > 0) {
      setTab('variants')
      toast({ title: L.dupSku, variant: 'destructive' })
      return
    }
    if (mode === 'create' && slug.trim() && !/^[a-z0-9-]{2,80}$/.test(slug.trim())) {
      setTab('seo')
      toast({ title: L.slugHint, variant: 'destructive' })
      return
    }

    const variantsPayload = variants.map((v) => ({
      ...(v.id ? { id: v.id } : {}),
      sku: v.sku.trim().toUpperCase(),
      format: v.format,
      bookLanguage: v.bookLanguage.trim() || 'English',
      priceMinor: Math.round(Number.parseFloat(v.price.replace(',', '.')) * 100),
      stock: Math.max(0, Number.parseInt(v.stock.trim() || '0', 10) || 0),
      isbn13: v.isbn13.trim() || null,
      editionLabel: v.editionLabel.trim() || null,
      pageCount: intOrNull(v.pageCount),
      widthMm: intOrNull(v.widthMm),
      heightMm: intOrNull(v.heightMm),
      depthMm: intOrNull(v.depthMm),
      weightG: intOrNull(v.weightG),
      countryOfPrinting: v.countryOfPrinting.trim() || null,
      isActive: v.isActive,
    }))

    const effectiveCover = coverUrl.trim() || media[0]?.url || null

    setSaving(true)
    try {
      if (mode === 'create') {
        const body = {
          ...(slug.trim() ? { slug: slug.trim() } : {}),
          status,
          titleEn: content.en.title.trim(),
          ...(content.fa.title.trim() ? { titleFa: content.fa.title.trim() } : {}),
          subtitleEn: content.en.subtitle.trim() || undefined,
          shortDescriptionEn: content.en.shortDescription.trim() || undefined,
          longDescriptionEn: longPayload('en') ?? undefined,
          seoTitleEn: content.en.seoTitle.trim() || undefined,
          seoDescEn: content.en.seoDesc.trim() || undefined,
          ...(content.fa.title.trim()
            ? {
                subtitleFa: content.fa.subtitle.trim() || undefined,
                shortDescriptionFa: content.fa.shortDescription.trim() || undefined,
                longDescriptionFa: longPayload('fa') ?? undefined,
                seoTitleFa: content.fa.seoTitle.trim() || undefined,
                seoDescFa: content.fa.seoDesc.trim() || undefined,
              }
            : {}),
          ...(effectiveCover ? { coverUrl: effectiveCover } : {}),
          publisher: publisher.trim() || undefined,
          series: series.trim() || undefined,
          publicationDate: publicationDate || null,
          audience: audience.trim() || undefined,
          safetyNote: safetyNote.trim() || undefined,
          fixedPrice,
          isFeatured,
          categories: selectedCategories,
          contributors: contributors.map((c, i) => ({ personId: c.personId, role: c.role, displayOrder: i })),
          media: media.map((m) => ({ url: m.url, altEn: m.altEn.trim() || undefined, altFa: m.altFa.trim() || undefined })),
          variants: variantsPayload,
          relatedIds: related.map((r) => r.id),
        }
        const res = await apiPost<{ product: { id: string; slug: string } }>('/api/admin/products', body)
        toast({ title: L.saved })
        onSaved(res.product.id)
        onClose()
      } else {
        const pid = productId as string
        const faPayload = content.fa.title.trim()
          ? {
              title: content.fa.title.trim(),
              subtitle: content.fa.subtitle.trim() || null,
              shortDescription: content.fa.shortDescription.trim() || null,
              longDescription: longPayload('fa'),
              seoTitle: content.fa.seoTitle.trim() || null,
              seoDesc: content.fa.seoDesc.trim() || null,
            }
          : undefined
        const body = {
          status,
          slug: slug.trim(),
          publisher: publisher.trim() || null,
          series: series.trim() || null,
          publicationDate: publicationDate || null,
          audience: audience.trim() || null,
          safetyNote: safetyNote.trim() || null,
          coverUrl: effectiveCover,
          fixedPrice,
          isFeatured,
          translations: {
            en: {
              title: content.en.title.trim(),
              subtitle: content.en.subtitle.trim() || null,
              shortDescription: content.en.shortDescription.trim() || null,
              longDescription: longPayload('en'),
              seoTitle: content.en.seoTitle.trim() || null,
              seoDesc: content.en.seoDesc.trim() || null,
            },
            ...(faPayload ? { fa: faPayload } : {}),
          },
          categories: selectedCategories,
          contributors: contributors.map((c, i) => ({ personId: c.personId, role: c.role, displayOrder: i })),
          media: media.map((m) => ({ url: m.url, altEn: m.altEn.trim() || null, altFa: m.altFa.trim() || null })),
          relatedIds: related.map((r) => r.id),
          variants: variantsPayload,
        }
        await apiPatch<{ product: { id: string } }>(`/api/admin/products/${pid}`, body)
        toast({ title: L.saved })
        onSaved(pid)
        onClose()
      }
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? L.error, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ── Upload ──
  /** One image → /api/admin/upload → public URL (server-persisted). */
  const uploadOne = async (file: File): Promise<string> => {
    const fd = new FormData()
    fd.append('file', file)
    // Plain fetch — the multipart body must not carry the JSON Content-Type header.
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
    const body = (await res.json().catch(() => null)) as { url?: string; message?: string } | null
    if (!res.ok || !body?.url) throw new Error(body?.message ?? `HTTP ${res.status}`)
    return body.url
  }

  /** Cover upload — result becomes the cover path. */
  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      setCoverUrl(await uploadOne(file))
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? L.error, variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  /** Gallery upload — multiple files, appended IN FILE ORDER to the end of the list. */
  const uploadGalleryFiles = async (files: FileList) => {
    const list = Array.from(files).filter((f) => f instanceof File)
    if (list.length === 0) return
    setGalleryUploading(true)
    try {
      const urls: string[] = []
      for (const f of list) {
        try {
          urls.push(await uploadOne(f))
        } catch (e) {
          toast({ title: `${f.name}: ${(e as { message?: string }).message ?? L.error}`, variant: 'destructive' })
        }
      }
      if (urls.length > 0) setMedia((rows) => [...rows, ...urls.map((url) => ({ url, altEn: '', altFa: '' }))])
    } finally {
      setGalleryUploading(false)
    }
  }

  // ── Derived UI state ──
  const stateBadge = (loc: 'en' | 'fa') => {
    const c = content[loc]
    const ready = c.title.trim() !== '' && c.shortDescription.trim() !== ''
    return <Badge tone={ready ? 'success' : 'warning'}>{ready ? L.stateReady : L.stateIncomplete}</Badge>
  }

  const inputCls = 'h-9'

  if (!open) {
    return (
      <Dialog open={false}>
        <DialogContent className="hidden" aria-describedby={undefined} />
      </Dialog>
    )
  }

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'content', label: L.tabContent },
    { key: 'media', label: L.tabMedia },
    { key: 'classification', label: L.tabClassification },
    { key: 'variants', label: L.tabVariants },
    { key: 'related', label: L.tabRelated },
    { key: 'seo', label: L.tabSeo },
  ]

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0"
        style={{ width: 'calc(100% - 2rem)', maxWidth: '1080px' }}
        showCloseButton={false}
        aria-describedby={undefined}
      >
        {/* Header: mode + slug + status + actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5 pe-14">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <DialogTitle className="text-base font-bold text-ink">
              {mode === 'create' ? L.newProduct : L.editProduct}
            </DialogTitle>
            {slug.trim() ? (
              <span dir="ltr" className="max-w-52 truncate text-xs text-ink-3">
                {slug.trim()}
              </span>
            ) : null}
            <Badge tone={status === 'PUBLISHED' ? 'success' : 'default'}>
              {status === 'PUBLISHED' ? L.published : L.draft}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-9" onClick={save} disabled={saving || loading}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {saving ? L.saving : L.save}
            </Button>
            <Button size="sm" variant="outline" className="h-9" onClick={onClose} disabled={saving}>
              {L.close}
            </Button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 border-b border-line bg-soft/50 px-4 py-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 text-[13px] font-medium transition',
                tab === t.key ? 'bg-white text-ink shadow-sm ring-1 ring-line' : 'text-ink-2 hover:bg-white/70 hover:text-ink',
              )}
            >
              {t.label}
              {t.key === 'variants' && variants.length > 0 ? (
                <span className="ms-1.5 rounded-full bg-brand-soft px-1.5 text-[10px] font-bold text-brand">{variants.length}</span>
              ) : null}
              {t.key === 'related' && related.length > 0 ? (
                <span className="ms-1.5 rounded-full bg-brand-soft px-1.5 text-[10px] font-bold text-brand">{related.length}</span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-slim">
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner label={L.loading} />
            </div>
          ) : (
            <>
              {/* ── Content ── */}
              {tab === 'content' && (
                <div className="grid gap-5 md:grid-cols-2">
                  {/* EN column */}
                  <section className="rounded-lg border border-line bg-white p-4" dir="ltr" lang="en">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-3">{L.english}</h3>
                      {stateBadge('en')}
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="pe-en-title" className="text-[13px] font-medium text-ink">
                          {L.title} <span className="text-orange-accent">*</span>
                        </Label>
                        <Input
                          id="pe-en-title"
                          className={inputCls}
                          value={content.en.title}
                          onChange={(e) => setContent((c) => ({ ...c, en: { ...c.en, title: e.target.value } }))}
                          maxLength={300}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pe-en-sub" className="text-[13px] font-medium text-ink">
                          {L.subtitle}
                        </Label>
                        <Input
                          id="pe-en-sub"
                          className={inputCls}
                          value={content.en.subtitle}
                          onChange={(e) => setContent((c) => ({ ...c, en: { ...c.en, subtitle: e.target.value } }))}
                          maxLength={300}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pe-en-short" className="text-[13px] font-medium text-ink">
                          {L.shortDescription}
                        </Label>
                        <Textarea
                          id="pe-en-short"
                          rows={3}
                          value={content.en.shortDescription}
                          onChange={(e) => setContent((c) => ({ ...c, en: { ...c.en, shortDescription: e.target.value } }))}
                          maxLength={1000}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label htmlFor="pe-en-long" className="text-[13px] font-medium text-ink">
                            {L.longDescription}
                          </Label>
                          <button
                            type="button"
                            onClick={() => setLongPreview((p) => ({ ...p, en: !p.en }))}
                            className={cn(
                              'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition',
                              longPreview.en ? 'border-brand/40 bg-brand-soft text-brand' : 'border-line text-ink-3 hover:border-brand/40 hover:text-brand',
                            )}
                            aria-pressed={longPreview.en}
                          >
                            {longPreview.en ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
                            {longPreview.en ? L.hidePreview : L.preview}
                          </button>
                        </div>
                        <Textarea
                          id="pe-en-long"
                          rows={9}
                          dir="ltr"
                          className="max-h-[60vh] overflow-y-auto font-mono text-[13px] leading-relaxed scrollbar-slim"
                          value={content.en.longDescription}
                          onChange={(e) => setContent((c) => ({ ...c, en: { ...c.en, longDescription: e.target.value } }))}
                        />
                        {longPreview.en && (
                          <div lang="en" dir="ltr" className="max-h-[46vh] overflow-y-auto rounded-lg border border-brand/25 bg-white p-4 scrollbar-slim" aria-live="polite">
                            {content.en.longDescription.trim() ? (
                              <ProseBlocks blocks={textToBlocks(content.en.longDescription)} locale="en" measure={false} />
                            ) : (
                              <p className="text-sm text-ink-3">—</p>
                            )}
                          </div>
                        )}
                        <p className="text-xs leading-relaxed text-ink-3">{L.longHint}</p>
                      </div>
                    </div>
                  </section>

                  {/* FA column */}
                  <section className="rounded-lg border border-line bg-white p-4" dir="rtl" lang="fa">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-3">{L.persian}</h3>
                      {stateBadge('fa')}
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="pe-fa-title" className="text-[13px] font-medium text-ink">
                          {L.title}
                        </Label>
                        <Input
                          id="pe-fa-title"
                          className={inputCls}
                          value={content.fa.title}
                          onChange={(e) => setContent((c) => ({ ...c, fa: { ...c.fa, title: e.target.value } }))}
                          maxLength={300}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pe-fa-sub" className="text-[13px] font-medium text-ink">
                          {L.subtitle}
                        </Label>
                        <Input
                          id="pe-fa-sub"
                          className={inputCls}
                          value={content.fa.subtitle}
                          onChange={(e) => setContent((c) => ({ ...c, fa: { ...c.fa, subtitle: e.target.value } }))}
                          maxLength={300}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pe-fa-short" className="text-[13px] font-medium text-ink">
                          {L.shortDescription}
                        </Label>
                        <Textarea
                          id="pe-fa-short"
                          rows={3}
                          value={content.fa.shortDescription}
                          onChange={(e) => setContent((c) => ({ ...c, fa: { ...c.fa, shortDescription: e.target.value } }))}
                          maxLength={1000}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label htmlFor="pe-fa-long" className="text-[13px] font-medium text-ink">
                            {L.longDescription}
                          </Label>
                          <button
                            type="button"
                            onClick={() => setLongPreview((p) => ({ ...p, fa: !p.fa }))}
                            className={cn(
                              'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition',
                              longPreview.fa ? 'border-brand/40 bg-brand-soft text-brand' : 'border-line text-ink-3 hover:border-brand/40 hover:text-brand',
                            )}
                            aria-pressed={longPreview.fa}
                          >
                            {longPreview.fa ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
                            {longPreview.fa ? L.hidePreview : L.preview}
                          </button>
                        </div>
                        <Textarea
                          id="pe-fa-long"
                          rows={9}
                          className="max-h-[60vh] overflow-y-auto font-prose-fa text-[13.5px] leading-[1.9] scrollbar-slim"
                          value={content.fa.longDescription}
                          onChange={(e) => setContent((c) => ({ ...c, fa: { ...c.fa, longDescription: e.target.value } }))}
                        />
                        {longPreview.fa && (
                          <div lang="fa" className="max-h-[46vh] overflow-y-auto rounded-lg border border-brand/25 bg-white p-4 scrollbar-slim" aria-live="polite">
                            {content.fa.longDescription.trim() ? (
                              <ProseBlocks blocks={textToBlocks(content.fa.longDescription)} locale="fa" measure={false} />
                            ) : (
                              <p className="text-sm text-ink-3">—</p>
                            )}
                          </div>
                        )}
                        <p className="text-xs leading-relaxed text-ink-3">{L.longHint}</p>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {/* ── Media ── */}
              {tab === 'media' && (
                <div className="space-y-5">
                  <section className="rounded-lg border border-line bg-white p-4">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-3">{L.cover}</h3>
                    <div className="flex flex-wrap items-start gap-4">
                      {coverUrl.trim() ? (
                         
                        <img
                          src={coverUrl}
                          alt={content.en.title || 'cover'}
                          className="h-28 w-auto rounded-md border border-line object-cover"
                        />
                      ) : (
                        <div className="flex h-28 w-21 items-center justify-center rounded-md border border-dashed border-line bg-soft text-xs text-ink-3">
                          —
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label htmlFor="pe-cover-upload" className="cursor-pointer">
                          <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink-2 transition hover:bg-soft">
                            <Upload className="h-4 w-4" aria-hidden />
                            {uploading ? L.uploading : L.uploadImage}
                          </span>
                        </Label>
                        <input
                          id="pe-cover-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) void uploadFile(f)
                            e.target.value = ''
                          }}
                        />
                        <Input
                          dir="ltr"
                          className={cn(inputCls, 'w-72 font-mono text-xs')}
                          placeholder="/images/cover.png"
                          value={coverUrl}
                          onChange={(e) => setCoverUrl(e.target.value)}
                        />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-line bg-white p-4">
                    <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-3">{L.gallery}</h3>
                    <p className="mb-3 text-xs leading-relaxed text-ink-3">{L.uploadGalleryHint}</p>

                    {/* Upload — images persist on the SERVER (/api/admin/upload → public/uploads) */}
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <Label htmlFor="pe-gallery-upload" className="cursor-pointer">
                        <span
                          className={cn(
                            'inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink-2 transition hover:bg-soft',
                            galleryUploading && 'opacity-60',
                          )}
                        >
                          {galleryUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
                          {galleryUploading ? L.uploading : L.uploadGallery}
                        </span>
                      </Label>
                      <input
                        id="pe-gallery-upload"
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        disabled={galleryUploading}
                        onChange={(e) => {
                          if (e.target.files?.length) void uploadGalleryFiles(e.target.files)
                          e.target.value = ''
                        }}
                      />
                    </div>

                    {media.length === 0 ? (
                      <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-line bg-soft/60 text-sm text-ink-3">
                        {L.uploadGallery}
                      </div>
                    ) : (
                      <ol className="space-y-2.5">
                        {media.map((m, i) => (
                          <li
                            key={`${m.url}-${i}`}
                            draggable={armDrag === i}
                            onDragStart={(e) => {
                              setDragFrom(i)
                              e.dataTransfer.effectAllowed = 'move'
                              e.dataTransfer.setData('text/plain', String(i))
                            }}
                            onDragEnd={() => {
                              setDragFrom(null)
                              setDragOver(null)
                              setArmDrag(null)
                            }}
                            onDragOver={(e) => {
                              if (dragFrom !== null && dragFrom !== i) {
                                e.preventDefault()
                                e.dataTransfer.dropEffect = 'move'
                                setDragOver(i)
                              }
                            }}
                            onDragLeave={() => setDragOver((cur) => (cur === i ? null : cur))}
                            onDrop={(e) => {
                              e.preventDefault()
                              const raw = dragFrom ?? Number.parseInt(e.dataTransfer.getData('text/plain') || '', 10)
                              setDragFrom(null)
                              setDragOver(null)
                              setArmDrag(null)
                              if (!Number.isFinite(raw) || raw === i) return
                              setMedia((rows) => {
                                const next = [...rows]
                                const [moved] = next.splice(raw, 1)
                                next.splice(i, 0, moved)
                                return next
                              })
                            }}
                            className={cn(
                              'group relative flex flex-wrap items-center gap-3 rounded-lg border p-3 ps-4 transition',
                              dragOver === i
                                ? 'border-brand bg-brand-soft/70 ring-2 ring-brand/30'
                                : dragFrom === i
                                  ? 'border-brand/40 opacity-50'
                                  : 'border-line hover:bg-soft/40',
                            )}
                          >
                            {/* Position badge — the list IS the display order */}
                            <span
                              className="absolute -top-2 start-3 z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-[11px] font-bold text-white shadow-sm bdi"
                              dir="ltr"
                              aria-label={`${L.position} ${i + 1}`}
                            >
                              {i + 1}
                            </span>

                            {/* Thumbnail → click to view large (lightbox) */}
                            <button
                              type="button"
                              onClick={() => setLightbox(m)}
                              className="relative block h-24 w-24 shrink-0 overflow-hidden rounded-md border border-line bg-soft transition hover:ring-2 hover:ring-brand/40"
                              aria-label={`${L.viewImage} ${i + 1}`}
                              title={L.viewImage}
                            >
                              <img src={m.url} alt={m.altEn || ''} className="h-full w-full object-cover" loading="lazy" />
                              <span className="absolute inset-0 hidden items-center justify-center bg-black/35 text-white group-hover:flex" aria-hidden>
                                <Eye className="h-5 w-5" />
                              </span>
                            </button>

                            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                              <Input
                                className="h-8 text-xs"
                                placeholder={L.altEn}
                                value={m.altEn}
                                onChange={(e) =>
                                  setMedia((rows) => rows.map((r, j) => (j === i ? { ...r, altEn: e.target.value } : r)))
                                }
                              />
                              <Input
                                className="h-8 text-xs"
                                dir="rtl"
                                placeholder={L.altFa}
                                value={m.altFa}
                                onChange={(e) =>
                                  setMedia((rows) => rows.map((r, j) => (j === i ? { ...r, altFa: e.target.value } : r)))
                                }
                              />
                              <p dir="ltr" className="truncate text-[11px] font-mono text-ink-3/80 sm:col-span-2" title={m.url}>
                                {m.url}
                              </p>
                            </div>

                            <div className="flex items-center gap-0.5">
                              {/* Drag handle — press & hold, then hover into place (HTML5 drag) */}
                              <button
                                type="button"
                                aria-label={L.dragHandle}
                                title={L.dragHandle}
                                onMouseDown={() => setArmDrag(i)}
                                onMouseUp={() => setArmDrag((cur) => (cur === i ? null : cur))}
                                onTouchStart={() => setArmDrag(i)}
                                onTouchEnd={() => setArmDrag(null)}
                                className="flex h-8 w-8 cursor-grab touch-none items-center justify-center rounded-md text-ink-3 transition hover:bg-soft hover:text-ink active:cursor-grabbing"
                              >
                                <GripVertical className="h-4 w-4" aria-hidden />
                              </button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={L.moveUp}
                                disabled={i === 0}
                                onClick={() =>
                                  setMedia((rows) => {
                                    const next = [...rows]
                                    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                                    return next
                                  })
                                }
                              >
                                <ArrowUp className="h-4 w-4" aria-hidden />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={L.moveDown}
                                disabled={i === media.length - 1}
                                onClick={() =>
                                  setMedia((rows) => {
                                    const next = [...rows]
                                    ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
                                    return next
                                  })
                                }
                              >
                                <ArrowDown className="h-4 w-4" aria-hidden />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-error hover:bg-error/10"
                                aria-label={L.remove}
                                onClick={() => setMedia((rows) => rows.filter((_, j) => j !== i))}
                              >
                                <X className="h-4 w-4" aria-hidden />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}

                    {/* Lightbox — admin can re-check what was uploaded */}
                    <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
                      <DialogContent className="max-w-3xl p-2">
                        <DialogTitle className="sr-only">{L.viewImage}</DialogTitle>
                        {lightbox && (
                          <div className="space-y-2.5">
                            <img src={lightbox.url} alt={lightbox.altEn || ''} className="max-h-[72vh] w-full rounded-md bg-soft object-contain" />
                            <p dir="ltr" className="truncate px-1 text-xs font-mono text-ink-3" title={lightbox.url}>
                              {lightbox.url}
                            </p>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  </section>
                </div>
              )}

              {/* ── Classification ── */}
              {tab === 'classification' && (
                <div className="space-y-5">
                  <section className="rounded-lg border border-line bg-white p-4">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-3">{L.categories}</h3>
                      {selectedCategories[0] ? <Badge tone="brand">{selectedCategories[0]}</Badge> : null}
                    </div>
                    <p className="mb-3 text-xs text-ink-3">{L.categoriesHint}</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {categoriesAll.map((c) => {
                        const checked = selectedCategories.includes(c.slug)
                        return (
                          <label
                            key={c.id}
                            className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-line px-3 text-sm transition hover:bg-soft"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() =>
                                setSelectedCategories((sel) =>
                                  checked ? sel.filter((s) => s !== c.slug) : [...sel, c.slug],
                                )
                              }
                            />
                            <span className="truncate text-ink-2">{(locale === 'fa' ? c.nameFa : c.nameEn) ?? c.slug}</span>
                          </label>
                        )
                      })}
                      {categoriesAll.length === 0 && <p className="text-sm text-ink-3">—</p>}
                    </div>
                  </section>

                  <section className="rounded-lg border border-line bg-white p-4">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-3">{L.contributors}</h3>
                    <div className="space-y-2">
                      {contributors.map((row, i) => (
                        <div key={row.key} className="flex flex-wrap items-center gap-2">
                          <Select
                            value={row.role}
                            onValueChange={(val) =>
                              setContributors((rows) => rows.map((r, j) => (j === i ? { ...r, role: val } : r)))
                            }
                          >
                            <SelectTrigger className="h-9 w-36" aria-label={L.role}>
                              <SelectValue placeholder={L.role} />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLE_KEYS.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {roleLabel(r)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={row.personId}
                            onValueChange={(val) =>
                              setContributors((rows) => rows.map((r, j) => (j === i ? { ...r, personId: val } : r)))
                            }
                          >
                            <SelectTrigger className="h-9 min-w-52 flex-1" aria-label={L.person}>
                              <SelectValue placeholder={L.person} />
                            </SelectTrigger>
                            <SelectContent>
                              {peopleAll.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {(locale === 'fa' ? p.nameFa : p.nameEn) ?? p.slug}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-error hover:bg-error/10"
                            aria-label={L.remove}
                            onClick={() => setContributors((rows) => rows.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9"
                          onClick={() => setContributors((rows) => [...rows, { key: nextKey(), personId: '', role: 'AUTHOR' }])}
                        >
                          <Plus className="h-4 w-4" aria-hidden />
                          {L.addContributor}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 gap-1.5 border-dashed"
                          onClick={() => {
                            setNpNameEn('')
                            setNpNameFa('')
                            setNpProfession('')
                            setNpForRow(contributors.length > 0 ? contributors.length - 1 : null)
                            setNpOpen(true)
                          }}
                          title={L.newPersonHint}
                        >
                          <UserPlus className="h-4 w-4" aria-hidden />
                          {L.newPerson}
                        </Button>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {/* ── Variants ── */}
              {tab === 'variants' && (
                <div className="space-y-4">
                  {variants.map((v, i) => {
                    const isDup = dupSkuKeys.has(v.key)
                    return (
                      <section key={v.key} className="rounded-lg border border-line bg-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-ink-3">#{i + 1}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-ink-3">{L.active}</span>
                            <Switch
                              checked={v.isActive}
                              onCheckedChange={(checked) =>
                                setVariants((rows) => rows.map((r, j) => (j === i ? { ...r, isActive: checked } : r)))
                              }
                              aria-label={L.active}
                            />
                            {v.id ? (
                              v.isActive ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs text-error hover:bg-error/10"
                                  onClick={() => {
                                    if (window.confirm(L.deactivateConfirm)) {
                                      setVariants((rows) => rows.map((r, j) => (j === i ? { ...r, isActive: false } : r)))
                                    }
                                  }}
                                >
                                  {L.deactivate}
                                </Button>
                              ) : null
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-error hover:bg-error/10"
                                aria-label={L.remove}
                                onClick={() => setVariants((rows) => rows.filter((_, j) => j !== i))}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div className="space-y-1">
                            <Label className="text-xs text-ink-3">{L.sku}</Label>
                            <Input
                              dir="ltr"
                              className={cn('h-9 font-mono text-xs', isDup && 'border-error')}
                              value={v.sku}
                              onChange={(e) => setVariants((rows) => rows.map((r, j) => (j === i ? { ...r, sku: e.target.value.toUpperCase() } : r)))}
                            />
                            {isDup && <p className="text-xs text-error">{L.dupSku}</p>}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-ink-3">{L.format}</Label>
                            <Select
                              value={v.format}
                              onValueChange={(val) => setVariants((rows) => rows.map((r, j) => (j === i ? { ...r, format: val } : r)))}
                            >
                              <SelectTrigger className="h-9" aria-label={L.format}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FORMAT_KEYS.map((f) => (
                                  <SelectItem key={f} value={f}>
                                    {formatLabel(f)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-ink-3">{L.language}</Label>
                            <Select
                              value={LANG_KEYS.includes(v.bookLanguage) ? v.bookLanguage : '__other__'}
                              onValueChange={(val) => {
                                if (val === '__other__') return
                                setVariants((rows) => rows.map((r, j) => (j === i ? { ...r, bookLanguage: val } : r)))
                              }}
                            >
                              <SelectTrigger className="h-9" aria-label={L.language}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Persian">{L.langPersian}</SelectItem>
                                <SelectItem value="English">{L.langEnglish}</SelectItem>
                                {/* Legacy free-text values stay visible instead of silently morphing */}
                                {!LANG_KEYS.includes(v.bookLanguage) && v.bookLanguage.trim() !== '' && (
                                  <SelectItem value="__other__">{v.bookLanguage} — {L.langOther}</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-ink-3">{L.price}</Label>
                            <Input
                              dir="ltr"
                              type="number"
                              min="1"
                              step="0.01"
                              className="h-9"
                              value={v.price}
                              onChange={(e) => setVariants((rows) => rows.map((r, j) => (j === i ? { ...r, price: e.target.value } : r)))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-ink-3">{L.stock}</Label>
                            <Input
                              dir="ltr"
                              type="number"
                              min="0"
                              step="1"
                              className="h-9"
                              value={v.stock}
                              onChange={(e) => setVariants((rows) => rows.map((r, j) => (j === i ? { ...r, stock: e.target.value } : r)))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-ink-3">{L.isbn}</Label>
                            <Input
                              dir="ltr"
                              className="h-9 font-mono text-xs"
                              value={v.isbn13}
                              onChange={(e) => setVariants((rows) => rows.map((r, j) => (j === i ? { ...r, isbn13: e.target.value } : r)))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-ink-3">{L.edition}</Label>
                            <Input
                              className="h-9"
                              value={v.editionLabel}
                              onChange={(e) =>
                                setVariants((rows) => rows.map((r, j) => (j === i ? { ...r, editionLabel: e.target.value } : r)))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-ink-3">{L.pages}</Label>
                            <Input
                              dir="ltr"
                              type="number"
                              min="1"
                              className="h-9"
                              value={v.pageCount}
                              onChange={(e) =>
                                setVariants((rows) => rows.map((r, j) => (j === i ? { ...r, pageCount: e.target.value } : r)))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-ink-3">{L.dims}</Label>
                            <div className="flex gap-1.5">
                              {(['widthMm', 'heightMm', 'depthMm'] as const).map((dim) => (
                                <Input
                                  key={dim}
                                  dir="ltr"
                                  type="number"
                                  min="1"
                                  aria-label={dim}
                                  className="h-9 px-2 text-center text-xs"
                                  value={v[dim]}
                                  onChange={(e) =>
                                    setVariants((rows) => rows.map((r, j) => (j === i ? { ...r, [dim]: e.target.value } : r)))
                                  }
                                />
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-ink-3">{L.weight}</Label>
                            <Input
                              dir="ltr"
                              type="number"
                              min="1"
                              className="h-9"
                              value={v.weightG}
                              onChange={(e) => setVariants((rows) => rows.map((r, j) => (j === i ? { ...r, weightG: e.target.value } : r)))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-ink-3">{L.country}</Label>
                            <Input
                              className="h-9"
                              value={v.countryOfPrinting}
                              onChange={(e) =>
                                setVariants((rows) => rows.map((r, j) => (j === i ? { ...r, countryOfPrinting: e.target.value } : r)))
                              }
                            />
                          </div>
                        </div>
                      </section>
                    )
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9"
                    onClick={() => setVariants((rows) => [...rows, emptyVariant(nextKey())])}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    {L.addVariant}
                  </Button>
                </div>
              )}

              {/* ── Related ── */}
              {tab === 'related' && (
                <div className="space-y-5">
                  <section className="rounded-lg border border-line bg-white p-4">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-3">{L.related}</h3>
                    {related.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {related.map((r) => (
                          <span
                            key={r.id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-soft py-1 pe-1.5 ps-1 text-xs text-ink-2"
                          >
                            {r.coverUrl ? (
                              <img src={r.coverUrl} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-line" loading="lazy" />
                            ) : (
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink/5 text-[10px] font-bold text-ink-3" aria-hidden>
                                {r.title.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <span className="max-w-56 truncate">{r.title}</span>
                            <button
                              type="button"
                              aria-label={`${L.remove} ${r.title}`}
                              className="flex h-5 w-5 items-center justify-center rounded-full text-ink-3 hover:bg-error/10 hover:text-error"
                              onClick={() => setRelated((rows) => rows.filter((x) => x.id !== r.id))}
                            >
                              <X className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="relative">
                      <Search className="absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
                      <Input
                        className="h-9 ps-8"
                        placeholder={L.search}
                        value={relatedQuery}
                        onChange={(e) => setRelatedQuery(e.target.value)}
                      />
                    </div>
                    <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-line scrollbar-slim">
                      {relatedSearching ? (
                        <div className="flex justify-center py-6">
                          <Loader2 className="h-4 w-4 animate-spin text-ink-3" aria-hidden />
                        </div>
                      ) : relatedFiltered.length === 0 ? (
                        <p className="py-6 text-center text-sm text-ink-3">{L.noResults}</p>
                      ) : (
                        <ul className="divide-y divide-line">
                          {relatedFiltered.map((r) => (
                            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-soft/50">
                              <div className="flex min-w-0 items-center gap-2.5">
                                {r.coverUrl ? (
                                  <img
                                    src={r.coverUrl}
                                    alt=""
                                    className="h-11 w-9 shrink-0 rounded border border-line bg-soft object-cover shadow-sm"
                                    loading="lazy"
                                  />
                                ) : (
                                  <span className="flex h-11 w-9 shrink-0 items-center justify-center rounded border border-dashed border-line bg-soft text-xs font-bold text-ink-3" aria-hidden>
                                    {r.title.slice(0, 1).toUpperCase()}
                                  </span>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-sm text-ink">{r.title}</p>
                                  <p dir="ltr" className="truncate text-xs text-ink-3">
                                    {r.slug}
                                  </p>
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 shrink-0"
                                onClick={() => setRelated((rows) => [...rows, r])}
                              >
                                <Plus className="h-3.5 w-3.5" aria-hidden />
                                {L.add}
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {/* ── SEO & details ── */}
              {tab === 'seo' && (
                <div className="space-y-5">
                  <section className="grid gap-3 rounded-lg border border-line bg-white p-4 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="pe-slug" className="text-[13px] font-medium text-ink">
                        {L.slug}
                      </Label>
                      <Input
                        id="pe-slug"
                        dir="ltr"
                        className={cn(inputCls, 'font-mono text-xs')}
                        value={slug}
                        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                        maxLength={80}
                      />
                      <p className="text-xs text-ink-3">{L.slugHint}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pe-publisher" className="text-[13px] font-medium text-ink">
                        {L.publisher}
                      </Label>
                      <Input id="pe-publisher" className={inputCls} value={publisher} onChange={(e) => setPublisher(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pe-series" className="text-[13px] font-medium text-ink">
                        {L.series}
                      </Label>
                      <Input id="pe-series" className={inputCls} value={series} onChange={(e) => setSeries(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pe-pubdate" className="text-[13px] font-medium text-ink">
                        {L.publicationDate}
                      </Label>
                      <Input
                        id="pe-pubdate"
                        dir="ltr"
                        type="date"
                        className={inputCls}
                        value={publicationDate}
                        onChange={(e) => setPublicationDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pe-audience" className="text-[13px] font-medium text-ink">
                        {L.audience}
                      </Label>
                      <Input id="pe-audience" className={inputCls} value={audience} onChange={(e) => setAudience(e.target.value)} />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="pe-safety" className="text-[13px] font-medium text-ink">
                        {L.safetyNote}
                      </Label>
                      <Textarea
                        id="pe-safety"
                        rows={2}
                        value={safetyNote}
                        onChange={(e) => setSafetyNote(e.target.value)}
                        maxLength={1000}
                      />
                    </div>
                    <div className="flex h-9 items-center justify-between gap-3 rounded-md border border-line px-3">
                      <Label htmlFor="pe-fixed" className="cursor-pointer text-[13px] text-ink-2">
                        {L.fixedPrice}
                      </Label>
                      <Switch id="pe-fixed" checked={fixedPrice} onCheckedChange={setFixedPrice} />
                    </div>
                    <div className="flex h-9 items-center justify-between gap-3 rounded-md border border-line px-3">
                      <Label htmlFor="pe-featured" className="cursor-pointer text-[13px] text-ink-2">
                        {L.isFeatured}
                      </Label>
                      <Switch id="pe-featured" checked={isFeatured} onCheckedChange={setIsFeatured} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[13px] font-medium text-ink">{L.status}</Label>
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="h-9" aria-label={L.status}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DRAFT">{L.draft}</SelectItem>
                          <SelectItem value="PUBLISHED">{L.published}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </section>

                  <section className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-3 rounded-lg border border-line bg-white p-4" dir="ltr">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-3">SEO · EN</h3>
                      <div className="space-y-1.5">
                        <Label htmlFor="pe-seo-title-en" className="text-[13px] font-medium text-ink">
                          {L.seoTitle}
                        </Label>
                        <Input
                          id="pe-seo-title-en"
                          className={inputCls}
                          value={content.en.seoTitle}
                          onChange={(e) => setContent((c) => ({ ...c, en: { ...c.en, seoTitle: e.target.value } }))}
                          maxLength={300}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pe-seo-desc-en" className="text-[13px] font-medium text-ink">
                          {L.seoDesc}
                        </Label>
                        <Textarea
                          id="pe-seo-desc-en"
                          rows={3}
                          value={content.en.seoDesc}
                          onChange={(e) => setContent((c) => ({ ...c, en: { ...c.en, seoDesc: e.target.value } }))}
                          maxLength={500}
                        />
                      </div>
                    </div>
                    <div className="space-y-3 rounded-lg border border-line bg-white p-4" dir="rtl" lang="fa">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-3">SEO · FA</h3>
                      <div className="space-y-1.5">
                        <Label htmlFor="pe-seo-title-fa" className="text-[13px] font-medium text-ink">
                          {L.seoTitle}
                        </Label>
                        <Input
                          id="pe-seo-title-fa"
                          className={inputCls}
                          value={content.fa.seoTitle}
                          onChange={(e) => setContent((c) => ({ ...c, fa: { ...c.fa, seoTitle: e.target.value } }))}
                          maxLength={300}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pe-seo-desc-fa" className="text-[13px] font-medium text-ink">
                          {L.seoDesc}
                        </Label>
                        <Textarea
                          id="pe-seo-desc-fa"
                          rows={3}
                          value={content.fa.seoDesc}
                          onChange={(e) => setContent((c) => ({ ...c, fa: { ...c.fa, seoDesc: e.target.value } }))}
                          maxLength={500}
                        />
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>

      {/* ── Inline «new person» dialog — register an author/editor/… on the spot ── */}
      <Dialog open={npOpen} onOpenChange={(o) => { if (!o) closeNp() }}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogTitle className="text-base font-bold text-ink">{L.newPersonTitle}</DialogTitle>
          <p className="text-xs leading-relaxed text-ink-3">{L.newPersonHint}</p>
          <form
            className="space-y-3"
            onSubmit={(e) => { e.preventDefault(); void createPerson() }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="np-name-en" className="text-[13px]">{L.nameEn} *</Label>
              <Input
                id="np-name-en"
                dir="ltr"
                value={npNameEn}
                onChange={(e) => setNpNameEn(e.target.value)}
                maxLength={80}
                placeholder="Mina Karimi"
                autoFocus
              />
            </div>
            <div className="space-y-1.5" lang="fa" dir="rtl">
              <Label htmlFor="np-name-fa" className="text-[13px]">{L.nameFa}</Label>
              <Input
                id="np-name-fa"
                dir="rtl"
                lang="fa"
                value={npNameFa}
                onChange={(e) => setNpNameFa(e.target.value)}
                maxLength={80}
                placeholder="مینا کریمی"
                className="font-prose-fa"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-profession" className="text-[13px]">{L.professionOptional}</Label>
              <Input
                id="np-profession"
                value={npProfession}
                onChange={(e) => setNpProfession(e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="outline" className="h-9" onClick={closeNp}>
                {L.cancel}
              </Button>
              <Button type="submit" className="h-9 gap-1.5" disabled={npBusy || npNameEn.trim().length < 2}>
                {npBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
                {npBusy ? L.personCreating : L.newPerson}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

// ─────────────────────────── detail response types ───────────────────────────

interface DetailTranslation {
  locale: string
  title: string
  subtitle: string | null
  shortDescription: string | null
  longDescription: string | null
  seoTitle: string | null
  seoDesc: string | null
  publishedState: string
}

interface DetailProduct {
  id: string
  slug: string
  status: string
  coverUrl: string | null
  publisher: string | null
  series: string | null
  isFeatured: boolean
  fixedPrice: boolean
  publicationDate: string | null
  publishAt?: string | null
  audience: string | null
  safetyNote: string | null
  translations: Record<string, DetailTranslation>
  categories: { slug: string; name: string; isPrimary: boolean }[]
  media: { id: string; url: string; altEn: string | null; altFa: string | null; sortOrder: number }[]
  contributors: { personId: string; role: string; displayOrder: number; name: string }[]
  related: { id: string; title: string; slug: string }[]
  variants: {
    id: string
    sku: string
    isbn13: string | null
    format: string
    bookLanguage: string
    editionLabel: string | null
    pageCount: number | null
    widthMm: number | null
    heightMm: number | null
    depthMm: number | null
    weightG: number | null
    countryOfPrinting: string | null
    priceMinor: number
    stock: number
    isActive: boolean
  }[]
  priceHistory?: unknown[]
}
