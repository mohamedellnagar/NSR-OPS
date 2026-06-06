/**
 * Integration Test Script - اختبار تكاملي على قاعدة البيانات الحقيقية
 * يختبر: المخزون، الفواتير، المطبخ، التقارير
 */
import mysql from "mysql2/promise";
import { config } from "dotenv";
config();

const DB_URL = process.env.DATABASE_URL;
let conn;
let passed = 0;
let failed = 0;
const errors = [];

function log(icon, msg) {
  console.log(`${icon} ${msg}`);
}

function pass(testName) {
  passed++;
  log("✅", testName);
}

function fail(testName, reason) {
  failed++;
  errors.push({ test: testName, reason });
  log("❌", `${testName}: ${reason}`);
}

async function query(sql, params = []) {
  const [rows] = await conn.execute(sql, params);
  return rows;
}

async function runTests() {
  conn = await mysql.createConnection(DB_URL);
  console.log("\n🔍 بدء الاختبار التكاملي لقاعدة البيانات\n");
  console.log("=".repeat(60));

  // ─── 1. اختبار جداول قاعدة البيانات ──────────────────────────────
  console.log("\n📋 1. التحقق من هيكل قاعدة البيانات\n");

  const requiredTables = [
    "raw_materials",
    "inventory_transactions",
    "invoices",
    "invoice_items",
    "suppliers",
    "material_categories",
    "kitchen_daily_production",
    "kitchen_production_materials",
    "kitchen_production_counts",
    "products",
    "recipe_items",
    "semi_finished_recipes",
    "users",
  ];

  for (const table of requiredTables) {
    try {
      await query(`SELECT 1 FROM ${table} LIMIT 1`);
      pass(`جدول ${table} موجود`);
    } catch (e) {
      fail(`جدول ${table}`, `غير موجود - ${e.message}`);
    }
  }

  // ─── 2. اختبار عمليات المخزون ──────────────────────────────────────
  console.log("\n📦 2. اختبار عمليات المخزون\n");

  // التحقق من أن الأرصدة لا تحتوي على قيم سالبة غير مبررة
  try {
    const negativeStock = await query(
      `SELECT id, name, nameAr, currentQuantity FROM raw_materials 
       WHERE currentQuantity < 0 AND isActive = 1`
    );
    if (negativeStock.length === 0) {
      pass("لا توجد مواد بأرصدة سالبة");
    } else {
      fail(
        "أرصدة سالبة",
        `${negativeStock.length} مادة بأرصدة سالبة: ${negativeStock
          .map((m) => m.nameAr || m.name)
          .join(", ")}`
      );
    }
  } catch (e) {
    fail("فحص الأرصدة السالبة", e.message);
  }

  // التحقق من أن مجموع المعاملات يتطابق مع الرصيد الحالي (عينة)
  try {
    const materials = await query(
      `SELECT id, name, nameAr, currentQuantity FROM raw_materials 
       WHERE isActive = 1 LIMIT 5`
    );
    let balanceOk = true;
    const balanceIssues = [];

    for (const mat of materials) {
      const [txSum] = await query(
        `SELECT 
          COALESCE(SUM(CASE WHEN transactionType = 'IN' THEN quantity ELSE 0 END), 0) AS totalIn,
          COALESCE(SUM(CASE WHEN transactionType = 'OUT' THEN quantity ELSE 0 END), 0) AS totalOut
         FROM inventory_transactions WHERE materialId = ?`,
        [mat.id]
      );
      const calcBalance =
        parseFloat(txSum.totalIn) - parseFloat(txSum.totalOut);
      const actualBalance = parseFloat(mat.currentQuantity);
      const diff = Math.abs(calcBalance - actualBalance);

      if (diff > 0.01) {
        // تسامح 0.01 للأرقام العشرية
        balanceOk = false;
        balanceIssues.push(
          `${mat.nameAr || mat.name}: محسوب=${calcBalance.toFixed(3)}, فعلي=${actualBalance.toFixed(3)}`
        );
      }
    }

    if (balanceOk) {
      pass("أرصدة المخزون متطابقة مع مجموع المعاملات (عينة 5 مواد)");
    } else {
      fail("تطابق الأرصدة", `تباين في: ${balanceIssues.join(" | ")}`);
    }
  } catch (e) {
    fail("فحص تطابق الأرصدة", e.message);
  }

  // التحقق من أن كل معاملة لها مادة موجودة
  try {
    const orphanTx = await query(
      `SELECT COUNT(*) AS cnt FROM inventory_transactions it
       LEFT JOIN raw_materials rm ON it.materialId = rm.id
       WHERE rm.id IS NULL`
    );
    if (parseInt(orphanTx[0].cnt) === 0) {
      pass("جميع المعاملات مرتبطة بمواد موجودة");
    } else {
      fail(
        "معاملات يتيمة",
        `${orphanTx[0].cnt} معاملة بدون مادة مرتبطة`
      );
    }
  } catch (e) {
    fail("فحص المعاملات اليتيمة", e.message);
  }

  // ─── 3. اختبار الفواتير ────────────────────────────────────────────
  console.log("\n🧾 3. اختبار الفواتير\n");

  // التحقق من صحة حسابات الفواتير
  try {
    const invoiceErrors = [];
    const invoices = await query(
      `SELECT id, invoiceNumber, subtotal, vatAmount, totalAmount, vatEnabled 
       FROM invoices LIMIT 20`
    );

    for (const inv of invoices) {
      const items = await query(
        `SELECT quantity, unitPrice, totalPrice FROM invoice_items WHERE invoiceId = ?`,
        [inv.id]
      );

      const calcSubtotal = items.reduce(
        (s, i) => s + parseFloat(i.quantity) * parseFloat(i.unitPrice),
        0
      );
      const calcVat = inv.vatEnabled ? calcSubtotal * 0.05 : 0;
      const calcTotal = calcSubtotal + calcVat;

      const subtotalDiff = Math.abs(
        calcSubtotal - parseFloat(inv.subtotal)
      );
      const totalDiff = Math.abs(calcTotal - parseFloat(inv.totalAmount));

      if (subtotalDiff > 0.01 || totalDiff > 0.01) {
        invoiceErrors.push(
          `${inv.invoiceNumber}: subtotal=${parseFloat(inv.subtotal).toFixed(3)} (محسوب=${calcSubtotal.toFixed(3)})`
        );
      }
    }

    if (invoiceErrors.length === 0) {
      pass(`حسابات ${invoices.length} فاتورة صحيحة`);
    } else {
      fail("حسابات الفواتير", invoiceErrors.join(" | "));
    }
  } catch (e) {
    fail("فحص حسابات الفواتير", e.message);
  }

  // التحقق من أن كل بند فاتورة له مادة موجودة
  try {
    const orphanItems = await query(
      `SELECT COUNT(*) AS cnt FROM invoice_items ii
       LEFT JOIN raw_materials rm ON ii.materialId = rm.id
       WHERE rm.id IS NULL`
    );
    if (parseInt(orphanItems[0].cnt) === 0) {
      pass("جميع بنود الفواتير مرتبطة بمواد موجودة");
    } else {
      fail(
        "بنود فواتير يتيمة",
        `${orphanItems[0].cnt} بند بدون مادة`
      );
    }
  } catch (e) {
    fail("فحص بنود الفواتير", e.message);
  }

  // التحقق من أن المبلغ المدفوع لا يتجاوز الإجمالي
  try {
    const overpaid = await query(
      `SELECT COUNT(*) AS cnt FROM invoices 
       WHERE CAST(paidAmount AS DECIMAL(15,3)) > CAST(totalAmount AS DECIMAL(15,3)) + 0.01`
    );
    if (parseInt(overpaid[0].cnt) === 0) {
      pass("لا توجد فواتير مدفوعة أكثر من الإجمالي");
    } else {
      fail("مبالغ مدفوعة زائدة", `${overpaid[0].cnt} فاتورة`);
    }
  } catch (e) {
    fail("فحص المبالغ المدفوعة", e.message);
  }

  // ─── 4. اختبار المطبخ ─────────────────────────────────────────────
  console.log("\n🍽️ 4. اختبار عمليات المطبخ\n");

  // التحقق من أن رصيد الإغلاق = افتتاح + إنتاج - مستخدم
  try {
    const productions = await query(
      `SELECT id, productName, openingBalance, producedQuantity, usedQuantity, closingBalance 
       FROM kitchen_daily_production LIMIT 20`
    );
    const balanceErrors = [];

    for (const p of productions) {
      const expected =
        parseFloat(p.openingBalance) +
        parseFloat(p.producedQuantity) -
        parseFloat(p.usedQuantity);
      const actual = parseFloat(p.closingBalance);
      const diff = Math.abs(expected - actual);

      if (diff > 0.01) {
        balanceErrors.push(
          `${p.productName} (id=${p.id}): expected=${expected.toFixed(3)}, actual=${actual.toFixed(3)}`
        );
      }
    }

    if (balanceErrors.length === 0) {
      pass(
        `أرصدة المطبخ صحيحة (${productions.length} سجل): افتتاح + إنتاج - مستخدم = إغلاق`
      );
    } else {
      fail("أرصدة المطبخ", balanceErrors.join(" | "));
    }
  } catch (e) {
    fail("فحص أرصدة المطبخ", e.message);
  }

  // التحقق من أن كل سجل مطبخ له مواد مستهلكة (إن وُجدت)
  try {
    const orphanProductions = await query(
      `SELECT COUNT(*) AS cnt FROM kitchen_production_materials kpm
       LEFT JOIN kitchen_daily_production kdp ON kpm.productionId = kdp.id
       WHERE kdp.id IS NULL`
    );
    if (parseInt(orphanProductions[0].cnt) === 0) {
      pass("جميع مواد المطبخ مرتبطة بسجلات إنتاج موجودة");
    } else {
      fail(
        "مواد مطبخ يتيمة",
        `${orphanProductions[0].cnt} سجل`
      );
    }
  } catch (e) {
    fail("فحص مواد المطبخ", e.message);
  }

  // ─── 5. اختبار الوصفات ────────────────────────────────────────────
  console.log("\n📖 5. اختبار الوصفات\n");

  // التحقق من أن كل مكوّن وصفة له مادة موجودة
  try {
    const orphanRecipes = await query(
      `SELECT COUNT(*) AS cnt FROM recipe_items ri
       LEFT JOIN raw_materials rm ON ri.materialId = rm.id
       WHERE rm.id IS NULL`
    );
    if (parseInt(orphanRecipes[0].cnt) === 0) {
      pass("جميع مكونات الوصفات مرتبطة بمواد موجودة");
    } else {
      fail(
        "مكونات وصفات يتيمة",
        `${orphanRecipes[0].cnt} مكوّن`
      );
    }
  } catch (e) {
    fail("فحص مكونات الوصفات", e.message);
  }

  // التحقق من أن كل مكوّن وصفة مصنّعة له مادة موجودة
  try {
    const orphanSemiRecipes = await query(
      `SELECT COUNT(*) AS cnt FROM semi_finished_recipes sfr
       LEFT JOIN raw_materials rm ON sfr.materialId = rm.id
       WHERE rm.id IS NULL`
    );
    if (parseInt(orphanSemiRecipes[0].cnt) === 0) {
      pass("جميع مكونات المواد المصنّعة مرتبطة بمواد موجودة");
    } else {
      fail(
        "مكونات مواد مصنّعة يتيمة",
        `${orphanSemiRecipes[0].cnt} مكوّن`
      );
    }
  } catch (e) {
    fail("فحص مكونات المواد المصنّعة", e.message);
  }

  // ─── 6. اختبار التقارير ───────────────────────────────────────────
  console.log("\n📊 6. اختبار التقارير\n");

  // تقرير تقييم المخزون
  try {
    const [valuationResult] = await query(
      `SELECT 
        COUNT(*) AS materialCount,
        SUM(CASE WHEN materialType = 'raw' THEN currentQuantity * COALESCE(lastPurchasePrice, 0) ELSE 0 END) AS rawValue,
        SUM(CASE WHEN materialType = 'semi_finished' THEN currentQuantity * COALESCE(averageCost, 0) ELSE 0 END) AS semiValue
       FROM raw_materials WHERE isActive = 1 AND currentQuantity > 0`
    );
    const totalValue =
      parseFloat(valuationResult.rawValue || 0) +
      parseFloat(valuationResult.semiValue || 0);
    pass(
      `تقرير تقييم المخزون: ${valuationResult.materialCount} مادة، إجمالي القيمة = ${totalValue.toFixed(2)}`
    );
  } catch (e) {
    fail("تقرير تقييم المخزون", e.message);
  }

  // التحقق من إحصائيات الداشبورد
  try {
    const [stats] = await query(
      `SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN currentQuantity <= 0 THEN 1 ELSE 0 END) AS outOfStock,
        SUM(CASE WHEN currentQuantity > 0 AND currentQuantity <= minimumQuantity THEN 1 ELSE 0 END) AS lowStock
       FROM raw_materials WHERE isActive = 1`
    );
    pass(
      `إحصائيات الداشبورد: ${stats.total} مادة، ${stats.outOfStock} نافدة، ${stats.lowStock} منخفضة`
    );
  } catch (e) {
    fail("إحصائيات الداشبورد", e.message);
  }

  // ─── 7. اختبار المستخدمين والصلاحيات ─────────────────────────────
  console.log("\n👥 7. اختبار المستخدمين\n");

  try {
    const users = await query(
      `SELECT id, email, role FROM users WHERE isActive = 1`
    );
    const adminCount = users.filter((u) => u.role === "admin").length;
    if (adminCount >= 1) {
      pass(`${users.length} مستخدم نشط، ${adminCount} مدير`);
    } else {
      fail("المستخدمون", "لا يوجد مدير نشط في النظام");
    }
  } catch (e) {
    fail("فحص المستخدمين", e.message);
  }

  // ─── النتيجة النهائية ──────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log(`\n📊 نتيجة الاختبار التكاملي:\n`);
  console.log(`  ✅ ناجح: ${passed}`);
  console.log(`  ❌ فاشل: ${failed}`);
  console.log(`  📈 معدل النجاح: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (errors.length > 0) {
    console.log(`\n⚠️  الأخطاء المكتشفة:\n`);
    errors.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.test}: ${e.reason}`);
    });
  }

  await conn.end();
  return { passed, failed, errors };
}

runTests().catch(console.error);
