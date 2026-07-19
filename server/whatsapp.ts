/**
 * Evolution API WhatsApp Integration
 * Handles sending WhatsApp messages via Evolution API
 */

interface EvolutionConfig {
  apiUrl: string;
  apiKey: string;
  instance: string;
}

interface SendTextResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Blocks every outbound WhatsApp send when DISABLE_BACKGROUND_JOBS=true.
 *
 * Guarding the transport itself rather than each caller: messages are sent from
 * the scheduler, daily-account notifications and event subscriptions, and a
 * dev server pointed at a production database would otherwise message real
 * customers from a developer's laptop.
 */
function outboundBlocked(): boolean {
  return process.env.DISABLE_BACKGROUND_JOBS === "true";
}

export async function sendWhatsAppText(
  config: EvolutionConfig,
  phoneNumber: string,
  message: string
): Promise<SendTextResult> {
  if (outboundBlocked()) {
    console.warn(`[Safety] blocked WhatsApp text to ${phoneNumber} (DISABLE_BACKGROUND_JOBS=true)`);
    return { success: false, error: "الإرسال معطّل (DISABLE_BACKGROUND_JOBS)" } as SendTextResult;
  }
  try {
    // Normalize phone number: remove spaces, dashes, +
    const normalizedPhone = phoneNumber.replace(/[\s\-\+]/g, "");
    
    const url = `${config.apiUrl.replace(/\/$/, "")}/message/sendText/${config.instance}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": config.apiKey,
      },
      body: JSON.stringify({
        number: normalizedPhone,
        text: message,
        delay: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
      };
    }

    const data = await response.json() as { key?: { id?: string } };
    return {
      success: true,
      messageId: data?.key?.id,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function checkEvolutionConnection(config: EvolutionConfig): Promise<{ connected: boolean; error?: string }> {
  try {
    const url = `${config.apiUrl.replace(/\/$/, "")}/instance/connectionState/${config.instance}`;
    const response = await fetch(url, {
      headers: { "apikey": config.apiKey },
    });
    if (!response.ok) {
      return { connected: false, error: `HTTP ${response.status}` };
    }
    const data = await response.json() as { instance?: { state?: string } };
    const state = data?.instance?.state;
    return { connected: state === "open" };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

import * as mysql from "mysql2/promise";

import { getConn } from "./pool";
interface InvoiceReportData {
  // تفاصيل الفاتورة
  invoiceNumber: string;
  supplierName: string;
  invoiceDate: string;
  expenseCategory: string;
  paymentStatus: string;
  totalAmount: number;
  paidAmount?: number;
  notes?: string;
  eventType: "new" | "paid"; // نوع الحدث: فاتورة جديدة أم تغيير حالة
  // الإجماليات
  grandTotal: number;
  totalPaid: number;
  totalDeferred: number;
  totalOperational: number;
  totalMaintenance: number;
  totalFixed: number;
  totalOther: number;
}

function formatAmount(amount: number): string {
  return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    operational: "تشغيلية",
    maintenance: "صيانة",
    fixed: "ثابتة",
    other: "أخرى",
  };
  return map[cat] || cat;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    paid: "✅ مدفوعة",
    deferred: "⏳ مؤجلة",
    partial: "🔶 جزئي",
  };
  return map[status] || status;
}

export function buildInvoiceReportMessage(data: InvoiceReportData): string {
  const header = data.eventType === "new"
    ? "🧾 *فاتورة جديدة*"
    : "💳 *تم تسجيل دفع فاتورة*";

  const lines = [
    header,
    "─────────────────────",
    `📌 *رقم الفاتورة:* ${data.invoiceNumber}`,
    `🏪 *المورد/الجهة:* ${data.supplierName}`,
    `📅 *التاريخ:* ${data.invoiceDate}`,
    `🏷️ *التصنيف:* ${categoryLabel(data.expenseCategory)}`,
    `💰 *المبلغ الإجمالي:* ${formatAmount(data.totalAmount)} د.إ`,
    `📊 *الحالة:* ${statusLabel(data.paymentStatus)}`,
  ];

  if (data.paidAmount && data.paidAmount > 0 && data.paymentStatus !== "paid") {
    lines.push(`💵 *المدفوع:* ${formatAmount(data.paidAmount)} د.إ`);
  }

  if (data.notes) {
    lines.push(`📝 *ملاحظة:* ${data.notes}`);
  }

  lines.push(
    "",
    "─────────────────────",
    "📈 *ملخص الفواتير الكلي*",
    `🛒 إجمالي المشتريات: *${formatAmount(data.grandTotal)} د.إ*`,
    "",
    "📂 *التوزيع حسب التصنيف:*",
    `  ⚙️ تشغيلية: ${formatAmount(data.totalOperational)} د.إ`,
    `  🔧 صيانة: ${formatAmount(data.totalMaintenance)} د.إ`,
    `  📌 ثابتة: ${formatAmount(data.totalFixed)} د.إ`,
    `  📦 أخرى: ${formatAmount(data.totalOther)} د.إ`,
    "",
    "💳 *حالة المدفوعات:*",
    `  ✅ مدفوع: ${formatAmount(data.totalPaid)} د.إ`,
    `  ⏳ ديون: ${formatAmount(data.totalDeferred)} د.إ`,
    "─────────────────────",
  );

  return lines.join("\n");
}

/**
 * Replace {{variable}} placeholders in a template with actual values.
 */
function applyInvoiceTemplate(template: string, data: InvoiceReportData): string {
  const replacements: Record<string, string> = {
    invoice_number:    data.invoiceNumber,
    supplier_name:     data.supplierName,
    invoice_date:      data.invoiceDate,
    expense_category:  categoryLabel(data.expenseCategory),
    total_amount:      formatAmount(data.totalAmount),
    payment_status:    statusLabel(data.paymentStatus),
    paid_amount:       data.paidAmount ? formatAmount(data.paidAmount) : '0.00',
    notes:             data.notes ?? '',
    grand_total:       formatAmount(data.grandTotal),
    total_paid:        formatAmount(data.totalPaid),
    total_deferred:    formatAmount(data.totalDeferred),
    total_operational: formatAmount(data.totalOperational),
    total_maintenance: formatAmount(data.totalMaintenance),
    total_fixed:       formatAmount(data.totalFixed),
    total_other:       formatAmount(data.totalOther),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => replacements[key] ?? `{{${key}}}`);
}

export async function sendInvoiceWhatsAppReport(data: InvoiceReportData): Promise<void> {
  try {
    const conn = await getConn();

    // جلب إعدادات واتساب
    const [settingsRows] = await conn.execute(
      "SELECT evolutionApiUrl, evolutionApiKey, evolutionInstance FROM whatsapp_settings WHERE isConfigured=1 LIMIT 1"
    ) as [any[], any];

    if (!settingsRows.length) {
      await conn.release();
      return;
    }

    const config: EvolutionConfig = {
      apiUrl: settingsRows[0].evolutionApiUrl,
      apiKey: settingsRows[0].evolutionApiKey,
      instance: settingsRows[0].evolutionInstance,
    };

    // تحديد نوع القالب بناءً على نوع الحدث ونوع الفاتورة
    // نوع الفاتورة: إذا كان invoiceNumber يبدأ بـ FREE- أو supplierName موجود بدون رقم فاتورة مورد
    // نستخدم eventType فقط لأن كلا النوعين يستخدمان نفس الدالة
    const isFreeInvoice = data.invoiceNumber?.startsWith('FREE-') || data.invoiceNumber?.startsWith('free-');
    const reportType = data.eventType === 'new'
      ? (isFreeInvoice ? 'free_invoice_new' : 'supplier_invoice_new')
      : (isFreeInvoice ? 'free_invoice_paid' : 'supplier_invoice_paid');

    // جلب القالب من قاعدة البيانات (إذا وُجد)
    const [templateRows] = await conn.execute(
      "SELECT full_text FROM report_templates WHERE reportType=? AND full_text IS NOT NULL ORDER BY updatedAt DESC LIMIT 1",
      [reportType]
    ) as [any[], any];

    // جلب المستلمين من الاشتراكات النشطة لهذا النوع
    const [subRecipientRows] = await conn.execute(
      `SELECT DISTINCT rr.phoneNumber, rr.name
       FROM report_recipients rr
       JOIN report_subscriptions rs ON rr.subscriptionId = rs.id
       WHERE rs.isActive = 1 AND rs.reportType = ?`,
      [reportType]
    ) as [any[], any];

    // إذا لم يوجد اشتراك خاص بهذا النوع، نرجع لجميع المستلمين (السلوك القديم)
    let recipientRows: any[];
    if (subRecipientRows.length > 0) {
      recipientRows = subRecipientRows;
    } else {
      const [allRecipients] = await conn.execute(
        "SELECT DISTINCT phoneNumber, name FROM report_recipients"
      ) as [any[], any];
      recipientRows = allRecipients;
    }

    await conn.release();

    if (!recipientRows.length) return;

    // بناء الرسالة: من القالب المحفوظ أو الـ fallback
    let message: string;
    if (templateRows.length > 0 && templateRows[0].full_text) {
      message = applyInvoiceTemplate(templateRows[0].full_text, data);
    } else {
      message = buildInvoiceReportMessage(data);
    }

    // إرسال لكل مستلم
    for (const recipient of recipientRows) {
      await sendWhatsAppText(config, recipient.phoneNumber, message);
    }
  } catch (err) {
    console.error("[InvoiceWhatsApp] Error sending report:", err);
  }
}

export async function getInvoiceTotals(): Promise<{
  grandTotal: number;
  totalPaid: number;
  totalDeferred: number;
  totalOperational: number;
  totalMaintenance: number;
  totalFixed: number;
  totalOther: number;
}> {
  const conn = await getConn();
  const sql = [
    "SELECT",
    "COALESCE(SUM(totalAmount), 0) as grandTotal,",
    "COALESCE(SUM(CASE WHEN paymentStatus='paid' THEN totalAmount ELSE 0 END), 0) as totalPaid,",
    "COALESCE(SUM(CASE WHEN paymentStatus IN ('deferred','partial') THEN totalAmount ELSE 0 END), 0) as totalDeferred,",
    "COALESCE(SUM(CASE WHEN expenseCategory='operational' THEN totalAmount ELSE 0 END), 0) as totalOperational,",
    "COALESCE(SUM(CASE WHEN expenseCategory='maintenance' THEN totalAmount ELSE 0 END), 0) as totalMaintenance,",
    "COALESCE(SUM(CASE WHEN expenseCategory='fixed' THEN totalAmount ELSE 0 END), 0) as totalFixed,",
    "COALESCE(SUM(CASE WHEN expenseCategory='other' OR expenseCategory IS NULL THEN totalAmount ELSE 0 END), 0) as totalOther",
    "FROM (SELECT totalAmount, paymentStatus, expenseCategory FROM invoices UNION ALL SELECT totalAmount, paymentStatus, expenseCategory FROM free_invoices) combined"
  ].join(" ");
  const [rows] = await conn.execute(sql) as [any[], any];
  await conn.release();
  const r = rows[0];
  return {
    grandTotal: parseFloat(r.grandTotal),
    totalPaid: parseFloat(r.totalPaid),
    totalDeferred: parseFloat(r.totalDeferred),
    totalOperational: parseFloat(r.totalOperational),
    totalMaintenance: parseFloat(r.totalMaintenance),
    totalFixed: parseFloat(r.totalFixed),
    totalOther: parseFloat(r.totalOther),
  };
}

/**
 * Send a document (PDF) via WhatsApp using Evolution API sendMedia endpoint.
 * @param config  Evolution API config
 * @param phoneNumber  Recipient phone number
 * @param mediaUrl  Public URL of the PDF file
 * @param caption  Caption text to accompany the document
 * @param fileName  File name shown in WhatsApp (e.g. "daily-report.pdf")
 */
export async function sendWhatsAppDocument(
  config: EvolutionConfig,
  phoneNumber: string,
  mediaUrl: string,
  caption: string,
  fileName = "report.pdf"
): Promise<SendTextResult> {
  if (outboundBlocked()) {
    console.warn(`[Safety] blocked WhatsApp document to ${phoneNumber} (DISABLE_BACKGROUND_JOBS=true)`);
    return { success: false, error: "الإرسال معطّل (DISABLE_BACKGROUND_JOBS)" } as SendTextResult;
  }
  try {
    const normalizedPhone = phoneNumber.replace(/[\s\-\+]/g, "");
    const url = `${config.apiUrl.replace(/\/$/, "")}/message/sendMedia/${config.instance}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": config.apiKey,
      },
      body: JSON.stringify({
        number: normalizedPhone,
        mediatype: "document",
        media: mediaUrl,
        caption,
        fileName,
        delay: 1200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText.slice(0, 200)}` };
    }

    const data = await response.json() as { key?: { id?: string } };
    return { success: true, messageId: data?.key?.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
