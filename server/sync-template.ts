/**
 * sync-template.ts
 * 1. generateSyncTemplate() — creates an Excel template to send to Manus AI
 * 2. importFromExcel()      — imports the filled-in Excel back into local DB
 */
import ExcelJS from "exceljs";
import { getDb } from "./db";

// ── 1. Generate Template ──────────────────────────────────────────────────────
export async function generateSyncTemplate(): Promise<Buffer> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const wb = new ExcelJS.Workbook();
  wb.creator = "Matjari Sync";
  wb.created = new Date();

  const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };

  function addHeaders(ws: ExcelJS.Worksheet, cols: { header: string; key: string; width: number }[]) {
    ws.columns = cols;
    ws.getRow(1).eachCell(cell => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.alignment = { horizontal: "center" };
    });
    ws.getRow(1).height = 20;
    ws.views = [{ rightToLeft: true }];
  }

  // ── Sheet 1: الفواتير ─────────────────────────────────────────────────────
  const wsInv = wb.addWorksheet("الفواتير");
  addHeaders(wsInv, [
    { header: "رقم الفاتورة",    key: "invoiceNumber",       width: 20 },
    { header: "اسم المورد",      key: "supplierName",        width: 22 },
    { header: "تاريخ الفاتورة",  key: "invoiceDate",         width: 14 },
    { header: "المجموع",         key: "subtotal",            width: 12 },
    { header: "ضريبة",           key: "vatAmount",           width: 10 },
    { header: "الإجمالي",        key: "totalAmount",         width: 12 },
    { header: "حالة الدفع",      key: "paymentStatus",       width: 14 },
    { header: "المدفوع",         key: "paidAmount",          width: 12 },
    { header: "ملاحظات",         key: "notes",               width: 22 },
  ]);
  wsInv.getCell("A2").value = "← أدخل بيانات الفواتير هنا (أو استبدل هذا الجدول ببيانات من قاعدة البيانات)";
  wsInv.getCell("A2").font = { italic: true, color: { argb: "FF888888" } };

  // ── Sheet 2: بنود الفواتير ───────────────────────────────────────────────
  const wsItems = wb.addWorksheet("بنود_الفواتير");
  addHeaders(wsItems, [
    { header: "رقم الفاتورة",    key: "invoiceNumber",       width: 20 },
    { header: "اسم المادة",      key: "materialName",        width: 22 },
    { header: "الكمية",          key: "quantity",            width: 10 },
    { header: "سعر الوحدة",      key: "unitPrice",           width: 12 },
    { header: "الإجمالي",        key: "totalPrice",          width: 12 },
    { header: "الوحدة",          key: "materialUnit",        width: 10 },
  ]);

  // ── Sheet 3: المواد الخام (كميات وأسعار فقط) ─────────────────────────────
  const wsMat = wb.addWorksheet("المواد_الخام");
  addHeaders(wsMat, [
    { header: "الكود",           key: "id",                  width: 10 },
    { header: "اسم المادة",      key: "name",                width: 30 },
    { header: "الكمية الحالية",  key: "currentQuantity",     width: 16 },
    { header: "آخر سعر شراء",   key: "lastPurchasePrice",   width: 16 },
    { header: "متوسط التكلفة",   key: "averageCost",         width: 16 },
    { header: "الحد الأدنى",     key: "minimumQuantity",     width: 14 },
    { header: "الوحدة",          key: "unit",                width: 10 },
  ]);
  // Load current materials as reference
  const [mats] = await db.execute(
    "SELECT id, name, nameAr, unit, currentQuantity, lastPurchasePrice, averageCost, minimumQuantity FROM raw_materials WHERE isActive=1 ORDER BY nameAr, name"
  );
  for (const m of mats as unknown as any[]) {
    wsMat.addRow({
      id: m.id,
      name: m.nameAr || m.name,
      currentQuantity: parseFloat(m.currentQuantity) || 0,
      lastPurchasePrice: parseFloat(m.lastPurchasePrice) || 0,
      averageCost: parseFloat(m.averageCost) || 0,
      minimumQuantity: parseFloat(m.minimumQuantity) || 0,
      unit: m.unit,
    });
  }
  // Lock name/id columns (read-only visual hint)
  wsMat.getColumn("id").font   = { color: { argb: "FF999999" } };
  wsMat.getColumn("name").font = { color: { argb: "FF999999" } };
  const matNote = wsMat.getCell("H1");
  matNote.value = "← عدّل الكميات والأسعار فقط — لا تغيّر الكود أو الاسم";
  matNote.font  = { italic: true, color: { argb: "FFCC6600" } };
  wsMat.getColumn("H").width = 38;

  // ── Sheet 4: إنتاج المطبخ ─────────────────────────────────────────────────
  const wsKitch = wb.addWorksheet("إنتاج_المطبخ");
  addHeaders(wsKitch, [
    { header: "التاريخ",         key: "productionDate",      width: 14 },
    { header: "اسم الصنف",       key: "productName",         width: 26 },
    { header: "الكمية المنتجة",  key: "producedQuantity",    width: 16 },
    { header: "الناتج الفعلي",   key: "actualYield",         width: 14 },
    { header: "الكمية المستخدمة",key: "usedQuantity",        width: 16 },
    { header: "تكلفة الوحدة",    key: "actualUnitCost",      width: 14 },
    { header: "ملاحظات",         key: "notes",               width: 22 },
  ]);

  // ── Sheet 5: الحسابات اليومية ─────────────────────────────────────────────
  const wsDA = wb.addWorksheet("الحسابات_اليومية");
  addHeaders(wsDA, [
    { header: "التاريخ",             key: "accountDate",         width: 14 },
    { header: "مبيعات نقد",          key: "salesCash",           width: 12 },
    { header: "مبيعات كارت",         key: "salesCard",           width: 12 },
    { header: "مبيعات كيتا",         key: "salesKita",           width: 12 },
    { header: "مبيعات أوردرز",       key: "salesOrders",         width: 14 },
    { header: "مبيعات نون",          key: "salesNoon",           width: 12 },
    { header: "مبيعات ديليفيرو",     key: "salesDeliveroo",      width: 14 },
    { header: "مبيعات كريم",         key: "salesCareem",         width: 12 },
    { header: "مصاريف ثابتة",        key: "expensesFixed",       width: 14 },
    { header: "مصاريف تشغيلية",      key: "expensesOperational", width: 16 },
    { header: "مصاريف صيانة",        key: "expensesMaintenance", width: 14 },
    { header: "توريد للمطعم",        key: "supplyToRestaurant",  width: 14 },
    { header: "توريد للإدارة",       key: "supplyToManagement",  width: 14 },
    { header: "توريد إضافي",         key: "supplyExtra",         width: 12 },
    { header: "ملاحظات",             key: "notes",               width: 22 },
  ]);

  // ── Instructions sheet ────────────────────────────────────────────────────
  const wsInfo = wb.addWorksheet("📋 تعليمات");
  wsInfo.views = [{ rightToLeft: true }];
  wsInfo.getColumn("A").width = 80;
  const instructions = [
    ["📋 تعليمات ملء الملف — Matjari Sync Template"],
    [""],
    ["⚠️  مهم: أرسل هذا الملف لـ Manus AI واطلب منه تعبئته من قاعدة البيانات"],
    [""],
    ["الجدول",                   "المحتوى المطلوب"],
    ["الفواتير",                  "كل الفواتير مع بياناتها الكاملة"],
    ["بنود_الفواتير",             "بنود كل فاتورة (مواد وكميات)"],
    ["المواد_الخام",              "عدّل الكمية الحالية وآخر سعر شراء فقط — الكود والاسم موجودان بالفعل"],
    ["إنتاج_المطبخ",              "سجلات الإنتاج اليومي للمطبخ"],
    ["الحسابات_اليومية",          "الحسابات والمبيعات اليومية"],
    [""],
    ["💡 بعد التعبئة: ارفع الملف في صفحة الإعدادات ← استيراد ملف المزامنة"],
  ];
  instructions.forEach((row, i) => {
    const r = wsInfo.addRow(row);
    if (i === 0) r.getCell(1).font = { bold: true, size: 13 };
    if (i === 2) r.getCell(1).font = { bold: true, color: { argb: "FFCC6600" } };
    if (i === 4) { r.getCell(1).font = { bold: true }; r.getCell(2).font = { bold: true }; }
  });

  return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Convert any ExcelJS cell value to a safe string (handles Date, number, string, null)
function cellStr(v: ExcelJS.CellValue): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "result" in (v as any)) return cellStr((v as any).result);
  if (typeof v === "object" && "text" in (v as any)) return String((v as any).text).trim() || null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function cellNum(v: ExcelJS.CellValue): string {
  const s = cellStr(v);
  if (!s) return "0";
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? "0" : String(n);
}
// Read a worksheet into array-of-rows (skip header row 1)
function sheetRows(ws: ExcelJS.Worksheet): ExcelJS.CellValue[][] {
  const rows: ExcelJS.CellValue[][] = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const vals: ExcelJS.CellValue[] = [];
    row.eachCell({ includeEmpty: true }, cell => vals.push(cell.value));
    // ensure at least 20 cells
    while (vals.length < 20) vals.push(null);
    rows.push(vals);
  });
  return rows;
}

// ── 2. Import from filled Excel ───────────────────────────────────────────────
export async function importFromSyncExcel(buffer: Buffer): Promise<{
  tables: { table: string; strategy: string; rows: number }[];
  durationMs: number;
}> {
  const start = Date.now();
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const results: { table: string; strategy: string; rows: number }[] = [];

  await (db as any).execute("SET FOREIGN_KEY_CHECKS = 0");

  try {
    // ── Invoices ─────────────────────────────────────────────────────────────
    const wsInv = wb.getWorksheet("الفواتير");
    if (wsInv) {
      await (db as any).execute("DELETE FROM invoice_items");
      await (db as any).execute("DELETE FROM invoices");
      let cnt = 0;
      for (const r of sheetRows(wsInv)) {
        const invNum = cellStr(r[0]);
        if (!invNum || invNum.startsWith("←")) continue;
        const supplierName  = cellStr(r[1]);
        const invoiceDate   = cellStr(r[2]) || new Date().toISOString().slice(0,10);
        const subtotal      = cellNum(r[3]);
        const vatAmount     = cellNum(r[4]);
        const totalAmount   = cellNum(r[5]);
        const paymentStatus = cellStr(r[6]) || "deferred";
        const paidAmount    = cellNum(r[7]);
        const notes         = cellStr(r[8]);
        const remaining     = String(Math.max(0, parseFloat(totalAmount) - parseFloat(paidAmount)));
        try {
          await (db as any).execute(
            `INSERT IGNORE INTO invoices
             (invoiceNumber, supplierName, invoiceDate, subtotal, vatAmount, totalAmount,
              paymentStatus, paidAmount, remainingAmount, notes, createdAt)
             VALUES (?,?,?,?,?,?,?,?,?,?,NOW())`,
            [invNum, supplierName, invoiceDate, subtotal, vatAmount, totalAmount,
             paymentStatus, paidAmount, remaining, notes]
          );
          cnt++;
        } catch { /* skip bad rows */ }
      }
      results.push({ table: "invoices", strategy: "replace", rows: cnt });
    }

    // ── Invoice Items ─────────────────────────────────────────────────────────
    const wsItems = wb.getWorksheet("بنود_الفواتير");
    if (wsItems) {
      let cnt = 0;
      for (const r of sheetRows(wsItems)) {
        const invNum = cellStr(r[0]);
        if (!invNum) continue;
        const [rows] = await (db as any).execute(
          "SELECT id FROM invoices WHERE invoiceNumber=? LIMIT 1", [invNum]
        );
        if (!(rows as any[]).length) continue;
        const invoiceId = (rows as any[])[0].id;
        try {
          await (db as any).execute(
            `INSERT IGNORE INTO invoice_items
             (invoiceId, materialName, quantity, unitPrice, totalPrice, materialUnit, createdAt)
             VALUES (?,?,?,?,?,?,NOW())`,
            [invoiceId, cellStr(r[1]), cellNum(r[2]), cellNum(r[3]), cellNum(r[4]), cellStr(r[5]) || "pcs"]
          );
          cnt++;
        } catch { /* skip */ }
      }
      results.push({ table: "invoice_items", strategy: "replace", rows: cnt });
    }

    // ── Raw Materials (qty + prices only) ────────────────────────────────────
    const wsMat = wb.getWorksheet("المواد_الخام");
    if (wsMat) {
      let cnt = 0;
      for (const r of sheetRows(wsMat)) {
        const idVal = r[0];
        const id = Number(idVal);
        if (!idVal || isNaN(id) || id <= 0) continue;
        try {
          await (db as any).execute(
            `UPDATE raw_materials
             SET currentQuantity=?, lastPurchasePrice=?, averageCost=?, minimumQuantity=?
             WHERE id=?`,
            [cellNum(r[2]), cellNum(r[3]), cellNum(r[4]), cellNum(r[5]), id]
          );
          cnt++;
        } catch { /* skip */ }
      }
      results.push({ table: "raw_materials", strategy: "update_qty_price", rows: cnt });
    }

    // ── Kitchen Production ────────────────────────────────────────────────────
    const wsKitch = wb.getWorksheet("إنتاج_المطبخ");
    if (wsKitch) {
      await (db as any).execute("DELETE FROM kitchen_daily_production");
      let cnt = 0;
      for (const r of sheetRows(wsKitch)) {
        const date = cellStr(r[0]); const name = cellStr(r[1]);
        if (!date || !name) continue;
        try {
          await (db as any).execute(
            `INSERT IGNORE INTO kitchen_daily_production
             (productionDate, productName, producedQuantity, actualYield, usedQuantity, actualUnitCost, notes, createdAt)
             VALUES (?,?,?,?,?,?,?,NOW())`,
            [date, name, cellNum(r[2]), cellNum(r[3]), cellNum(r[4]), cellNum(r[5]), cellStr(r[6])]
          );
          cnt++;
        } catch { /* skip */ }
      }
      results.push({ table: "kitchen_daily_production", strategy: "replace", rows: cnt });
    }

    // ── Daily Accounts ────────────────────────────────────────────────────────
    const wsDA = wb.getWorksheet("الحسابات_اليومية");
    if (wsDA) {
      await (db as any).execute("DELETE FROM daily_accounts");
      let cnt = 0;
      for (const r of sheetRows(wsDA)) {
        const date = cellStr(r[0]);
        if (!date) continue;
        try {
          await (db as any).execute(
            `INSERT IGNORE INTO daily_accounts
             (accountDate, salesCash, salesCard, salesKita, salesOrders, salesNoon,
              salesDeliveroo, salesCareem, expensesFixed, expensesOperational,
              expensesMaintenance, supplyToRestaurant, supplyToManagement, supplyExtra, notes, createdAt)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
            [date, cellNum(r[1]), cellNum(r[2]), cellNum(r[3]), cellNum(r[4]),
             cellNum(r[5]), cellNum(r[6]), cellNum(r[7]), cellNum(r[8]),
             cellStr(r[9]), cellStr(r[10]),
             cellNum(r[11]), cellNum(r[12]), cellNum(r[13]), cellStr(r[14])]
          );
          cnt++;
        } catch { /* skip */ }
      }
      results.push({ table: "daily_accounts", strategy: "replace", rows: cnt });
    }

  } finally {
    await (db as any).execute("SET FOREIGN_KEY_CHECKS = 1");
  }

  return { tables: results, durationMs: Date.now() - start };
}
