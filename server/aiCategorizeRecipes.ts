/**
 * aiCategorizeRecipes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses OpenAI to auto-categorize menu products/recipes by name & description.
 * Picks from the categories already used across products (plus a standard
 * fallback set of common menu categories), e.g. "سندوتش كبدة" → "السندوتشات",
 * "شيش طاووق" → "المشاوي".
 */
import OpenAI from "openai";
import mysql from "mysql2/promise";
import { getConn } from "./pool";
import { getEffectiveOpenAIApiKey } from "./db";

async function getOpenAI(): Promise<OpenAI> {
  const apiKey = await getEffectiveOpenAIApiKey();
  if (!apiKey) {
    throw new Error("AI feature is not configured. Missing OPENAI_API_KEY.");
  }
  return new OpenAI({ apiKey });
}

// Common Arabic menu categories used as a fallback if the menu has few/no categories yet.
const STANDARD_MENU_CATEGORIES = [
  "المقبلات",
  "السلطات",
  "الشوربات",
  "السندوتشات",
  "المشاوي",
  "الدجاج",
  "اللحوم",
  "البحريات",
  "الأرز والمعكرونة",
  "البيتزا",
  "المعجنات",
  "الحلويات",
  "المشروبات",
  "العصائر",
  "أخرى",
];

interface CategorizeResult {
  totalProducts: number;
  categorized: number;
  failed: number;
  durationMs: number;
}

interface ProductRow {
  id: number;
  name: string;
  nameAr: string | null;
  description: string | null;
}

async function askOpenAI(
  products: ProductRow[],
  categoryNames: string[]
): Promise<Map<number, string>> {
  const productList = products
    .map((p) => {
      const title = p.nameAr || p.name;
      const desc = p.description ? ` — ${p.description}` : "";
      return `${p.id}: ${title}${desc}`;
    })
    .join("\n");
  const catList = categoryNames.join(" | ");

  const completion = await (await getOpenAI()).chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `أنت مساعد متخصص في تصنيف أصناف منيو مطعم حسب اسمها ووصفها.
ستحصل على قائمة أصناف وقائمة فئات.
أعد JSON object بالشكل { "assignments": { "<id>": "<category>", ... } } حيث:
- المفتاح هو id الصنف
- القيمة هي اسم الفئة بالعربي بالضبط من القائمة المعطاة (الأقرب لطبيعة الصنف)
- مثال: "سندوتش كبدة" تُصنّف ضمن "السندوتشات"، و"شيش طاووق" يُصنّف ضمن "المشاوي"
- إذا لم تكن متأكداً ولم تجد فئة مناسبة، استخدم "أخرى"
- لا تخترع فئات خارج القائمة المعطاة`,
      },
      {
        role: "user",
        content: `الفئات المتاحة: ${catList}\n\nالأصناف:\n${productList}\n\nأعد JSON object فقط بدون أي شرح.`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content || "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error("OpenAI returned non-JSON response: " + content.slice(0, 200));
  }

  const assignments = parsed.assignments || parsed;
  const result = new Map<number, string>();
  for (const [idStr, catName] of Object.entries(assignments)) {
    const id = Number(idStr);
    if (!Number.isFinite(id)) continue;
    if (typeof catName !== "string") continue;
    result.set(id, catName);
  }
  return result;
}

export async function autoCategorizeProducts(opts?: {
  onlyUncategorized?: boolean;
}): Promise<CategorizeResult> {
  const startedAt = Date.now();
  const onlyUncategorized = opts?.onlyUncategorized !== false; // default true

  const apiKey = await getEffectiveOpenAIApiKey();
  if (!apiKey || apiKey.startsWith("sk-placeholder")) {
    throw new Error("OPENAI_API_KEY غير مُعد. أضف مفتاح حقيقي من صفحة الإعدادات أو ملف .env");
  }

  const conn = await getConn();

  try {
    // 1. Collect the categories already in use across products.
    const [catRows] = (await conn.query(
      "SELECT DISTINCT categoryReference FROM products WHERE categoryReference IS NOT NULL AND categoryReference != ''"
    )) as [any[], any];
    const existingCategories = (catRows as any[]).map((r) => r.categoryReference as string);

    const categoryNames = Array.from(
      new Set([...existingCategories, ...STANDARD_MENU_CATEGORIES])
    );

    // 2. Fetch products to categorize.
    const where = onlyUncategorized
      ? "WHERE isActive = 1 AND (categoryReference IS NULL OR categoryReference = '')"
      : "WHERE isActive = 1";
    const [rows] = (await conn.query(
      `SELECT id, name, nameAr, description FROM products ${where} ORDER BY id`
    )) as [any[], any];
    const products = rows as ProductRow[];

    if (products.length === 0) {
      return {
        totalProducts: 0,
        categorized: 0,
        failed: 0,
        durationMs: Date.now() - startedAt,
      };
    }

    // 3. Ask OpenAI in batches (avoid huge prompts).
    const BATCH = 60;
    let categorized = 0;
    let failed = 0;

    for (let i = 0; i < products.length; i += BATCH) {
      const batch = products.slice(i, i + BATCH);
      try {
        const assignments = await askOpenAI(batch, categoryNames);

        for (const product of batch) {
          const catName = assignments.get(product.id);
          if (!catName) {
            failed += 1;
            continue;
          }
          await conn.execute(
            "UPDATE products SET categoryReference = ?, updatedAt = NOW() WHERE id = ?",
            [catName, product.id]
          );
          categorized += 1;
        }
      } catch (err) {
        console.error(`[AI Recipe Categorizer] Batch ${i / BATCH + 1} failed:`, err);
        failed += batch.length;
      }
    }

    return {
      totalProducts: products.length,
      categorized,
      failed,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await conn.release();
  }
}
