/**
 * WhatsApp Report Scheduler
 * Cron-based scheduler that sends WhatsApp reports automatically
 */

import mysql from "mysql2/promise";
import { getConn } from "./pool";
import { sendWhatsAppText, sendWhatsAppDocument } from "./whatsapp";
import { generateReport, generateReportFromFullText } from "./reportGenerators";
import { generateDailyAccountPDF } from "./pdfGenerator";
import { storagePut } from "./storage";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

function shouldRunNow(sub: {
  scheduleType: string;
  scheduleHour: number | null;
  scheduleDay: number | null;
  scheduleEveryHours: number | null;
}, now: Date): boolean {
  const hour = now.getHours();
  const minute = now.getMinutes();
  const dayOfWeek = now.getDay(); // 0=Sunday
  const dayOfMonth = now.getDate();

  // Only trigger at minute 0 of each hour
  if (minute !== 0) return false;

  switch (sub.scheduleType) {
    case "hourly": {
      const every = sub.scheduleEveryHours ?? 4;
      return hour % every === 0;
    }
    case "daily": {
      return hour === (sub.scheduleHour ?? 8);
    }
    case "weekly": {
      return hour === (sub.scheduleHour ?? 8) && dayOfWeek === (sub.scheduleDay ?? 1);
    }
    case "monthly": {
      return hour === (sub.scheduleHour ?? 8) && dayOfMonth === (sub.scheduleDay ?? 1);
    }
    default:
      return false;
  }
}

async function processSubscription(sub: any, config: any): Promise<void> {
  const conn = await getConn();
  try {
    // Get recipients
    const [recipients] = await conn.execute(
      "SELECT phoneNumber, name FROM report_recipients WHERE subscriptionId = ?",
      [sub.id]
    );
    const recipientList = recipients as any[];
    if (!recipientList.length) return;

    // Fetch template: prefer templateId, fallback to reportType
    let tmplRow: any = null;
    if (sub.templateId) {
      const [tr] = await conn.execute('SELECT * FROM report_templates WHERE id=? LIMIT 1', [sub.templateId]);
      tmplRow = (tr as any[])[0] ?? null;
    }
    if (!tmplRow) {
      const [tr] = await conn.execute('SELECT * FROM report_templates WHERE reportType=? ORDER BY updatedAt DESC LIMIT 1', [sub.reportType]);
      tmplRow = (tr as any[])[0] ?? null;
    }

    // Generate report content
    let message: string;
    if (tmplRow?.full_text) {
      const validTypes = ['daily_sales','orders_summary','kitchen_cost','inventory_value','waste_summary','system_alerts','warehouse_performance'];
      const rt = validTypes.includes(tmplRow.reportType) ? tmplRow.reportType : 'daily_sales';
      message = await generateReportFromFullText(tmplRow.full_text, rt as any);
    } else {
      const validTypes = ['daily_sales','orders_summary','kitchen_cost','inventory_value','waste_summary','system_alerts','warehouse_performance'];
      const rt = validTypes.includes(sub.reportType) ? sub.reportType : 'daily_sales';
      message = await generateReport(rt as any, tmplRow);
    }

    // Send to each recipient
    for (const recipient of recipientList) {
      const logId = await createLog(conn, sub.id, recipient.phoneNumber, message);
      const result = await sendWhatsAppText(
        { apiUrl: config.evolutionApiUrl, apiKey: config.evolutionApiKey, instance: config.evolutionInstance },
        recipient.phoneNumber,
        message
      );
      await updateLog(conn, logId, result.success ? "sent" : "failed", result.error);
    }
  } finally {
    await conn.end();
  }
}

async function createLog(conn: mysql.Connection, subscriptionId: number, phone: string, message: string): Promise<number> {
  const [result] = await conn.execute(
    "INSERT INTO report_logs (subscriptionId, status, recipientPhone, messageContent) VALUES (?, 'pending', ?, ?)",
    [subscriptionId, phone, message]
  ) as any[];
  return result.insertId;
}

async function updateLog(conn: mysql.Connection, logId: number, status: string, errorMessage?: string): Promise<void> {
  await conn.execute(
    "UPDATE report_logs SET status = ?, errorMessage = ?, sentAt = NOW() WHERE id = ?",
    [status, errorMessage ?? null, logId]
  );
}

export async function runSchedulerTick(): Promise<void> {
  const conn = await getConn();
  try {
    // Get WhatsApp settings
    const [settingsRows] = await conn.execute(
      "SELECT * FROM whatsapp_settings WHERE isConfigured = 1 LIMIT 1"
    );
    const settings = (settingsRows as any[])[0];
    if (!settings) return;

    // Get active subscriptions
    const [subs] = await conn.execute(
      "SELECT * FROM report_subscriptions WHERE isActive = 1"
    );
    const subscriptions = subs as any[];

    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // ── Daily 08:00 — expiry alert for materials expiring within 3 days ──
    if (hour === 8 && minute === 0) {
      triggerEventSubscriptions("expiry_alert", {}).catch(console.error);
    }

    // ── Daily 23:00 — daily closing summary ──
    if (hour === 23 && minute === 0) {
      triggerEventSubscriptions("daily_closing_report", {}).catch(console.error);
    }

    for (const sub of subscriptions) {
      if (shouldRunNow(sub, now)) {
        processSubscription(sub, settings).catch(console.error);
      }
    }
  } catch (err) {
    console.error("[WhatsApp Scheduler] Error:", err);
  } finally {
    await conn.end();
  }
}

export async function sendReportNow(subscriptionId: number): Promise<{ success: boolean; sent: number; failed: number; message: string }> {
  const conn = await getConn();
  try {
    const [settingsRows] = await conn.execute(
      "SELECT * FROM whatsapp_settings WHERE isConfigured = 1 LIMIT 1"
    );
    const settings = (settingsRows as any[])[0];
    if (!settings) {
      return { success: false, sent: 0, failed: 0, message: "لم يتم إعداد Evolution API بعد" };
    }

    const [subRows] = await conn.execute(
      "SELECT * FROM report_subscriptions WHERE id = ?",
      [subscriptionId]
    );
    const sub = (subRows as any[])[0];
    if (!sub) {
      return { success: false, sent: 0, failed: 0, message: "الاشتراك غير موجود" };
    }

    const [recipients] = await conn.execute(
      "SELECT phoneNumber, name FROM report_recipients WHERE subscriptionId = ?",
      [subscriptionId]
    );
    const recipientList = recipients as any[];
    if (!recipientList.length) {
      return { success: false, sent: 0, failed: 0, message: "لا يوجد مستلمون مضافون" };
    }

    // Fetch template: prefer templateId, fallback to reportType
    let tmplRow2: any = null;
    if (sub.templateId) {
      const [tr] = await conn.execute('SELECT * FROM report_templates WHERE id=? LIMIT 1', [sub.templateId]);
      tmplRow2 = (tr as any[])[0] ?? null;
    }
    if (!tmplRow2) {
      const [tr] = await conn.execute('SELECT * FROM report_templates WHERE reportType=? ORDER BY updatedAt DESC LIMIT 1', [sub.reportType]);
      tmplRow2 = (tr as any[])[0] ?? null;
    }

    const allValidTypes = ['daily_sales','orders_summary','kitchen_cost','inventory_value','waste_summary','system_alerts','warehouse_performance','daily_account_summary'];
    let message: string;
    if (tmplRow2?.full_text) {
      const rt = allValidTypes.includes(tmplRow2.reportType) ? tmplRow2.reportType : 'daily_sales';
      message = await generateReportFromFullText(tmplRow2.full_text, rt as any);
    } else {
      const rt = allValidTypes.includes(sub.reportType) ? sub.reportType : 'daily_sales';
      message = await generateReport(rt as any, tmplRow2);
    }

    // Generate PDF for daily_account_summary or daily_summary_confirmed
    let pdfUrl: string | null = null;
    let pdfAccountDate: string | null = null; // The report date (not today's date)
    if (sub.reportType === 'daily_account_summary' || sub.reportType === 'daily_summary_confirmed') {
      try {
        console.log('[WhatsApp Scheduler] Generating PDF for daily_account_summary...');
        // Use the most recently saved daily account (not necessarily today)
        const [daRows] = await conn.execute(
          'SELECT * FROM daily_accounts ORDER BY accountDate DESC LIMIT 1'
        );
        const da = (daRows as any[])[0];
        const today = da?.accountDate instanceof Date
          ? da.accountDate.toISOString().split('T')[0]
          : da?.accountDate ? String(da.accountDate).split('T')[0] : new Date().toISOString().split('T')[0];
        console.log(`[WhatsApp Scheduler] Using daily account date: ${today}, found: ${!!da}`);
        if (da) {
          // Get supplier invoices with items (exclude under_review)
          const [suppRows] = await conn.execute(
            `SELECT i.id, i.invoiceNumber, s.name as supplierName, i.totalAmount, i.paymentStatus,
             COALESCE(i.paidAmount, 0) as paidAmount
             FROM invoices i LEFT JOIN suppliers s ON i.supplierId = s.id
             WHERE DATE(i.invoiceDate) = ? AND i.paymentStatus != 'under_review'`, [today]
          );
          // Get free invoices with items
          const [freeRows] = await conn.execute(
            `SELECT id, supplierName, totalAmount, paymentStatus,
             COALESCE(paidAmount, 0) as paidAmount, expenseCategory
             FROM free_invoices WHERE DATE(date) = ?`, [today]
          );
          // Build supplier + partial invoices with items
          const supplierInvoices: Array<{ supplierName: string; invoiceNumber: string | null; totalAmount: number; items?: Array<{ description: string; qty: number; unitPrice: number; total: number }> }> = [];
          const partialInvoices: Array<{ supplierName: string; invoiceNumber: string | null; totalAmount: number; paidAmount: number; items?: Array<{ description: string; qty: number; unitPrice: number; total: number }> }> = [];
          for (const r of suppRows as any[]) {
            const [itemRows] = await conn.execute(
              `SELECT materialName as description, quantity as qty, unitPrice, totalPrice as total
               FROM invoice_items WHERE invoiceId = ?`, [r.id]
            );
            const items = (itemRows as any[]).map((it: any) => ({
              description: String(it.description ?? ''),
              qty: Number(it.qty),
              unitPrice: Number(it.unitPrice),
              total: Number(it.total),
            }));
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
          // Build free invoices with items
          const freeInvoices: Array<{ supplierName: string; invoiceNumber: string | null; totalAmount: number; expenseCategory: string; items?: Array<{ description: string; qty: number; unitPrice: number; total: number }> }> = [];
          for (const r of freeRows as any[]) {
            const [itemRows] = await conn.execute(
              `SELECT description, qty, unitPrice, total
               FROM free_invoice_items WHERE invoiceId = ?`, [r.id]
            );
            const items = (itemRows as any[]).map((it: any) => ({
              description: String(it.description ?? ''),
              qty: Number(it.qty),
              unitPrice: Number(it.unitPrice),
              total: Number(it.total),
            }));
            const displayAmount = r.paymentStatus === 'partial' ? Number(r.paidAmount) : Number(r.totalAmount);
            freeInvoices.push({
              supplierName: String(r.supplierName ?? ''),
              invoiceNumber: null,
              totalAmount: displayAmount,
              expenseCategory: String(r.expenseCategory ?? ''),
              items,
            });
          }
          const [prevDa] = await conn.execute(
            'SELECT carryForwardToNext FROM daily_accounts WHERE accountDate < ? ORDER BY accountDate DESC LIMIT 1', [today]
          );
          const carryFromPrev = Number((prevDa as any[])[0]?.carryForwardToNext || 0);
          const pdfBuffer = await generateDailyAccountPDF({
            accountDate: da.accountDate instanceof Date ? da.accountDate.toISOString().split('T')[0] : String(da.accountDate).split('T')[0],
            salesCash: Number(da.salesCash || 0),
            salesCard: Number(da.salesCard || 0),
            salesKita: Number(da.salesKita || 0),
            salesOrders: Number(da.salesOrders || 0),
            salesNoon: Number(da.salesNoon || 0),
            salesDeliveroo: Number(da.salesDeliveroo || 0),
            salesCareem: Number(da.salesCareem || 0),
            expensesFixed: Number(da.expensesFixed || 0),
            expensesSupplierInvoices: supplierInvoices.reduce((s, r) => s + r.totalAmount, 0),
            expensesFreeInvoices: freeInvoices.reduce((s, r) => s + r.totalAmount, 0),
            expensesPartial: partialInvoices.reduce((s, r) => s + r.paidAmount, 0),
            supplyToRestaurant: Number(da.supplyToRestaurant || 0),
            supplyToManagement: Number(da.supplyToManagement || 0),
            supplyExtra: Number(da.supplyExtra || 0),
            carryForwardFromPrev: carryFromPrev,
            carryForwardToNext: Number(da.carryForwardToNext || 0),
            notes: da.notes,
            supplierInvoices,
            freeInvoices,
            partialInvoices,
          });
          const fileKey = `daily-reports/daily-account-${today}-${Date.now()}.pdf`;
          const { url } = await storagePut(fileKey, pdfBuffer, 'application/pdf');
          pdfUrl = url;
          pdfAccountDate = today; // Save the report date for the filename
          console.log(`[WhatsApp Scheduler] PDF generated for daily_account_summary: ${pdfUrl}`);
        }
      } catch (pdfErr) {
        console.error('[WhatsApp Scheduler] Failed to generate PDF for daily_account_summary:', pdfErr);
      }
    }

    let sent = 0;
    let failed = 0;

    for (const recipient of recipientList) {
      const logId = await createLog(conn, sub.id, recipient.phoneNumber, message);
      const result = await sendWhatsAppText(
        { apiUrl: settings.evolutionApiUrl, apiKey: settings.evolutionApiKey, instance: settings.evolutionInstance },
        recipient.phoneNumber,
        message
      );
      await updateLog(conn, logId, result.success ? "sent" : "failed", result.error);
      if (result.success) sent++; else failed++;

      // Send PDF document if available (with 2s delay)
      if (pdfUrl && result.success) {
        // Use the account date (from the PDF generation above), not today's date
        const reportDateLabel = pdfAccountDate || new Date().toISOString().split('T')[0];
        setTimeout(() => {
          sendWhatsAppDocument(
            { apiUrl: settings.evolutionApiUrl, apiKey: settings.evolutionApiKey, instance: settings.evolutionInstance },
            recipient.phoneNumber,
            pdfUrl!,
            `📊 تقرير اليوم التشغيلي — ${reportDateLabel}`,
            `تقرير-${reportDateLabel}.pdf`
          ).catch(console.error);
        }, 2000);
      }
    }

    return {
      success: sent > 0,
      sent,
      failed,
      message: `تم الإرسال: ${sent} ✅، فشل: ${failed} ❌`,
    };
  } finally {
    await conn.end();
  }
}

/**
 * triggerEventSubscriptions
 * Called when a real-time event occurs (e.g. kitchen production, pull, invoice).
 * Finds all active subscriptions of the given reportType, applies the saved template
 * (substituting {{variables}}), and sends the message to all recipients.
 * If no active subscription exists → nothing is sent.
 */
export async function triggerEventSubscriptions(
  reportType: string,
  variables: Record<string, string>
): Promise<void> {
  const conn = await getConn();
  try {
    // Check WhatsApp settings
    const [settingsRows] = await conn.execute(
      "SELECT * FROM whatsapp_settings WHERE isConfigured = 1 LIMIT 1"
    );
    const settings = (settingsRows as any[])[0];
    if (!settings) return; // No WhatsApp configured

    // Find active subscriptions for this event type
    const [subRows] = await conn.execute(
      "SELECT * FROM report_subscriptions WHERE isActive = 1 AND reportType = ?",
      [reportType]
    );
    const subs = subRows as any[];
    if (!subs.length) return; // No active subscription → do not send

    for (const sub of subs) {
      // Fetch template: prefer templateId, fallback to reportType
      let tmplRow: any = null;
      if (sub.templateId) {
        const [tr] = await conn.execute('SELECT * FROM report_templates WHERE id=? LIMIT 1', [sub.templateId]);
        tmplRow = (tr as any[])[0] ?? null;
      }
      if (!tmplRow) {
        const [tr] = await conn.execute(
          'SELECT * FROM report_templates WHERE reportType=? ORDER BY updatedAt DESC LIMIT 1',
          [reportType]
        );
        tmplRow = (tr as any[])[0] ?? null;
      }

      // Build message from template or fallback
      let message: string;
      if (tmplRow?.full_text) {
        // Replace {{variable}} placeholders with actual values
        message = tmplRow.full_text.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => variables[key] ?? '');
      } else if (tmplRow?.bodyText) {
        message = tmplRow.bodyText.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => variables[key] ?? '');
      } else {
        // No template saved → skip (do not send)
        continue;
      }

      // Get recipients
      const [recipients] = await conn.execute(
        "SELECT phoneNumber, name FROM report_recipients WHERE subscriptionId = ?",
        [sub.id]
      );
      const recipientList = recipients as any[];
      if (!recipientList.length) continue;

      // Send to each recipient
      for (const recipient of recipientList) {
        const logId = await createLog(conn, sub.id, recipient.phoneNumber, message);
        const result = await sendWhatsAppText(
          { apiUrl: settings.evolutionApiUrl, apiKey: settings.evolutionApiKey, instance: settings.evolutionInstance },
          recipient.phoneNumber,
          message
        );
        await updateLog(conn, logId, result.success ? "sent" : "failed", result.error);
      }
    }
  } catch (err) {
    console.error(`[triggerEventSubscriptions] Error for ${reportType}:`, err);
  } finally {
    await conn.end();
  }
}

async function seedFoodCostAlertTemplate(): Promise<void> {
  try {
    const conn = await getConn();
    const [rows] = await conn.execute(
      "SELECT id FROM report_templates WHERE reportType = 'food_cost_alert' LIMIT 1"
    ) as any[];
    if ((rows as any[]).length === 0) {
      const fullText = `📈 *تنبيه تغيير Food Cost*\n\n⚠️ تغيّرت نسبة Food Cost لبعض الوصفات بسبب تغيير أسعار المواد الخام\n\n📅 التاريخ: {{date}}\n\n{{affected_recipes}}\n\n_تم الإرسال تلقائياً من منصة مطجري_`;
      await conn.execute(
        `INSERT INTO report_templates (reportType, name, headerText, bodyText, footerText, full_text, includeDate)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [
          'food_cost_alert',
          'تنبيه Food Cost',
          '📈 *تنبيه تغيير Food Cost*',
          '⚠️ تغيّرت نسبة Food Cost لبعض الوصفات بسبب تغيير أسعار المواد الخام\n\n📅 التاريخ: {{date}}\n\n{{affected_recipes}}',
          '_تم الإرسال تلقائياً من منصة مطجري_',
          fullText
        ]
      );
      console.log('[WhatsApp Scheduler] Seeded food_cost_alert template');
    }
    await conn.end();
  } catch (err) {
    console.error('[WhatsApp Scheduler] Failed to seed food_cost_alert template:', err);
  }
}

export function startScheduler(): void {
  if (schedulerInterval) return;
  // Seed default templates on startup
  seedFoodCostAlertTemplate().catch(console.error);
  // Check every minute
  schedulerInterval = setInterval(() => {
    runSchedulerTick().catch(console.error);
  }, 60 * 1000);
  console.log("[WhatsApp Scheduler] Started - checking every minute");
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
