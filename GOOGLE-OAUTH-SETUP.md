# راهنمای راه‌اندازی ورود با گوگل (Google OAuth 2.0)

این سند قدم‌به‌قدم اتصال «ورود / ثبت‌نام با گوگل» را برای فروشگاه پرس‌پیکس توضیح می‌دهد.
پیاده‌سازی کامل است: فقط اطلاعات اعتبارنامه (Credentials) را از گوگل بگیرید و در `.env` بگذارید.

---

## ۱. چه اطلاعاتی از گوگل گرفته می‌شود؟

با اسکوپ‌های `openid email profile` این اطلاعات خوانده و ذخیره می‌شود:

| فیلد گوگل | ستون دیتابیس | کاربرد |
|---|---|---|
| `sub` (شناسه یکتای همیشگی) | `User.googleSub` | اتصال پایدار حساب گوگل به حساب محلی |
| `email` | `User.email` | ورود/ثبت‌نام با همین ایمیل |
| `email_verified` | `User.emailVerifiedAt` | اگر گوگل تأیید کرده باشد، ایمیل تأیید‌شده تلقی می‌شود |
| `name` / `given_name` / `family_name` | `User.name` | نام نمایشی کاربر |
| `picture` | `User.avatarUrl` | آواتار (در هدر و صفحه‌ی حساب نمایش داده می‌شود) |

هیچ توکن یا داده‌ی دیگری از گوگل نگه داشته نمی‌شود (`access_type=online`).

## ۲. ساخت اعتبارنامه در Google Cloud Console

1. به [console.cloud.google.com](https://console.cloud.google.com/) بروید و یک پروژه بسازید (یا پروژه‌ی موجود را انتخاب کنید).
2. **APIs & Services → OAuth consent screen**:
   - User Type را **External** بگذارید.
   - App name: `Persepix`، ایمیل پشتیبانی و ایمیل توسعه‌دهنده را پر کنید.
   - Scopes را دست نزنید (فقط اسکوپ‌های پیش‌فرض openid/email/profile).
   - اگر دکمه‌ی «Publish» را نزنید، فقط ایمیل‌های Test users می‌توانند وارد شوند.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized redirect URIs** — دقیقاً این آدرس (آدرس دقیق سایت خودتان + مسیر ثابت):
     ```
     https://<دامنه‌ی سایت شما>/api/auth/google/callback
     ```
     برای توسعه‌ی محلی:
     ```
     http://localhost:3000/api/auth/google/callback
     ```
   - آدرس دقیق برای این استقرار را از این endpoint بگیرید:
     ```
     GET /api/auth/google/status  →  { "configured": false, "redirectUri": "…" }
     ```
     همین `redirectUri` را عیناً در کنسول گوگل ثبت کنید.
4. بعد از ساخت، **Client ID** و **Client Secret** را کپی کنید.

## ۳. قرار دادن مقادیر در `.env` و ری‌استارت

```env
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
# اگر سایت پشت پروکسی/گیت‌وی است و هاست درخواست با آدرس عمومی فرق دارد:
APP_URL=https://<دامنه‌ی عمومی سایت>
```

سپس سرور را ری‌استارت کنید (`bun run dev`). از این لحظه:
- دکمه‌ی «Continue with Google / ورود با گوگل» در صفحه‌های **ورود** و **ثبت‌نام** فعال می‌شود (تا قبل از آن، کلیک روی دکمه پیام «تنظیم نشده» نشان می‌دهد).
- `GET /api/auth/google/status` مقدار `configured: true` برمی‌گرداند.

## ۴. رفتار سیستم (خودکار)

- **ایمیل جدید** → حساب CUSTOMER ساخته می‌شود؛ ایمیل تأییدشده تلقی می‌شود؛ نشست ۳۰ روزه باز می‌شود؛ سبد مهمان ادغام می‌شود.
- **ایمیل موجود (حساب رمزی)** → هویت گوگل به همان حساب **لینک** می‌شود (هر دو روش ورود کار می‌کنند) و آواتار/وضعیت تأیید ایمیل به‌روز می‌شود.
- **ایمیل موجود (حساب فقط‌گوگلی)** → ورود با رمز پیام «این ایمیل با گوگل ثبت شده» می‌دهد و کاربر را به دکمه‌ی گوگل هدایت می‌کند.
- لغو اجازه توسط کاربر، منقضی‌شدن state، خطای تبادل کد یا ایمیل تأییدنشده → بازگشت امن به صفحه‌ی ورود با پیام محلی‌شده (EN/FA).
- امنیت: `state` یک‌بارمصرف در کوکی `HttpOnly` (۱۰ دقیقه) + امضای HMAC؛ مقایسه‌ی timing-safe؛ session کوکی `sp_session` همان ورود رمزی.

## ۵. عیب‌یابی

| نشانه | علت / راه‌حل |
|---|---|
| `402 invalid_client` در صفحه‌ی گوگل | Client ID اشتباه است |
| `redirect_uri_mismatch` | آدرس ثبت‌شده در کنسول با `redirectUri` خروجی `/api/auth/google/status` یکی نیست |
| `access_blocked: app not verified` | در OAuth consent screen دکمه‌ی **PUBLISH APP** را بزنید (یا ایمیل را در Test users اضافه کنید) |
| دکمه می‌گوید «تنظیم نشده» | مقادیر `.env` خالی است یا سرور ری‌استارت نشده |
