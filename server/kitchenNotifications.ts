/**
 * Kitchen Event WhatsApp Notifications
 * Sends instant WhatsApp messages when a production or pull event occurs in the kitchen.
 */

import mysql from "mysql2/promise";
import { sendWhatsAppText } from "./whatsapp";

async function getConn() {
  return mysql.createConnection(process.env.DATABASE_URL!);
}

function fmt(n: number | string, dec = 3): string {
  return Number(n || 0).toFixed(dec);
}

function nowArabic(): string {
  return new Date().toLocaleString("ar-AE", {
    timeZone: "Asia/Dubai",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Get WhatsApp config + recipients filtered by reportType.
 * Returns null if WhatsApp is not configured or no active subscriptions for that type.
 */
async function getConfigAndRecipients(reportType: "kitchen_production" | "kitchen_pull"): Promise<{
  config: { apiUrl: string; apiKey: string; instance: string };
  recipients: { phoneNumber: string; name?: string }[];
} | null> {
  const conn = await getConn();
  try {
    const [settingsRows] = await conn.execute(
      "SELECT * FROM whatsapp_settings WHERE isConfigured = 1 LIMIT 1"
    );
    const settings = (settingsRows as any[])[0];
    if (!settings?.evolutionApiUrl || !settings?.evolutionApiKey || !settings?.evolutionInstance) {
      return null;
    }

    // Get recipients only from active subscriptions of this specific reportType
    const [recipientRows] = await conn.execute(
      `SELECT DISTINCT rr.phoneNumber, rr.name
       FROM report_recipients rr
       JOIN report_subscriptions rs ON rr.subscriptionId = rs.id
       WHERE rs.isActive = 1 AND rs.reportType = ?`,
      [reportType]
    );
    const recipients = (recipientRows as any[]).map((r) => ({
      phoneNumber: r.phoneNumber,
      name: r.name ?? undefined,
    }));

    // If no recipients configured for this type, do not send
    if (recipients.length === 0) return null;

    return {
      config: {
        apiUrl: settings.evolutionApiUrl,
        apiKey: settings.evolutionApiKey,
        instance: settings.evolutionInstance,
      },
      recipients,
    };
  } finally {
    await conn.end();
  }
}

/**
 * Fetch saved template full_text from DB for a given reportType.
 * Returns null if not found.
 */
async function getTemplateText(reportType: string): Promise<string | null> {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      "SELECT full_text FROM report_templates WHERE reportType=? AND full_text IS NOT NULL ORDER BY updatedAt DESC LIMIT 1",
      [reportType]
    );
    const r = (rows as any[])[0];
    return r?.full_text ?? null;
  } finally {
    await conn.end();
  }
}

/**
 * Replace {{variable}} placeholders in a kitchen template.
 */
function applyKitchenTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/**
 * Send a WhatsApp message to recipients of a specific reportType (fire-and-forget).
 */
async function broadcastMessage(reportType: "kitchen_production" | "kitchen_pull", message: string): Promise<void> {
  try {
    const data = await getConfigAndRecipients(reportType);
    if (!data) return;
    const { config, recipients } = data;
    for (const r of recipients) {
      sendWhatsAppText(config, r.phoneNumber, message).catch(() => {});
    }
  } catch {
    // Silent — never block the main operation
  }
}

// ─── Production Notification ──────────────────────────────────────────────────

export interface ProductionNotifParams {
  materialName: string;       // اسم المادة المصنّعة
  producedQuantity: number;   // كمية المواد الخام المسحوبة للتصنيع
  actualYield: number;        // الإنتاج الفعلي الناتج
  unit: string;               // الوحدة
  unitCost?: number;          // تكلفة الوحدة من الإنتاج الفعلي (اختيارية)
  totalCost?: number;         // التكلفة الإجمالية الصحيحة = مجموع تكاليف المواد الخام (اختيارية)
  deductions?: Array<{
    ingredientName: string;
    unit: string;
    deductQty: number;
  }>;
}

export async function sendProductionNotification(params: ProductionNotifParams): Promise<void> {
  // التكلفة الإجمالية: تُستخدم totalCost المحسوبة من المواد الخام إذا توفرت
  const totalCost = params.totalCost ?? (params.unitCost != null ? params.unitCost * params.actualYield : null);

  // محاولة جلب القالب من قاعدة البيانات
  const savedTemplate = await getTemplateText("kitchen_production").catch(() => null);

  let msg: string;
  if (savedTemplate) {
    // بناء قائمة المواد الخام كنص منسق
    const rawMaterials = params.deductions?.length
      ? params.deductions.map(d => `  • ${d.ingredientName}: ${fmt(d.deductQty)} ${d.unit}`).join('\n')
      : '';
    msg = applyKitchenTemplate(savedTemplate, {
      production_date:   nowArabic(),
      material_name:     params.materialName,
      produced_qty:      fmt(params.producedQuantity),
      actual_yield:      fmt(params.actualYield),
      unit:              params.unit,
      unit_cost:         params.unitCost != null ? fmt(params.unitCost) : '0.000',
      total_cost:        totalCost != null ? fmt(totalCost) : '0.000',
      raw_materials_used: rawMaterials,
    });
  } else {
    // Fallback: النص الثابت
    msg = `🏗️ *تقرير إنتاج مادة*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📅 ${nowArabic()}\n\n`;
    msg += `🧪 *المادة:* ${params.materialName}\n`;
    msg += `⚖️ *الكمية المسحوبة:* ${fmt(params.producedQuantity)} ${params.unit}\n`;
    msg += `✅ *الإنتاج الفعلي:* ${fmt(params.actualYield)} ${params.unit}\n`;
    if (params.unitCost != null && params.unitCost > 0) {
      msg += `💰 *تكلفة الوحدة:* ${fmt(params.unitCost)} د.إ\n`;
    }
    if (totalCost != null && totalCost > 0) {
      msg += `💵 *التكلفة الإجمالية:* ${fmt(totalCost)} د.إ\n`;
    }
    if (params.deductions && params.deductions.length > 0) {
      msg += `\n📦 *المواد الخام المستخدمة:*\n`;
      for (const d of params.deductions) {
        msg += `  • ${d.ingredientName}: ${fmt(d.deductQty)} ${d.unit}\n`;
      }
    }
    msg += `━━━━━━━━━━━━━━━━━━━━`;
  }

  await broadcastMessage("kitchen_production", msg);
}

// ─── Pull (Withdrawal) Notification ──────────────────────────────────────────

export interface PullNotifParams {
  materialName: string;       // اسم المادة
  materialType: string;       // raw / semi_finished
  pulledQuantity: number;     // الكمية المسحوبة
  actualYield?: number;       // الإنتاج الفعلي (للمصنّعة فقط)
  unit: string;               // الوحدة
  unitCost?: number;          // تكلفة الوحدة
}

export async function sendPullNotification(params: PullNotifParams): Promise<void> {
  const totalCost =
    params.unitCost != null ? params.unitCost * params.pulledQuantity : null;

  const typeLabel =
    params.materialType === "semi_finished" ? "مادة مصنّعة" : "مادة خام";

  // محاولة جلب القالب من قاعدة البيانات
  const savedTemplate = await getTemplateText("kitchen_pull").catch(() => null);

  let msg: string;
  if (savedTemplate) {
    msg = applyKitchenTemplate(savedTemplate, {
      pull_date:     nowArabic(),
      material_type: typeLabel,
      material_name: params.materialName,
      pulled_qty:    fmt(params.pulledQuantity),
      actual_yield:  params.actualYield != null ? fmt(params.actualYield) : fmt(params.pulledQuantity),
      unit:          params.unit,
      unit_cost:     params.unitCost != null ? fmt(params.unitCost) : '0.000',
      total_cost:    totalCost != null ? fmt(totalCost) : '0.000',
    });
  } else {
    // Fallback: النص الثابت
    msg = `🔄 *تقرير سحب مادة*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📅 ${nowArabic()}\n\n`;
    msg += `🏷️ *النوع:* ${typeLabel}\n`;
    msg += `🧪 *المادة:* ${params.materialName}\n`;
    msg += `⚖️ *الكمية المسحوبة:* ${fmt(params.pulledQuantity)} ${params.unit}\n`;
    if (params.actualYield != null && params.actualYield !== params.pulledQuantity) {
      msg += `✅ *الإنتاج الفعلي:* ${fmt(params.actualYield)} ${params.unit}\n`;
    }
    if (params.unitCost != null && params.unitCost > 0) {
      msg += `💰 *تكلفة الوحدة:* ${fmt(params.unitCost)} د.إ\n`;
    }
    if (totalCost != null && totalCost > 0) {
      msg += `💵 *التكلفة الإجمالية:* ${fmt(totalCost)} د.إ\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━`;
  }

  await broadcastMessage("kitchen_pull", msg);
}
