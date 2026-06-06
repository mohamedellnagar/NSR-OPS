# مطجري - Raw Materials Inventory Platform TODO

## Phase 1: Project Setup & Database Schema
- [x] Install required dependencies (xlsx, date-fns)
- [x] Design and implement database schema (Drizzle)
- [x] Run migrations

## Phase 2: Backend (tRPC Routers)
- [x] i18n translations file (Arabic/English)
- [x] material_categories router (CRUD)
- [x] raw_materials router (CRUD, search, filter)
- [x] inventory_transactions router (stock in, stock out, log, export)
- [x] dashboard router (summary stats)
- [x] alerts router (low stock)
- [x] reports router (valuation, movement, supplier)
- [x] user management router (admin only)

## Phase 3: Core UI Infrastructure
- [x] i18n context + hooks (Arabic/English, RTL/LTR)
- [x] Global theme (elegant color palette, IBM Plex Sans Arabic font)
- [x] AppLayout with sidebar navigation (bilingual, RTL/LTR)
- [x] Login / auth page
- [x] Role-based route guards

## Phase 4: Main Pages
- [x] Dashboard page (summary cards, charts, recent transactions)
- [x] Raw Materials Management page (table, add/edit/delete modal, search, filter)
- [x] Material Categories page (CRUD)
- [x] Suppliers page (CRUD)

## Phase 5: Stock Operations
- [x] Stock In page (form, supplier info, auto stock update)
- [x] Stock Out page (form, reason tracking, auto deduction)
- [x] Inventory Transactions Log (filters, date range, CSV export)

## Phase 6: Alerts & Reports
- [x] Low Stock Alerts page (visual indicators, reorder recommendations)
- [x] Reports: Inventory Valuation (pie chart + top 10 table)
- [x] Reports: Stock Movement (bar chart + summary)
- [x] Reports: Supplier Performance (table)
- [x] User Management page (admin only, role assignment)

## Phase 7: Polish & Tests
- [x] Write vitest unit tests (24 tests passing)
- [x] Responsive design (mobile sidebar overlay)
- [x] RTL/LTR layout with IBM Plex Sans Arabic font
- [x] Final checkpoint

## Auth System Overhaul (Custom Email/Password) ✅
- [x] Replace Manus OAuth with custom email/password auth
- [x] Add passwordHash column to users table + migration
- [x] Build custom login/logout/me tRPC procedures with bcrypt + JWT cookies
- [x] Build login page with email + password form (no Manus)
- [x] Update user management page: admin creates/edits/deletes users + sets passwords
- [x] Seed first admin user on startup if no users exist

## Materials Page Enhancements ✅
- [x] Add Stock In popup dialog button per row in MaterialsPage
- [x] Add Stock Out popup dialog button per row in MaterialsPage
- [x] Add Excel (XLSX) import for bulk raw materials upload with template download
- [x] All 25 tests passing

## Stock In Form Enhancement ✅
- [x] Show unit price field in Stock In popup
- [x] Auto-calculate invoice total (quantity × unit price) in real-time

## Materials Table Enhancement ✅
- [x] lastPurchasePrice already exists in raw_materials table (updated on each Stock In)
- [x] Show "آخر سعر الوحدة" column in materials table (blue color)
- [x] Show "الإجمالي" column = currentQuantity × lastPurchasePrice (green color)

## Reset All Stock ✅
- [x] Add resetAllStock backend procedure (admin only) to set all currentQuantity = 0
- [x] Add "تصفير المخزون" button in MaterialsPage with confirmation dialog (visible to admin only)

## Delete All Materials ✅
- [x] Add deleteAllMaterials backend procedure (admin only) - also deletes all related transactions
- [x] Add "حذف جميع المواد" button in MaterialsPage with confirmation dialog (admin only)

## Granular Page Permissions ✅
- [x] Add allowedPages JSON column to users table (stores array of accessible page keys)
- [x] Update createUser/updateUser backend to accept allowedPages
- [x] auth.me returns full User object including allowedPages via getUserById
- [x] Add page permission checkboxes in UsersPage (admin can toggle pages per user)
- [x] Filter sidebar nav items based on user's allowedPages
- [x] Add route guard to redirect unauthorized page access with bilingual error page

## Currency: UAE Dirham (د.إ / AED) ✅
- [x] Update i18n translations to use د.إ as currency symbol
- [x] Update all price/value display in MaterialsPage (last price, total value columns)
- [x] Update Stock In form (unit price, invoice total)
- [x] Update Reports page (inventory valuation, stock movement)
- [x] Update Dashboard stats (total inventory value)
- [x] Update Transactions log (unit price, total amount columns)

## Fix: Alerts Page Empty ✅
- [x] Diagnose: API returns data correctly but frontend filtered on missing `stockStatus` field
- [x] Fix: derive out-of-stock (currentQty<=0) and low-stock (0<currentQty<=minQty) from returned fields
- [x] Fix: use categoryName flat field instead of nested category object

## Stock-Out Log Page (صفحة سجل الإخراج) ✅
- [x] Add inventory.stockOutLog procedure with date + material filters
- [x] Create StockOutLogPage: table with date, material, qty, unit price, total
- [x] Add date filter (day picker) and material filter (dropdown)
- [x] Add summary cards + totals footer row
- [x] Register /stock-out-log route in App.tsx
- [x] Add "سجل الإخراج" to sidebar navigation with ArrowDownCircle icon
- [x] Add stockOutLog i18n keys (Arabic + English)

## Invoice Management Page (صفحة إدارة الفواتير) ✅
- [x] Add invoices + invoice_items tables to drizzle schema
- [x] Generate and apply DB migration
- [x] Add db helpers: createInvoice, listInvoices, getInvoiceById, updateInvoiceStatus, deleteInvoice
- [x] Add tRPC procedures: invoices.create, invoices.list, invoices.get, invoices.updateStatus, invoices.delete
- [x] Create InvoicesPage: list with status badges (paid/deferred/partial)
- [x] Create invoice form: supplier, date, line items (material + qty + unit price), VAT 5% toggle, totals
- [x] On invoice submit: create stock-in transactions for each line item + update material quantities
- [x] Invoice detail view: show all items, totals, VAT, payment status
- [x] Register /invoices route in App.tsx
- [x] Add "الفواتير" to sidebar navigation with Receipt icon
- [x] Add invoices i18n keys (Arabic + English)

## Fix: Searchable Material Dropdown in Invoice Line Items ✅
- [x] Added inline search input inside material Select dropdown in invoice line items
- [x] Filters materials in real-time as user types, clears on selection, shows empty state

## Fix: UsersPage - Add New Pages to Permissions List ✅
- [x] Added stockOutLog (سجل الإخراج) and invoices (الفواتير) to ALL_PAGES array in UsersPage
- [x] ALL_PAGES is the single source of truth - adding entries here auto-updates all permission checkboxes

## Feature: Per-Line VAT Toggle in Invoice Form ✅
- [x] Added vatEnabled boolean per line item
- [x] VAT checkbox column added in each line row (header: ض. / VAT)
- [x] Line total = base + 5% VAT if enabled, shows VAT amount in orange below total
- [x] Invoice grand total sums all line totals (including per-line VAT) correctly

## Feature: Edit Invoice After Save ✅
- [x] Added updateInvoice db helper: reverses old stock, deletes old items/transactions, re-inserts new ones
- [x] Added invoices.update tRPC procedure
- [x] Added edit (pencil) button in invoice list row (amber color)
- [x] Pre-fills form with existing invoice data when edit button clicked
- [x] Dialog title and submit button change to 'Edit Invoice' / 'Save Changes' in edit mode
- [x] On save: stock is correctly reversed and re-applied

## Feature: Editable Line Total (Back-calculates Unit Price) ✅
- [x] Added lineTotalInput field to LineItem interface
- [x] Typing total auto-calculates unitPrice = total / quantity
- [x] Typing unitPrice or quantity auto-updates total display
- [x] Total column is now an editable input (highlighted border) instead of read-only text

## Fix: Mobile Keyboard Dismissal in Material Search Dropdown ✅
- [x] Added onPointerDown, onTouchStart, onFocus stopPropagation to prevent Radix Select from stealing focus
- [x] Added autoComplete/autoCorrect/autoCapitalize/spellCheck off for cleaner mobile UX

## Feature: KPI Cards in InvoicesPage ✅
- [x] KPI card: إجمالي المؤجل (amber) - sum of all deferred invoice totals
- [x] KPI card: المتبقي من الدفع الجزئي (blue) - totalAmount - paidAmount for partial invoices
- [x] KPI card: إجمالي المستحق (red) - deferred + partial remaining combined

## Feature: Combobox Material Selection in Invoice Form ✅
- [x] Replaced Select+search-inside-dropdown with direct-type combobox input
- [x] Floating suggestions list appears as user types, filtered in real-time
- [x] Selected material shown as placeholder; X button to clear selection
- [x] onMouseDown used to prevent blur-before-select race condition

## Feature: Admin-Only Delete Transaction in Transactions Log ✅
- [x] Added deleteTransaction db helper: reverses stock quantity then deletes the row
- [x] Added admin-only inventory.deleteTransaction tRPC procedure
- [x] Delete (trash) button appears in table only for admin role
- [x] AlertDialog confirmation with stock-reversal warning before delete

## Feature: Auto-Add Invoice Supplier to Suppliers List ✅
- [x] createInvoice checks if free-text supplier name already exists in suppliers table
- [x] If exists: links invoice to existing supplier ID
- [x] If not exists: creates new supplier record and links invoice to it
- [x] TypeScript: 0 errors

## Feature: Numeric Keypad (Calculator) for All Numeric Inputs ✅
- [x] Created reusable NumericKeypad component (popover with 0-9, ., ⌫, C, ✓ buttons)
- [x] Added keypad to MaterialsPage: currentQty, minQty, reorderQty, stockIn qty+price, stockOut qty
- [x] Added keypad to InvoicesPage: line qty, unit price, line total, paidAmount (create + update status)
- [x] TypeScript: 0 errors

## Feature: Editable Last Price in Stock-In Form ✅
- [x] Stock-In form now pre-fills unit price with material's lastPurchasePrice
- [x] Label shows current last price as hint (e.g., "آخر سعر: 25.000 د.إ")
- [x] User can edit the price; on submit it becomes the new lastPurchasePrice automatically

## Feature: Last Price Column in Stock-Out Log ✅
- [x] Added lastPurchasePrice to listTransactions select query (joined from rawMaterials)
- [x] Added "آخر سعر المادة" column (emerald color) to StockOutLogPage table between Total and Reason
- [x] Updated colSpan values in loading skeleton, empty state, and tfoot accordingly

## Feature: Last Price × Qty Column in Stock-Out Log ✅
- [x] Added "إجمالي (آخر سعر × كمية)" column (purple) = lastPurchasePrice × quantity per row
- [x] Footer shows grand total of all lastPrice×qty values

## Feature: Kitchen Production - Fix Date Query & Carry-Forward (ترحيل المتبقي)
- [x] Fix Drizzle timezone bug: use DATE() SQL function instead of JS Date boundaries
- [x] Add carry-forward button per withdrawn material row: transfers remaining qty to next day as a new stock-out entry
- [x] Show confirmation dialog before carry-forward with material name, qty, and next date
- [x] After carry-forward: refresh page data to reflect the transfer

## Fix: Add "الإجراءات" header to carry-forward column in withdrawn materials table
- [x] Add "الإجراءات / Actions" header to the carry-forward column in the withdrawn materials table

## Feature: هدر المتبقي - Discard Remaining Qty
- [x] Add "هدر المتبقي" button in the Actions column of withdrawn materials table
- [x] Confirmation dialog: show material name, remaining qty, and warn that it will be recorded as waste
- [x] On confirm: create a new OUT transaction with reason="waste" for the remaining qty on the same date

## Feature: Section D Summary Table - جرد + ترحيل/هدر actions per production row
- [x] Add kitchen_production_counts table (DB schema + migration): productionId, actualCount, countedAt, countedBy, notes
- [x] Add backend procedures: saveProductionCount, getProductionCounts
- [x] Add "الإجراءات" column to Section D summary table
- [x] Show "جرد" button always (opens dialog to enter actual qty)
- [x] After count saved: show ترحيل/هدر buttons based on actual counted qty
- [x] ترحيل: carry forward actual counted qty to next day as new stock-out (product-level)
- [x] هدر: record actual counted qty as waste
- [x] Confirmation dialogs for both actions

## Fix: Section D Summary Table cleanup
- [x] Remove الجرد column from Section D summary table (not needed)
- [x] Add delete button per row in الإجراءات column
- [x] Add "إضافة منتج" button in the Section D card header

## Fix: Remove Section B inline production form
- [x] Remove Section B (ب — تسجيل الإنتاج) card from KitchenProductionPage
- [x] Keep only the dialog-based form triggered by "إضافة منتج" button in Section D header

## Fix: Delete confirmation dialog in Section D
- [x] Add deleteConfirmItem state for the production record to delete
- [x] Show confirmation dialog with product name before deleting
- [x] Replace direct deleteMutation.mutate call with setDeleteConfirmItem

## Feature: Edit production record (produced qty + used qty)
- [x] Add backend procedure: kitchen.updateProduction (update producedQuantity + usedQuantity + recalculate closingBalance)
- [x] Add editProdItem state in KitchenProductionPage
- [x] Add edit dialog with two fields: الكمية المنتجة + الكمية المستخدمة
- [x] Add edit (pencil) button per row in Section D الإجراءات column
- [x] On save: call updateProduction mutation and refresh data

## Fix: Hide ترحيل/هدر buttons when closing balance <=- [x] Fix Section D: only show ترحيل/هدر buttons when closingBalance > 0
- [x] Section A (withdrawn materials): only show ترحيل/هدر buttons when remaining > 0
## Feature: Add material button in Section A (withdrawn materials)
- [x] Add "إضافة مادة" button in Section A card header
- [x] Dialog: search/select raw material from inventory, enter qty
- [x] On confirm: create a new OUT transaction for the selected date (reuse stockOut procedure)
- [x] Refresh withdrawn materials list after adding

## Feature: Add إضافة منتج button to Section B header
- [x] Add "إضافة منتج" button next to "إضافة مادة" in Section B header
- [x] Button opens the existing add-product dialog (same as Section D header button)

## Feature: Waste qty per material in add-product dialog
- [x] Add wasteQty field per raw material row in the add-product dialog
- [x] Backend: when saving production, also create OUT transactions with reason="waste" for each material that has wasteQty > 0
- [x] Show wasteQty column header in the materials table inside the dialog

## Feature: Live remaining balance per material in add-product dialog
- [x] Add "المتبقي" column showing: withdrawn - consumed - waste (live, updates as user types)
- [x] Color red if remaining < 0 (over-used), green if >= 0
- [x] Block save if any material has remaining < 0

## Feature: Monthly Waste Report Page
- [x] Backend: getMonthlyWasteReport(year, month) - query inventory_transactions for OUT+waste grouped by material, join with total withdrawn (all OUT) to compute waste %
- [x] Add reports.monthlyWaste tRPC procedure
- [x] Create WasteReportPage.tsx with month/year selector, summary cards (total waste qty, avg waste %, top wasted material), and detailed table per material
- [x] Table columns: المادة | إجمالي السحب | إجمالي الهدر | نسبة الهدر | الوحدة
- [x] Color-code waste % (green < 5%, yellow 5-15%, red > 15%)
- [x] Add route /reports/waste to App.tsx
- [x] Add sidebar link under "التقارير" section

## Fix: remainingQty = withdrawn - consumed - waste (Section A)
- [x] Fix getWithdrawnMaterialsForDate: remainingQty should subtract both consumed (production) AND waste OUT transactions, not just production consumed

## Bug: Withdrawn materials list not showing in Section B despite data existing
- [ ] Investigate why withdrawn materials table is not rendering even when data exists

## Fix: Withdrawn materials not showing (reason='production' excluded by HAVING)
- [ ] Fix getWithdrawnMaterialsForDate: include ALL OUT transactions as withdrawn (don't filter by reason), only separate waste for subtraction

## Feature: Redesign add-product dialog - auto-waste calculation
- [x] Change material row fields: consumed qty + actual produced qty
- [x] waste = consumed - actual produced (auto-calculated, shown read-only)
- [x] remaining = withdrawn - consumed (shown live)
- [x] Block save if waste < 0 (produced more than consumed)

## Feature: Waste Summary Table (Section E) - separate from stock-out log
- [x] Remove waste OUT transactions from production save backend (don't write to inventory_transactions)
- [x] Add waste summary table below daily production summary showing: المادة | الهدر | الوحدة | آخر سعر | إجمالي الهدر (قيمة)
- [x] Waste data comes from production_record_materials (wasteQty field) joined with raw_materials (lastPurchasePrice)
- [x] Add backend procedure: kitchen.getWasteSummary(date) - returns waste per material for the day

## Feature: تصفير مادة خام واحدة من صفحة المواد
- [x] Add resetSingleMaterial backend procedure (admin only): sets currentQuantity=0 for one material
- [x] Add "تصفير" button in the actions column of MaterialsPage table (admin only, red/amber color)
- [x] Confirmation dialog before resetting with material name

## Feature: تعديل الكمية الحالية والسعر من قائمة الإجراءات
- [x] Add updateStockAndPrice backend procedure: updates currentQuantity + lastPurchasePrice for one material
- [x] Add "تعديل الكمية والسعر" menu item in MaterialsPage actions dropdown
- [x] Small dialog with two fields: currentQuantity + lastPurchasePrice (pre-filled with current values)

## Feature: إضافة آخر سعر والإجمالي في جدول مواد الإنتاج (KitchenProductionPage)
- [x] Add "آخر سعر" column showing lastPurchasePrice from raw_materials
- [x] Add "الإجمالي" column = withdrawnQty * lastPurchasePrice
- [x] Backend: include lastPurchasePrice in getWithdrawnMaterialsForDate query

## Feature: إظهار تكلفة المستهلك والصافي في نموذج إضافة منتج
- [x] Show consumed cost per material row = consumedQty × lastPurchasePrice
- [x] Show net value = remaining (after waste) × lastPurchasePrice
- [x] lastPurchasePrice comes from the withdrawn material (w.lastPurchasePrice)

## Fix: تصحيح عمود "صافي المتبقي" في نموذج إضافة منتج
- [x] Replace "صافي المتبقي" with "سعر وحدة الإنتاج" = تكلفة المستهلك ÷ الإنتاج الفعلي
- [x] Show — if actualProducedQty is 0 or price is missing

## Feature: إضافة سعر وحدة الإنتاج والإجمالي في ملخص الإنتاج اليومي
- [x] Add actualUnitCost column to kitchen_daily_production table in DB
- [x] Calculate and store actualUnitCost when saving production (sum of consumedCost / producedQty across all materials)
- [x] Show "سعر وحدة الإنتاج" column in Section D table
- [x] Show "إجمالي التكلفة" column = producedQuantity × actualUnitCost

## Fix: تصحيح حساب المتبقي في نموذج إضافة منتج
- [x] remaining = withdrawnQty − consumedQty − wasteQty (not just withdrawnQty − consumedQty)
- [x] wasteQty = consumedQty − actualProducedQty (auto-calculated)

## Feature: اسم المنتج combobox مع حفظ في القائمة
- [x] Add kitchen_products table (id, name, nameAr, unit, createdAt)
- [x] Add backend procedures: kitchen.getProducts, kitchen.addProduct
- [x] Replace productName text input with combobox: type to search, select from list, or type new name and save it
- [x] When user types a new name and saves production, auto-save the product to kitchen_products list

## Feature: إضافة الصفحات الجديدة في نظام الصلاحيات بصفحة المستخدمين
- [x] Read UsersPage to understand current permissions structure
- [x] Add new pages to the permissions list: Kitchen Production (kitchen), Users Management (users)

## UX Improvement: تحسين نافذة إضافة منتج جديد
- [x] Improve product name combobox: clearer visual feedback, better dropdown styling
- [x] Add icon or hint text to indicate the field supports both typing and selection
- [x] Improve form layout and spacing for better readability
- [x] Add visual separation between sections (product info vs materials table)

## UX Redesign: تحويل نافذة إضافة منتج إلى Stepper Wizard
- [x] Add step state (1/2/3) to the dialog
- [x] Step 1: Product name (combobox), unit, produced qty — no scroll
- [x] Step 2: Materials table (consumed, actual produced, waste auto-calc) — no scroll
- [x] Step 3: Review summary + save button
- [x] Progress bar / step indicator at the top
- [x] Next/Back navigation buttons

## Fix: RTL مشاكل في Stepper Wizard
- [x] إصلاح ترتيب الخطوات: إضافة dir=ltr للمؤشر حتى يظهر 1،2،3 من اليسار لليمين دائماً
- [x] إصلاح ترتيب أعمدة جدول المواد: dir=ltr على الجدول ونقل زر الحذف للعمود الأول

## Fix: تكبير نافذة إضافة منتج
- [x] تكبير عرض الـ Dialog إلى max-w-6xl w-[95vw]
- [x] ضبط أعمدة جدول المواد لتناسب العرض الجديد

## UX Redesign: تحويل جدول المواد إلى بطاقات عمودية
- [x] استبدال الجدول الأفقي ببطاقات عمودية: سطر 1 (اختيار المادة) + سطر 2 (مستهلك + إنتاج فعلي) + سطر 3 (هدر + متبقي + تكلفة + سعر وحدة)
- [x] لا overflow أبداً ويعمل على أي حجم شاشة

## Feature: صفحة الوصفات مع AI Chef
- [x] إنشاء جدول `products` في قاعدة البيانات (id, name, sku, categoryReference, price, cost, description, recipeSource, isActive)
- [x] إنشاء جدول `recipe_items` في قاعدة البيانات (id, productId, materialId, quantity, unit, notes)
- [x] إضافة ملف `server/aiChef.ts` باستخدام built-in LLM (invokeLLM) بدلاً من OpenAI مباشرة
- [x] إضافة recipes router في `server/routers.ts`: getByProduct, addItem, updateItem, deleteItem, clearRecipe, generateWithAI
- [x] إضافة products router في `server/routers.ts`: getProducts, updateProduct, addProduct, deleteProduct
- [x] إنشاء صفحة `client/src/pages/RecipesPage.tsx` مع accordion cards لكل منتج
- [x] كل بطاقة تعرض: تكلفة الوصفة | سعر البيع | Food Cost% | هامش الربح%
- [x] زر توليد وصفة بالـ AI + إعادة التوليد + مسح الكل
- [x] تعديل inline للمكونات (الكمية، الوحدة، الملاحظات)
- [x] إضافة منتج جديد من الصفحة
- [x] فلتر بحث في رأس الصفحة
- [x] تسجيل Route في App.tsx وإضافة رابط في الـ sidebar
- [x] إضافة الوصفات لنظام صلاحيات المستخدمين (UsersPage)
- [x] إضافة ترجمات الوصفات (i18n.ts) عربي وإنجليزي
- [x] كتابة 10 اختبارات Vitest للـ recipes و products routers (35 اختبار إجمالاً)

## Feature: تحويل AI Chef للاعتماد على OpenAI مباشرةً
- [x] إضافة OPENAI_API_KEY كـ secret في المشروع
- [x] تثبيت openai npm package
- [x] تعديل server/aiChef.ts لاستخدام OpenAI SDK بدلاً من invokeLLM
- [x] اختبار التوليد والتأكد من عمل الوصفات (35 اختبار ناجحة)
- [x] حفظ checkpoint

## Feature: استيراد المنيو عن طريق Excel
- [x] إضافة backend procedure: products.importFromExcel (يقبل base64 Excel، يحلله، يُدرج المنتجات)
- [x] إضافة backend procedure: products.downloadTemplate (يُنشئ ويُرجع قالب Excel جاهز)
- [x] إضافة زر "تحميل القالب" في صفحة الوصفات
- [x] إضافة زر "استيراد من Excel" مع dialog لرفع الملف
- [x] عرض ملخص الاستيراد (عدد المنتجات المضافة، الأخطاء)
- [x] 35 اختبار Vitest جميعها ناجحة
- [x] حفظ checkpoint

## Feature: تكييف الاستيراد مع قالب المستخدم
- [x] تعديل products.importFromExcel ليدعم أعمدة: name, nameAr, description, descriptionAr, price, category, categoryAr, calories
- [x] توليد SKU تلقائياً من اسم المنتج عند الاستيراد
- [x] تعديل products.downloadTemplate ليولد القالب بنفس أعمدة المستخدم (35 اختبار ناجحة)
- [x] حفظ checkpoint

## Fix: AI Chef يستخدم المواد الخام من المنصة فقط
- [x] تعديل aiChef.ts ليستقبل قائمة المواد الخام (id, name, unit) ويُضمّنها في الـ prompt
- [x] إلزام الـ AI باختيار المكونات من القائمة فقط (بالـ id والاسم والوحدة المسجلة)
- [x] إلغاء وحدة الـ AI واستبدالها بالوحدة المسجلة بعد الاستجابة (لا استثناء)
- [x] حذف أي مكون ليس materialId صحيحاً من قائمة المواد الخام
- [x] router يمرر المواد الخام بشكل صحيح (35 اختبار ناجحة)
- [x] حفظ checkpoint

## Fix: حساب تكلفة الوصفة مع تحويل الوحدات
- [x] إضافة دالة convertToBaseUnit: g→kg (÷1000), mg→kg (÷1M), ml→L (÷1000), cl→L (÷100), dl→L (÷10)
- [x] تعديل calcRecipeCost لتحويل الكمية إلى وحدة السعر قبل الضرب
- [x] TypeScript نظيف (0 أخطاء) و 35 اختبار ناجحة
- [x] حفظ checkpoint

## Fix: تحويل الوحدات يدعم الأسماء الكاملة
- [x] تعديل convertToBaseUnit لتطبيع الوحدات: Gram→g, Kilogram→kg, Liter→l, Milliliter→ml, Pcs→pcs (case-insensitive) + عربي
- [x] حفظ checkpoint

## Feature: المواد المصنّعة (Semi-Finished Materials)
- [x] إضافة عمود `materialType` (raw_material | semi_finished) في جدول `rawMaterials` + migration
- [x] إنشاء جدول `semiFinishedRecipes` (id, materialId, ingredientId, quantity, unit, notes)
- [x] إضافة DB helpers: listSemiFinishedMaterials, getSemiFinishedRecipe, addSemiFinishedItem, updateSemiFinishedItem, deleteSemiFinishedItem, clearSemiFinishedRecipe, calcSemiFinishedCost
- [x] إضافة tRPC procedures: semiFinished.list, getRecipe, addItem, updateItem, deleteItem, clearRecipe, calcCost, create, update
- [x] إنشاء صفحة SemiFinishedPage مع محرر وصفة لكل مادة (مكونات من المواد الخام فقط)
- [x] تسجيل /semi-finished route في App.tsx + sidebar + i18n + UsersPage permissions
- [x] تحديث calcRecipeCost: إذا كان المكون مادة مصنّعة، يجلب تكلفتها من semiFinished.calcCost تلقائياً
- [x] إضافة materialType لـ listMaterials و getRecipeItems لتمييز النوعين
- [x] 35 اختبار Vitest ناجحة
- [x] حفظ checkpoint

## Feature: ربط المواد المصنّعة بإنتاج المطبخ ✅
- [x] إضافة DB helper: produceSemiFinished (يخصم المكونات الخام من المخزون ويضيف سجل معاملة لكل مكون)
- [x] إضافة tRPC procedure: semiFinished.produce (حماية warehouseProcedure)
- [x] إضافة SemiFinishedProductionSection في KitchenProductionPage (قسم هـ)
- [x] عرض قائمة المواد المصنّعة + اختيار الكمية + ملاحظات
- [x] بعد التأكيد: خصم المكونات الخام من المخزون + عرض جدول الخصم التفصيلي
- [x] 35 اختبار Vitest ناجحة + TypeScript نظيف
- [x] حفظ checkpoint

## Fix: المواد المصنّعة لا تظهر في SemiFinishedPage ✅
- [x] تشخيص: filter يبحث عن 'raw_material' لكن قاعدة البيانات تخزن 'raw' كقيمة افتراضية
- [x] إصلاح: تحديث filter ليقبل 'raw' و'raw_material' كليهما
- [x] حفظ checkpoint

## Fix: إضافة تعديل وحذف بيانات المادة المصنّعة ✅
- [x] إضافة زر Pencil وTrash2 على كل بطاقة مادة مصنّعة
- [x] نافذة تعديل: الاسم الإنجليزي، العربي، الوحدة، الملاحظات
- [x] نافذة تأكيد الحذف مع عرض اسم المادة وتحذير حذف الوصفة
- [x] TypeScript نظيف (0 أخطاء)
- [x] حفظ checkpoint

## Fix: إضافة بحث في صفحة المواد المصنّعة ✅
- [x] حقل البحث موجود بالفعل في الصفحة (سطر 641) مع فلترة فورية بالاسم العربي والإنجليزي
- [x] تأكيد: لم يتطلب تعديلاً (كان خطأ في الـ visual editor)
- [x] حفظ checkpoint

## Feature: Search Inside Ingredient Selector Dropdown (SemiFinishedPage) ✅
- [x] Added inline search input inside the raw material Select dropdown in SemiFinishedPage recipe editor
- [x] Filters materials in real-time by Arabic or English name as user types
- [x] Shows "لا توجد نتائج" empty state when no match found
- [x] onKeyDown stopPropagation prevents Radix Select from intercepting keystrokes

## Fix: عرض رقمين عشريين بدلاً من ثلاثة في جميع الأسعار والكميات ✅
- [x] استبدال toFixed(3) بـ toFixed(2) في جميع صفحات المنصة (KitchenProductionPage, WasteReportPage, RecipesPage, SemiFinishedPage)

## Feature: Waste Tracking in Semi-Finished Recipes (الهدر في وصفات المواد المصنّعة)
- [x] Add actualQuantity column to semi_finished_recipe_items table (migration)
- [x] Update DB helpers to read/write actualQuantity
- [x] Update tRPC procedures (addItem, updateItem) to accept actualQuantity
- [x] Update SemiFinishedPage: add actual quantity input field per ingredient
- [x] Auto-calculate waste = quantity (expected) - actualQuantity and display in red

## Feature: إعادة هيكلة صفحة الإنتاج اليومي للمطبخ + صفحة الهدر الموحدة
- [ ] إضافة جدول kitchen_daily_pulls (سحب يومي: مادة خام أو مصنّعة، الكمية، التاريخ، المصدر)
- [ ] إضافة جدول waste_logs (سجل الهدر الموحد: المصدر، المادة، الكمية، التاريخ، السبب)
- [x] تطبيق migration على قاعدة البيانات
- [ ] بناء DB helpers وtRPC procedures للسحب اليومي والجرد والترحيل والهدر
- [ ] إعادة بناء KitchenProductionPage: نموذج سحب يومي، قائمة المواد المسحوبة، جرد نهاية اليوم، ترحيل أو هدر
- [ ] بناء صفحة WastePage موحدة تجمع هدر المواد المصنّعة + هدر المواد الخام + هدر المطبخ
- [ ] تسجيل الهدر تلقائياً عند تأكيد الهدر من المطبخ
- [ ] إضافة صفحة الهدر للـ sidebar وصلاحيات المستخدمين

## Feature: إعادة هيكلة صفحة الإنتاج اليومي + صفحة الهدر الموحدة ✅
- [x] Add kitchen_daily_pulls table (migration)
- [x] Add waste_logs table (migration)
- [x] Build backend DB helpers for kitchen pulls (add, delete, count, close, carry-forward)
- [x] Build backend DB helpers for waste logs (list, add, delete)
- [x] Build tRPC procedures for kitchen pulls (add, delete, count, close)
- [x] Build tRPC procedures for waste logs (list, add, delete)
- [x] Rebuild KitchenProductionPage: pull-based workflow, end-of-day count dialog, carry-forward, waste auto-calc
- [x] Build unified WastePage: all waste sources (kitchen, raw_material, semi_finished), filters, add/delete
- [x] Add WastePage route (/waste) and nav link (سجل الهدر) with Trash2 icon
- [x] Add wasteLog i18n keys (Arabic + English)

## Feature: صفحة الإعدادات
- [ ] إنشاء جدول app_settings في قاعدة البيانات (migration)
- [ ] بناء DB helpers و tRPC procedures لقراءة وتحديث الإعدادات
- [ ] بناء SettingsPage: معلومات المطعم (الاسم، الهاتف، العنوان) وإعدادات التوقيت (المنطقة، ساعة بداية/نهاية يوم العمل)
- [ ] ربط ساعة بداية يوم العمل بفلاتر التاريخ في db.ts
- [ ] إضافة رابط الإعدادات في الشريط الجانبي

## Feature: إنتاج المواد المصنّعة من صفحة المطبخ
- [ ] إضافة tRPC procedure لإنتاج مادة مصنّعة (خصم المكونات + إضافة للمخزون + سجل pull)
- [ ] إضافة نموذج إنتاج مادة مصنّعة في KitchenProductionPage
- [ ] عرض ملخص المكونات التي سيتم خصمها قبل التأكيد

## Feature: ربط كاشير الملحمة بالمخزون
- [x] إضافة عمود currentStock لجدول butcher_products
- [x] تحديث produceSaleOrder لخصم الكمية المباعة من مخزون المنتج
- [x] إضافة إجراء رفع مخزون المنتج عند تسجيل إنتاج جديد
- [x] عرض المخزون المتاح في الكاشير مع منع البيع عند نفاد المخزون

## Feature: جرد نهاية اليوم للمواد المصنّعة
- [ ] إضافة أيقونة جرد في صفحة إنتاج المواد المصنّعة لكل عملية إنتاج
- [ ] عرض الكمية المنتجة وإدخال الكمية المتبقية
- [ ] حساب الهدر تلقائياً (المنتج - المتبقي - المستخدم)
- [ ] خصم الكمية المستخدمة من مخزون المادة المصنّعة
- [ ] تسجيل الهدر في قائمة الهدر تلقائياً
- [x] إضافة KPI إجمالي مبلغ الإنتاج في صفحة الإنتاج اليومي للمطبخ
- [x] إضافة عمود تكلفة الوحدة (الكمية × آخر سعر) في جدول المسحوبات بصفحة الإنتاج اليومي
- [x] إصلاح تكلفة المواد المصنّعة في جدول المسحوبات: حسابها من وصفتها بدلاً من lastPurchasePrice الفارغ
- [x] إضافة إمكانية تعديل كمية المادة المسحوبة مع انعكاس التعديل على المخزون
- [x] تقييد صلاحية تعديل كمية المسحوبات للأدمن فقط
- [x] تحسين جرد المواد المصنّعة: عرض الكمية المنتجة، إدخال المتبقي، حساب الهدر، خصم المستخدم من المخزون، إضافة الهدر لقائمة الهدر
- [x] إعادة تصميم منطق جرد المواد المصنّعة: إدخال المستخدم + الهدر اختياري، المرحّل = الكلي - المستخدم - الهدر
- [x] إصلاح مشكلة عدم انتقال الكمية المرحّلة للمادة المصنّعة لليوم التالي
- [x] إنشاء صفحة يوم المطبخ بجورني مبسّطة 3 مراحل

## Feature: عرض رقم الفاتورة في سجل المعاملات ✅
- [x] إضافة عمود "رقم الفاتورة" في جدول سجل المعاملات (TransactionsPage)
- [x] عرض رقم الفاتورة بشكل مميز (badge أزرق) للمعاملات من نوع purchase
- [x] تحديث عدد أعمدة skeleton loading وempty state من 9 إلى 10

## Fix: خطأ Rules of Hooks في ProductCard بصفحة /recipes ✅
- [x] تشخيص: كان الكود يستدعي trpc.semiFinished.calcCost.useQuery داخل .map() مما يغير عدد الـ hooks بحسب عدد المواد المصنّعة
- [x] إضافة endpoint جديد calcCostBatch يقبل مصفوفة IDs ويعيد تكاليفها دفعة واحدة من الـ backend
- [x] استبدال .map(useQuery) بـ useQuery واحدة تستخدم calcCostBatch في ProductCard
- [x] TypeScript: 0 errors، 35 tests passing

## Feature: تحويل حقل الوحدة في الوصفات إلى قائمة منسدلة ✅
- [x] تحويل حقل الوحدة في وضع تعديل مكوّن الوصفة (editUnit) من Input نصي إلى Select دروبداون
- [x] تحويل حقل الوحدة في نموذج إضافة مكوّن جديد (newUnit) من Input نصي إلى Select دروبداون
- [x] الوحدات المتاحة: g، kg، ml، l، حبة/قطعة، ملعقة كبيرة، ملعقة صغيرة، كوب

## Feature: تحديث برومت AI لتوليد الوصفات ليشمل المواد المصنّعة ✅
- [x] إضافة حقل materialType لـ MaterialOption في aiChef.ts
- [x] تقسيم قائمة المواد في البرومت إلى قسمين: المواد الخام والمواد المصنّعة
- [x] تحديث routers.ts لجلب المواد المصنّعة بجانب المواد الخام وتمريرها للـ AI
- [x] تحديث البرومت بقاعدة جديدة: استخدام المواد المصنّعة كمكونات جاهزة بدلاً من تفصيل مكوناتها

## Feature: توليد AI لمكونات المواد المصنّعة
- [x] إضافة procedure semiFinished.generateWithAI في routers.ts
- [x] إضافة زر "توليد بـ AI" في SemiFinishedPage بنفس أسلوب RecipesPage
- [x] إضافة حالة تحميل مع نص "جاري توليد..." في اسم المادة

## Feature: زر "توليد AI للكل" في صفحة الوصفات
- [x] إضافة procedure recipes.generateAllWithAI في routers.ts
- [x] إضافة زر "توليد AI للكل" في header صفحة الوصفات
- [x] إضافة banner تحميل وdialog نتيجة بعد التوليد
- [x] إزالة زر AI من صفحة المواد المصنّعة

## Feature: استبدال مادة بأخرى في جميع الوصفات
- [x] إضافة procedure recipes.replaceMaterial في routers.ts
- [x] إضافة زر "استبدال مادة" في header صفحة الوصفات
- [x] Dialog اختيار المادة القديمة والجديدة مع تأكيد قبل التنفيذ

## Feature: صفحة جرد الإنتاج اليومي (تاب المطبخ)
- [x] إضافة procedure recipes.getDailyInventoryPreview في routers.ts
- [x] بناء صفحة DailyInventoryPage
- [x] إضافة الصفحة في تاب المطبخ بالراوتر

## Fix: NaN في input بصفحة جرد الإنتاج اليومي
- [x] إصلاح قيمة NaN في حقل عدد الأوردرات

## Fix: عدم ظهور آخر سعر والتكلفة في جدول مكونات الوصفة
- [x] إصلاح حساب التكلفة في عرض الجدول ليستخدم convertToBaseUnit

## Fix: إظهار تكلفة المواد المصنّعة في جدول مكونات الوصفة
- [x] عرض تكلفة المادة المصنّعة (من semiCostMap) في عمود "آخر سعر" و"التكلفة" بدلاً من "—"

## Feature: إضافة الصفحات الجديدة في قائمة صلاحيات المستخدمين
- [x] إضافة صفحة "جرد الإنتاج اليومي" في قائمة الصلاحيات بـ UsersPage

## Fix: مزامنة ALL_PAGES مع جميع صفحات التطبيق
- [x] إضافة wasteLog، menuOfferDesigner، settings، butcherRecipes، butcherProduction، butcherWaste، butcherCashier في ALL_PAGES

## Feature: KPIs في صفحة إنتاج المطبخ
- [x] إضافة حسابات totalUsedValue و totalWasteValue
- [x] تحديث بطاقات KPI لتشمل 6 بطاقات: مواد مسحوبة، بانتظار الجرد، كمية الهدر، إجمالي الإنتاج، قيمة المستخدم، قيمة الهدر

## Fix: إصلاح منطق carriedForward في KitchenProductionPage ✅
- [x] إصلاح CountDialog: تغيير نوع onSave ليشمل carriedQty كمعامل رابع
- [x] تمرير carriedNum (pulled - used - waste) كـ carriedQty عند الضغط على "تأكيد الجرد"
- [x] تصحيح استدعاء countPull.mutate: إرسال carriedForward=carriedQty بدلاً من carriedForward=wasteQty (كان خطأً)
- [x] إزالة شرط !usedInput من زر التأكيد (يمكن إدخال 0 استخدام وترحيل الكل)

## Feature: تبسيط واجهة الجرد في KitchenDayPage
- [x] تحويل ClosePhase من wizard خطوة بخطوة إلى قائمة مواد كاملة يختار منها الموظف أي مادة يريد جردها
- [x] كل مادة تظهر كبطاقة مع زر "جرد" يفتح نافذة جرد سريعة
- [x] المواد المجردة تظهر بلون مختلف مع ملخص الجرد
- [x] إمكانية الجرد بأي ترتيب وليس بالترتيب الإجباري

## Feature: التنقل بين التواريخ في KitchenDayPage
- [x] تحويل date من useState ثابت إلى state قابل للتغيير
- [x] إضافة أزرار السهم (السابق / التالي) للتنقل بين الأيام
- [x] إضافة حقل تاريخ قابل للتعديل المباشر
- [x] منع التنقل لتاريخ مستقبلي
- [x] جميع البيانات (pulls, semiMaterials) تُحدَّث عند تغيير التاريخ

## Bug Fix: إصلاح حساب تاريخ الترحيل في countKitchenPull
- [x] استبدال حساب nextDate من now (وقت التنفيذ) إلى pull.pullDate + 1 يوم

## Feature: منع الإنتاج على التواريخ الماضية في KitchenDayPage
- [x] تمرير isToday من Main Page إلى StartPhase
- [x] تعطيل أزرار الإنتاج وإخفاء حقول الإدخال إذا كان التاريخ ليس اليوم
- [x] عرض رسالة توضيحية "لا يمكن الإنتاج على تاريخ ماضٍ"

## Bug Fix: إصلاح منطق السجلات المُرحَّلة في KitchenDayPage
- [x] إضافة حقل isCarriedForward في schema kitchen_daily_pulls
- [x] تعديل countKitchenPull لتعيين isCarriedForward=true على السجل الجديد
- [x] تعديل الواجهة لعرض المواد المُرحَّلة في تبويب الجرد مباشرة (لا في الإنتاج)
- [x] إظهار المواد المُرحَّلة بشكل مميز مع تسمية "مرحّل من اليوم السابق"

## Bug Fix: منع إنشاء سجل مُرحَّل بكمية صفر
- [x] إضافة شرط carriedToTomorrow > 0 قبل إنشاء سجل الترحيل
- [x] حذف السجلات الموجودة في قاعدة البيانات بكمية 0 وisCarriedForward=true

## Bug Fix: إصلاح منطق نافذة الجرد (QuickCountDialog)
- [x] المدخل = الكمية المتبقية، closingCount = المنتج - المتبقي، carriedForward = المتبقي
- [x] التحقق من أن carriedForward > 0 قبل الترحيل (موجود في الخادم لكن يجب التأكد)

## Feature: توحيد نموذج الجرد في KitchenDayPage
- [x] تعديل QuickCountDialog ليطلب "كم استخدمت؟" + "الهدر (اختياري)" بدلاً من "كم تبقّى؟"
- [x] حساب carriedForward = produced - used - waste تلقائياً

## Feature: حقل الكمية الفعلية في نموذج الإنتاج (يوم المطبخ)
- [x] إضافة حقل "الكمية الفعلية المنتجة" في نموذج الإنتاج
- [x] تعبئة تلقائية من وصفة الإنتاج إذا لم يُدخل الموظف قيمة
- [x] استخدام actualYield في الجرد بدلاً من pulledQuantity

## Feature: تصدير PDF للمواد المصنّعة
- [x] إضافة endpoint /api/pdf/semi-finished في الخادم لتوليد PDF بقائمة المواد المصنّعة ومكوناتها (بدون أسعار)
- [x] إضافة زر "تصدير PDF" في صفحة المواد المصنّعة
- [x] تنسيق PDF بخط Amiri مع اسم المادة ومكوناتها والكميات

## Bug Fix: إصلاح زر تصدير PDF في المواد المصنّعة
- [x] فحص سبب عدم تنزيل الملف عند الضغط على الزر (ECONNRESET + اسم عمود خاطئ)
- [x] إصلاح المشكلة: استخدام connection مستقل وإصلاح اسم العمود materialId
- [x] إصلاح طريقة تنزيل PDF في الواجهة: استبدال a.href+click بـ fetch+Blob URL لضمان التنزيل في جميع المتصفحات

## Bug Fix: إصلاح تصدير PDF في بيئة الإنتاج
- [x] تشخيص سبب فشل PDF في الإنتاج: ملفات الخطوط لا تُضمَّن في esbuild bundle
- [x] إنشاء server/fontData.ts يحتوي على الخطوط مضمّنة كـ base64
- [x] تعديل pdfGenerator.ts لاستخدام الخطوط من base64 بدلاً من ملفات خارجية

## Comprehensive Testing Suite - اختبار شامل لجميع العمليات
- [x] كتابة 56 اختبار وحدة شامل (server/comprehensive.test.ts) - جميعها تمر
- [x] اختبار حسابات الأسعار والتكاليف (آخر سعر، متوسط التكلفة، تقريب الفاتورة)
- [x] اختبار حسابات الوصفات والمكونات (تحويل الوحدات، التكلفة)
- [x] اختبار تكاملي على قاعدة البيانات الحقيقية (scripts/integration-test.mjs)
- [x] اكتشاف وإصلاح خطأ تباين subtotal في الفواتير (تقريب الأرقام)
- [x] اكتشاف وإصلاح مشكلة الأرصدة السالبة (إضافة تحقق قبل stockOut)
- [x] إضافة retry logic في pdfGenerator لمعالجة ECONNRESET
- [x] 91 اختبار إجمالي - جميعها تمر بنجاح

## إعادة هيكلة جدول الوصفات - استيراد المنيو
- [x] حذف 108 وصفة و902 عنصر وصفة الحالية من قاعدة البيانات
- [x] استيراد 146 صنف من ملف المنيو كمنتجات في جدول الوصفات (الاسم، SKU، السعر، الوصف)
- [x] التحقق من صحة الاستيراد - 146 صنف بنجاح
- [x] حذف المنيو الحالي (146 صنف) واستيراد الملف الجديد (132 صنف) مكانه - بدون أخطاء

## صفحة المبيعات
- [x] إنشاء جدول sales_reports (تقارير المبيعات) وجدول sale_items (بنود المبيعات) في قاعدة البيانات
- [x] بناء backend: رفع CSV، تحليل البيانات، ربط SKU بالمنيو، حساب الاستهلاك النظري (6 procedures)
- [x] بناء صفحة المبيعات: رفع ملف مع تحديد التاريخ، جدول المبيعات، تقرير الاستهلاك
- [x] حذف تقرير مبيعات كامل
- [x] 91 اختبار تمر بنجاح بعد إضافة الصفحة

## تاب عرض المبيعات بالتاريخ
- [x] إضافة backend procedure getSalesByDate لجلب المبيعات حسب تاريخ محدد
- [x] إضافة تاب "عرض المبيعات بالتاريخ" في صفحة المبيعات: date picker + جدول مجمّع لمبيعات ذلك اليوم مع إجماليات

## إعادة ترتيب أعمدة جدول عرض المبيعات بالتاريخ
- [x] إعادة ترتيب الأعمدة: SKU → اسم الصنف → الكمية المباعة → صافي المبيع (أول عمود على اليمين)

## تبسيط جدول عرض المبيعات بالتاريخ
- [x] تعديل الجدول ليعرض 4 أعمدة فقط من اليمين: SKU → اسم الصنف → صافي المبيعات → صافي الكمية

## عكس اتجاه جدول المبيعات بالتاريخ
- [x] إضافة dir=rtl للجدول ليبدأ من اليمين: SKU أول عمود على اليمين، صافي الكمية آخر عمود على اليسار

## إصلاح عمود صافي المبيعات
- [x] إصلاح ربط عمود "صافي المبيعات" في getSalesByDate لتجميع netSales بشكل صحيح بدلاً من totalSales

## تعديل تسمية بطاقة الإحصائيات في صفحة المبيعات بالتاريخ
- [x] تغيير "إجمالي المبيعات" إلى "إجمالي صافي المبيعات" في بطاقة الإحصائيات وعرض قيمة totalNetSales بدلاً من totalSales

## حذف بطاقة KPI من صفحة التقارير المرفوعة
- [x] حذف بطاقة "إجمالي المبيعات" من شبكة KPI في تاب التقارير المرفوعة وتحديث الـ grid من 4 إلى 3 أعمدة

## صف تفصيلي للمكونات في جدول المبيعات بالتاريخ
- [x] فحص هيكل جداول الوصفات والمكونات والمنتجات والربط بين SKU والوصفات
- [x] إضافة backend procedure يجلب مكونات الوصفة لصنف محدد مع حساب الكميات المستهلكة (qty_sold × ingredient_qty)
- [x] إضافة زر توسيع (▼) في كل صف بجدول المبيعات يفتح صفاً تفصيلياً بالمكونات المستهلكة

## إضافة عمود آخر سعر الوحدة في جدول المبيعات بالتاريخ
- [x] جلب price من products في getSalesByDate وإضافة عمود "آخر سعر الوحدة" في الجدول

## إضافة آخر سعر لكل مكون في جدول المكونات التفصيلي
- [x] إضافة عمود "آخر سعر الوحدة" لكل مكون في IngredientRow (من lastPurchasePrice في getProductIngredients)

## إصلاح آخر سعر للمواد المصنّعة في جدول المكونات
- [x] فحص هيكل جدول المواد المصنّعة وعمود السعر فيها
- [x] تحديث getProductIngredients لجلب actualUnitCost من kitchen_daily_production للمواد المصنّعة التي lastPurchasePrice = null

## إصلاح مطابقة أسماء المواد المصنّعة مع kitchen_daily_producti- [x] فحص أسماء المواد المصنّعة التي لا تزال تعرض "—" ومقارنتها بأسماء kitchen_daily_production
- [x] حساب سعر المادة المصنّعة من مجموع تكاليف مكوناتها في semi_finished_recipes (كمية × lastPurchasePrice لكل مكون) مع تحويل الوحدات (g→kg, mL→L)لاسم بدون بادئة

## إضافة عمودي إجمالي التكلفة ونسبة التكلفة في جدول المبيعات
- [x] إضافة getBatchIngredientCosts في backend وprocedure batchIngredientCosts في salesRouter
- [x] إضافة عمودي "إجمالي التكلفة" و"نسبة التكلفة %" في جدول المبيعات بالتاريخ مع تلوين تلقائي (أخضر/برتقالي/أحمر)

## تحديث prompt AI لتوليد مكونات الوصفات
- [x] فحص مكان prompt AI لتوليد الوصفات في الكود
- [x] تحديث prompt ليُفضّل المواد المصنّعة (semi_finished) للمكونات التي تحتاج إنتاج والمواد الخام للمكونات الجاهزة

## إصلاح زر توليد AI للكل
- [x] فحص كود procedure generateAllRecipes وتحديد سبب رفض المنتجات ذات الوصفات
- [x] إضافة خيار overwrite في generateAllWithAI وتحديث زر الواجهة ليسأل عن إعادة التوليد عند وجود جميع الوصفات

## إصلاح خطأ Unexpected token '<' عند توليد AI للكل
- [x] فحص server logs: تحديد 504 Gateway Timeout بسبب توليد جميع الوصفات في طلب واحد (300 ثانية)
- [x] إصلاح الخطأ: تحويل توليد الكل إلى طلبات تسلسلية لكل منتج مع شريط تقدم حقيقي

## إضافة بطاقة KPI لقيمة استهلاك إنتاج المطبخ في صفحة المبيعات بالتاريخ
- [x] فحص هيكل kitchen_daily_production وكيفية حساب قيمة الاستهلاك اليومي
- [x] إضافة backend procedure kitchenProductionCost يجلب SUM(producedQty * unitCost) لتاريخ محدد
- [x] إضافة بطاقة KPI "تكلفة إنتاج المطبخ" باللون البرتقالي في SalesByDateTab

## إصلاح قيمة بطاقة KPI تكلفة إنتاج المطبخ
- [x] فحص دالة getKitchenProductionCostByDate: الاستعلام صحيح لكن fmt تعرض الأرقام بالعربية (',') بدلاً من الأرقام اللاتينية
- [x] إصلاح عرض القيمة باستخدام Number().toLocaleString مباشرة بدلاً من fmt العربية

## Feature: KPI Cards جديدة في SalesPage
- [x] إضافة KPI إجمالي قيمة المواد الخام المستخدمة في اليوم (من kitchen_daily_pulls - raw فقط)
- [x] إضافة KPI إجمالي قيمة المواد المصنّعة المستخدمة في اليوم (من kitchen_daily_pulls - semi_finished فقط)
- [x] إضافة KPI كمية الدجاج الكاملة المستخدمة في اليوم (من kitchen_daily_pulls - مواد تحتوي على 'دجاج')

## Feature: قسم تحليلي متكامل P&L في صفحة التحليلات
- [x] إضافة procedure getAnalyticsProfitLoss في backend مع weeklyTrend
- [x] بناء بطاقة P&L (الربح والخسارة) مع صافي الربح ونسبة هامش الربح
- [x] إضافة مؤشر Food Cost % مع خط تحذيري عند 35%
- [x] إضافة رسم بياني للمبيعات مقابل التكلفة أسبوعياً
- [x] إضافة تنبيه الديون المعلقة مع نسبة من المشتريات
- [x] إصلاح خطأ Unknown column 'status' → paymentStatus في invoices

## Feature: فلتر التاريخ في لوحة التحليل (P&L)
- [x] تحديث getAnalyticsProfitLoss في backend لقبول فلتر تاريخ اختياري (startDate/endDate)
- [x] إضافة date picker في واجهة لوحة التحليل لاختيار يوم محدد أو نطاق
- [x] تحديث procedure في routers.ts لتمرير التاريخ
- [x] تحديث الرسم البياني الأسبوعي ليعكس الفترة المختارة

## Fix: تكلفة المطبخ في لوحة التحليل
- [x] فحص عمود التكلفة الفعلية في kitchen_daily_pulls → closingCount × unitCost
- [x] تحديث getAnalyticsProfitLoss لاستخدام closingCount بدلاً من pulledQuantity
- [x] تحديث الرسم البياني الأسبوعي ليعكس التكلفة الفعلية (closingCount)

## Feature: قسم COGS (تكلفة البضاعة المباعة) في لوحة التحليل
- [x] بناء دالة getAnalyticsCOGS في db.ts: مخزون أول المدة + مشتريات الفترة - مخزون آخر المدة
- [x] إضافة procedure analytics.cogs في routers.ts مع فلتر startDate/endDate
- [x] إضافة قسم COGS منفصل في AnalyticsDashboardPage.tsx بجانب قسم P&L الحالي
- [x] إضافة openingStockValue في app_settings وتعيينها بـ 12,000 د.إ

## Feature: قسم كفاءة المخزون (Inventory Turnover + Working Capital)
- [x] تحديث getAnalyticsCOGS لإرجاع avgStock ودوران المخزون ورأس المال المحبوس
- [x] إضافة قسم منفصل في AnalyticsDashboardPage.tsx يعرض: نسبة الدوران، أيام الاحتفاظ، رأس المال المحبوس

## Fix: قيم فارغة في قسم كفاءة المخزون
- [x] تشخيص سبب القيم الفارغة → خطأ اسم العمود type بدلاً من materialType
- [x] إصلاح استعلام semi_finished وراو في getAnalyticsCOGS

## Fix: قيمة المواد المصنّعة في رأس المال المحبوس
- [x] فحص كيفية حساب 1,602.15 → تستخدم calcSemiFinishedCost (تكلفة الوصفة) × الكمية
- [x] تحديث getAnalyticsCOGS لاستخدام calcSemiFinishedCost بدلاً من lastPurchasePrice للمواد المصنّعة

## Task: حذف قسم COGS من لوحة التحليل
- [x] حذف قسم "تكلفة البضاعة المباعة (COGS)" من AnalyticsDashboardPage.tsx

## Feature: إجمالي المدفوع في صفحة الفواتير
- [x] إضافة بطاقة "إجمالي المدفوع" في InvoicesPage بجانب إجمالي الفواتير والمتبقي

## Feature: الفاتورة الحرة (بدون مواد خام)
- [x] إضافة جدول free_invoices في drizzle/schema.ts (supplierName, supplierType, date, paymentStatus, paidAmount, notes)
- [x] إضافة جدول free_invoice_items (invoiceId, description, qty, unitPrice)
- [x] توليد migration SQL وتطبيقه
- [x] إضافة procedures في routers.ts: freeInvoices.create, list, getById, updateStatus, delete
- [x] بناء واجهة الفاتورة الحرة في InvoicesPage كقسم منفصل بعد جدول الفواتير العادية
- [x] دعم نفس حالات الدفع (مدفوع/مؤجل/جزئي) + KPI cards للفواتير الحرة

## Feature: Pagination في جميع الجداول
- [x] بناء مكوّن Pagination مشترك (15 صف/صفحة + أزرار التنقل) مع hook usePagination
- [x] تطبيق pagination على MaterialsPage
- [x] تطبيق pagination على InvoicesPage
- [x] تطبيق pagination على TransactionsPage
- [x] تطبيق pagination على StockOutLogPage
- [x] تطبيق pagination على UsersPage
- [x] تطبيق pagination على ButcherProductionPage
- [x] تطبيق pagination على ButcherWastePage
- [x] تطبيق pagination على WastePage
- [x] تطبيق pagination على SuppliersPage
- [x] تطبيق pagination على SemiFinishedPage
- [x] تطبيق pagination على FreeInvoicesSection
- [x] تطبيق pagination على ReportsPage (جدول الموردين)
- [x] تطبيق pagination على KitchenProductionPage
- [x] تطبيق pagination على SalesPage

## Fix: منطق جرد نهاية اليوم في إنتاج المطبخ
- [x] تعديل CountDialog: إظهار الكمية المسحوبة + الإنتاج الفعلي كمعلومات ثابتة
- [x] تغيير حقل الإدخال من "كم استخدمت؟" إلى "الكمية المتبقية الفعلية"
- [x] النظام يحسب تلقائياً: المستخدم = الإنتاج الفعلي - المتبقي - الهدر
- [x] تعديل backend countKitchenPull: قبول remainingQty بدلاً من closingCount مباشرة
- [x] تحديث routers.ts لتمرير remainingQty للـ db helper

## Fix: تعديل منطق الجرد في CountDialog
- [x] تغيير حقل الإدخال من "الكمية المتبقية" إلى "الكمية المستخدمة"
- [x] النظام يحسب تلقائياً: المتبقي = المتاح - المستخدم - الهدر
- [x] المرحّل = المتبقي المحسوب
- [x] إصلاح backend: produceSemiFinished يخزن pulledQuantity = producedQuantity (وليس actualYield)

## Feature: الترحيل المزدوج في جرد المطبخ (إنتاج + مواد خام)
- [x] CountDialog: حساب نسبة المتبقي = (الإنتاج الفعلي - المستخدم) / الإنتاج الفعلي
- [x] CountDialog: عرض المرحّل من الإنتاج + المرحّل المقابل من المواد الخام
- [x] Backend countKitchenPull: تسجيل ترحيل مزدوج (إنتاج + مواد خام لكل مكوّن) في جدول المسحوبات

## Fix: عمود المرحّل في جدول المسحوبات
- [x] إضافة حقل carriedRawQty في schema kitchen_daily_pulls
- [x] تحديث countKitchenPull لحفظ carriedRawQty في قاعدة البيانات
- [x] تحديث PullRow في الجدول: عرض carriedRawQty للمواد المصنّعة بدلاً من carriedForward

## Fix: عمود المستخدم في جدول المسحوبات
- [x] للمواد المصنّعة: عرض كمية الخام المستخدمة (= مسحوب - مرحّل خام) بالرقم الكبير وكمية الإنتاج بالأسفل
- [x] القيمة = كمية الخام المستخدمة × سعر الوحدة (بدلاً من كمية الإنتاج × السعر)

## Fix: التراجع عن الجرد (uncount)
- [x] فحص uncountKitchenPull: يعيد ضبط carriedRawQty وcarriedForward وwasteQty وclosingCount لكلا النوعين
- [x] للمواد المصنّعة: التراجع يحذف جميع سجلات الترحيل المزدوج (إنتاج + مواد خام لكل مكوّن)
- [x] للمواد الخام: التراجع يحذف سجل الهدر ويعيد الحالة إلى open بشكل صحيح

## Fix: produceSemiFinished - سطر واحد فقط للمادة المصنّعة
- [x] حذف سطر المواد الخام المنفصل الذي يُنشأ عند الترحيل
- [x] تخزين carriedRawQty في سطر المادة المصنّعة فقط (سطر واحد فقط)
- [x] حذف سجل TEST المنفصل الموجود حالياً من قاعدة البيانات

## Fix: عمود المرحّل وسطر الترحيل
- [x] عمود المرحّل (بعد الجرد): يعرض carriedRawQty فقط بدون إظهار الإنتاج
- [x] سطر الترحيل (اليوم التالي): الكمية المسحوبة = carriedRawQty وليس pulledQuantity
- [x] سطر الترحيل: عمود المرحّل يكون فارغاً (لم يُجرد بعد)

## Fix: سطر الترحيل - المرحّل وCountDialog
- [x] عمود المرحّل في سطر الترحيل: يكون فارغاً إذا كانت الحالة open
- [x] CountDialog للمادة المرحّلة: الكمية المسحوبة = carriedRawQty والإنتاج الفعلي = actualYield

## Fix: KPIs في صفحة إنتاج المطبخ
- [x] إجمالي الإنتاج: يعتمد على carriedRawQty للمرحّلة وpulledQuantity للأصلية
- [x] قيمة المستخدم: تحسب بناءً على كمية الخام المستخدمة (carriedRaw - newCarriedRaw)
- [x] عمود المستخدم في الجدول: يعرض كمية الخام المستخدمة بشكل صحيح

## Fix: uncountKitchenPull - الاستعادة
- [x] مراجعة uncountKitchenPull: المنطق صحيح — closingCount = usedQty (كمية الإنتاج المستخدم) يُعاد للمخزون بشكل صحيح
- [x] دورة الجرد والاستعادة كاملة وصحيحة للمواد الخام والمصنّعة

## Fix: زيادة كميات المخزون الغريبة ✅
- [x] تشخيص المشكلة: حذف معاملات production/waste/other مباشرة من صفحة المعاملات كان يُعيد المخزون بشكل مزدوج
- [x] إضافة حماية في deleteTransaction: منع حذف المعاملات ذات reason = production أو waste أو other
- [x] هذه المعاملات تُدار تلقائياً من نظام الإنتاج والجرد والهدر - يجب التراجع عنها من مصدرها
- [x] كتابة اختبارات vitest للتحقق من الحماية (8 اختبارات جديدة)

## Fix: زيادة كميات المخزون - الإصلاح الشامل ✅
- [x] إصلاح deleteKitchenPull: السجلات المرحّلة (isCarriedForward=true) لا تُعيد المخزون عند الحذف (لم تُخصم أصلاً)
- [x] إصلاح updateKitchenPullQuantity: السجلات المرحّلة لا تُعدّل المخزون عند تغيير الكمية
- [x] إصلاح deleteWasteLog: يحذف الـ OUT transaction المرتبطة لمنع الازدواجية
- [x] كتابة 8 اختبارات vitest جديدة لتغطية حالات الترحيل (107 اختبار إجمالاً)

## Feature: عرض كمية الخام المسحوبة وإجماليها للمواد المصنّعة في صفحة المواد
- [ ] إضافة دالة backend لجلب مجموع الخام المسحوب لكل مادة مصنّعة (من kitchenDailyPulls)
- [ ] إضافة endpoint في routers.ts لجلب مجموع الخام المسحوب
- [ ] تعديل MaterialsPage لعرض كمية الخام المسحوبة للمواد المصنّعة بدلاً من currentQuantity
- [ ] تعديل عمود الإجمالي للمواد المصنّعة ليعتمد على كمية الخام المسحوبة × تكلفة الوحدة
- [ ] التأكد من عدم تأثير التغيير على منطق الجرد (الجرد يعتمد على actualYield)

## WhatsApp Scheduled Reports Module
- [ ] Create DB tables: report_subscriptions, report_recipients, report_logs
- [ ] Apply DB migration via webdev_execute_sql
- [ ] Add db helpers in server/db.ts for whatsapp reports
- [ ] Add tRPC whatsapp router in server/routers.ts
- [ ] Build Evolution API integration (server/whatsapp.ts)
- [ ] Build cron scheduler (server/scheduler.ts)
- [ ] Build report generators (server/reportGenerators.ts)
- [ ] Create WhatsAppReportsPage.tsx frontend
- [ ] Add route /whatsapp-reports to App.tsx
- [ ] Add nav item to AppLayout.tsx (under Reports & Alerts)
- [ ] Add Evolution API credentials settings
- [ ] Test Send Now button
- [ ] Test toggle ON/OFF

## WhatsApp Scheduled Reports Module ✅
- [x] Create DB tables: report_subscriptions, report_recipients, report_logs, whatsapp_settings
- [x] Apply DB migration
- [x] Build Evolution API integration (server/whatsapp.ts)
- [x] Build cron scheduler (server/whatsappScheduler.ts) - runs every minute
- [x] Build report generators (server/reportGenerators.ts) - 6 report types
- [x] Add tRPC whatsapp router in server/routers.ts (10 procedures)
- [x] Create WhatsAppReportsPage.tsx frontend with Tabs (Subscriptions, Logs, Settings)
- [x] Add route /whatsapp-reports to App.tsx
- [x] Add nav item to AppLayout.tsx (under Reports & Alerts)
- [x] Add nav item to DashboardLayout.tsx
- [x] Add i18n keys for whatsappReports (ar/en)

## WhatsApp Reports - تحسينات إضافية (أبريل 2026)
- [x] إضافة تكلفة المطبخ اليومية في resolveVariables (kitchen_daily_cost, kitchen_daily_waste_cost, kitchen_materials_count, kitchen_prod_cost)
- [x] إضافة aliases للمتغيرات في resolveVariables (kitchen_pull_count, kitchen_open_count, kitchen_top1/2/3, inv_total_items, إلخ)
- [x] تحديث ALL_VARIABLE_GROUPS لإضافة متغيرات تكلفة المطبخ اليومية
- [x] تحسين generateTemplateWithAI لإرسال تكلفة المطبخ الحقيقية في statsContext
- [x] تحسين system prompt ليقترح إحصائيات جديدة في suggestedVariables
- [x] إضافة JSON schema لـ suggestedVariables في generateTemplateWithAI
- [x] عرض الإحصائيات المقترحة من AI في واجهة TemplateCard (لوحة صفراء)

## WhatsApp Reports - معاينة ببيانات حقيقية (أبريل 2026)
- [x] تصدير applyTemplateAsync من reportGenerators.ts
- [x] إضافة previewTemplateWithData tRPC mutation في routers.ts
- [x] إضافة زر "معاينة ببيانات حقيقية" في TemplateCard (بجانب زر الحفظ)
- [x] إضافة نافذة معاينة WhatsApp بتصميم داكن مع البيانات الحقيقية من DB

## WhatsApp Reports - تحديث منطق التواريخ (يوم العمل يبدأ 06:00)
- [x] إضافة دالة getBusinessDate() في reportGenerators.ts - تعيد تاريخ يوم العمل بناءً على 06:00 صباحاً
- [x] تحديث جميع استعلامات SQL في resolveVariables لتستخدم نطاق 06:00-05:59
- [x] تحديث buildDailySalesBody لاستخدام نطاق يوم العمل
- [x] تحديث buildKitchenCostBody لاستخدام نطاق يوم العمل
- [x] تحديث buildWasteSummaryBody لاستخدام نطاق يوم العمل
- [x] تحديث buildOrdersSummaryBody لاستخدام نطاق يوم العمل
- [x] تحديث استعلامات kitchen_cost في generateTemplateWithAI في routers.ts

## زر AI لإنشاء قوالب WhatsApp من لوحة التحكم
- [ ] إضافة generateTemplateFromPageContext procedure في routers.ts
- [ ] إنشاء مكوّن AIWhatsAppTemplateButton.tsx
- [ ] إضافة الزر في صفحة المطبخ (KitchenPage)
- [ ] إضافة الزر في صفحة المبيعات (SalesPage)
- [ ] إضافة الزر في صفحة المخزون (MaterialsPage/InventoryPage)
- [ ] إضافة الزر في صفحة الهدر (WastePage)
- [x] إصلاح AI يولّد [variable] بدلاً من {{variable}} - تحديث system prompt بقائمة المتغيرات الصحيحة
- [x] إضافة report_date وaliases للمتغيرات الشائعة في resolveVariables

## إعادة هيكلة نظام WhatsApp Reports ✅
- [x] إضافة حقل full_text وname إلى جدول report_templates
- [x] إضافة حقل templateId إلى جدول report_subscriptions
- [x] إضافة دالة generateReportFromFullText في reportGenerators.ts
- [x] إضافة إجراءات backend: saveFullTextTemplate، deleteTemplate، previewFullText
- [x] تحديث whatsappScheduler.ts لاستخدام templateId وfull_text
- [x] إعادة كتابة AIWhatsAppTemplateButton لحفظ القالب كنص كامل مع اسم مخصص
- [x] تبسيط تبويب القوالب: عرض القوالب المحفوظة بالاسم مع معاينة بأرقام حقيقية
- [x] تحديث SubscriptionFormDialog لاختيار القالب من القائمة المحفوظة
- [x] إزالة النماذج الافتراضية الستة من تبويب القوالب

## قالب WhatsApp لأداء المطعم اليومي ✅
- [x] إضافة زر "قالب الأداء اليومي" في تبويب القوالب بصفحة WhatsApp Reports
- [x] القالب يعرض: التكلفة، الربح، إجمالي المبيعات، نسبة تكلفة الإنتاج %
- [x] إضافة متغيرات kitchen_daily_cost وdaily_cost_pct إلى daily_sales في resolveVariables

## تعديل القالب واختيار التاريخ في المعاينة
- [x] إضافة زر تعديل (قلم) لكل قالب محفوظ في تبويب القوالب
- [x] نافذة تعديل القالب: تعديل الاسم ونص القالب مع حفظ التغييرات
- [x] إضافة date picker في المعاينة لاختيار تاريخ محدد للتحقق من صحة البيانات

## قائمة المتغيرات في نافذة تعديل القالب
- [x] إضافة قائمة المتغيرات المتاحة (الإحصائيات) داخل نافذة تعديل القالب
- [x] النقر على أي متغير يُدرجه مباشرة في نص القالب عند موضع المؤشر

## تحويل شارت أداء المطعم اليومي إلى جدول أفقي
- [x] تحديد الشارت المستهدف في صفحة DashboardPage أو ReportsPage
- [x] تحويله إلى جدول أفقي: الأعمدة = الأيام، الصفوف = إجمالي المبيعات / تكلفة المطبخ / صافي الربح / نسبة تكلفة الإنتاج %

## فلتر أسبوعي لجدول أداء المطعم اليومي
- [x] إضافة أزرار فلتر: الأسبوع الأول / الثاني / الثالث / الرابع
- [x] كل أسبوع يعرض 7 أيام فقط من الجدول

## استبدال إجمالي المبيعات بصافي المبيعات في جدول الأداء اليومي
- [x] تغيير مفتاح البيانات من grossSales إلى d.sales (صافي المبيعات)
- [x] تحديث التسمية في الجدول من "إجمالي المبيعات" إلى "صافي المبيعات"

## قالب WhatsApp يومي لأداء المطعم (بيانات اليوم الحالي)
- [x] التحقق من متغيرات اليوم الحالي في resolveVariables (pos_net_sales, kitchen_daily_cost, pos_profit, daily_cost_pct)
- [x] تحديث DAILY_PERF_TEMPLATE ليستخدم pos_net_sales وإضافة report_date
- [x] القالب يحتوي على: صافي المبيعات، تكلفة المطبخ، صافي الربح، نسبة تكلفة الإنتاج %

## إصلاح resolveVariables - تجميع كل مصادر المبيعات
- [x] إصلاح pos_net_sales ليستخدم sale_items.netSales (نفس منطق الجدول)
- [x] إصلاح kitchen_daily_cost ليستخدم closingCount × lastPurchasePrice (نفس calcKitchenPullRawCost)
- [x] إصلاح daily_cost_pct وpos_profit ليستخدم الأرقام الصحيحة

## إصلاح business day في resolveVariables
- [ ] فحص كيف يطبق الجدول منطق بداية اليوم من الساعة 6 صباحاً
- [ ] تطبيق نفس المنطق في resolveVariables لمطابقة الأرقام

## صفحة الحسابات اليومية (Daily Accounts)
- [x] إضافة حقل expenseCategory إلى جدول free_invoices (operational/maintenance/fixed)
- [x] إنشاء جدول daily_accounts في قاعدة البيانات
- [x] إنشاء migration وتطبيقه
- [x] بناء backend procedures: saveDailyAccount, getDailyAccounts, getDailyAccountByDate, deleteDailyAccount
- [x] بناء صفحة DailyAccountsPage في frontend
- [x] نموذج إدخال: المبيعات اليومية (نقدي/بطاقة/كيتا/طلبات/نون/ديلفروا/كريم)
- [x] نموذج إدخال: المصروفات (تشغيلية/صيانة ومعدات/ثابتة) مع ربط الفواتير الحرة
- [x] نموذج إدخال: التوريدات (للمطعم/للإدارة/إضافي)
- [x] حساب الرصيد النقدي المرحّل تلقائياً
- [x] جدول عرض الحسابات اليومية الأفقي
- [x] إضافة الصفحة إلى قائمة التنقل في DashboardLayout

## إضافة فواتير الموردين في الحسابات اليومية
- [ ] إضافة فواتير الموردين المدفوعة في قسم المصروفات بالحسابات اليومية بتصنيف "فواتير موردين"
- [ ] تطبيق منطق "اليوم يبدأ 6 صباحاً بتوقيت الإمارات" على استعلامات الحسابات اليومية (فواتير حرة + فواتير موردين)
- [ ] إضافة حقل paidAt (بتوقيت الإمارات) في جدول invoices وfree_invoices
- [ ] ملء paidAt للفواتير المدفوعة الحالية من updatedAt
- [ ] تحديث routers.ts لحفظ paidAt عند الدفع
- [ ] تحديث getFreeInvoiceExpensesForDate لاستخدام paidAt

## تحسينات الفواتير الحرة - عرض التاريخ الصحيح (أبريل 2026)
- [ ] إصلاح عرض التاريخ في جدول الفواتير الحرة: استخدام paidAt للمدفوعة، date للمؤجلة
- [ ] إصلاح الفلترة بالتاريخ في getFreeInvoices: استخدام paidAt للمدفوعة
- [ ] إضافة حقل expenseCategory في نموذج إنشاء الفاتورة الحرة
- [ ] إضافة expenseCategory في createFreeInvoice (db.ts + router)
- [ ] حفظ paidAt تلقائياً عند إنشاء فاتورة حرة بحالة paid أو partial
- [ ] عرض عمود "تاريخ الدفع" في جدول الفواتير الحرة للمدفوعة

## تحسينات UX/UI - صفحة الإنتاج اليومي للمطبخ
- [x] تنظيم الـ Header: تقسيم الأزرار لمجموعتين (إجراءات اليوم + تصدير)
- [x] إضافة شريط تقدم اليوم (جرد / إغلاق بالنسبة المئوية)
- [x] إضافة زر "جرد الكل" للمواد المفتوحة (ترحيل كامل)
- [x] تكبير أزرار الجدول (جرد / إغلاق) بألوان بارزة
- [x] إضافة فلتر الحالة (كل / مفتوح / تم الجرد / مغلق) بجانب البحث
- [x] تلوين صفوف الجدول حسب الحالة (أخضر مغلق / أصفر مجرود / عادي مفتوح)
- [x] إضافة صف ملخص (tfoot) في نهاية الجدول (إجمالي التكلفة + المستخدم + الهدر)

## توحيد منطق فلترة الفواتير الحرة مع فواتير الموردين
- [x] تعديل استعلام الفواتير الحرة: استخدام DATE(CONVERT_TZ(COALESCE(paidAt, updatedAt), '+00:00', tzOffset)) = accountDate
- [x] نفس المنطق لكلا نوعي الفواتير (حرة + موردين) في getFreeInvoiceExpensesForDate

## Feature: تصدير Excel لجميع الفواتير ✅
- [x] إنشاء server/excelGenerator.ts: دالة generateInvoicesExcel تجلب الفواتير وبنودها من DB
- [x] ملف Excel يحتوي على 3 أوراق: فواتير الموردين، الفواتير الحرة، ملخص إجمالي
- [x] كل فاتورة تُعرض مع بنودها التفصيلية (المادة/البيان، الكمية، السعر، الإجمالي)
- [x] إضافة route GET /api/excel/invoices في server/_core/index.ts
- [x] إضافة زر "تصدير Excel" في InvoicesPage.tsx بجانب زر PDF
- [x] الزر يحترم فلاتر الحالة والتاريخ الحالية في الصفحة

## Feature: صفحة الاستهلاك المستقلة
- [ ] إنشاء tRPC procedure: consumption.calculate - تقبل قائمة (productId + qty) وترجع المواد الخام المستهلكة
- [ ] إنشاء ConsumptionPage.tsx: إدخال الأصناف وكمياتها + عرض جدول المواد الخام المستهلكة
- [ ] ربط الصفحة بالتنقل (sidebar + App.tsx)
- [ ] دعم تصدير النتيجة إلى Excel

## Feature: صفحة تحليل الفروقات (Variance Analysis) ✅
- [x] إنشاء server/variance-analysis-db.ts: منطق حساب الاستهلاك الفعلي والمتوقع
- [x] إضافة tRPC procedure: reports.varianceAnalysis في server/routers.ts
- [x] إنشاء client/src/pages/VarianceAnalysisPage.tsx: صفحة كاملة مع فلاتر وجداول وبطاقات KPI
- [x] إضافة رابط "تحليل الفروقات" في AppLayout sidebar
- [x] إضافة route /variance-analysis في App.tsx
- [x] دعم تصدير CSV للنتائج
- [x] عرض أعلى 10 مواد بفروقات (bar chart)
- [x] جدول تفصيلي مع الحالة (طبيعي/تحذير/حرج) وتكلفة الفرق

## إعادة بناء صفحة تحليل الفروقات: مشتريات vs استهلاك متوقع من المبيعات
- [x] بناء backend جديد: جلب المشتريات من invoice_items + الاستهلاك المتوقع من sale_items × recipe_items
- [x] عرض جدول: المادة | وحدة | كمية المشتريات | كمية الاستهلاك المتوقع | الفرق (كمية) | تكلفة الفرق
- [x] بطاقات KPI: إجمالي تكلفة المشتريات، إجمالي تكلفة الاستهلاك المتوقع، الفرق
- [x] فلاتر: نطاق تاريخ، بحث بالاسم
- [x] تصدير CSV

## تحديث حساب الاستهلاك المتوقع - وصفات متداخلة

- [x] تحديث purchase-vs-sales-db.ts لحساب الاستهلاك عبر مستويين: المبيعات × recipe_items × semi_finished_recipes
- [x] التحقق من صحة حساب دجاج كاملة وباقي المواد الخام

## تحديث تقرير استهلاك المطبخ - إضافة مواد الإنتاج

- [x] فحص الجداول المستخدمة في تقرير استهلاك المطبخ
- [x] تحديث backend ليشمل المواد الخام المسحوبة لإنتاج المواد المصنّعة (kitchen_production_materials + semi_finished_recipes)
- [x] تحديث الواجهة لعرض مصدر الاستهلاك (مباشر / إنتاج)

## دمج فواتير الموردين والفواتير الحرة

- [x] فحص الكود الحالي لصفحة الفواتير وبنية قاعدة البيانات
- [x] تحديث قاعدة البيانات: إضافة procedure موحد allUnified يجلب كلا الجدولين مع invoiceType
- [x] تحديث الـ backend: procedure موحد يجلب كلا النوعين مع الفئة
- [x] تحديث الواجهة: جدول واحد مع فلتر الفئة ونموذج إضافة ذكي (بنود للموردين / نص حر للحرة)
- [x] التحقق من عمل الصفحة

## تحديث منطق المصروفات في DailyAccountDialog
- [x] فحص الكود الحالي لـ DailyAccountDialog ومنطق المصروفات
- [x] تحديث backend: استعلام DATE(CONVERT_TZ(paidAt, '+00:00', '+04:00') - INTERVAL 6 HOUR) = accountDate
- [x] التأكد من شمول فواتير الموردين والفواتير الحرة معاً
- [x] تحديث النصوص التوضيحية في الواجهة

## تحديث فلتر التاريخ في صفحة الفواتير
- [x] فحص فلتر التاريخ الحالي في InvoicesPage والـ backend
- [x] تحديث الـ backend: استخدام DATE(CONVERT_TZ(COALESCE(paidAt, invoiceDate), '+00:00', '+04:00') - INTERVAL 6 HOUR)
- [x] التحقق وحفظ checkpoint

## إعادة فلتر التاريخ في صفحة الفواتير
- [x] إعادة فلتر التاريخ ليعمل على DATE(invoiceDate) بدلاً من paidAt
- [x] التحقق وحفظ checkpoint

## إضافة فلتر تاريخ الدفع في صفحة الفواتير
- [ ] إضافة state paidDateFrom و paidDateTo في InvoicesPage
- [ ] إضافة حقلي تاريخ الدفع في شريط الفلاتر
- [ ] تحديث backend لدعم فلتر paidDateFrom/paidDateTo
- [ ] التحقق وحفظ checkpoint

## Feature: Material Ledger - سجل حركات المادة التفصيلي
- [ ] إضافة procedure getMaterialLedger في routers.ts لجلب حركات مادة مع الرصيد المتراكم
- [ ] إضافة نافذة MaterialLedgerModal في MaterialsPage لعرض حركات المادة بشكل تفصيلي
- [ ] إضافة زر "سجل الحركات" في قائمة كل مادة في MaterialsPage
- [x] تعديل تصدير Excel للوصفات: استخدام getProductIngredients من backend لضمان تطابق القيم مع الـ UI
- [x] تعديل تصدير Excel في KitchenProductionPage: الأعمدة = اسم العنصر، النوع، الكمية المستخدمة، الوحدة، سعر الوحدة، التكلفة الإجمالية
- [x] إصلاح منطق حساب التكلفة في تصدير Excel للإنتاج: سعر الوحدة = (مسحوب ÷ إنتاج فعلي)، التكلفة = الكمية المستخدمة × سعر الوحدة
- [x] تطبيق منطق (مسحوب ÷ إنتاج فعلي × سعر) في عمود التكلفة بجدول الـ UI في KitchenProductionPage
- [x] إعادة تصميم جدول الإنتاج اليومي: grid layout مع رؤوس مجمّعة (خام/إنتاج/استهلاك) ومنطق حساب صحيح
- [x] إخفاء Consumption per Unit وUsage Cost للعناصر المفتوحة (open) في جدول الإنتاج
- [x] إصلاح حساب Kitchen Cost (تكلفة المطبخ) ليعتمد على مجموع Usage Cost فقط
- [x] إصلاح Kitchen Cost في Dashboard (بطاقة الشهر + جدول الأداء اليومي) لاستخدام منطق Usage Cost
- [x] حذف روابط التنقل لـ 6 صفحات: حاسبة الاستهلاك، تقرير استهلاك المطبخ، بنود فواتير الموردين، تحليل الفروقات، مشتريات vs مبيعات، تقارير المبيعات
- [x] إصلاح خطأ Failed to fetch في /analytics: استبدال حلقات N+1 queries بـ batch SQL في getAnalyticsProfitLoss وgetAnalyticsCOGS
- [x] استبدال قسم Period Summary بجدول Sales vs Kitchen Production
- [ ] إضافة أداة حاسبة الوصفة (modal) داخل صفحة الإنتاج اليومي: اختيار وصفة + كمية مباعة → مقارنة المكونات المطلوبة مع الإنتاج الفعلي
- [x] Partial payment logic: auto-reduce remaining balance, accumulate total paid, save payment history per invoice (invoice_payment_history table)

## Fix: تعديل تصدير Excel في صفحة الفواتير ✅
- [x] تعديل generateInvoicesExcel: كل فاتورة = سطر واحد فقط (بدون تفاصيل البنود الداخلية)
- [x] أعمدة Sheet 1 (فواتير الموردين): رقم الفاتورة، المورد، التاريخ، الإجمالي، المدفوع، المتبقي، حالة الدفع، تاريخ الدفع، ملاحظات
- [x] أعمدة Sheet 2 (الفواتير الحرة): رقم الفاتورة، المورد/الجهة، التاريخ، تصنيف المصروف، الإجمالي، المدفوع، المتبقي، حالة الدفع، تاريخ الدفع، ملاحظات
- [x] حساب المتبقي من remainingAmount (أو totalAmount - paidAmount كبديل)
- [x] صف الملخص يعرض: إجمالي الفواتير، مجموع المدفوع، مجموع المعلق

## Fix: توحيد مصدر بيانات كارد المديونية في الداشبورد
- [ ] فحص مصدر بيانات كارد المديونية (getDashboardStats) ومقارنته بـ getInvoiceListStats
- [ ] توحيد المنطق: كارد الداشبورد يستخدم نفس حسابات صفحة الفواتير (paidAmount + remainingAmount)
- [ ] التأكد من تطابق: مدفوع + مؤجل = إجمالي في كلا المصدرين
- [x] إصلاح كارد المديونية في الداشبورد - فلتر "شهر" يُرجع 0 بدلاً من أرقام الشهر الحالي
- [x] إضافة الفواتير ذات الدفع الجزئي في DailyAccountDialog مع عرض المبلغ المدفوع فقط
- [x] إضافة المبلغ المدفوع جزئياً إلى إجمالي المصروفات في DailyAccountDialog مع ظهوره في التفاصيل
- [x] إزالة "صافي الربح" من نموذج حفظ بيانات اليوم (DailyAccountDialog)
- [x] إضافة Accordion لتفاصيل المصروفات يعرض بنود كل فاتورة بأسعارها
- [x] إنشاء دالة generateDailyAccountPDF في pdfGenerator.ts
- [x] إضافة قالب WhatsApp لتقرير اليوم في صفحة القوالب (مع expenses_partial وبدون net_profit)
- [x] إرسال PDF تفصيلي عبر WhatsApp عند تأكيد حفظ بيانات اليوم

## Feature: إعادة تصميم PDF الحسابات اليومية ✅
- [x] استبدال PDFKit بـ Puppeteer + HTML لدعم RTL الصحيح
- [x] تصميم HTML احترافي مع كاردات ملخص في الأعلى (مبيعات / مصروفات / رصيد)
- [x] جدول المبيعات مع تفاصيل كل قناة (نقدي / بطاقة / تطبيقات)
- [x] جدول المصروفات مع تفاصيل كل فاتورة وبنودها (موردين / حرة / جزئي)
- [x] قسم التوريدات والرصيد النقدي والملاحظات
- [x] الـ PDF الآن 2 صفحات فقط بدلاً من 24 صفحة
- [x] خط Cairo العربي من Google Fonts لجودة عالية

## Fix: المرحّل من اليوم السابق يعرض رقم خاطئ
- [x] التحقق من منطق previousCarryForward - المشكلة كانت في استخدام totalAmount بدلاً من paidAmount للفواتير الحرة
- [x] إصلاح db.ts ليستخدم paidAmount للفواتير الحرة عند حساب carryForwardToNext
- [x] تصحيح carryForwardToNext ليوم 14 أبريل من 759.65 إلى 1309.65 د.إ

## Fix: عمود المصروفات التشغيلية في جدول الحسابات اليومية
- [x] إصلاح عمود المصروفات التشغيلية في جدول الحسابات اليومية ليشمل: موردين + حرة paid + حرة partial (paidAmount)

## Feature: قالب رسالة واتساب للتقرير التشغيلي اليومي
- [x] إضافة نوع قالب daily_account_summary في صفحة القوالب مع عرض النص الفعلي مثل باقي القوالب
- [x] إمكانية حفظ القالب وإضافته في الاشتراكات بضغطة زر واحد

## Fix: عدم إرسال PDF مع رسالة واتساب التقرير التشغيلي
- [x] تحليل سجلات الإرسال - المشكلة كانت في sendReportNow لا تدعم daily_account_summary ولا ترفق PDF
- [x] إصلاح sendReportNow لدعم daily_account_summary وإرسال PDF مع الرسالة

## Feature: إضافة جميع قوالب الرسائل في صفحة القوالب
- [ ] مراجعة النصوص الحالية لقوالب: فاتورة مورد جديدة، دفع فاتورة مورد، فاتورة حرة جديدة، دفع فاتورة حرة، إنتاج مطبخ، سحب مطبخ
- [ ] إضافة القوالب الجديدة في report_templates (قاعدة البيانات)
- [ ] تحديث صفحة WhatsAppReportsPage لعرض القوالب الجديدة
- [ ] تحديث كود الإرسال (whatsapp.ts, kitchenNotifications.ts) ليستخدم القوالب المحفوظة
- [ ] اختبار جميع القوالب

## WhatsApp Invoice Templates (4 New Templates) ✅
- [x] حذف الإرسال التلقائي لرسائل الواتساب عند إنشاء/دفع الفواتير (مورد + حرة) - الإرسال الآن عبر الاشتراكات فقط
- [x] إضافة 4 أنواع جديدة في REPORT_TYPES: supplier_invoice_new, supplier_invoice_paid, free_invoice_new, free_invoice_paid
- [x] إضافة نصوص القوالب الثابتة الأربعة مع متغيرات {{variable}}
- [x] إضافة كاردات القوالب السريعة في TemplatesTab (برتقالي، أخضر، بنفسجي، وردي)
- [x] تعديل sendInvoiceWhatsAppReport لجلب القالب من قاعدة البيانات مع fallback
- [x] تعديل sendProductionNotification و sendPullNotification لجلب القوالب من DB
- [x] تحديث enum reportType في schema.ts وتطبيق migration على قاعدة البيانات

## Invoice Status: Under Review (التدقيق) ✅
- [x] إضافة under_review في enum paymentStatus في schema.ts (invoices + free_invoices) وتطبيق migration
- [x] تحديث routers.ts لقبول under_review بدون تأثير مالي
- [x] تحديث CreateInvoiceInput, UpdateInvoiceInput, listInvoices, createFreeInvoice, updateFreeInvoice في db.ts
- [x] تحديث updateInvoiceStatus و updateFreeInvoiceStatus لقبول under_review بدون تغيير مالي
- [x] إضافة badge "التدقيق" (بنفسجي) في STATUS_CONFIG في InvoicesPage
- [x] إضافة under_review في جميع Select dropdowns وبطاقات فلتر الحالة
- [x] إضافة under_review في pdfGenerator.ts (label بنفسجي + color + bg)
- [x] إضافة under_review في excelGenerator.ts (statusLabel)
- [x] إضافة under_review في STATUS_LABELS_PDF و فلتر PDF في index.ts

## Centralized Notification System (Subscriptions Only) ✅
- [x] حذف sendProductionNotification و sendPullNotification من routers.ts (إزالة الإرسال التلقائي المباشر)
- [x] إضافة دالة triggerEventSubscriptions في whatsappScheduler.ts: تبحث عن الاشتراكات النشطة وتستبدل المتغيرات وترسل للمشتركين
- [x] توحيد أسماء المتغيرات في قوالب المطبخ (date, produced_quantity, pulled_quantity, deductions, actual_yield, unit_cost)
- [x] kitchen_production و kitchen_pull موجودان في REPORT_TYPES والقوالب الافتراضية محدثة
- [x] جميع الأنواع (invoices, payments, kitchen) تمر عبر الاشتراكات فقط - لا إرسال خارج النظام

## Subscription Form: Operation Type Field
- [x] إضافة حقل "نوع العملية" يظهر فقط عند اختيار "فوري" في نموذج إنشاء الاشتراك
- [x] الخيارات: kitchen_production, kitchen_pull, supplier_invoice_new, supplier_invoice_paid, free_invoice_new, free_invoice_paid
- [x] الحقل مطلوب عند اختيار "فوري" (رسالة خطأ واضحة)
- [x] ربط reportType بـ operationType المختار (عند الحفظ operationType يصبح reportType)
- [x] إخفاء الحقل للاشتراكات المجدولة (hourly, daily, weekly, monthly)

## Fix Operation Type Mapping in Subscription Form ✅
- [x] مراجعة جميع القوالب وتحديد نوع العملية الصحيح لكل منها
- [x] إزالة التكرار - INSTANT_OPERATION_TYPES تحتوي على 6 عمليات فريدة فقط
- [x] عند اختيار قالب فوري: تظهر عملية واحدة فقط مطابقة للقالب
- [x] عند اختيار قالب فوري: scheduleType يتغير تلقائياً لـ "instant" وoperationType يُملأ تلقائياً
- [x] عند اختيار قالب مجدول: scheduleType يعود لـ "daily" إذا كان "instant" سابقاً

## New Operation Type: Daily Summary Confirmed ✅
- [x] إضافة daily_summary_confirmed في REPORT_TYPES وINSTANT_OPERATION_TYPES وINSTANT_ONLY_REPORT_TYPES
- [x] إضافة DAILY_SUMMARY_CONFIRMED_TEMPLATE وكارد القالب السريع (أخضر) في WhatsAppReportsPage
- [x] تغيير reportType في dailyAccountNotification.ts من daily_account_summary إلى daily_summary_confirmed
- [x] الإرسال يتم عند التأكيد النهائي فقط (زر تأكيد الحفظ في DailyAccountDialog)

## PDF Daily Report: Add Expense Details ✅
- [x] جلب فواتير الموردين المدفوعة من قاعدة البيانات (invoices WHERE paymentStatus='paid')
- [x] جلب الفواتير الجزئية (invoices WHERE paymentStatus='partial')
- [x] جلب الفواتير الحرة (free_invoices) مع expenseCategory
- [x] إصلاح اسم العمود: category → expenseCategory في استعلام free_invoices
- [x] الجلب دائماً من قاعدة البيانات (fallback للبيانات المُمررة من الواجهة)

## PDF Daily Report: Fix Expenses Display ✅
- [x] جلب جميع الفواتير (paid + partial) وليس paid فقط - استثناء under_review
- [x] إضافة بنود كل فاتورة من invoice_items و free_invoice_items
- [x] إصلاح إجمالي المصروفات: يُحسب الآن من الفواتير المجلوبة فعلياً من DB
- [x] إصلاح expensesSupplierInvoices و expensesFreeInvoices و expensesPartial في PDF

## PDF Daily Report: Fix Filename & Show Invoice Items ✅

## WhatsApp Notification on Daily Account Save ✅
- [x] تحقق من عمل sendDailyAccountNotification عند تأكيد الحفظ
- [x] إضافة logging واضح لتتبع الإرسال
- [x] إصلاح استدعاء sendDailyAccountNotification ليلتقط الأخطاء بشكل صحيح
- [x] اختبار مباشر: الرسالة والمرفق تصل بنجاح للرقم 971528063609
- [x] إصلاح اسم ملف PDF: يستخدم الآن pdfAccountDate (تاريخ التقرير) بدلاً من new Date() (تاريخ الإرسال)
- [x] إصلاح sendReportNow: جلب بنود الفواتير من invoice_items و free_invoice_items لكل فاتورة

## Fix TypeScript Errors in db.ts ✅
- [x] إصلاح خطأ under_review و remainingAmount بإضافة as any للحقول التي تسبب خطأ Drizzle type inference
- [x] TypeScript check نظيف تماماً (0 أخطاء)

## Add Partial Invoice Items in PDF ✅
- [x] إضافة items لنوع partialInvoices في pdfGenerator.ts
- [x] تحديث buildPartialRows لعرض بنود الفواتير الجزئية
- [x] تحديث dailyAccountNotification.ts و whatsappScheduler.ts لتمرير items مع الفواتير الجزئية

## Add Resend Report Button ✅
- [x] إضافة procedure resendReport في dailyAccounts router
- [x] إضافة زر إعادة إرسال (أيقونة طائرة) بجانب أزرار التعديل والحذف في جدول الحسابات اليومية
- [x] الزر يعرض animation دوران أثناء الإرسال ويعرض toast عند النجاح أو الخطأ
- [ ] إضافة خيار إخفاء/إظهار الوصفة من المنيو (حقل showInMenu في جدول recipes)

## Feature: حفظ المنيو ومشاركته برابط عام
- [x] إضافة جدول saved_menus في DB schema (token, name, data JSON, createdAt)
- [x] تطبيق migration على قاعدة البيانات
- [x] إضافة backend procedures: saveMenu, getPublicMenu, listSavedMenus, deleteMenu
- [x] تحديث MenuPage بزر "حفظ المنيو" وعرض الروابط المحفوظة مع نسخ الرابط
- [x] إنشاء صفحة PublicMenuPage (بدون تسجيل دخول) مع route /menu/:token

## تحديث KPI cards في صفحة إنتاج المطبخ ✅
- [x] تحديث getDailyKitchenKPIs في sales-db.ts: استبدال charcoalProduction بـ energyUsage (فحم + غاز)
- [x] تحديث getDailyKitchenKPIs في sales-db.ts: توسيع rawMaterialsUsed إلى allMaterialsUsed (خام + مصنعة مصنّفة)
- [x] تحديث KPI card 1 في KitchenProductionPage.tsx: استبدال "إنتاج الفحم" بـ "استهلاك الطاقة" (فحم + غاز منفصلين)
- [x] تحديث KPI card 4 في KitchenProductionPage.tsx: توسيع "المواد الخام اليوم" إلى "المواد المستخدمة اليوم" مع تصنيف خام/مصنعة
- [x] إصلاح TypeScript: إضافة const d = await db() في getDailyKitchenKPIs
- [x] التحقق من 0 أخطاء TypeScript

## تعديل KPI cards - حذف 3 وإضافة KPI الخضروات
- [x] حذف KPI "استهلاك الطاقة" من KitchenProductionPage.tsx
- [x] حذف KPI "الأرز والحواشي" من KitchenProductionPage.tsx
- [x] حذف KPI "دجاج الفحم" من KitchenProductionPage.tsx
- [x] إضافة دالة getDailyVegetablesUsed في sales-db.ts: تجمع كل المواد الخام من kitchenDailyPulls + مكونات الوصفات من kitchenProductionMaterials
- [x] إضافة procedure dailyVegetables في salesRouter في routers.ts
- [x] إضافة KPI card "الخضروات والمكونات" في KitchenProductionPage.tsx يعرض قائمة تفصيلية بكل مادة وكميتها

## تفكيك مكونات المواد المصنعة في KPI الخضروات
- [x] تحديث getDailyVegetablesUsed: إضافة مصدر 3 - سحبات المواد المصنعة (materialType='semi') من kitchenDailyPulls
- [x] لكل مادة مصنعة مسحوبة: جلب وصفتها من semiFinishedRecipes وضرب كمياتها في الكمية المسحوبة
- [x] ضم مكونات الوصفة (مواد خام) إلى نفس الـ map المجمعة

## إصلاح تحويل الوحدات في KPI المكونات
- [x] فحص بنية semiFinishedRecipes: وحدة الوصفة (g/kg) مقابل وحدة المادة المنتجة
- [x] إضافة دالة toBaseUnit لتحويل الكميات من وحدة الوصفة إلى وحدة المخزون
- [x] تصحيح حساب: recipe qty بالجرام ÷ 1000 إذا كانت وحدة المنتج kg

## إصلاح منطق الكمية المستخدمة في KPI المكونات
- [x] فحص معنى حقول kitchenDailyPulls: closingCount = usedQty (بعد الجرد), pulledQuantity = المسحوب, carriedForward = المتبقي
- [x] تصحيح حساب: إذا جرد → closingCount, إذا لم يجرد → pulled - carriedForward

## إعادة كتابة getDailyVegetablesUsed لاستخدام inventory_transactions
- [x] استبدال 3 مصادر (kitchenDailyPulls + semiFinishedRecipes + kitchenProductionMaterials) بمصدر واحد: inventory_transactions WHERE type=OUT AND reason=production
- [x] تجميع الكميات حسب materialId مع SUM(quantity) وunit من raw_materials

## إصلاح KPI المكونات - الاعتماد على الإنتاج الفعلي
- [ ] فحص kitchen_daily_production: actualQuantity × وصفة المكونات = الكمية المستخدمة الصحيحة
- [ ] إعادة كتابة getDailyVegetablesUsed: لكل سجل إنتاج، اضرب actualQuantity في كمية كل مكون من الوصفة
- [ ] تجاهل inventory_transactions لأنها تحتوي تعديلات مكررة

## إصلاح getDailyVegetablesUsed - الاعتماد على closingCount
- [x] المصدر 1: kitchen_daily_pulls WHERE materialType='raw' → closingCount = الاستهلاك الفعلي
- [x] المصدر 2: kitchen_daily_pulls WHERE materialType='semi_finished' → closingCount × وصفة semiFinishedRecipes = مكونات المادة المصنعة المستهلكة
- [x] تجاهل inventory_transactions لأنها تحتوي تعديلات مكررة

## إصلاح منطق الحساب في getDailyVegetablesUsed
- [x] مواد خام: closingCount = الاستهلاك الفعلي (صحيح)
- [x] مواد مصنعة: pulledQuantity - carriedForward = الكمية المستخدمة من المنتج × وصفة المكونات

## حذف KPI المواد المستخدمة اليوم
- [x] حذف KPI "المواد المستخدمة اليوم" من KitchenProductionPage.tsx

## صفحة Food Cost للوصفات
- [ ] فحص بنية جداول الوصفات (menu_items, recipes, semi_finished_recipes, raw_materials)
- [ ] procedure: getFoodCostRecipes - جلب كل الوصفات مع تكلفة المكونات ونسبة الـ food cost
- [ ] procedure: updateIngredientPrice - تحديث سعر مكون مباشرة من الصفحة
- [ ] صفحة FoodCostPage.tsx: جدول احترافي مع expand للمكونات
- [ ] إضافة الصفحة للـ navigation

## صفحة Food Cost - متابعة نسبة تكلفة الوصفات ✅
- [x] بناء procedure getFoodCostReport في recipes router: يجلب جميع الوصفات مع تكلفة المكونات ونسبة Food Cost
- [x] بناء procedure updateIngredientPrice: يحدث lastPurchasePrice لأي مادة خام مباشرة
- [x] بناء صفحة FoodCostPage.tsx: جدول مع expand للمكونات وتعديل الأسعار inline
- [x] KPI cards: متوسط Food Cost, عدد وصفات ممتازة/تحذير/خطر
- [x] ربط الصفحة بالـ navigation في DashboardLayout.tsx وApp.tsx

## إصلاح صفحة قائمة الطعام - عرض المنيو المحفوظ تلقائياً
- [x] فحص MenuPage الحالية لفهم سبب إعادة التصميم في كل مرة
- [x] تعديل MenuPage لجلب وعرض المنيو المحفوظ تلقائياً عند الفتح

## قائمة الطعام - عرض الوصفات الحالية تلقائياً
- [x] بناء procedure menu.getLiveProducts يجلب المنتجات الحالية مع دمجها مع تصنيف المنيو المحفوظ
- [x] تعديل MenuPage لعرض الوصفات الحالية مباشرة بدون الحاجة لحفظ أو ضغط زر

## تجميع القائمة الجانبية في أقسام
- [x] تحديث DashboardLayout لعرض القائمة بأقسام مجمّعة مع عناوين (مخزون، وصفات، مطبخ، مبيعات، تقارير، إدارة)

## إصلاح مشاكل مُبلَّغ عنها
- [x] إصلاح: صفحة Food Cost غير ظاهرة في القائمة الجانبية - تم إضافة foodCost لـ ALL_PAGES وإضافة فلتر allowedPages لـ DashboardLayout
- [x] إصلاح: وجبة "صنية ورك بطاطس" غير ظاهرة في المنيو - تم تصحيح اسم الوجبة في قاعدة البيانات (name=و تم تصحيحه لـ nameAr)

## توحيد القائمة الجانبية
- [x] إزالة DashboardLayout من FoodCostPage وWasteReportPage لتوحيد القائمة في AppLayout فقط

## إشعارات واتساب - Food Cost
- [ ] إنشاء نموذج واتساب جديد لإشعارات تغيير Food Cost
- [ ] إضافة trigger في server عند تسجيل سعر مادة خام جديد يحسب تأثيره على Food Cost
- [ ] إرسال إشعار واتساب إذا تغيرت نسبة Food Cost بأكثر من 1% مع تفاصيل الوصفات والمكونات

## إشعارات واتساب - تنبيه Food Cost ✅
- [x] إضافة food_cost_alert كنوع جديد في report_subscriptions enum (DB + schema)
- [x] إنشاء server/foodCostAlert.ts: يحسب تأثير تغيير السعر على Food Cost لكل وصفة تحتوي المادة
- [x] إرسال إشعار واتساب تلقائي عند تغيير نسبة Food Cost بأكثر من 1%
- [x] الرسالة تحتوي: اسم الوصفة، النسبة القديمة، النسبة الجديدة، اسم المادة، السعر القديم والجديد
- [x] إضافة trigger في createInvoice (عند إضافة فاتورة مورد جديدة)
- [x] إضافة trigger في updateIngredientPrice (عند تحديث السعر من صفحة Food Cost)
- [x] إضافة trigger في updateStockAndPrice (عند تحديث السعر من صفحة المواد)
- [x] إضافة food_cost_alert في WhatsAppReportsPage لإنشاء اشتراك جديد
- [x] إضافة نموذج رسالة افتراضي مع متغيرات: date, affected_recipes, material_name, old_price, new_price
- [x] كتابة 4 اختبارات vitest - جميعها نجحت (149/149 tests)

## تعديلات صفحة الحسابات اليومية
- [x] حذف KPI "المصروفات الثابتة (مستبعدة)" من صفحة الحسابات اليومية
- [x] حذف قسم KPI كامل "بعد خصم المصروفات التشغيلية والصيانة" (المصروفات التشغيلية، الصيانة، الثابتة، الربح قبل الثابت)

## Feature: Food Cost Alert - Semi-Finished Materials Support ✅
- [x] تحديث foodCostAlert.ts ليشمل المواد المصنّعة (semi_finished) في حساب تأثير تغيير سعر المادة الخام
- [x] calcSemiFinishedCost: حساب تكلفة المادة المصنّعة ديناميكياً من semi_finished_recipes مع مراعاة price overrides
- [x] calcRecipeCost: عند وجود مكون semi_finished في الوصفة، يُحسب سعره من وصفته الخاصة بدلاً من lastPurchasePrice
- [x] checkFoodCostImpact: البحث عن المنتجات المتأثرة مباشرة (raw) وغير مباشرة (عبر semi_finished)
- [x] إضافة علامة 🔗 في الإشعار للوصفات المتأثرة بشكل غير مباشر مع ذكر أسماء المواد المصنّعة
- [x] تحديث اختبارات foodCostAlert.test.ts لتشمل سيناريو التأثير غير المباشر (5 اختبارات)
- [x] جميع الاختبارات تنجح (150/150)

## Feature: Monthly Fixed Payments (المدفوعات الشهرية الثابتة) ✅
- [x] إنشاء جدول monthly_payments في قاعدة البيانات (migration 0041)
- [x] بناء tRPC procedures: getByMonth, getYearlySummary, create, update, delete, markAsPaid, deleteByMonth
- [x] بناء صفحة MonthlyPayments مع الإحصائيات الـ 6 (إجمالي، مدفوع، متبقي، عدد مدفوع/متأخر/انتظار)
- [x] إضافة جدول المدفوعات مع فلاتر (شهر، تصنيف، حالة، بحث) مجمّعة حسب التصنيف
- [x] إضافة نسخ تلقائي للمدفوعات لأشهر متعددة عند الإنشاء
- [x] إضافة الجدول السنوي مع صافي الدخل الشهري (مبيعات - مصروفات - ثوابت)
- [x] إضافة الصفحة في القائمة الجانبية والـ routes
- [x] إضافة ترجمة في i18n.ts (عربي + إنجليزي)
- [x] جميع الاختبارات تنجح (150/150)

## WhatsApp Inbox Module ✅
- [x] WaChatsPage — Three-panel CRM inbox (conversation list + chat window + AI analysis panel)
- [x] WaChatsPage — Conversation list with search, unread filter, avatar colors
- [x] WaChatsPage — Chat window with message bubbles, direction indicators, date separators
- [x] WaChatsPage — Message status badges (sent/delivered/read/pending/failed)
- [x] WaChatsPage — Media type indicators (image/video/audio/document/location)
- [x] WaChatsPage — AI Analysis right panel (intent, sentiment, priority, summary, suggested reply, tags, behavior, satisfaction)
- [x] WaChatsPage — Contact info card in AI panel
- [x] WaChatsPage — Fetch messages from Evolution API button
- [x] WaChatsPage — Run AI analysis on-demand button
- [x] WaChatsPage — Mobile responsive (list/chat toggle)
- [x] WaChatsPage — Arabic + English support (RTL/LTR)
- [x] WaNumbersPage — WhatsApp instance management (add/edit/delete/test connection)
- [x] AppLayout — Updated icons for waChats (MessageCircle) and waNumbers (Phone)
- [x] TypeScript: 0 errors, 189 tests passing

## WhatsApp Analytics Dashboard ✅
- [x] waAnalytics.ts — backend queries for all KPIs (message volume, first response, conv status, complaints, top intents, sentiment, busiest hours, agent performance, instance breakdown, daily volume)
- [x] waAnalyticsDash tRPC router — 11 procedures (full + individual KPI endpoints)
- [x] WaAnalyticsDashboard.tsx — full analytics page with KPI cards, donut charts, bar chart, area chart, line chart, agent table, instance table
- [x] Date range filter (today / 7d / 30d / 90d)
- [x] WhatsApp instance filter dropdown
- [x] KPI explanations on each card
- [x] i18n keys added (waAnalytics in ar + en)
- [x] AppLayout navigation entry added
- [x] App.tsx route added (/wa-analytics)
- [x] TypeScript: 0 errors, 189 tests passing

## Auto-Polling & Auto-Analysis في WaChatsPage
- [ ] Polling تلقائي كل دقيقة لتحديث المحادثات والرسائل في WaChatsPage
- [ ] Auto-trigger AI analysis لكل محادثة جديدة أو محدّثة تلقائياً
- [ ] تأكيد triggerAiAnalysis في webhook pipeline عند استقبال رسالة جديدة

## Auto-Sync on Connection Confirmed (Evolution API)
- [ ] syncAllChats — سحب جميع المحادثات والرسائل القديمة من Evolution API وحفظها في DB
- [ ] ربط syncAllChats بحدث connection.update (state=open) في webhook handler
- [ ] تسجيل Webhook URL تلقائياً في Evolution API عند تأكيد الاتصال
- [ ] تحليل AI تلقائي لكل محادثة مُزامَنة (background job)
- [ ] عرض progress في WaNumbersPage أثناء المزامنة (sync status)
- [ ] زر "مزامنة يدوية" في WaNumbersPage لإعادة المزامنة في أي وقت

## Feature: WhatsApp Batch AI Analysis System ✅
- [x] إضافة batchAnalyzeAllConversations وgetBatchProgress إلى waAiAnalysis.ts
- [x] إضافة getLatestAnalysis إلى waAiAnalysis.ts
- [x] إضافة waBatch router إلى routers.ts (start, progress, getConvAnalysis, getMultiAnalysis)
- [x] تحديث WaChatsPage: عرض sentiment badges لكل محادثة في القائمة (getMultiAnalysis query)
- [x] تحديث WaAnalyticsDashboard: زر "تحليل الكل بالذكاء الاصطناعي" مع progress bar live
- [x] Dashboard auto-refresh كل 60 ثانية (live monitoring)
- [x] إصلاح runFullConversationAnalysis و_legacyAnalyzeConversation لاستخدام wa_messages بدلاً من whatsapp_messages
- [x] 189 اختبار ناجح، 0 TypeScript errors

## Fix: Arabic Language for AI Analysis ✅
- [x] تعديل SYSTEM_PROMPT في waAiAnalysis.ts لإلزام الـ AI بكتابة النصوص الوصفية بالعربية دائماً
- [x] تعديل analyzeMessage userPrompt: summary, tags, suggestedReply بالعربية
- [x] تعديل analyzeConversationFull userPrompt: summary, tags, impressionSummary, behaviorTags, extractedOrderItems بالعربية
- [x] 189 اختبار ناجح، 0 TypeScript errors

## Fix: Time Filter in WaAnalyticsDashboard ✅
- [x] إصلاح aiSubquery في getConversationsWithAnalysis: إزالة dateFilterSub المبني على analyzedAt
- [x] إضافة متغيرات dateFromMs/dateToMs/dateFromMsWh/dateToMsWh للفلتر على lastMessageAt
- [x] إصلاح getRestaurantInsights: تغيير dateFilter من DATE(analyzedAt) إلى lastMessageAt عبر JOIN مع wa_conversations
- [x] إضافة dateFromMs/dateToMs كـ Unix timestamps في input schema لكلا الـ procedures
- [x] تحديث WaAnalyticsDashboard.tsx: إرسال Unix timestamps (timezone-aware) بدلاً من date strings فقط
- [x] الفلتر الآن يعمل بشكل صحيح مع timezone UTC+4 للمستخدم
- [x] 189 اختبار ناجح، 0 TypeScript errors

## Bug: الرسائل لا تظهر في ConversationDetailDialog ✅
- [x] تشخيص: محادثات wh تستخدم whatsapp_messages لكن getConversationDetail كان يبحث فقط في wa_messages
- [x] إضافة source parameter لـ getConversationDetail procedure
- [x] تعديل getConversationDetail ليبحث في كلا الجدولين (wa_messages + whatsapp_messages) حسب source
- [x] تعديل ConversationDetailDialog لقبول وتمرير source
- [x] تعديل WaAnalyticsDashboard لتتبع selectedConvSource وتمريره للـ dialog
- [x] 189 اختبار ناجح، 0 TypeScript errors

## Feature: Real-time Dashboard & Conversations ✅
- [x] إضافة SSE endpoint /api/sse/wa-events في server/_core/index.ts
- [x] إنشاء sseBroadcaster.ts مع broadcastNewMessage + broadcastAnalysisDone
- [x] ربط waIntegration.ts: بعد حفظ الرسالة يبث SSE event تلقائياً
- [x] إنشاء useWaRealtime hook مع exponential backoff reconnect
- [x] تعديل WaAnalyticsDashboard: debounced refetch + real-time indicator في header
- [x] 189 اختبار ناجح، 0 TypeScript errors

## Bug Fix: إجمالي قيمة الهدر في KitchenProductionPage ✅
- [x] تشخيص: totalWasteValue كان يحسب wasteQty × unitCost فقط بدون consumptionPerUnit للمواد المصنّعة
- [x] إصلاح: totalWasteValue يستخدم نفس منطق wasteCost في PullRow (مع consumptionPerUnit للمصنّعة)
- [x] 0 TypeScript errors

## Feature: قيمة الهدر اليومي في DashboardPage ✅
- [x] إضافة query في getDashboardStats لحساب هدر kitchen_daily_pulls بنفس منطق KitchenProductionPage
- [x] إضافة kitchenWasteCost وtotalWasteCost في todayWaste return
- [x] تحديث بطاقة "هدر اليوم" لعرض الإجمالي (waste_logs + kitchen) مع تفصيل صغير للمطبخ
- [x] 0 TypeScript errors

## Feature: نظام الدفع الجزئي المتعدد
- [ ] إنشاء جدول invoice_payments لتخزين دفعات متعددة لكل فاتورة
- [ ] تعديل backend: procedure لإضافة دفعة جديدة وعرض سجل الدفعات
- [ ] تعديل frontend: عرض سجل الدفعات وإضافة دفعة جديدة مع التاريخ
- [ ] تحديث paidAmount في invoices ليعكس مجموع الدفعات

## Feature: نظام الدفع الجزئي المتعدد ✅
- [x] إضافة queries لجلب تفاصيل الفاتورة مع paymentHistory عند فتح dialog الدفع
- [x] استبدال dialog بنسخة محسّنة تعرض: ملخص الفاتورة (إجمالي/مدفوع/متبقي) + جدول الدفعات السابقة + إضافة دفعة جديدة
- [x] الديالوج لا يغلق بعد كل دفعة حتى يتمكن المستخدم من إضافة دفعات متعددة
- [x] عرض تحذير إذا تجاوز المبلغ المتبقي
- [x] عرض رسالة "تم سداد الفاتورة بالكامل" عند اكتمال السداد
- [x] 189 اختبار ناجح، 0 TypeScript errors

## Feature: حذف الدفعة وإرجاع المبلغ ✅
- [x] إضافة deleteInvoicePayment في db.ts: حذف سجل الدفعة وإعادة حساب paidAmount/remainingAmount/paymentStatus
- [x] إضافة invoices.deletePayment و freeInvoices.deletePayment في routers.ts
- [x] إضافة deletePaymentMutation و deleteFreePaymentMutation في InvoicesPage
- [x] إضافة عمود "حذف" وزر أحمر لكل دفعة مع تأكيد confirm قبل الحذف
- [x] 189 اختبار ناجح، 0 TypeScript errors

## Bug Fix: paidAt بعد حذف الدفعة ✅
- [x] تعديل deleteInvoicePayment: بعد الحذف، جلب آخر دفعة متبقية وتحديث paidAt بتاريخها (أو null إذا لا توجد دفعات)
- [x] تصحيح يدوي لـ FREE-20260414-0004: paidAt = 2026-04-15 (تاريخ آخر دفعة متبقية)

## Bug Fix: DailyAccountDialog - المبلغ المدفوع ✅
- [x] تشخيص: كان يعرض paidAmount (إجمالي كل الدفعات) بدلاً من مبلغ اليوم فقط
- [x] إصلاح partialSupplierRaw وpartialFreeRaw لجلب todayPaid من invoice_payment_history
- [x] إصلاح DATE() إلى DATE_FORMAT() لضمان مقارنة صحيحة مع التواريخ
- [x] 189 اختبار ناجح، 0 TypeScript errors

## Feature: استيراد قوائم الطعام من منصات التوصيل ✅
- [x] إنشاء جداول menu_import_sessions, imported_menu_categories, imported_menu_items في schema
- [x] تطبيق migration على قاعدة البيانات
- [x] بناء menuImportConnectors.ts: استخراج القوائم من Talabat/Keeta/Noon باستخدام Puppeteer + AI
- [x] إضافة menuImportRouter في routers.ts (قبل appRouter لتجنب ReferenceError)
- [x] إضافة procedures: importFromUrl, listSessions, getSessionItems, deleteSession
- [x] بناء MenuImportPage.tsx: input رابط، جدول سجل الاستيرادات، dialog معاينة القائمة
- [x] إضافة route /menu-import في App.tsx
- [x] إضافة رابط "استيراد قوائم الطعام" في sidebar (مجموعة المطبخ)
- [x] إضافة مفاتيح الترجمة في i18n.ts
- [x] كتابة اختبارات vitest (196 اختبار ناجح)

## Bug Fix: استيراد قوائم طلبات لا يسحب البيانات الكاملة
- [x] إصلاح talabatConnector ليقرأ __NEXT_DATA__ JSON مباشرة بدلاً من HTML المقطوع
- [x] استخراج 230 صنف من menuData.items و 14 فئة من menuData.categories
- [x] إضافة baseUrl لإكمال روابط الصور
- [x] اختبار الاستيراد الكامل - 199 اختبار ناجح

## Feature: مقارنة أسعار القوائم بين المطاعم
- [x] إضافة جداول price_comparison_sessions و comparison_matched_items في schema
- [x] تطبيق migration على قاعدة البيانات
- [x] إضافة procedure: createComparison (تحديد مطعمي + المنافسين)
- [x] إضافة procedure: matchItemsWithAI (AI يطابق الأصناف المتشابهة عبر المطاعم)
- [x] إضافة procedure: getComparisonResult (جلب نتيجة المقارنة)
- [x] إضافة procedure: listComparisons (سجل جلسات المقارنة)
- [x] بناء صفحة PriceComparisonPage: اختيار مطاعم من القوائم المستوردة
- [x] جدول مقارنة تفاعلي: صنف × مطعم مع تلوين أرخص/أغلى
- [x] تمييز "مطعمي" بلون مختلف في الجدول
- [x] إضافة route /price-comparison في App.tsx
- [x] إضافة رابط في sidebar
- [x] كتابة اختبارات vitest - 199 اختبار ناجح

## Feature: تحسين AI مطابقة الوصفات في المقارنة
- [x] إعادة كتابة prompt AI ليحلل مسميات الوصفات دلالياً (مش بس نصياً)
- [x] AI يجمع كل أسماء الوصفات من جميع المطاعم (بما فيها مطعمي) ببلوكات منظمة مع تمييز مطعمي
- [x] AI يربط الوصفات المتشابهة معنىً رغم اختلاف المسمى ويشرح سبب المطابقة (matchReason)
- [x] تحديث واجهة عرض نتائج المطابقة: اسم الوصفة الأصلي في كل مطعم + سبب المطابقة
- [x] اختبارات vitest - 199 اختبار ناجح

## Bug Fix: 504 Timeout في runMatching
- [ ] تعديل runMatching ليبدأ المعالجة في الخلفية ويرجع فوراً
- [ ] تقسيم AI matching إلى batches بـ 50 صنف لكل batch
- [ ] polling من الواجهة كل 3 ثوانٍ لمتابعة الحالة

## Bug Fix: المرحل من اليوم السابق في DailyAccountDialog
- [ ] فحص كيفية حساب المرحل من اليوم السابق في DailyAccountDialog.tsx
- [ ] إصلاح المنطق ليجلب رصيد نهاية اليوم السابق الفعلي من قاعدة البيانات
