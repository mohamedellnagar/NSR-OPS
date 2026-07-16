import PDFDocument from "pdfkit";
import { AMIRI_REGULAR_B64, AMIRI_BOLD_B64 } from "./fontData";
import mysql from "mysql2/promise";

import { getConn } from "./pool";
// Convert base64 font strings to Buffers for PDFKit
const FONT_REGULAR_BUF = Buffer.from(AMIRI_REGULAR_B64, "base64");
const FONT_BOLD_BUF = Buffer.from(AMIRI_BOLD_B64, "base64");

/** Reverse Arabic text for RTL rendering in PDFKit */
function rtl(text: string): string {
  return text.split(" ").reverse().join(" ");
}

async function fetchMaterialsWithRecipes() {
  const mysql = await import("mysql2/promise");
  // Retry up to 3 times to handle transient ECONNRESET errors
  let conn: Awaited<ReturnType<typeof mysql.createConnection>> | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      conn = await getConn();
      break;
    } catch (err: any) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  if (!conn) throw new Error("Failed to connect to database");

  try {
    // Fetch all semi-finished materials
    const [materials] = await conn.execute<any[]>(
      `SELECT id, name, nameAr, unit FROM raw_materials 
       WHERE materialType = 'semi_finished' AND isActive = 1 
       ORDER BY COALESCE(nameAr, name)`
    );

    // Fetch recipes for all materials
    const result: Array<{ id: number; name: string; nameAr: string; unit: string; recipe: any[] }> = [];

    for (const mat of materials) {
      const [recipe] = await conn.execute<any[]>(
        `SELECT 
          sfr.quantity,
          rm.name AS ingredientName,
          rm.nameAr AS ingredientNameAr,
          rm.unit AS ingredientUnit
         FROM semi_finished_recipes sfr
         JOIN raw_materials rm ON sfr.ingredientId = rm.id
         WHERE sfr.materialId = ?
         ORDER BY rm.name`,
        [mat.id]
      );
      result.push({ ...mat, recipe });
    }

    return result;
  } finally {
    await conn.release();
  }
}

export async function generateSemiFinishedPDF(): Promise<Buffer> {
  const materials = await fetchMaterialsWithRecipes();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      info: {
        Title: "قائمة المواد المصنّعة ومكوناتها",
        Author: "مطعمي",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Register fonts from embedded base64 buffers
    doc.registerFont("Arabic", FONT_REGULAR_BUF);
    doc.registerFont("Arabic-Bold", FONT_BOLD_BUF);

    const pageWidth = doc.page.width - 80; // margins

    // ─── Header ───────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 70).fill("#1e293b");

    doc
      .font("Arabic-Bold")
      .fontSize(22)
      .fillColor("#ffffff")
      .text(rtl("قائمة المواد المصنّعة ومكوناتها"), 40, 20, {
        width: pageWidth,
        align: "right",
      });

    const today = new Date().toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    doc
      .font("Arabic")
      .fontSize(11)
      .fillColor("#94a3b8")
      .text(rtl(`تاريخ الطباعة: ${today}`), 40, 48, {
        width: pageWidth,
        align: "right",
      });

    // ─── Materials ────────────────────────────────────────────
    let yPos = 90;

    for (let i = 0; i < materials.length; i++) {
      const mat = materials[i];
      const recipe = mat.recipe || [];

      // Check if we need a new page
      const estimatedHeight = 50 + recipe.length * 22 + 20;
      if (yPos + estimatedHeight > doc.page.height - 60) {
        doc.addPage();
        yPos = 40;
      }

      // Material header card
      const cardBg = i % 2 === 0 ? "#f8fafc" : "#f1f5f9";
      doc.rect(40, yPos, pageWidth, 36).fill(cardBg).stroke("#e2e8f0");

      // Material number badge
      doc.circle(60, yPos + 18, 12).fill("#3b82f6");
      doc
        .font("Arabic-Bold")
        .fontSize(10)
        .fillColor("#ffffff")
        .text(String(i + 1), 48, yPos + 12, { width: 24, align: "center" });

      // Material name
      const matName = mat.nameAr || mat.name;
      doc
        .font("Arabic-Bold")
        .fontSize(14)
        .fillColor("#1e293b")
        .text(rtl(matName), 80, yPos + 10, {
          width: pageWidth - 100,
          align: "right",
        });

      // Unit badge
      doc
        .font("Arabic")
        .fontSize(10)
        .fillColor("#64748b")
        .text(`(${mat.unit})`, 80, yPos + 12, { width: 60, align: "left" });

      yPos += 40;

      // Recipe items
      if (recipe.length === 0) {
        doc
          .font("Arabic")
          .fontSize(11)
          .fillColor("#94a3b8")
          .text(rtl("لا توجد مكوّنات مسجّلة"), 40, yPos, {
            width: pageWidth,
            align: "right",
          });
        yPos += 20;
      } else {
        // Table header
        doc.rect(40, yPos, pageWidth, 20).fill("#e2e8f0");

        doc.font("Arabic-Bold").fontSize(10).fillColor("#475569");
        doc.text(rtl("المكوّن"), 80, yPos + 5, {
          width: pageWidth - 120,
          align: "right",
        });
        doc.text(rtl("الكمية"), 40, yPos + 5, { width: 80, align: "left" });

        yPos += 22;

        // Recipe rows
        recipe.forEach((item: any, idx: number) => {
          const rowBg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
          doc.rect(40, yPos, pageWidth, 20).fill(rowBg);

          const ingredientName = item.ingredientNameAr || item.ingredientName || "";
          const qty = parseFloat(item.quantity || "0");
          const unit = item.ingredientUnit || "";

          doc
            .font("Arabic")
            .fontSize(11)
            .fillColor("#334155")
            .text(rtl(ingredientName), 80, yPos + 4, {
              width: pageWidth - 120,
              align: "right",
            });

          doc
            .font("Arabic-Bold")
            .fontSize(10)
            .fillColor("#3b82f6")
            .text(`${qty} ${unit}`, 40, yPos + 4, { width: 80, align: "left" });

          // Separator line
          doc
            .moveTo(40, yPos + 20)
            .lineTo(40 + pageWidth, yPos + 20)
            .strokeColor("#f1f5f9")
            .lineWidth(0.5)
            .stroke();

          yPos += 22;
        });
      }

      yPos += 12; // gap between materials
    }

    // ─── Footer ───────────────────────────────────────────────
    doc
      .font("Arabic")
      .fontSize(9)
      .fillColor("#94a3b8")
      .text(
        rtl(`إجمالي المواد المصنّعة: ${materials.length}`),
        40,
        doc.page.height - 30,
        { width: pageWidth, align: "right" }
      );

    doc.end();
  });
}

// ─── Invoices PDF ─────────────────────────────────────────────────────────────

export interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  supplierName: string | null;
  invoiceDate: Date;
  subtotal: string | number;
  vatEnabled: boolean;
  vatAmount: string | number;
  totalAmount: string | number;
  paymentStatus: string;
  paidAmount: string | number | null;
  notes: string | null;
}

const INV_STATUS_LABELS: Record<string, string> = {
  paid: "مدفوع",
  deferred: "مؤجل",
  partial: "جزئي",
  under_review: "التدقيق",
};

const INV_STATUS_COLORS: Record<string, string> = {
  paid: "#16a34a",
  deferred: "#dc2626",
  partial: "#d97706",
  under_review: "#7c3aed",
};

const INV_STATUS_BG: Record<string, string> = {
  paid: "#dcfce7",
  deferred: "#fee2e2",
  partial: "#fef3c7",
  under_review: "#ede9fe",
};

function fmtNum(v: string | number | null | undefined): string {
  const n = parseFloat(String(v ?? 0));
  return isNaN(n) ? "0.000" : n.toFixed(3);
}

/** Format date as DD/MM/YYYY using Gregorian numerals — safe for PDFKit RTL */
function fmtDateGregorian(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function drawPageHeader(
  doc: InstanceType<typeof PDFDocument>,
  pageWidth: number,
  today: string,
  filterLabel: string,
  totalAll: number,
  totalPaid: number,
  totalPending: number,
  count: number
) {
  // Header background
  doc.rect(0, 0, doc.page.width, 80).fill("#0f172a");

  // Accent stripe
  doc.rect(0, 0, 6, 80).fill("#3b82f6");

  // Title
  doc
    .font("Arabic-Bold")
    .fontSize(22)
    .fillColor("#ffffff")
    .text(rtl("تقرير فواتير الموردين"), 20, 14, {
      width: pageWidth + 20,
      align: "right",
    });

  // Print date (Gregorian, LTR-safe)
  const printDate = fmtDateGregorian(new Date());
  doc
    .font("Arabic")
    .fontSize(10)
    .fillColor("#94a3b8")
    .text(`${rtl("تاريخ الطباعة:")} ${printDate}`, 20, 45, {
      width: pageWidth + 20,
      align: "right",
    });

  if (filterLabel) {
    doc
      .font("Arabic")
      .fontSize(9)
      .fillColor("#7dd3fc")
      .text(`${rtl("الفلتر:")} ${filterLabel}`, 20, 60, {
        width: pageWidth + 20,
        align: "right",
      });
  }

  // ─── Summary cards ────────────────────────────────────────
  const cardY = 90;
  const cardH = 44;
  const cardGap = 8;
  const cardW = (pageWidth - cardGap * 2) / 3;

  const cards = [
    { label: "عدد الفواتير", value: String(count), color: "#1e40af", bg: "#eff6ff", textColor: "#1e3a8a" },
    { label: "إجمالي الفواتير", value: `${fmtNum(totalAll)} د.إ`, color: "#065f46", bg: "#f0fdf4", textColor: "#14532d" },
    { label: "المبلغ المعلق", value: `${fmtNum(totalPending)} د.إ`, color: "#991b1b", bg: "#fef2f2", textColor: "#7f1d1d" },
  ];

  cards.forEach((card, idx) => {
    const cx = 40 + idx * (cardW + cardGap);
    doc.rect(cx, cardY, cardW, cardH).fill(card.bg).stroke(card.color);
    // Left accent
    doc.rect(cx, cardY, 4, cardH).fill(card.color);
    // Label
    doc.font("Arabic").fontSize(9).fillColor("#64748b")
      .text(rtl(card.label), cx + 6, cardY + 6, { width: cardW - 10, align: "right" });
    // Value
    doc.font("Arabic-Bold").fontSize(13).fillColor(card.textColor)
      .text(card.value, cx + 6, cardY + 20, { width: cardW - 10, align: "right" });
  });
}

export async function generateInvoicesPDF(
  invoicesList: InvoiceRow[],
  filterLabel: string = ""
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      info: {
        Title: "تقرير فواتير الموردين",
        Author: "مطعمي",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("Arabic", FONT_REGULAR_BUF);
    doc.registerFont("Arabic-Bold", FONT_BOLD_BUF);

    const pageWidth = doc.page.width - 80;
    const today = fmtDateGregorian(new Date());

    // Track page number
    let pageCount = 1;
    doc.on("pageAdded", () => { pageCount++; });

    const totalAll = invoicesList.reduce((s, r) => s + parseFloat(String(r.totalAmount ?? 0)), 0);
    const totalPaid = invoicesList.reduce((s, r) => s + parseFloat(String(r.paidAmount ?? 0)), 0);
    const totalPending = totalAll - totalPaid;

    // Draw first page header
    drawPageHeader(doc, pageWidth, today, filterLabel, totalAll, totalPaid, totalPending, invoicesList.length);

    // ─── Column layout (A4 = 595pt, margins 40 each = 515 usable) ─────────────
    // #(25) | Date(65) | InvNum(105) | Supplier(120) | Total(75) | Paid(75) | Status(50)
    const COL = {
      num:    { x: 40,  w: 25  },
      date:   { x: 65,  w: 65  },
      inv:    { x: 130, w: 110 },
      supp:   { x: 240, w: 120 },
      total:  { x: 360, w: 75  },
      paid:   { x: 435, w: 75  },
      status: { x: 510, w: 45  },
    };

    const ROW_H = 26;
    const HEADER_H = 24;

    function drawTableHeader(y: number) {
      // Header background with gradient-like effect
      doc.rect(40, y, pageWidth, HEADER_H).fill("#1e293b");
      // Bottom accent line
      doc.rect(40, y + HEADER_H - 2, pageWidth, 2).fill("#3b82f6");

      const headerItems: [string, { x: number; w: number }, "center" | "right" | "left"][] = [
        ["#",              COL.num,    "center"],
        ["التاريخ",       COL.date,   "center"],
        ["رقم الفاتورة",  COL.inv,    "center"],
        ["المورد",        COL.supp,   "right" ],
        ["الإجمالي",      COL.total,  "center"],
        ["المدفوع",       COL.paid,   "center"],
        ["الحالة",        COL.status, "center"],
      ];

      doc.font("Arabic-Bold").fontSize(9).fillColor("#e2e8f0");
      for (const [label, col, align] of headerItems) {
        doc.text(rtl(label), col.x, y + 7, { width: col.w, align });
      }
    }

    let yPos = 148; // after header + summary cards
    drawTableHeader(yPos);
    yPos += HEADER_H + 2;

    // ─── Table rows ───────────────────────────────────────────
    for (let i = 0; i < invoicesList.length; i++) {
      const inv = invoicesList[i];

      // Page break
      if (yPos + ROW_H > doc.page.height - 45) {
        doc.addPage();
        // Compact header on new page
        doc.rect(0, 0, doc.page.width, 36).fill("#0f172a");
        doc.rect(0, 0, 6, 36).fill("#3b82f6");
        doc.font("Arabic-Bold").fontSize(12).fillColor("#ffffff")
          .text(rtl(`تقرير فواتير الموردين - تابع | صفحة ${pageCount}`), 20, 10, { width: pageWidth + 20, align: "right", lineBreak: false });
        yPos = 46;
        drawTableHeader(yPos);
        yPos += HEADER_H + 2;
      }

      // Alternating row background
      const rowBg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
      doc.rect(40, yPos, pageWidth, ROW_H).fill(rowBg);
      // Bottom border
      doc.moveTo(40, yPos + ROW_H).lineTo(40 + pageWidth, yPos + ROW_H)
        .strokeColor("#e2e8f0").lineWidth(0.5).stroke();

      const statusColor = INV_STATUS_COLORS[inv.paymentStatus] ?? "#64748b";
      const statusBg    = INV_STATUS_BG[inv.paymentStatus] ?? "#f1f5f9";
      const statusLabel = INV_STATUS_LABELS[inv.paymentStatus] ?? inv.paymentStatus;
      const textY = yPos + 8;

      // Row number
      doc.font("Arabic").fontSize(9).fillColor("#94a3b8")
        .text(String(i + 1), COL.num.x, textY, { width: COL.num.w, align: "center" });

      // Date — Gregorian DD/MM/YYYY, LTR
      doc.font("Arabic").fontSize(9).fillColor("#475569")
        .text(fmtDateGregorian(inv.invoiceDate), COL.date.x, textY, { width: COL.date.w, align: "center", lineBreak: false });

      // Invoice number — LTR, no line break
      doc.font("Arabic").fontSize(8).fillColor("#1e293b")
        .text(inv.invoiceNumber ?? "-", COL.inv.x, textY, { width: COL.inv.w, align: "center", lineBreak: false });

      // Supplier name — RTL
      doc.font("Arabic").fontSize(9).fillColor("#334155")
        .text(rtl(inv.supplierName ?? "-"), COL.supp.x, textY, { width: COL.supp.w, align: "right", lineBreak: false });

      // Total amount — bold
      doc.font("Arabic-Bold").fontSize(9).fillColor("#0f172a")
        .text(fmtNum(inv.totalAmount), COL.total.x, textY, { width: COL.total.w, align: "center", lineBreak: false });

      // Paid amount
      doc.font("Arabic").fontSize(9).fillColor("#475569")
        .text(fmtNum(inv.paidAmount), COL.paid.x, textY, { width: COL.paid.w, align: "center", lineBreak: false });

      // Status badge
      const badgeX = COL.status.x + 2;
      const badgeW = COL.status.w - 4;
      const badgeY = yPos + 5;
      const badgeH = ROW_H - 10;
      doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 3).fill(statusBg);
      doc.font("Arabic-Bold").fontSize(8).fillColor(statusColor)
        .text(rtl(statusLabel), badgeX, badgeY + 3, { width: badgeW, align: "center", lineBreak: false });

      yPos += ROW_H;
    }

    // ─── Totals row ───────────────────────────────────────────
    if (invoicesList.length > 0) {
      doc.rect(40, yPos, pageWidth, 28).fill("#1e293b");
      doc.font("Arabic-Bold").fontSize(10).fillColor("#ffffff")
        .text(rtl("الإجمالي"), COL.supp.x, yPos + 8, { width: COL.supp.w, align: "right" });
      doc.font("Arabic-Bold").fontSize(10).fillColor("#34d399")
        .text(fmtNum(totalAll), COL.total.x, yPos + 8, { width: COL.total.w, align: "center" });
      doc.font("Arabic-Bold").fontSize(10).fillColor("#60a5fa")
        .text(fmtNum(totalPaid), COL.paid.x, yPos + 8, { width: COL.paid.w, align: "center" });
      yPos += 30;
    }

    doc.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily Account PDF Generator
// ─────────────────────────────────────────────────────────────────────────────

export interface DailyAccountPDFData {
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
  expensesPartial: number;
  supplyToRestaurant: number;
  supplyToManagement: number;
  supplyExtra: number;
  carryForwardFromPrev: number;
  carryForwardToNext: number;
  notes?: string;
  // Detailed invoices
  supplierInvoices?: Array<{ supplierName: string; invoiceNumber: string | null; totalAmount: number; items?: Array<{ description: string; qty: number; unitPrice: number; total: number }> }>;
  freeInvoices?: Array<{ supplierName: string; invoiceNumber: string | null; totalAmount: number; expenseCategory: string; items?: Array<{ description: string; qty: number; unitPrice: number; total: number }> }>;
  partialInvoices?: Array<{ supplierName: string; invoiceNumber: string | null; totalAmount: number; paidAmount: number; items?: Array<{ description: string; qty: number; unitPrice: number; total: number }> }>;
}

export async function generateDailyAccountPDF(data: DailyAccountPDFData): Promise<Buffer> {
  const puppeteer = await import("puppeteer-core");
  const fmt = (v: number) => v.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totalSales = data.salesCash + data.salesCard + data.salesKita +
    data.salesOrders + data.salesNoon + data.salesDeliveroo + data.salesCareem;
  const totalApps = data.salesOrders + data.salesNoon + data.salesDeliveroo + data.salesCareem;
  const totalExpenses = data.expensesSupplierInvoices + data.expensesFreeInvoices +
    data.expensesFixed + data.expensesPartial;
  const totalSupply = data.supplyToRestaurant + data.supplyToManagement + data.supplyExtra;

  // Build supplier invoices rows HTML
  function buildInvoiceRows(invoices: DailyAccountPDFData['supplierInvoices'] | DailyAccountPDFData['freeInvoices'], type: 'supplier' | 'free'): string {
    if (!invoices || invoices.length === 0) return '';
    const title = type === 'supplier' ? 'فواتير الموردين' : 'الفواتير الحرة';
    const color = type === 'supplier' ? '#dc2626' : '#7c3aed';
    const bgHeader = type === 'supplier' ? '#fef2f2' : '#f5f3ff';

    let html = `<tr><td colspan="3" style="background:${bgHeader};color:${color};font-weight:bold;padding:8px 12px;font-size:13px;border-bottom:2px solid ${color}">${title}</td></tr>`;

    for (const inv of invoices) {
      const cat = (inv as any).expenseCategory ? ` — ${(inv as any).expenseCategory}` : '';
      html += `
        <tr class="inv-row">
          <td style="padding:7px 12px;color:#374151;font-size:12px">${inv.supplierName}${cat}</td>
          <td style="padding:7px 12px;color:#6b7280;font-size:11px;text-align:center">${inv.invoiceNumber ?? '—'}</td>
          <td style="padding:7px 12px;font-weight:bold;color:#dc2626;text-align:left;font-size:12px">${fmt(inv.totalAmount)} د.إ</td>
        </tr>`;
      if (inv.items && inv.items.length > 0) {
        for (const item of inv.items) {
          html += `
            <tr style="background:#fafafa">
              <td colspan="2" style="padding:4px 24px;color:#6b7280;font-size:11px">• ${item.description} — ${item.qty} × ${fmt(item.unitPrice)} د.إ</td>
              <td style="padding:4px 12px;color:#9ca3af;font-size:11px;text-align:left">${fmt(item.total)} د.إ</td>
            </tr>`;
        }
      }
    }
    return html;
  }

  function buildPartialRows(invoices: DailyAccountPDFData['partialInvoices']): string {
    if (!invoices || invoices.length === 0) return '';
    let html = `<tr><td colspan="3" style="background:#eff6ff;color:#1d4ed8;font-weight:bold;padding:8px 12px;font-size:13px;border-bottom:2px solid #1d4ed8">دفع جزئي</td></tr>`;
    for (const inv of invoices) {
      html += `
        <tr class="inv-row">
          <td style="padding:7px 12px;color:#374151;font-size:12px">${inv.supplierName}</td>
          <td style="padding:7px 12px;color:#6b7280;font-size:11px;text-align:center">${inv.invoiceNumber ?? '—'} <span style="color:#9ca3af">(إجمالي: ${fmt(inv.totalAmount)})</span></td>
          <td style="padding:7px 12px;font-weight:bold;color:#2563eb;text-align:left;font-size:12px">${fmt(inv.paidAmount)} د.إ</td>
        </tr>`;
      if (inv.items && inv.items.length > 0) {
        for (const item of inv.items) {
          html += `
            <tr style="background:#f0f7ff">
              <td colspan="2" style="padding:4px 24px;color:#6b7280;font-size:11px">• ${item.description} — ${item.qty} × ${fmt(item.unitPrice)} د.إ</td>
              <td style="padding:4px 12px;color:#9ca3af;font-size:11px;text-align:left">${fmt(item.total)} د.إ</td>
            </tr>`;
        }
      }
    }
    return html;
  }

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Cairo', 'Arial', sans-serif; background: #f8fafc; color: #1e293b; direction: rtl; }
  .page { max-width: 794px; margin: 0 auto; background: white; }

  /* Header */
  .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; padding: 24px 32px; border-bottom: 4px solid #f59e0b; }
  .header h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .header .date { color: #fbbf24; font-size: 14px; }
  .header .subtitle { color: #94a3b8; font-size: 12px; margin-top: 2px; }

  /* Summary cards */
  .summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 20px 32px; background: #f1f5f9; }
  .card { background: white; border-radius: 10px; padding: 14px 16px; border-right: 4px solid; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .card.sales { border-color: #16a34a; }
  .card.expenses { border-color: #dc2626; }
  .card.balance { border-color: #7c3aed; }
  .card .label { font-size: 11px; color: #64748b; margin-bottom: 4px; }
  .card .value { font-size: 18px; font-weight: 700; }
  .card.sales .value { color: #16a34a; }
  .card.expenses .value { color: #dc2626; }
  .card.balance .value { color: #7c3aed; }

  /* Sections */
  .section { margin: 0 32px 20px; }
  .section-title { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 8px 8px 0 0; font-size: 14px; font-weight: 700; color: white; }
  .section-title.green { background: #065f46; }
  .section-title.red { background: #991b1b; }
  .section-title.blue { background: #1e3a5f; }
  .section-title.purple { background: #4c1d95; }
  .section-title.amber { background: #78350f; }
  .section-title .icon { font-size: 16px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px; overflow: hidden; }
  .inv-row:nth-child(even) { background: #f8fafc; }
  .inv-row:nth-child(odd) { background: white; }
  tr:last-child td { border-bottom: none; }
  td { border-bottom: 1px solid #f1f5f9; }

  /* Total rows */
  .total-row td { background: #1e293b !important; color: white !important; font-weight: 700; padding: 10px 12px; font-size: 13px; }
  .total-row td.amount { color: #34d399 !important; text-align: left; }

  /* Footer */
  .footer { background: #0f172a; color: #64748b; text-align: center; padding: 12px; font-size: 11px; margin-top: 20px; }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <h1>📊 تقرير بيانات اليوم التشغيلي</h1>
    <div class="date">📅 ${data.accountDate}</div>
    <div class="subtitle">تم الإنشاء تلقائياً من منصة مطجري</div>
  </div>

  <!-- Summary Cards -->
  <div class="summary-cards">
    <div class="card sales">
      <div class="label">💰 إجمالي المبيعات</div>
      <div class="value">${fmt(totalSales)} د.إ</div>
    </div>
    <div class="card expenses">
      <div class="label">📤 إجمالي المصروفات</div>
      <div class="value">${fmt(totalExpenses)} د.إ</div>
    </div>
    <div class="card balance">
      <div class="label">🔄 مرحّل لليوم التالي</div>
      <div class="value">${fmt(data.carryForwardToNext)} د.إ</div>
    </div>
  </div>

  <!-- Sales Section -->
  <div class="section">
    <div class="section-title green"><span class="icon">💵</span> المبيعات</div>
    <table>
      ${data.salesCash > 0 ? `<tr class="inv-row"><td style="padding:8px 12px">نقدي</td><td></td><td style="padding:8px 12px;font-weight:600;color:#16a34a;text-align:left">${fmt(data.salesCash)} د.إ</td></tr>` : ''}
      ${data.salesCard > 0 ? `<tr class="inv-row"><td style="padding:8px 12px">بطاقة</td><td></td><td style="padding:8px 12px;font-weight:600;color:#16a34a;text-align:left">${fmt(data.salesCard)} د.إ</td></tr>` : ''}
      ${data.salesKita > 0 ? `<tr class="inv-row"><td style="padding:8px 12px">كيتا</td><td></td><td style="padding:8px 12px;font-weight:600;color:#16a34a;text-align:left">${fmt(data.salesKita)} د.إ</td></tr>` : ''}
      ${data.salesOrders > 0 ? `<tr class="inv-row"><td style="padding:8px 12px">أوردرات</td><td></td><td style="padding:8px 12px;font-weight:600;color:#16a34a;text-align:left">${fmt(data.salesOrders)} د.إ</td></tr>` : ''}
      ${data.salesNoon > 0 ? `<tr class="inv-row"><td style="padding:8px 12px">نون</td><td></td><td style="padding:8px 12px;font-weight:600;color:#16a34a;text-align:left">${fmt(data.salesNoon)} د.إ</td></tr>` : ''}
      ${data.salesDeliveroo > 0 ? `<tr class="inv-row"><td style="padding:8px 12px">ديليفرو</td><td></td><td style="padding:8px 12px;font-weight:600;color:#16a34a;text-align:left">${fmt(data.salesDeliveroo)} د.إ</td></tr>` : ''}
      ${data.salesCareem > 0 ? `<tr class="inv-row"><td style="padding:8px 12px">كريم</td><td></td><td style="padding:8px 12px;font-weight:600;color:#16a34a;text-align:left">${fmt(data.salesCareem)} د.إ</td></tr>` : ''}
      <tr class="total-row"><td>إجمالي المبيعات</td><td></td><td class="amount">${fmt(totalSales)} د.إ</td></tr>
    </table>
  </div>

  <!-- Expenses Section -->
  <div class="section">
    <div class="section-title red"><span class="icon">📋</span> المصروفات — تفاصيل الفواتير المدفوعة</div>
    <table>
      ${buildInvoiceRows(data.supplierInvoices, 'supplier')}
      ${buildInvoiceRows(data.freeInvoices as DailyAccountPDFData['supplierInvoices'], 'free')}
      ${buildPartialRows(data.partialInvoices)}
      ${data.expensesFixed > 0 ? `<tr class="inv-row"><td style="padding:8px 12px">مصروفات ثابتة</td><td></td><td style="padding:8px 12px;font-weight:bold;color:#dc2626;text-align:left">${fmt(data.expensesFixed)} د.إ</td></tr>` : ''}
      <tr class="total-row"><td>إجمالي المصروفات</td><td></td><td class="amount" style="color:#f87171 !important">${fmt(totalExpenses)} د.إ</td></tr>
    </table>
  </div>

  ${totalSupply > 0 ? `
  <!-- Supply Section -->
  <div class="section">
    <div class="section-title blue"><span class="icon">🚚</span> التوريدات</div>
    <table>
      ${data.supplyToRestaurant > 0 ? `<tr class="inv-row"><td style="padding:8px 12px">للمطعم</td><td></td><td style="padding:8px 12px;font-weight:600;color:#1e40af;text-align:left">${fmt(data.supplyToRestaurant)} د.إ</td></tr>` : ''}
      ${data.supplyToManagement > 0 ? `<tr class="inv-row"><td style="padding:8px 12px">للإدارة</td><td></td><td style="padding:8px 12px;font-weight:600;color:#1e40af;text-align:left">${fmt(data.supplyToManagement)} د.إ</td></tr>` : ''}
      ${data.supplyExtra > 0 ? `<tr class="inv-row"><td style="padding:8px 12px">إضافي</td><td></td><td style="padding:8px 12px;font-weight:600;color:#1e40af;text-align:left">${fmt(data.supplyExtra)} د.إ</td></tr>` : ''}
      <tr class="total-row"><td>إجمالي التوريدات</td><td></td><td class="amount">${fmt(totalSupply)} د.إ</td></tr>
    </table>
  </div>` : ''}

  <!-- Cash Balance Section -->
  <div class="section">
    <div class="section-title purple"><span class="icon">💼</span> الرصيد النقدي</div>
    <table>
      <tr class="inv-row"><td style="padding:8px 12px">مرحّل من السابق</td><td></td><td style="padding:8px 12px;font-weight:600;color:#7c3aed;text-align:left">${fmt(data.carryForwardFromPrev)} د.إ</td></tr>
      <tr class="inv-row"><td style="padding:8px 12px">مرحّل لليوم التالي</td><td></td><td style="padding:8px 12px;font-weight:700;color:#7c3aed;text-align:left;font-size:15px">${fmt(data.carryForwardToNext)} د.إ</td></tr>
    </table>
  </div>

  ${data.notes ? `
  <!-- Notes Section -->
  <div class="section">
    <div class="section-title amber"><span class="icon">📝</span> ملاحظات</div>
    <div style="border:1px solid #e2e8f0;border-top:none;padding:14px 16px;background:#fffbeb;border-radius:0 0 8px 8px;font-size:13px;color:#374151;line-height:1.6">${data.notes}</div>
  </div>` : ''}

  <div class="footer">تم الإنشاء تلقائياً من منصة مطجري</div>
</div>
</body>
</html>`;

  const browser = await puppeteer.default.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}


// ─── Recipe Cost Card PDF ─────────────────────────────────────────────────────

function unitConvFactor(recipeUnit: string, matUnit: string): number {
  const ru = (recipeUnit || "").toLowerCase().trim();
  const mu = (matUnit || "").toLowerCase().trim();
  if ((ru === "g" || ru === "gram" || ru === "غرام") && (mu === "kg" || mu === "كيلو" || mu === "كجم")) return 1 / 1000;
  if ((ru === "ml" || ru === "مل") && (mu === "l" || mu === "liter" || mu === "لتر")) return 1 / 1000;
  return 1;
}

export async function generateRecipeCostCard(productId: number): Promise<Buffer> {
  const conn = await getConn();
  try {
    // Fetch product
    const [pRows] = await conn.execute(
      `SELECT id, name, nameAr, sku, price FROM products WHERE id = ?`, [productId]
    ) as [any[], any];
    const product = pRows[0];
    if (!product) throw new Error("Product not found");

    // Fetch recipe items with material details
    const [recipeRows] = await conn.execute(
      `SELECT ri.id, ri.materialId, ri.quantity, ri.unit, ri.notes, ri.allergens,
              rm.name AS matName, rm.nameAr AS matNameAr, rm.unit AS matUnit,
              rm.lastPurchasePrice, rm.materialType
       FROM recipe_items ri
       JOIN raw_materials rm ON rm.id = ri.materialId
       WHERE ri.productId = ?`,
      [productId]
    ) as [any[], any];

    // Expand semi-finished one level
    const ingredients: Array<{
      name: string; nameAr: string; unit: string;
      qty: number; unitPrice: number; lineCost: number;
      allergens: string | null;
    }> = [];

    for (const r of recipeRows as any[]) {
      const qty = parseFloat(r.quantity || "0");
      if (r.materialType === "semi_finished") {
        const [sfRows] = await conn.execute(
          `SELECT sfr.ingredientId, sfr.quantity, sfr.unit,
                  rm2.name, rm2.nameAr, rm2.unit AS matUnit, rm2.lastPurchasePrice
           FROM semi_finished_recipes sfr
           JOIN raw_materials rm2 ON rm2.id = sfr.ingredientId
           WHERE sfr.materialId = ?`,
          [r.materialId]
        ) as [any[], any];
        for (const sf of sfRows) {
          const sfQty = parseFloat(sf.quantity || "0") * qty;
          const sfConv = sfQty * unitConvFactor(sf.unit, sf.matUnit);
          const price = parseFloat(sf.lastPurchasePrice || "0");
          ingredients.push({
            name: sf.name, nameAr: sf.nameAr,
            unit: sf.matUnit, qty: parseFloat(sfConv.toFixed(4)),
            unitPrice: price, lineCost: parseFloat((sfConv * price).toFixed(4)),
            allergens: null,
          });
        }
      } else {
        const conv = qty * unitConvFactor(r.unit, r.matUnit);
        const price = parseFloat(r.lastPurchasePrice || "0");
        ingredients.push({
          name: r.matName, nameAr: r.matNameAr,
          unit: r.matUnit, qty: parseFloat(conv.toFixed(4)),
          unitPrice: price, lineCost: parseFloat((conv * price).toFixed(4)),
          allergens: r.allergens || null,
        });
      }
    }

    const totalCost = ingredients.reduce((s, i) => s + i.lineCost, 0);
    const sellingPrice = parseFloat(product.price || "0");
    const fcPct = sellingPrice > 0 ? (totalCost / sellingPrice) * 100 : 0;
    const target30Price = totalCost > 0 ? totalCost / 0.30 : 0;
    const allergenSet = new Set<string>();
    for (const ing of ingredients) {
      if (ing.allergens) ing.allergens.split(",").forEach((a: string) => allergenSet.add(a.trim()));
    }
    const allAllergens = Array.from(allergenSet).join(" | ");

    // Build PDF
    return await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      doc.registerFont("Arabic", FONT_REGULAR_BUF);
      doc.registerFont("Arabic-Bold", FONT_BOLD_BUF);
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const W = doc.page.width - 80;

      // Header
      doc.rect(40, 40, W, 60).fill("#1e3a5f");
      doc.fillColor("white").font("Arabic-Bold").fontSize(18)
        .text(rtl(product.nameAr || product.name), 40, 52, { width: W, align: "center" });
      doc.fontSize(11)
        .text(`${product.name}  |  SKU: ${product.sku}`, 40, 76, { width: W, align: "center" });

      doc.fillColor("#333").font("Arabic").fontSize(10);
      let y = 120;

      // KPI row
      const kpis = [
        { label: "سعر البيع", value: sellingPrice > 0 ? `${sellingPrice.toFixed(2)} AED` : "—" },
        { label: "تكلفة الوصفة", value: `${totalCost.toFixed(3)} AED` },
        { label: "Food Cost %", value: `${fcPct.toFixed(1)}%` },
        { label: "سعر البيع المقترح (30%)", value: target30Price > 0 ? `${target30Price.toFixed(2)} AED` : "—" },
      ];
      const kpiW = W / kpis.length;
      kpis.forEach((k, i) => {
        const x = 40 + i * kpiW;
        const col = fcPct > 40 ? "#fee2e2" : fcPct > 30 ? "#fef3c7" : "#d1fae5";
        if (i === 2) doc.rect(x + 2, y - 2, kpiW - 4, 36).fill(col);
        doc.fillColor("#555").font("Arabic").fontSize(8).text(rtl(k.label), x, y, { width: kpiW, align: "center" });
        doc.fillColor("#111").font("Arabic-Bold").fontSize(13).text(k.value, x, y + 12, { width: kpiW, align: "center" });
      });
      y += 50;

      // Table header
      doc.rect(40, y, W, 20).fill("#1e3a5f");
      doc.fillColor("white").font("Arabic-Bold").fontSize(9);
      const cols = [
        { label: "المادة", x: 40, w: 140 },
        { label: "الوحدة", x: 180, w: 60 },
        { label: "الكمية", x: 240, w: 70 },
        { label: "سعر الوحدة", x: 310, w: 90 },
        { label: "التكلفة", x: 400, w: 80 },
      ];
      cols.forEach(c => doc.text(rtl(c.label), c.x, y + 6, { width: c.w, align: "center" }));
      y += 20;

      // Table rows
      ingredients.forEach((ing, idx) => {
        if (y > doc.page.height - 100) { doc.addPage(); y = 40; }
        const bg = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
        doc.rect(40, y, W, 18).fill(bg);
        doc.fillColor("#222").font("Arabic").fontSize(9);
        doc.text(rtl(ing.nameAr || ing.name), cols[0].x, y + 5, { width: cols[0].w, align: "right" });
        doc.text(ing.unit, cols[1].x, y + 5, { width: cols[1].w, align: "center" });
        doc.text(ing.qty.toFixed(3), cols[2].x, y + 5, { width: cols[2].w, align: "center" });
        doc.text(ing.unitPrice.toFixed(3), cols[3].x, y + 5, { width: cols[3].w, align: "center" });
        doc.text(ing.lineCost.toFixed(3), cols[4].x, y + 5, { width: cols[4].w, align: "center" });
        y += 18;
      });

      // Total row
      doc.rect(40, y, W, 22).fill("#1e3a5f");
      doc.fillColor("white").font("Arabic-Bold").fontSize(11);
      doc.text(rtl("إجمالي التكلفة"), 40, y + 6, { width: W - 90, align: "right" });
      doc.text(`${totalCost.toFixed(3)} AED`, cols[4].x, y + 6, { width: cols[4].w, align: "center" });
      y += 30;

      // Allergens
      if (allAllergens) {
        doc.fillColor("#92400e").font("Arabic-Bold").fontSize(9)
          .text(rtl(`⚠️ مسببات الحساسية: ${allAllergens}`), 40, y, { width: W });
        y += 16;
      }

      // Footer
      y += 10;
      doc.rect(40, y, W, 1).fill("#e2e8f0");
      y += 8;
      doc.fillColor("#666").font("Arabic").fontSize(8)
        .text(`طُبع بتاريخ ${new Date().toLocaleDateString("ar-SA")} — منصة مطجري`, 40, y, { width: W, align: "center" });

      doc.end();
    });
  } finally {
    await conn.release();
  }
}
