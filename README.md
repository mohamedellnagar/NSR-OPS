# مطجري — Matjari 🍽️
**منصة إدارة مطاعم متكاملة | Full-Stack Restaurant Management Platform**

> **آخر تحديث:** 2026-05-27 — تمت إضافة نظام POS كامل (كاشير + ويتر + KDS) مع ربط مخزون المطبخ ثلاثي الطبقات

---

## 📌 نظرة عامة | Overview

**Matjari** منصة ويب متكاملة لإدارة عمليات المطاعم من الألف إلى الياء:
المخزن ← المطبخ ← القائمة ← نقطة البيع ← التقارير ← واتساب

المنصة مبنية كـ **Fullstack Monorepo**:
- **Frontend**: React 19 + Vite + TailwindCSS v4
- **Backend**: Express + tRPC v11
- **Database**: MySQL via Drizzle ORM
- **Auth**: JWT (email + password)
- **AI**: OpenAI API
- **WhatsApp**: Evolution API
- **Real-time**: Server-Sent Events (SSE)

---

## 🗂️ هيكل المشروع | Project Structure

```
matjari/
├── client/                         # React frontend (Vite)
│   └── src/
│       ├── pages/                  # ~55 صفحة
│       │   └── pos/                # نظام POS (كاشير، ويتر، KDS، إنتاج)
│       ├── components/             # مكونات مشتركة + shadcn/ui
│       ├── contexts/               # ThemeContext, LanguageContext (AR/EN)
│       └── lib/                    # tRPC client, i18n, utils
│
├── server/                         # Express + tRPC backend
│   ├── _core/                      # البنية التحتية (index, trpc, auth, env)
│   ├── routers.ts                  # 🔑 جميع tRPC routers
│   ├── db.ts                       # 🔑 قاعدة بيانات رئيسية (Drizzle)
│   ├── pos-db.ts                   # نظام POS (طلبات، طاولات، دفع)
│   ├── kitchen-service-stock-db.ts # مخزون خدمة المطبخ (Layer 3)
│   ├── inventory-intelligence-db.ts# توقعات المخزون + ورقة الطلب الذكية
│   ├── price-simulator-db.ts       # محاكاة تأثير تغيير الأسعار
│   ├── waste-analytics-db.ts       # تحليل الهدر المتقدم
│   ├── daily-flash-db.ts           # تقرير اليومية السريع
│   ├── production-planning-db.ts   # تخطيط الإنتاج + حاسبة الشُح
│   ├── menu-engineering-db.ts      # هندسة القائمة (Star/Dog/etc)
│   ├── shifts-db.ts                # إدارة الورديات
│   ├── purchase-orders-db.ts       # طلبات الشراء + إرسال WA
│   └── wa*.ts                      # WhatsApp integration
│
├── drizzle/                        # 52 migration SQL + schema.ts (~55 جدول)
├── shared/                         # Types مشتركة
└── scripts/                        # Utility scripts
```

---

## 🚀 تشغيل المشروع | Getting Started

### المتطلبات
- **Node.js** >= 18
- **pnpm** >= 10
- **MySQL** 8+

### التثبيت
```bash
pnpm install
```

### متغيرات البيئة
أنشئ ملف `.env` في جذر المشروع:
```env
DATABASE_URL=mysql://user:password@localhost:3306/matjari
JWT_SECRET=your-very-long-secret-key-here   # إلزامي في الإنتاج

PORT=3000

# AI features (اختياري)
BUILT_IN_FORGE_API_URL=https://...
BUILT_IN_FORGE_API_KEY=...

# WhatsApp — Evolution API (اختياري)
EVOLUTION_API_URL=https://...
EVOLUTION_API_KEY=...

# AWS S3 (اختياري)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=...
AWS_S3_BUCKET=...
```

> ⚠️ إذا لم يتم تعيين `JWT_SECRET` في بيئة الإنتاج يرفض السيرفر البدء.

### قاعدة البيانات
```bash
pnpm db:push        # تطبيق كل الـ migrations
```

### أول مستخدم Admin
```bash
node seed-admin.mjs
```

### تشغيل Development
```bash
pnpm dev            # http://localhost:3000
```

### Build للإنتاج
```bash
pnpm build
pnpm start
```

### الاختبارات
```bash
pnpm test
```

---

## 🧩 الوحدات الكاملة | All Modules

---

### 🏠 1. Dashboard (`/`)
- بطاقات KPI: إجمالي المواد، قيمة المخزون، تنبيهات المخزون
- رسم بياني للأداء اليومي
- آخر المعاملات

---

### 📦 2. المخزن | Warehouse

| الصفحة | الرابط | الوصف |
|--------|--------|-------|
| المواد الخام | `/materials` | CRUD كامل + استيراد Excel + تاريخ الأسعار |
| الفئات | `/categories` | تصنيف المواد |
| الموردون | `/suppliers` | بيانات الموردين + رقم واتساب + تقييم |
| إدخال مخزون | `/stock-in` | استلام مواد + تاريخ انتهاء الصلاحية |
| إخراج مخزون | `/stock-out` | صرف مواد مع تحديد السبب |
| سجل الإخراج | `/stock-out-log` | سجل تفصيلي |
| الفواتير | `/invoices` | فواتير الموردين + حالات الدفع + PDF |
| المعاملات | `/transactions` | كل حركات الدخول والخروج |
| طلبات الشراء | `/purchase-orders` | إنشاء PO + إرسال عبر واتساب + تتبع الحالة |
| توقعات المخزون | `/inventory-forecast` | أيام التغطية + ورقة الطلب الذكية |
| مقارنة الأسعار | `/price-comparison` | مقارنة أسعار الموردين |
| أسعار المواد | `/material-prices` | تاريخ أسعار المواد الخام |

**ميزات خاصة بالمخزن:**
- ✅ تتبع تاريخ انتهاء الصلاحية على كل دفعة مستلمة
- ✅ تنبيه تلقائي عند الاقتراب من تاريخ الانتهاء (3/7/30 يوم)
- ✅ توليد طلبات شراء تلقائية للمواد تحت الحد الأدنى
- ✅ ورقة طلب ذكية تحسب الكمية المطلوبة بناءً على معدل الاستهلاك

---

### 🍳 3. المطبخ | Kitchen Operations

| الصفحة | الرابط | الوصف |
|--------|--------|-------|
| إنتاج المطبخ | `/kitchen` | تسجيل الإنتاج اليومي |
| يوم المطبخ | `/kitchen-day` | عرض يومي شامل |
| الجرد اليومي | `/kitchen-daily-inventory` | إغلاق يومي للإنتاج |
| عد الخامات | `/kitchen-raw-count` | جرد المواد في المطبخ |
| تقرير الاستهلاك | `/kitchen-consumption-report` | مقارنة الفعلي بالمتوقع |
| تخطيط الإنتاج | `/production-planning` | حساب المواد المطلوبة لإنتاج كمية محددة |
| الورديات | `/shifts` | تقويم أسبوعي للورديات + توزيع الموظفين |

**منطق يوم المطبخ:**
```
سحب مواد من المخزن → إنتاج → جرد فعلي
Remaining = withdrawn − consumed − waste
```
- ترحيل المتبقي للغد تلقائياً (carry-forward)

---

### 🥩 4. الملحمة | Butcher Module

| الصفحة | الرابط |
|--------|--------|
| وصفات الملحمة | `/butcher/recipes` |
| إنتاج الملحمة | `/butcher/production` |
| هدر الملحمة | `/butcher/waste` |
| كاشير الملحمة | `/butcher/cashier` |

---

### 📋 5. الوصفات وتكلفة الأغذية | Recipes & Food Cost

| الصفحة | الرابط | الوصف |
|--------|--------|-------|
| الوصفات | `/recipes` | ربط المنتجات بمكوناتها + مواد مسببة للحساسية |
| المنتجات شبه المصنعة | `/semi-finished` | وصفات للمنتجات الداخلية |
| Food Cost | `/food-cost` | نسبة تكلفة الغذاء لكل منتج |
| هندسة القائمة | `/menu-engineering` | تصنيف (⭐ Star / 🐴 Plowhorse / 🔮 Puzzle / 🐕 Dog) |
| محاكي الأسعار | `/price-simulator` | تأثير تغيير سعر مادة على تكلفة الوصفات |
| مصمم عروض AI | `/menu-offer-designer` | تصميم عروض مرئية بالذكاء الاصطناعي |

**ميزات خاصة:**
- ✅ مواد مسببة للحساسية (Allergens) على مستوى المكونات
- ✅ بطاقة تكلفة الوصفة PDF (`GET /api/pdf/recipe/:productId`)
- ✅ محاكاة سيناريوهات تغيير الأسعار قبل تطبيقها
- ✅ تحليل تذبذب أسعار المواد (Volatility Analysis)

---

### 🛒 6. نقطة البيع (POS) | Point of Sale

> نظام POS متكامل مع 3 طبقات للمخزون مترابطة

| الصفحة | الرابط | الوصف |
|--------|--------|-------|
| الكاشير | `/pos/cashier` | Full-screen POS: منتجات + سلة + دفع |
| الويتر | `/pos/waiter` | Mobile-first: خريطة طاولات + أخذ أوردر |
| شاشة المطبخ (KDS) | `/pos/kitchen` | قائمة انتظار real-time + مؤقت ملون |
| إعداد الإنتاج اليومي | `/pos/service-stock` | الكميات الجاهزة للخدمة (صباحاً) |

#### 🔗 الربط الثلاثي للمخزون

```
LAYER 1 — المخزن (raw_materials)
    ↓ سحب المواد
LAYER 2 — سحب المطبخ (kitchen_daily_pulls)
    ↓ طبخ وتحضير
LAYER 3 — الإنتاج الجاهز (kitchen_item_production)  ← جديد
    ↓ بيع من الكاشير/الويتر
POS Sales
```

**روتين يوم العمل:**
1. **7:00 ص** — مسؤول المخزن يسجّل السحب اليومي للمواد
2. **9:00 ص** — مدير المطبخ يفتح `/pos/service-stock` ويدخل: "25 كبسة، 15 مندي"  
   → المواد الخام تُخصم تلقائياً من المخزن
3. **خلال الخدمة** — الكاشير/الويتر يبيع → كل بيعة تخصم من Layer 3
4. **المنتج ينفد** → يُعلَّم `86'd` تلقائياً ويختفي من شاشة الكاشير
5. **11:00 م** — إغلاق نهاية اليوم → الباقي يُسجَّل كهدر

**Fallback الذكي:** إذا لم يتم تسجيل إنتاج → النظام يخصم من المواد الخام مباشرة عبر الوصفة (on-demand mode)

**ميزات الكاشير:**
- ✅ 3 أنواع طلبات: داخلي / تيك أواي / توصيل
- ✅ خصم بنسبة % أو مبلغ ثابت
- ✅ دفع نقدي (حساب الباقي) / بطاقة / تحويل
- ✅ إرسال للمطبخ بضغطة زر
- ✅ استرداد / إرجاع مع تسجيل السبب
- ✅ 86'd items مخفية بشكل تلقائي من الشاشة

**ميزات شاشة المطبخ (KDS):**
- ✅ تحديث تلقائي كل 10 ثانية
- ✅ مؤقت ملون: 🟢 <3 دقائق / 🟡 3-6 دقائق / 🔴 >6 دقائق
- ✅ زر "بدأ" ثم "جاهز ✓" لكل صنف
- ✅ progress bar لكل طلب
- ✅ دعم الملاحظات الخاصة (no onions, extra spicy)

---

### 🗑️ 7. الهدر | Waste Management

| الصفحة | الرابط | الوصف |
|--------|--------|-------|
| سجل الهدر | `/waste` | تسجيل هدر المواد مع السبب |
| تقرير الهدر | `/reports/waste` | تقرير دوري |
| تحليل الهدر المتقدم | `/waste-analytics` | اتجاهات، أسباب، مقارنة بالمشتريات |

**ميزات تحليل الهدر:**
- ✅ أعلى 10 مواد هدراً (bar chart)
- ✅ اتجاه يومي (line chart)
- ✅ توزيع حسب السبب (pie chart)
- ✅ نسبة الهدر من المشتريات لكل مادة
- ✅ مقارنة أسبوعية تلقائية
- ✅ توصيات تلقائية مبنية على البيانات

---

### 💰 8. الماليات | Financials

| الصفحة | الرابط | الوصف |
|--------|--------|-------|
| الحسابات اليومية | `/daily-accounts` | إيرادات + مصاريف يومية |
| المدفوعات الشهرية | `/monthly-payments` | مصاريف ثابتة (إيجار، رواتب...) |
| تقارير المبيعات | `/sales` | استيراد CSV + تحليل |
| مشتريات vs مبيعات | `/purchase-vs-sales` | مقارنة دورية |
| تحليل الانحراف | `/variance-analysis` | الفرق بين المتوقع والفعلي |
| بنود فواتير الموردين | `/supplier-items-report` | تفاصيل كل فاتورة |

---

### 📊 9. التقارير والتحليلات | Reports & Analytics

| الصفحة | الرابط | الوصف |
|--------|--------|-------|
| لوحة التحليل | `/analytics` | رسوم بيانية شاملة + COGS |
| التقارير | `/reports` | تقييم المخزون، حركة المخزون، أداء الموردين |
| التنبيهات | `/alerts` | مخزون منخفض + منتهي الصلاحية |
| **تقرير اليومية** | `/daily-flash` | ملخص يومي شامل لكل KPIs |

**تقرير اليومية السريع يشمل:**
- الإيراد + أعلى المبيعات
- نسبة تكلفة الطعام (Actual vs Theoretical)
- إنتاج المطبخ
- تكلفة الهدر
- حركة المخزون + تنبيهات المخزون
- الفواتير المستحقة
- تنبيهات ذكية تلقائية

---

### 📱 10. واتساب | WhatsApp Integration

| الصفحة | الرابط | الوصف |
|--------|--------|-------|
| تقارير واتساب | `/whatsapp-reports` | إعداد وإرسال التقارير المجدولة |
| شات واتساب | `/wa-chats` | إدارة المحادثات مع العملاء |
| أرقام المطعم | `/wa-numbers` | إدارة أرقام واتساب المتعددة |
| تحليلات واتساب | `/wa-analytics` | Response time، Sentiment، أكثر الأوقات نشاطاً |

**التقارير التلقائية المجدولة:**

| الوقت | نوع التقرير |
|-------|------------|
| 08:00 يومياً | تنبيه انتهاء الصلاحية (خلال 3 أيام) |
| 23:00 يومياً | تقرير إغلاق اليوم (المبيعات، التكلفة، الهدر، المخزون) |
| مخصص | أي تقرير يومي/أسبوعي/شهري |

**متغيرات التقارير المدعومة:** `{total_sales}`, `{food_cost_pct}`, `{total_purchases}`, `{total_waste_cost}`, `{low_stock_count}`, `{expiry_count}`, `{top_3_sellers}` وغيرها

---

### 🍽️ 11. القائمة | Menu Management

| الصفحة | الرابط | الوصف |
|--------|--------|-------|
| القائمة | `/menu` | بناء قائمة رقمية |
| استيراد القوائم | `/menu-import` | استيراد من Talabat وغيرها |
| قائمة عامة | `/menu/live/:token` | صفحة قابلة للمشاركة بدون تسجيل دخول |

---

### 🔔 12. التنبيهات | Alerts (`/alerts`)
- تنبيهات مخزون منخفض (تحت الحد الأدنى)
- تنبيهات مخزون نافد (صفر)
- **تنبيهات انتهاء الصلاحية** ← جديد
  - 🔴 أقل من 3 أيام
  - 🟠 أقل من 7 أيام
  - 🟡 أقل من 30 يوم
- تنبيهات Food Cost (ارتفاع سعر مادة >1%)

---

### ⚙️ 13. الإدارة | Admin

| الصفحة | الرابط | الوصف |
|--------|--------|-------|
| المستخدمون | `/users` | CRUD + صلاحيات تفصيلية |
| الإعدادات | `/settings` | إعدادات التطبيق العامة |

---

## 👥 نظام الصلاحيات | Role & Permission System

| الدور | الوصف |
|-------|-------|
| `admin` | وصول كامل لكل الصفحات والعمليات |
| `warehouse_manager` | العمليات التشغيلية كاملة ما عدا إدارة المستخدمين |
| `viewer` | قراءة فقط |

**صلاحيات تفصيلية:**
- للأدمن تحديد قائمة `allowedPages` لكل مستخدم
- كل صفحة لها `pageKey` مستقل
- صفحات POS منفصلة: الكاشير / الويتر / المطبخ / إعداد الإنتاج ← صلاحيات مستقلة
- Session عبر JWT cookie صالح 30 يوماً
- Rate limiting على الـ login: 5 محاولات / 15 دقيقة ثم قفل

---

## 🗄️ قاعدة البيانات | Database Schema

المخطط في `drizzle/schema.ts` — **55 جدول** أهمها:

```
── Core ────────────────────────────────────────────────
users                       — المستخدمون والصلاحيات
app_settings                — إعدادات التطبيق
restaurant_settings         — إعدادات المطعم

── Warehouse (Layer 1) ─────────────────────────────────
material_categories         — فئات المواد
raw_materials               — المواد الخام + currentQuantity
inventory_transactions      — كل حركات الدخول والخروج (+ expiryDate)
suppliers                   — الموردون (+ whatsappPhone)
invoices + invoice_items    — فواتير الموردين
free_invoices               — الفواتير الحرة
invoice_payment_history     — سجل دفعات الفواتير
purchase_orders             — طلبات الشراء
purchase_order_items        — بنود طلبات الشراء

── Kitchen (Layer 2) ───────────────────────────────────
kitchen_daily_production    — جلسات الإنتاج اليومي
kitchen_production_materials— مواد كل جلسة إنتاج
kitchen_daily_pulls         — سحب مواد المطبخ من المخزن
kitchen_production_counts   — أعداد الإنتاج
kitchen_inventory_counts    — جرد المطبخ
waste_logs                  — سجل الهدر الموحد

── Kitchen Service Stock (Layer 3) ─────────────────────
kitchen_item_production     — الحصص الجاهزة للخدمة يومياً
                              (soldQty, remainingQty, is86d)

── POS System ──────────────────────────────────────────
restaurant_tables           — طاولات المطعم
pos_orders                  — الطلبات (draft→sent→ready→paid)
pos_order_items             — بنود الطلب (+ kitchenProductionId)
pos_payments                — الدفعات (نقد/بطاقة/تحويل)
pos_returns                 — الاستردادات والإرجاعات

── Menu & Recipes ───────────────────────────────────────
products                    — منتجات القائمة
recipe_items                — وصفات المنتجات (+ allergens)
semi_finished_recipes       — وصفات المنتجات شبه المصنعة
saved_menus                 — القوائم المحفوظة

── Sales & Finance ─────────────────────────────────────
daily_sales_uploads         — رفع ملفات المبيعات
sale_items                  — بنود المبيعات المرفوعة
daily_accounts              — الحسابات اليومية
monthly_payments            — المدفوعات الشهرية الثابتة

── WhatsApp ────────────────────────────────────────────
wa_numbers                  — أرقام واتساب + إعدادات Evolution
wa_conversations            — المحادثات
wa_messages                 — الرسائل
report_subscriptions        — اشتراكات التقارير التلقائية
report_recipients           — مستلمو التقارير
report_logs                 — سجل التقارير المُرسَلة

── Butcher Section ─────────────────────────────────────
butcher_products            — منتجات الملحمة
butcher_recipes             — وصفات الملحمة
butcher_production          — إنتاج الملحمة
butcher_waste               — هدر الملحمة
butcher_sales + items       — مبيعات الملحمة

── Staff ───────────────────────────────────────────────
shifts                      — الورديات
shift_assignments           — توزيع الموظفين على الورديات

── Menu Import & Comparison ────────────────────────────
menu_import_sessions        — جلسات استيراد القوائم
price_comparison_sessions   — جلسات مقارنة الأسعار
comparison_restaurants      — المطاعم المقارنة
comparison_match_groups     — مجموعات التطابق
comparison_match_items      — عناصر التطابق
```

---

## 🌐 API Architecture

```
/api/trpc/...                   — tRPC (كل الـ endpoints)
/api/webhook/whatsapp/:id       — WhatsApp webhook (Evolution)
/api/sse/wa-events              — SSE real-time events
/api/pdf/recipe/:productId      — بطاقة تكلفة الوصفة PDF
/api/pdf/invoices               — تصدير فواتير PDF
/api/excel/invoices             — تصدير Excel
/menu/live/:token               — صفحة قائمة عامة
```

### tRPC Routers الرئيسية:
```
auth, dashboard, materials, categories, suppliers,
inventory, invoices, kitchen, kitchenPulls,
products, recipes, semiFinished, waste,
sales, analytics, reports, alerts,
butcher, freeInvoices, settings, users,
whatsapp, waInstances, waNumbers, waChats, waAnalyticsDash,
dailyAccounts, monthlyPayments, consumption,
kitchenConsumption, supplierItems, kitchenCount,
purchaseVsSales, varianceAnalysis, menuImport,
priceComparison, productionPlanning, menuEngineering,
shifts, purchaseOrders,
inventoryIntelligence, priceSimulator,
wasteAnalytics, dailyFlash,
pos, kitchenServiceStock           ← POS system
```

---

## 🛠️ التقنيات | Tech Stack

### Frontend
| التقنية | الاستخدام |
|---------|-----------|
| React 19 | UI framework |
| Wouter | Client-side routing |
| TanStack Query v5 | Server state + caching |
| tRPC v11 | Type-safe API client |
| Tailwind CSS v4 | Styling |
| Radix UI / shadcn/ui | Component library |
| Recharts | Charts & graphs |
| xlsx | Excel export (client-side) |
| lucide-react | Icons |

### Backend
| التقنية | الاستخدام |
|---------|-----------|
| Express | HTTP server |
| tRPC v11 | Type-safe API layer |
| Drizzle ORM | Database ORM |
| MySQL2 | Database driver |
| bcryptjs + jose | Hashing + JWT |
| ExcelJS | Excel export |
| PDFKit + Amiri font | PDF generation (Arabic) |
| OpenAI SDK | AI (وصفات، تحليل، شات) |
| Puppeteer/Playwright | Menu scraping |
| ws | WebSocket (WA real-time) |
| SSE | Real-time dashboard |
| AWS S3 SDK | File storage |

### DevTools
| التقنية | الاستخدام |
|---------|-----------|
| Vite | Frontend bundler |
| esbuild | Backend bundler |
| tsx | TypeScript runner |
| Drizzle Kit | DB migrations |
| Vitest | Unit testing |
| pnpm | Package manager |

---

## 🔑 ملفات الدخول الرئيسية | Key Files

| الملف | الوصف |
|-------|-------|
| [`server/_core/index.ts`](server/_core/index.ts) | نقطة بداية البـ backend + rate limiting |
| [`server/routers.ts`](server/routers.ts) | كل الـ API endpoints (~4500 سطر) |
| [`server/db.ts`](server/db.ts) | كل الـ DB queries الرئيسية |
| [`server/pos-db.ts`](server/pos-db.ts) | نظام POS الكامل |
| [`server/kitchen-service-stock-db.ts`](server/kitchen-service-stock-db.ts) | ربط المطبخ بالكاشير (Layer 3) |
| [`client/src/App.tsx`](client/src/App.tsx) | كل الـ routes + auth guards |
| [`client/src/components/AppLayout.tsx`](client/src/components/AppLayout.tsx) | الـ sidebar + navigation |
| [`drizzle/schema.ts`](drizzle/schema.ts) | تعريف 55 جدول |
| [`client/src/lib/i18n.ts`](client/src/lib/i18n.ts) | ترجمات AR/EN |

---

## 🧪 الاختبارات | Tests

```bash
pnpm test
```

ملفات الاختبار في `server/*.test.ts`:
- `inventory.test.ts` — حركات المخزون
- `recipes.test.ts` — الوصفات
- `dailyAccounts.test.ts` — الحسابات اليومية
- `foodCostAlert.test.ts` — تنبيهات تكلفة الأغذية
- `waIntegration.test.ts` — تكامل واتساب
- `comprehensive.test.ts` — اختبارات شاملة
- `menuImport.test.ts` — استيراد القوائم
- `bulk-ingredient.test.ts` — استيراد المكونات

---

## 🌍 اللغات | i18n

- **العربية (AR)** — RTL — خط IBM Plex Sans Arabic
- **الإنجليزية (EN)** — LTR
- تبديل فوري عبر `LanguageContext` بدون إعادة تحميل
- تعريفات في `client/src/lib/i18n.ts`

---

## 📁 Utility Scripts

```bash
seed-admin.mjs                         # إنشاء أول مستخدم أدمن
migrate-auth.mjs                       # هجرة نظام المصادقة
migrate-subscriptions.mjs              # هجرة اشتراكات التقارير
recalc_carry.mjs                       # إعادة حساب الترحيل
scripts/import-menu.mjs                # استيراد قائمة من ملف
scripts/import-daily-accounts.mjs      # استيراد حسابات يومية
scripts/backfill-free-invoice-numbers.mjs  # ترقيم الفواتير الحرة
```

---

## 📋 سجل التغييرات | Changelog

### v3.0.0 — 2026-05-27
**🛒 نظام POS متكامل:**
- كاشير (`/pos/cashier`): Full-screen POS مع خصم ودفع واسترداد
- ويتر (`/pos/waiter`): Mobile-first + خريطة طاولات
- شاشة مطبخ KDS (`/pos/kitchen`): Real-time + مؤقت ملون
- إعداد إنتاج يومي (`/pos/service-stock`): Layer 3 service stock

**🔗 ربط المخزون ثلاثي الطبقات:**
- `kitchen_item_production` جدول جديد (Layer 3)
- POS يخصم من الإنتاج الجاهز أولاً، fallback للوصفة
- 86'd: المنتج يختفي من POS عند النفاد
- تسجيل إنتاج صباحي → خصم مواد خام تلقائي

**🗄️ جداول جديدة:**
`restaurant_tables`, `pos_orders`, `pos_order_items`, `pos_payments`, `pos_returns`, `kitchen_item_production`

---

### v2.0.0 — 2026-05-26
**📊 التحليلات المتقدمة:**
- توقعات المخزون (`/inventory-forecast`): أيام التغطية + ورقة الطلب الذكية
- محاكي الأسعار (`/price-simulator`): تأثير تغيير السعر على الوصفات
- تحليل الهدر المتقدم (`/waste-analytics`): أنماط + مقارنة بالمشتريات
- تقرير اليومية (`/daily-flash`): ملخص يومي شامل

**🍽️ هندسة القائمة:**
- تصنيف Star / Plowhorse / Puzzle / Dog
- مصفوفة بوسطن مرئية

**🏗️ تحسينات تشغيلية:**
- تتبع تاريخ انتهاء الصلاحية على الدفعات
- مواد مسببة للحساسية على الوصفات
- بطاقة تكلفة الوصفة PDF
- رقم واتساب للموردين
- إدارة الورديات (تقويم أسبوعي)
- طلبات الشراء مع إرسال WA

**📱 تقارير واتساب جديدة:**
- تنبيه انتهاء الصلاحية (08:00 يومياً)
- تقرير إغلاق اليوم (23:00 يومياً)

**🔒 أمان:**
- Rate limiting على الـ login (5 محاولات / 15 دقيقة)
- JWT_SECRET إلزامي في الإنتاج

---

### v1.0.0 — السابق
المنصة الأساسية: مخزن، مطبخ، ملحمة، وصفات، فواتير، مبيعات، واتساب، تحليلات

---

## ✅ حالة المشروع | Status

المشروع **يعمل في بيئة الإنتاج**. التطوير النشط جارٍ.

**التغطية الحالية:**
- ✅ 100% عمليات المخزن والشراء
- ✅ 100% عمليات المطبخ (Layer 1 + 2)
- ✅ 100% نقطة البيع مع ربط المخزون (Layer 3)
- ✅ 95% التقارير والتحليلات
- ✅ 100% تكامل واتساب
- ⏳ HR/Payroll (الورديات فقط، بدون أجور)
- ⏳ P&L Statement كامل
- ⏳ Multi-Branch
- ⏳ Talabat / Deliveroo Live API
