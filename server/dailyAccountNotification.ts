/**
 * Daily Account WhatsApp Notification
 * Sends a WhatsApp summary message + PDF when daily account data is confirmed.
 * Recipients are fetched from report_subscriptions of type "daily_summary_confirmed" with scheduleType "instant".
 * The message is built from the saved template (fullText) with variable substitution.
 * If no template is saved, a built-in default message is used.
 * Updated: 2026-04-16
 */
import mysql from "mysql2/promise";
import { sendWhatsAppText, sendWhatsAppDocument } from "./whatsapp";
import { generateDailyAccountPDF, type DailyAccountPDFData } from "./pdfGenerator";
import { storagePut } from "./storage";

async function getConn() {
  return mysql.createConnection(process.env.DATABASE_URL!);
}

function fmt(n: number, dec = 2): string {
  return Number(n || 0).toLocaleString("ar-AE", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
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
  notes?: string;
  // Detailed invoice data for PDF
  supplierInvoices?: DailyAccountPDFData["supplierInvoices"];
  freeInvoices?: DailyAccountPDFData["freeInvoices"];
  partialInvoices?: DailyAccountPDFData["partialInvoices"];
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
function buildDefaultMessage(data: DailyAccountSummaryData): string {
  const totalSales =
    data.salesCash + data.salesCard + data.salesKita +
    data.salesOrders + data.salesNoon + data.salesDeliveroo + data.salesCareem;

  const totalExpenses =
    data.expensesFixed + data.expensesSupplierInvoices + data.expensesFreeInvoices + (data.expensesPartial ?? 0);

  const lines: string[] = [];
  lines.push(`📊 *ملخص بيانات اليوم*`);
  lines.push(`📅 ${formatDateAr(data.accountDate)}`);
  lines.push(`${"─".repeat(28)}`);

  // المبيعات
  lines.push(`\n💰 *المبيعات اليومية*`);
  if (data.salesCash > 0) lines.push(`  • نقدي: ${fmt(data.salesCash)} د.إ`);
  if (data.salesCard > 0) lines.push(`  • بطاقة: ${fmt(data.salesCard)} د.إ`);
  if (data.salesKita > 0) lines.push(`  • كيتا: ${fmt(data.salesKita)} د.إ`);
  if (data.salesOrders > 0) lines.push(`  • أوردرز: ${fmt(data.salesOrders)} د.إ`);
  if (data.salesNoon > 0) lines.push(`  • نون: ${fmt(data.salesNoon)} د.إ`);
  if (data.salesDeliveroo > 0) lines.push(`  • ديليفرو: ${fmt(data.salesDeliveroo)} د.إ`);
  if (data.salesCareem > 0) lines.push(`  • كريم: ${fmt(data.salesCareem)} د.إ`);
  lines.push(`  ✅ *الإجمالي: ${fmt(totalSales)} د.إ*`);

  // المصروفات
  if (totalExpenses > 0) {
    lines.push(`\n🔴 *المصروفات*`);
    if (data.expensesSupplierInvoices > 0)
      lines.push(`  • موردين: ${fmt(data.expensesSupplierInvoices)} د.إ`);
    if (data.expensesFreeInvoices > 0)
      lines.push(`  • فواتير حرة: ${fmt(data.expensesFreeInvoices)} د.إ`);
    if ((data.expensesPartial ?? 0) > 0)
      lines.push(`  • دفع جزئي: ${fmt(data.expensesPartial ?? 0)} د.إ`);
    if (data.expensesFixed > 0)
      lines.push(`  • مصروفات ثابتة: ${fmt(data.expensesFixed)} د.إ`);
    lines.push(`  ❌ *الإجمالي: ${fmt(totalExpenses)} د.إ*`);
  }

  // التوريدات
  const hasSupply =
    data.supplyToRestaurant > 0 || data.supplyToManagement > 0 || data.supplyExtra > 0;
  if (hasSupply) {
    lines.push(`\n🔄 *التوريدات*`);
    if (data.supplyToRestaurant > 0)
      lines.push(`  • للمطعم (+): ${fmt(data.supplyToRestaurant)} د.إ`);
    if (data.supplyToManagement > 0)
      lines.push(`  • للإدارة (-): ${fmt(data.supplyToManagement)} د.إ`);
    if (data.supplyExtra > 0)
      lines.push(`  • إضافي (+): ${fmt(data.supplyExtra)} د.إ`);
  }

  // الرصيد النقدي
  lines.push(`\n💵 *الرصيد النقدي*`);
  lines.push(`  • مرحّل من السابق: ${fmt(data.carryForwardFromPrev)} د.إ`);
  lines.push(`  • المرحّل لليوم التالي: *${fmt(data.carryForwardToNext)} د.إ*`);

  lines.push(`${"─".repeat(28)}`);

  if (data.notes) {
    lines.push(`📝 ملاحظات: ${data.notes}`);
  }

  lines.push(`\n📎 _تفاصيل الفواتير مرفقة في ملف PDF_`);

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

    // Build message: use saved template with variable substitution, or fallback to default
    const message = savedTemplate
      ? applyTemplate(savedTemplate, data)
      : buildDefaultMessage(data);

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
