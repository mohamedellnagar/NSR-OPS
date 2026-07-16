/**
 * Daily Account WhatsApp Notification
 * Sends a WhatsApp summary message + PDF when daily account data is confirmed.
 * Recipients are fetched from report_subscriptions of type "daily_summary_confirmed" with scheduleType "instant".
 * The message is built from the saved template (fullText) with variable substitution.
 * If no template is saved, a built-in default message is used.
 * Updated: 2026-04-16
 */
import mysql from "mysql2/promise";
import { getConn } from "./pool";
import { sendWhatsAppText, sendWhatsAppDocument } from "./whatsapp";
import { generateDailyAccountPDF, type DailyAccountPDFData } from "./pdfGenerator";
import { storagePut } from "./storage";

function fmt(n: number, dec = 2): string {
  const num = Number(n || 0).toFixed(dec);
  const [int, frac] = num.split(".");
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac !== undefined ? `${intFormatted}.${frac}` : intFormatted;
}

function formatDateAr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString("ar-AE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export interface DailyAccountSummaryData {
  accountDate: string;
  salesCash: number;
  salesCard: number;
  salesKita: number;
  salesOrders: number;
  salesNoon: number;
  salesDeliveroo: number;
  salesCareem: number;
  expensesFixed: number;
  expensesSupplierInvoices: number;
  expensesFreeInvoices: number;
  expensesPartial?: number;
  supplyToRestaurant: number;
  supplyToManagement: number;
  supplyExtra: number;
  carryForwardFromPrev: number;
  carryForwardToNext: number;
  staffMeals?: number;
  foodCostPercent?: number;
  restaurantDiff?: number;
  notes?: string;
  // Detailed invoice data for PDF
  supplierInvoices?: DailyAccountPDFData["supplierInvoices"];
  freeInvoices?: DailyAccountPDFData["freeInvoices"];
  partialInvoices?: DailyAccountPDFData["partialInvoices"];
}

interface InventorySnapshot {
  totalValue: number;
  chicken1100: number;
  chicken1200: number;
  chicken1300: number;
  chickenKilo: number;
  beef: number;
  indianMeat: number;
  coal: number;
  gas: number;
  basmatiRice: number;
  rice: number;
  pasta: number;
}

async function fetchInventorySnapshot(conn: mysql.Connection): Promise<InventorySnapshot> {
  const [rows] = await conn.execute(
    `SELECT name, currentQuantity, lastPurchasePrice FROM raw_materials WHERE isActive=1`
  ) as any[];
  const [butcherRows] = await conn.execute(
    `SELECT COALESCE(SUM(currentStock * pricePerUnit),0) AS butcherValue FROM butcher_products WHERE isActive=1`
  ) as any[];
  const [mfgRows] = await conn.execute(
    `SELECT COALESCE(SUM(t.closingBalance * COALESCE(t.actualUnitCost,0)),0) AS mfgValue
     FROM kitchen_daily_production t
     INNER JOIN (SELECT productName, MAX(productionDate) AS maxDate FROM kitchen_daily_production GROUP BY productName) latest
     ON t.productName = latest.productName AND t.productionDate = latest.maxDate`
  ) as any[];

  let rawTotal = 0;
  const snap: InventorySnapshot = { totalValue: 0, chicken1100: 0, chicken1200: 0, chicken1300: 0, chickenKilo: 0, beef: 0, indianMeat: 0, coal: 0, gas: 0, basmatiRice: 0, rice: 0, pasta: 0 };

  for (const r of rows as any[]) {
    const qty = parseFloat(r.currentQuantity ?? 0) || 0;
    const price = parseFloat(r.lastPurchasePrice ?? 0) || 0;
    if (qty > 0) rawTotal += qty * price;
    const name = (r.name ?? "").trim();
    if (name === "دجاج 1100")                                      snap.chicken1100 = qty;
    if (name === "دجاج 1200")                                      snap.chicken1200 = qty;
    if (name === "دجاج 1300")                                      snap.chicken1300 = qty;
    if (name === "دجاج كيلو" || name.includes("دجاج كيلو"))       snap.chickenKilo = qty;
    if (name === "لحم بقري" || name === "Beef")                    snap.beef        = qty;
    if (name === "لحم هندي" || name === "Indian Meat")             snap.indianMeat  = qty;
    if (name === "فحم" || name === "الفحم" || name === "Coal")     snap.coal        = qty;
    if (name === "غاز" || name === "Gas" || name.includes("غاز"))  snap.gas         = qty;
    if (name === "أرز بسمتي" || name === "Basmati Rice"
        || name.includes("ارز بسمتي") || name.includes("أرز بسمتي")) snap.basmatiRice = qty;
    if ((name === "أرز" || name === "Rice") && !name.includes("بسمتي")) snap.rice    = qty;
    if (name === "مكرونة" || name === "Pasta" || name.includes("مكرونة") || name.includes("مكرونه")) snap.pasta = qty;
  }
  const butcherVal = parseFloat((butcherRows as any[])[0]?.butcherValue) || 0;
  const mfgVal = parseFloat((mfgRows as any[])[0]?.mfgValue) || 0;
  snap.totalValue = rawTotal + butcherVal + mfgVal;
  return snap;
}

/**
 * Replace {{variable}} placeholders in a template with actual values.
 */
function applyTemplate(template: string, data: DailyAccountSummaryData): string {
  const totalSales =
    data.salesCash + data.salesCard + data.salesKita +
    data.salesOrders + data.salesNoon + data.salesDeliveroo + data.salesCareem;

  const salesApps =
    data.salesKita + data.salesOrders + data.salesNoon +
    data.salesDeliveroo + data.salesCareem;

  const totalExpenses =
    data.expensesFixed + data.expensesSupplierInvoices + data.expensesFreeInvoices + (data.expensesPartial ?? 0);

  const vars: Record<string, string> = {
    account_date: formatDateAr(data.accountDate),
    sales_cash: fmt(data.salesCash),
    sales_card: fmt(data.salesCard),
    sales_kita: fmt(data.salesKita),
    sales_orders: fmt(data.salesOrders),
    sales_noon: fmt(data.salesNoon),
    sales_deliveroo: fmt(data.salesDeliveroo),
    sales_careem: fmt(data.salesCareem),
    sales_apps: fmt(salesApps),
    total_sales: fmt(totalSales),
    expenses_supplier: fmt(data.expensesSupplierInvoices),
    expenses_free: fmt(data.expensesFreeInvoices),
    expenses_partial: fmt(data.expensesPartial ?? 0),
    expenses_fixed: fmt(data.expensesFixed),
    total_expenses: fmt(totalExpenses),
    supply_restaurant: fmt(data.supplyToRestaurant),
    supply_management: fmt(data.supplyToManagement),
    supply_extra: fmt(data.supplyExtra),
    carry_from_prev: fmt(data.carryForwardFromPrev),
    carry_to_next: fmt(data.carryForwardToNext),
    notes: data.notes ?? "—",
  };

  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/**
 * Build a default message when no template is saved.
 */
function buildDefaultMessage(data: DailyAccountSummaryData, inv?: InventorySnapshot): string {
  const totalSales =
    data.salesCash + data.salesCard + data.salesKita +
    data.salesOrders + data.salesNoon + data.salesDeliveroo + data.salesCareem;

  const totalOpEx = data.expensesSupplierInvoices + data.expensesFreeInvoices + (data.expensesPartial ?? 0);
  const totalNonOpEx = data.expensesFixed;
  const totalExpenses = totalOpEx + totalNonOpEx;

  const sep = "━━━━━━━━━━━━━━━━━━━━━━";
  const lines: string[] = [];

  lines.push(`📊 *ملخص ${formatDateAr(data.accountDate)}*`);
  lines.push(sep);

  // المبيعات
  lines.push(`\n💰 *إجمالي المبيعات: ${fmt(totalSales)} د.إ*`);
  const salesItems = [
    { label: "نقدي",    val: data.salesCash },
    { label: "بطاقة",   val: data.salesCard },
    { label: "كيتا",    val: data.salesKita },
    { label: "أوردرز",  val: data.salesOrders },
    { label: "نون",     val: data.salesNoon },
    { label: "ديليفرو", val: data.salesDeliveroo },
    { label: "كريم",    val: data.salesCareem },
  ].filter(x => x.val > 0);
  lines.push(salesItems.map(x => `${x.label}: ${fmt(x.val)}`).join("  |  "));

  // المصروفات
  lines.push(`\n💸 *المصروفات: ${fmt(totalExpenses)} د.إ*`);
  if (totalOpEx > 0)    lines.push(`تشغيلية: ${fmt(totalOpEx)} د.إ`);
  if (totalNonOpEx > 0) lines.push(`غير تشغيلية: ${fmt(totalNonOpEx)} د.إ`);

  // الفود كوست
  if ((data.foodCostPercent ?? 0) > 0) {
    const pct = data.foodCostPercent!;
    const emoji = pct > 40 ? "🔴" : pct > 30 ? "🟡" : "🟢";
    lines.push(`\n${emoji} *فود كوست: ${pct.toFixed(1)}%*`);
  }

  // المخزون
  if (inv) {
    lines.push(`\n📦 *المخزون الحالي: ${fmt(inv.totalValue)} د.إ*`);

    const chicken = [
      { label: "1100", qty: inv.chicken1100 },
      { label: "1200", qty: inv.chicken1200 },
      { label: "1300", qty: inv.chicken1300 },
      { label: "كيلو", qty: inv.chickenKilo },
    ].filter(x => x.qty > 0);
    if (chicken.length > 0)
      lines.push(`🐔 دجاج: ${chicken.map(c => `${c.label}: ${c.qty} قطعة`).join("  |  ")}`);

    const meats = [
      { label: "لحم بقري", qty: inv.beef },
      { label: "لحم هندي", qty: inv.indianMeat },
    ].filter(x => x.qty > 0);
    if (meats.length > 0)
      lines.push(`🥩 ${meats.map(m => `${m.label}: ${m.qty.toFixed(2)} kg`).join("  |  ")}`);

    const others = [
      { label: "فحم", qty: inv.coal, unit: "قطعة" },
      { label: "غاز", qty: inv.gas,  unit: "أسطوانة" },
    ].filter(x => x.qty > 0);
    if (others.length > 0)
      lines.push(`🔥 ${others.map(o => `${o.label}: ${o.qty} ${o.unit}`).join("  |  ")}`);

    const grains = [
      { label: "أرز بسمتي", qty: inv.basmatiRice },
      { label: "أرز",       qty: inv.rice },
      { label: "مكرونة",    qty: inv.pasta },
    ].filter(x => x.qty > 0);
    if (grains.length > 0)
      lines.push(`🌾 ${grains.map(g => `${g.label}: ${g.qty.toFixed(2)} kg`).join("  |  ")}`);
  }

  // نسبة المطعم
  lines.push(`\n${sep}`);
  if (data.restaurantDiff != null) {
    const diff = data.restaurantDiff;
    const sign = diff >= 0 ? "+" : "";
    const dir = diff >= 0 ? "للمطعم 🟢" : "على المطعم 🔴";
    lines.push(`💵 *نسبة المطعم: ${sign}${fmt(diff)} د.إ — ${dir}*`);
  }

  if (data.notes) lines.push(`\n📝 ${data.notes}`);
  lines.push(`📎 _تفاصيل الفواتير مرفقة_`);

  return lines.join("\n");
}

/**
 * Send daily account summary to all active subscribers of type "daily_account_summary".
 * Fire-and-forget — errors are logged but not thrown.
 */
export async function sendDailyAccountNotification(
  data: DailyAccountSummaryData
): Promise<void> {
  const conn = await getConn();
  try {
    // Get WhatsApp config
    const [settingsRows] = await conn.execute(
      "SELECT * FROM whatsapp_settings WHERE isConfigured = 1 LIMIT 1"
    );
    const settings = (settingsRows as any[])[0];
    if (!settings?.evolutionApiUrl || !settings?.evolutionApiKey || !settings?.evolutionInstance) {
      console.log("[DailyAccountNotif] WhatsApp not configured, skipping.");
      return;
    }

    // Get recipients from active subscriptions of type daily_summary_confirmed
    const [recipientRows] = await conn.execute(
      `SELECT DISTINCT rr.phoneNumber, rr.name
       FROM report_recipients rr
       JOIN report_subscriptions rs ON rr.subscriptionId = rs.id
       WHERE rs.isActive = 1 AND rs.reportType = 'daily_summary_confirmed'`
    );
    const recipients = (recipientRows as any[]).map((r) => ({
      phoneNumber: r.phoneNumber as string,
      name: r.name as string | undefined,
    }));

    if (recipients.length === 0) {
      console.log("[DailyAccountNotif] No recipients for daily_summary_confirmed, skipping.");
      return;
    }

    // Try to load saved template for daily_summary_confirmed
    const [templateRows] = await conn.execute(
      `SELECT full_text FROM report_templates
       WHERE reportType = 'daily_summary_confirmed' AND full_text IS NOT NULL
       ORDER BY id DESC LIMIT 1`
    );
    const savedTemplate = (templateRows as any[])[0]?.full_text as string | undefined;

    // جلب بيانات المخزون الحالي
    const inv = await fetchInventorySnapshot(conn);

    // Build message: use saved template with variable substitution, or fallback to default
    const message = savedTemplate
      ? applyTemplate(savedTemplate, data)
      : buildDefaultMessage(data, inv);

    const config = {
      apiUrl: settings.evolutionApiUrl as string,
      apiKey: settings.evolutionApiKey as string,
      instance: settings.evolutionInstance as string,
    };

    // Fetch invoice details from DB for the given date (always fresh from DB)
    let supplierInvoices: DailyAccountSummaryData['supplierInvoices'] = [];
    let freeInvoices: DailyAccountSummaryData['freeInvoices'] = [];
    let partialInvoices: DailyAccountSummaryData['partialInvoices'] = [];
    let totalExpensesFromDB = 0;
    try {
      // All supplier invoices (paid + partial + deferred) with their items
      const [suppRows] = await conn.execute(
        `SELECT i.id, i.invoiceNumber, s.name as supplierName, i.totalAmount, i.paymentStatus,
         COALESCE(i.paidAmount, 0) as paidAmount
         FROM invoices i LEFT JOIN suppliers s ON i.supplierId = s.id
         WHERE DATE(i.invoiceDate) = ?`,
        [data.accountDate]
      );
      for (const r of suppRows as any[]) {
        // Skip under_review invoices - no financial impact
        if (r.paymentStatus === 'under_review') continue;
        // Fetch items for this invoice
        const [itemRows] = await conn.execute(
          `SELECT materialName as description, quantity as qty, unitPrice, totalPrice as total
           FROM invoice_items WHERE invoiceId = ?`,
          [r.id]
        );
        const items = (itemRows as any[]).map((it: any) => ({
          description: String(it.description ?? ''),
          qty: Number(it.qty),
          unitPrice: Number(it.unitPrice),
          total: Number(it.total),
        }));
        const displayAmount = r.paymentStatus === 'partial'
          ? Number(r.paidAmount)
          : Number(r.totalAmount);
        totalExpensesFromDB += displayAmount;
        if (r.paymentStatus === 'partial') {
          partialInvoices.push({
            supplierName: String(r.supplierName ?? r.invoiceNumber ?? ''),
            invoiceNumber: r.invoiceNumber ?? null,
            totalAmount: Number(r.totalAmount),
            paidAmount: Number(r.paidAmount),
            items,
          });
        } else {
          supplierInvoices.push({
            supplierName: String(r.supplierName ?? r.invoiceNumber ?? ''),
            invoiceNumber: r.invoiceNumber ?? null,
            totalAmount: Number(r.totalAmount),
            items,
          });
        }
      }
      // All free invoices with their items
      const [freeRows] = await conn.execute(
        `SELECT id, supplierName, totalAmount, paymentStatus,
         COALESCE(paidAmount, 0) as paidAmount, expenseCategory
         FROM free_invoices WHERE DATE(date) = ?`,
        [data.accountDate]
      );
      for (const r of freeRows as any[]) {
        const [itemRows] = await conn.execute(
          `SELECT description, qty, unitPrice, total
           FROM free_invoice_items WHERE invoiceId = ?`,
          [r.id]
        );
        const items = (itemRows as any[]).map((it: any) => ({
          description: String(it.description ?? ''),
          qty: Number(it.qty),
          unitPrice: Number(it.unitPrice),
          total: Number(it.total),
        }));
        const displayAmount = r.paymentStatus === 'partial'
          ? Number(r.paidAmount)
          : Number(r.totalAmount);
        totalExpensesFromDB += displayAmount;
        freeInvoices.push({
          supplierName: String(r.supplierName ?? ''),
          invoiceNumber: null,
          totalAmount: displayAmount,
          expenseCategory: String(r.expenseCategory ?? ''),
          items,
        });
      }
      console.log(`[DailyAccountNotif] Fetched: ${supplierInvoices.length} supplier, ${freeInvoices.length} free, ${partialInvoices.length} partial — total expenses: ${totalExpensesFromDB}`);
    } catch (fetchErr) {
      console.error('[DailyAccountNotif] Failed to fetch invoices from DB:', fetchErr);
      // Fallback to passed data
      supplierInvoices = data.supplierInvoices ?? [];
      freeInvoices = data.freeInvoices ?? [];
      partialInvoices = data.partialInvoices ?? [];
      totalExpensesFromDB = data.expensesSupplierInvoices + data.expensesFreeInvoices + (data.expensesPartial ?? 0);
    }

    // Generate PDF and upload to S3
    let pdfUrl: string | null = null;
    try {
      const pdfBuffer = await generateDailyAccountPDF({
        accountDate: data.accountDate,
        salesCash: data.salesCash,
        salesCard: data.salesCard,
        salesKita: data.salesKita,
        salesOrders: data.salesOrders,
        salesNoon: data.salesNoon,
        salesDeliveroo: data.salesDeliveroo,
        salesCareem: data.salesCareem,
        expensesFixed: data.expensesFixed,
        expensesSupplierInvoices: supplierInvoices.reduce((s, inv) => s + (inv.totalAmount ?? 0), 0),
        expensesFreeInvoices: freeInvoices.reduce((s, inv) => s + (inv.totalAmount ?? 0), 0),
        expensesPartial: partialInvoices.reduce((s, inv) => s + ((inv as any).paidAmount ?? inv.totalAmount ?? 0), 0),
        supplyToRestaurant: data.supplyToRestaurant,
        supplyToManagement: data.supplyToManagement,
        supplyExtra: data.supplyExtra,
        carryForwardFromPrev: data.carryForwardFromPrev,
        carryForwardToNext: data.carryForwardToNext,
        notes: data.notes,
        supplierInvoices,
        freeInvoices: freeInvoices as any,
        partialInvoices,
      });
      const fileKey = `daily-reports/daily-account-${data.accountDate}-${Date.now()}.pdf`;
      const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
      pdfUrl = url;
      console.log(`[DailyAccountNotif] PDF generated and uploaded: ${pdfUrl}`);
    } catch (pdfErr) {
      console.error("[DailyAccountNotif] Failed to generate/upload PDF:", pdfErr);
    }

    // Send to all recipients (fire-and-forget per recipient)
    for (const recipient of recipients) {
      // Send text message first
      sendWhatsAppText(config, recipient.phoneNumber, message)
        .then((result) => {
          if (result.success) {
            console.log(`[DailyAccountNotif] Text sent to ${recipient.phoneNumber} — msgId: ${result.messageId}`);
          } else {
            console.error(`[DailyAccountNotif] Failed text to ${recipient.phoneNumber}: ${result.error}`);
          }
        })
        .catch((err) => {
          console.error(`[DailyAccountNotif] Error sending text to ${recipient.phoneNumber}:`, err);
        });

      // Send PDF document if available
      if (pdfUrl) {
        const pdfCaption = `📊 تقرير اليوم التشغيلي — ${data.accountDate}`;
        const fileName = `تقرير-${data.accountDate}.pdf`;
        setTimeout(() => {
          sendWhatsAppDocument(config, recipient.phoneNumber, pdfUrl!, pdfCaption, fileName)
            .then((result) => {
              if (result.success) {
                console.log(`[DailyAccountNotif] PDF sent to ${recipient.phoneNumber} — msgId: ${result.messageId}`);
              } else {
                console.error(`[DailyAccountNotif] Failed PDF to ${recipient.phoneNumber}: ${result.error}`);
              }
            })
            .catch((err) => {
              console.error(`[DailyAccountNotif] Error sending PDF to ${recipient.phoneNumber}:`, err);
            });
        }, 2000); // 2s delay after text message
      }
    }
  } catch (err) {
    console.error("[DailyAccountNotif] Unexpected error:", err);
  } finally {
    await conn.end();
  }
}
