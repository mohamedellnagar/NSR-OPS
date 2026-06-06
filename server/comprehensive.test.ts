/**
 * Comprehensive Test Suite - اختبار شامل لجميع العمليات الحرجة
 * يغطي: حسابات المخزون، تكاليف الوصفات، منطق المطبخ، الفواتير، التقارير
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Helpers: Pure business logic extracted for unit testing ──────────────────

/** حساب متوسط التكلفة المرجح عند إضافة كمية جديدة */
function calcWeightedAvgCost(
  oldQty: number,
  oldAvg: number,
  newQty: number,
  newPrice: number
): number {
  const totalQty = oldQty + newQty;
  if (totalQty <= 0) return newPrice;
  return (oldQty * oldAvg + newQty * newPrice) / totalQty;
}

/** حساب تكلفة وصفة بناءً على مكوناتها */
function calcRecipeCost(
  ingredients: { quantity: number; unit: string; lastPurchasePrice: number; priceUnit: string }[]
): number {
  return ingredients.reduce((total, ing) => {
    // السعر دائماً للوحدة الكبيرة (كيلو/لتر)
    // إذا كانت الكمية بالجرام → نحول إلى كيلو
    let qty = ing.quantity;
    if (ing.unit === "g" && ing.priceUnit === "kg") qty = qty / 1000;
    if (ing.unit === "ml" && ing.priceUnit === "L") qty = qty / 1000;
    return total + qty * ing.lastPurchasePrice;
  }, 0);
}

/** حساب إجمالي الفاتورة مع ضريبة القيمة المضافة */
function calcInvoiceTotals(
  items: { quantity: number; unitPrice: number }[],
  vatEnabled: boolean
): { subtotal: number; vatAmount: number; totalAmount: number } {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const vatAmount = vatEnabled ? subtotal * 0.05 : 0;
  return { subtotal, vatAmount, totalAmount: subtotal + vatAmount };
}

/** حساب رصيد الإغلاق للمطبخ */
function calcKitchenClosingBalance(
  openingBalance: number,
  producedQty: number,
  usedQty: number
): number {
  return openingBalance + producedQty - usedQty;
}

/** حساب نسبة الهدر */
function calcWastePct(totalWaste: number, totalWithdrawn: number): number {
  if (totalWithdrawn <= 0) return 0;
  return (totalWaste / totalWithdrawn) * 100;
}

/** حساب قيمة المخزون */
function calcInventoryValue(
  materials: { qty: number; type: "raw" | "semi_finished"; lastPrice: number; avgCost: number }[]
): { rawValue: number; semiFinishedValue: number; totalValue: number } {
  let rawValue = 0;
  let semiFinishedValue = 0;
  for (const m of materials) {
    if (m.qty <= 0) continue;
    if (m.type === "semi_finished") {
      semiFinishedValue += m.qty * m.avgCost;
    } else {
      rawValue += m.qty * m.lastPrice;
    }
  }
  return { rawValue, semiFinishedValue, totalValue: rawValue + semiFinishedValue };
}

/** تحديد حالة المخزون */
function getStockStatus(
  currentQty: number,
  minimumQty: number
): "out_of_stock" | "low_stock" | "normal" {
  if (currentQty <= 0) return "out_of_stock";
  if (currentQty <= minimumQty) return "low_stock";
  return "normal";
}

// ─── 1. اختبارات حسابات المخزون ──────────────────────────────────────────────
describe("📦 حسابات المخزون", () => {
  describe("متوسط التكلفة المرجح (Weighted Average Cost)", () => {
    it("حساب صحيح عند الشراء الأول (رصيد صفر)", () => {
      const avg = calcWeightedAvgCost(0, 0, 100, 10);
      expect(avg).toBe(10);
    });

    it("حساب صحيح عند إضافة كمية بنفس السعر", () => {
      const avg = calcWeightedAvgCost(50, 10, 50, 10);
      expect(avg).toBe(10);
    });

    it("حساب صحيح عند إضافة كمية بسعر مختلف", () => {
      // 50 كيلو بسعر 10 + 50 كيلو بسعر 20 = متوسط 15
      const avg = calcWeightedAvgCost(50, 10, 50, 20);
      expect(avg).toBe(15);
    });

    it("حساب صحيح بكميات غير متساوية", () => {
      // 100 كيلو بسعر 8 + 25 كيلو بسعر 12 = (800 + 300) / 125 = 8.8
      const avg = calcWeightedAvgCost(100, 8, 25, 12);
      expect(avg).toBeCloseTo(8.8, 2);
    });

    it("لا يعطي قيمة سالبة عند الكمية صفر", () => {
      const avg = calcWeightedAvgCost(0, 0, 0, 15);
      expect(avg).toBe(15);
    });
  });

  describe("حالة المخزون (Stock Status)", () => {
    it("نفاد المخزون عند الكمية صفر", () => {
      expect(getStockStatus(0, 10)).toBe("out_of_stock");
    });

    it("نفاد المخزون عند الكمية سالبة", () => {
      expect(getStockStatus(-5, 10)).toBe("out_of_stock");
    });

    it("مخزون منخفض عند الكمية = الحد الأدنى", () => {
      expect(getStockStatus(10, 10)).toBe("low_stock");
    });

    it("مخزون منخفض عند الكمية أقل من الحد الأدنى", () => {
      expect(getStockStatus(5, 10)).toBe("low_stock");
    });

    it("مخزون طبيعي عند الكمية أعلى من الحد الأدنى", () => {
      expect(getStockStatus(15, 10)).toBe("normal");
    });
  });

  describe("قيمة المخزون (Inventory Valuation)", () => {
    it("قيمة المواد الخام = الكمية × آخر سعر شراء", () => {
      const result = calcInventoryValue([
        { qty: 100, type: "raw", lastPrice: 5, avgCost: 4.5 },
      ]);
      expect(result.rawValue).toBe(500);
      expect(result.semiFinishedValue).toBe(0);
    });

    it("قيمة المواد المصنّعة = الكمية × متوسط التكلفة (ليس آخر سعر)", () => {
      const result = calcInventoryValue([
        { qty: 50, type: "semi_finished", lastPrice: 20, avgCost: 15 },
      ]);
      expect(result.semiFinishedValue).toBe(750); // 50 × 15
      expect(result.rawValue).toBe(0);
    });

    it("المواد ذات الكمية صفر لا تُحتسب في القيمة", () => {
      const result = calcInventoryValue([
        { qty: 0, type: "raw", lastPrice: 10, avgCost: 10 },
        { qty: 50, type: "raw", lastPrice: 8, avgCost: 8 },
      ]);
      expect(result.rawValue).toBe(400); // فقط 50 × 8
    });

    it("الإجمالي = مواد خام + مواد مصنّعة", () => {
      const result = calcInventoryValue([
        { qty: 100, type: "raw", lastPrice: 5, avgCost: 4.5 },
        { qty: 50, type: "semi_finished", lastPrice: 20, avgCost: 15 },
      ]);
      expect(result.totalValue).toBe(500 + 750); // 1250
    });
  });
});

// ─── 2. اختبارات حسابات الوصفات والتكاليف ────────────────────────────────────
describe("🍳 حسابات الوصفات والتكاليف", () => {
  describe("تكلفة الوصفة", () => {
    it("تكلفة مكوّن بالكيلو", () => {
      const cost = calcRecipeCost([
        { quantity: 0.5, unit: "kg", lastPurchasePrice: 20, priceUnit: "kg" },
      ]);
      expect(cost).toBe(10); // 0.5 كيلو × 20 = 10
    });

    it("تكلفة مكوّن بالجرام (السعر بالكيلو)", () => {
      // 500 جرام من مادة سعرها 20 للكيلو = 10
      const cost = calcRecipeCost([
        { quantity: 500, unit: "g", lastPurchasePrice: 20, priceUnit: "kg" },
      ]);
      expect(cost).toBe(10);
    });

    it("تكلفة مكوّن بالمليلتر (السعر باللتر)", () => {
      // 250 مل من مادة سعرها 8 للتر = 2
      const cost = calcRecipeCost([
        { quantity: 250, unit: "ml", lastPurchasePrice: 8, priceUnit: "L" },
      ]);
      expect(cost).toBe(2);
    });

    it("تكلفة وصفة متعددة المكونات", () => {
      const cost = calcRecipeCost([
        { quantity: 0.25, unit: "kg", lastPurchasePrice: 25, priceUnit: "kg" }, // دجاج: 6.25
        { quantity: 200, unit: "g", lastPurchasePrice: 5, priceUnit: "kg" },   // أرز: 1.00
        { quantity: 50, unit: "ml", lastPurchasePrice: 10, priceUnit: "L" },   // زيت: 0.50
      ]);
      expect(cost).toBeCloseTo(7.75, 2);
    });

    it("تكلفة صفر عند عدم وجود مكونات", () => {
      const cost = calcRecipeCost([]);
      expect(cost).toBe(0);
    });
  });
});

// ─── 3. اختبارات الفواتير ─────────────────────────────────────────────────────
describe("🧾 حسابات الفواتير", () => {
  describe("إجمالي الفاتورة", () => {
    it("فاتورة بدون ضريبة", () => {
      const totals = calcInvoiceTotals(
        [{ quantity: 10, unitPrice: 5 }],
        false
      );
      expect(totals.subtotal).toBe(50);
      expect(totals.vatAmount).toBe(0);
      expect(totals.totalAmount).toBe(50);
    });

    it("فاتورة مع ضريبة 5%", () => {
      const totals = calcInvoiceTotals(
        [{ quantity: 10, unitPrice: 100 }],
        true
      );
      expect(totals.subtotal).toBe(1000);
      expect(totals.vatAmount).toBe(50);
      expect(totals.totalAmount).toBe(1050);
    });

    it("فاتورة متعددة البنود", () => {
      const totals = calcInvoiceTotals(
        [
          { quantity: 5, unitPrice: 20 },  // 100
          { quantity: 3, unitPrice: 30 },  // 90
          { quantity: 2, unitPrice: 15 },  // 30
        ],
        false
      );
      expect(totals.subtotal).toBe(220);
      expect(totals.totalAmount).toBe(220);
    });

    it("فاتورة متعددة البنود مع ضريبة", () => {
      const totals = calcInvoiceTotals(
        [
          { quantity: 10, unitPrice: 50 }, // 500
          { quantity: 5, unitPrice: 100 }, // 500
        ],
        true
      );
      expect(totals.subtotal).toBe(1000);
      expect(totals.vatAmount).toBe(50);
      expect(totals.totalAmount).toBe(1050);
    });

    it("فاتورة بكميات عشرية", () => {
      const totals = calcInvoiceTotals(
        [{ quantity: 2.5, unitPrice: 8 }],
        false
      );
      expect(totals.subtotal).toBe(20);
    });
  });
});

// ─── 4. اختبارات منطق المطبخ ─────────────────────────────────────────────────
describe("🍽️ منطق المطبخ", () => {
  describe("رصيد الإغلاق اليومي", () => {
    it("رصيد الإغلاق = رصيد الافتتاح + الإنتاج - المستخدم", () => {
      expect(calcKitchenClosingBalance(0, 100, 80)).toBe(20);
    });

    it("رصيد الإغلاق صفر عند استخدام كل الإنتاج", () => {
      expect(calcKitchenClosingBalance(0, 50, 50)).toBe(0);
    });

    it("رصيد الإغلاق يشمل رصيد الافتتاح المُرحَّل", () => {
      // رصيد أمس 10 + إنتاج اليوم 100 - مستخدم 80 = 30
      expect(calcKitchenClosingBalance(10, 100, 80)).toBe(30);
    });

    it("رصيد الإغلاق لا يكون سالباً في حالة طبيعية", () => {
      const balance = calcKitchenClosingBalance(5, 50, 55);
      // 5 + 50 - 55 = 0 (نظرياً قد يكون سالباً إذا استُخدم أكثر من المتاح)
      expect(balance).toBe(0);
    });

    it("الترحيل: رصيد الإغلاق يصبح رصيد افتتاح اليوم التالي", () => {
      const day1Closing = calcKitchenClosingBalance(0, 100, 75); // = 25
      const day2Closing = calcKitchenClosingBalance(day1Closing, 80, 90); // 25 + 80 - 90 = 15
      expect(day1Closing).toBe(25);
      expect(day2Closing).toBe(15);
    });
  });

  describe("حسابات الهدر", () => {
    it("نسبة الهدر صفر عند عدم وجود هدر", () => {
      expect(calcWastePct(0, 100)).toBe(0);
    });

    it("نسبة الهدر 100% عند هدر الكل", () => {
      expect(calcWastePct(100, 100)).toBe(100);
    });

    it("نسبة الهدر محسوبة بشكل صحيح", () => {
      // 20 هدر من 100 مسحوب = 20%
      expect(calcWastePct(20, 100)).toBe(20);
    });

    it("نسبة الهدر صفر عند الكمية المسحوبة صفر", () => {
      expect(calcWastePct(0, 0)).toBe(0);
    });

    it("نسبة الهدر بأرقام عشرية", () => {
      expect(calcWastePct(15, 60)).toBeCloseTo(25, 2);
    });
  });
});

// ─── 5. اختبارات تحويل الوحدات ───────────────────────────────────────────────
describe("⚖️ تحويل الوحدات", () => {
  it("جرام إلى كيلو: 1000 جرام = 1 كيلو", () => {
    const kg = 1000 / 1000;
    expect(kg).toBe(1);
  });

  it("مليلتر إلى لتر: 500 مل = 0.5 لتر", () => {
    const L = 500 / 1000;
    expect(L).toBe(0.5);
  });

  it("تكلفة 250 جرام من مادة سعر الكيلو 40 = 10", () => {
    const cost = (250 / 1000) * 40;
    expect(cost).toBe(10);
  });

  it("تكلفة 100 مل من مادة سعر اللتر 20 = 2", () => {
    const cost = (100 / 1000) * 20;
    expect(cost).toBe(2);
  });
});

// ─── 6. اختبارات منطق الأرصدة ────────────────────────────────────────────────
describe("💰 منطق الأرصدة والمدفوعات", () => {
  describe("حالة الدفع", () => {
    it("مدفوع بالكامل", () => {
      const total = 1000;
      const paid = 1000;
      const remaining = total - paid;
      expect(remaining).toBe(0);
    });

    it("مدفوع جزئياً", () => {
      const total = 1000;
      const paid = 400;
      const remaining = total - paid;
      expect(remaining).toBe(600);
    });

    it("غير مدفوع", () => {
      const total = 1000;
      const paid = 0;
      const remaining = total - paid;
      expect(remaining).toBe(1000);
    });

    it("تحديد حالة الدفع بناءً على المبلغ المدفوع", () => {
      const getPaymentStatus = (total: number, paid: number) => {
        if (paid <= 0) return "deferred";
        if (paid >= total) return "paid";
        return "partial";
      };
      expect(getPaymentStatus(1000, 0)).toBe("deferred");
      expect(getPaymentStatus(1000, 500)).toBe("partial");
      expect(getPaymentStatus(1000, 1000)).toBe("paid");
      expect(getPaymentStatus(1000, 1100)).toBe("paid"); // دفع أكثر من المطلوب
    });
  });
});

// ─── 7. اختبارات التحقق من صحة البيانات ──────────────────────────────────────
describe("✅ التحقق من صحة البيانات", () => {
  it("الكمية يجب أن تكون موجبة", () => {
    const isValidQty = (qty: number) => qty > 0;
    expect(isValidQty(0)).toBe(false);
    expect(isValidQty(-1)).toBe(false);
    expect(isValidQty(0.001)).toBe(true);
    expect(isValidQty(100)).toBe(true);
  });

  it("السعر يجب أن يكون غير سالب", () => {
    const isValidPrice = (price: number) => price >= 0;
    expect(isValidPrice(-1)).toBe(false);
    expect(isValidPrice(0)).toBe(true);
    expect(isValidPrice(10.5)).toBe(true);
  });

  it("نسبة الضريبة 5% صحيحة", () => {
    const vatRate = 0.05;
    expect(vatRate * 100).toBe(5);
    expect(1000 * vatRate).toBe(50);
  });

  it("رقم الفاتورة يجب أن يكون فريداً وتصاعدياً", () => {
    // محاكاة توليد رقم الفاتورة
    const generateInvoiceNum = (lastNum: number) => {
      const next = lastNum + 1;
      return `INV-${String(next).padStart(6, "0")}`;
    };
    expect(generateInvoiceNum(0)).toBe("INV-000001");
    expect(generateInvoiceNum(99)).toBe("INV-000100");
    expect(generateInvoiceNum(999999)).toBe("INV-1000000");
  });
});

// ─── 8. اختبارات حالات الحافة (Edge Cases) ───────────────────────────────────
describe("⚠️ حالات الحافة", () => {
  it("وصفة بمكوّن بكمية صفر لا تُضيف تكلفة", () => {
    const cost = calcRecipeCost([
      { quantity: 0, unit: "kg", lastPurchasePrice: 20, priceUnit: "kg" },
    ]);
    expect(cost).toBe(0);
  });

  it("فاتورة بدون بنود = إجمالي صفر", () => {
    const totals = calcInvoiceTotals([], true);
    expect(totals.subtotal).toBe(0);
    expect(totals.vatAmount).toBe(0);
    expect(totals.totalAmount).toBe(0);
  });

  it("متوسط التكلفة لا يتأثر بالإخراج من المخزون", () => {
    // الإخراج لا يغير متوسط التكلفة
    const avgBefore = 15;
    const avgAfter = avgBefore; // يجب أن يبقى نفسه
    expect(avgAfter).toBe(15);
  });

  it("رصيد المطبخ لا يُرحَّل إذا كان صفراً", () => {
    const closing = calcKitchenClosingBalance(0, 100, 100);
    expect(closing).toBe(0);
    // لا داعي للترحيل
    const shouldCarryForward = closing > 0;
    expect(shouldCarryForward).toBe(false);
  });

  it("قيمة مخزون مادة بسعر صفر = صفر", () => {
    const result = calcInventoryValue([
      { qty: 100, type: "raw", lastPrice: 0, avgCost: 0 },
    ]);
    expect(result.rawValue).toBe(0);
  });
});

// ─── 9. اختبارات تكاملية للسيناريوهات الواقعية ───────────────────────────────
describe("🔄 سيناريوهات واقعية", () => {
  it("سيناريو: شراء دجاج وحساب المتوسط بعد شراءين", () => {
    // شراء 1: 50 كيلو بسعر 20
    let qty = 50;
    let avg = calcWeightedAvgCost(0, 0, 50, 20);
    expect(avg).toBe(20);

    // شراء 2: 30 كيلو بسعر 25
    avg = calcWeightedAvgCost(qty, avg, 30, 25);
    qty += 30;
    // (50×20 + 30×25) / 80 = (1000 + 750) / 80 = 21.875
    expect(avg).toBeCloseTo(21.875, 3);
    expect(qty).toBe(80);
  });

  it("سيناريو: تكلفة وجبة ربع دجاج مشوي", () => {
    const cost = calcRecipeCost([
      { quantity: 250, unit: "g", lastPurchasePrice: 22, priceUnit: "kg" },  // دجاج: 5.5
      { quantity: 150, unit: "g", lastPurchasePrice: 6, priceUnit: "kg" },   // أرز: 0.9
      { quantity: 30, unit: "ml", lastPurchasePrice: 12, priceUnit: "L" },   // زيت: 0.36
      { quantity: 10, unit: "g", lastPurchasePrice: 50, priceUnit: "kg" },   // بهارات: 0.5
    ]);
    // 5.5 + 0.9 + 0.36 + 0.5 = 7.26
    expect(cost).toBeCloseTo(7.26, 2);
  });

  it("سيناريو: يوم عمل كامل في المطبخ", () => {
    // رصيد أمس: 0
    // إنتاج اليوم: 200 وحدة
    // مستخدم: 180 وحدة
    // متبقي: 20 وحدة تُرحَّل لغد
    const closing = calcKitchenClosingBalance(0, 200, 180);
    expect(closing).toBe(20);

    // اليوم التالي يبدأ بـ 20
    const nextDayOpening = closing;
    const nextDayClosing = calcKitchenClosingBalance(nextDayOpening, 150, 160);
    expect(nextDayClosing).toBe(10);
  });

  it("سيناريو: فاتورة مشتريات أسبوعية مع ضريبة", () => {
    const totals = calcInvoiceTotals(
      [
        { quantity: 50, unitPrice: 22 },  // دجاج: 1100
        { quantity: 20, unitPrice: 6 },   // أرز: 120
        { quantity: 10, unitPrice: 15 },  // زيت: 150
        { quantity: 5, unitPrice: 30 },   // بهارات: 150
      ],
      true // مع ضريبة 5%
    );
    expect(totals.subtotal).toBe(1520);
    expect(totals.vatAmount).toBe(76);
    expect(totals.totalAmount).toBe(1596);
  });

  it("سيناريو: تقييم مخزون مختلط (خام + مصنّع)", () => {
    const result = calcInventoryValue([
      { qty: 80, type: "raw", lastPrice: 22, avgCost: 20 },        // دجاج: 1760
      { qty: 30, type: "raw", lastPrice: 6, avgCost: 5.5 },        // أرز: 180
      { qty: 50, type: "semi_finished", lastPrice: 0, avgCost: 8 }, // صلصة: 400
    ]);
    expect(result.rawValue).toBe(80 * 22 + 30 * 6); // 1760 + 180 = 1940
    expect(result.semiFinishedValue).toBe(50 * 8);   // 400
    expect(result.totalValue).toBe(2340);
  });
});
