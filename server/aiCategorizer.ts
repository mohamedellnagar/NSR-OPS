/**
 * aiCategorizer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses OpenAI to auto-categorize raw materials by name. Creates a standard set
 * of categories (vegetables, meat, chicken, spices, etc.) if none exist, then
 * asks OpenAI to map each uncategorized material → category, and persists.
 */
import OpenAI from "openai";
import mysql from "mysql2/promise";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Standard restaurant pantry categories. Order matches the typical UI sort.
const STANDARD_CATEGORIES: Array<{ name: string; nameAr: string; color: string }> = [
  { name: "Vegetables", nameAr: "خضروات", color: "#22c55e" },
  { name: "Fruits", nameAr: "فواكه", color: "#f97316" },
  { name: "Meat", nameAr: "لحوم", color: "#ef4444" },
  { name: "Poultry", nameAr: "دجاج", color: "#eab308" },
  { name: "Seafood", nameAr: "أسماك ومأكولات بحرية", color: "#06b6d4" },
  { name: "Dairy & Eggs", nameAr: "ألبان وبيض", color: "#fde68a" },
  { name: "Grains & Rice", nameAr: "حبوب وأرز", color: "#d97706" },
  { name: "Bread & Bakery", nameAr: "خبز ومخبوزات", color: "#a16207" },
  { name: "Oils & Ghee", nameAr: "زيوت وسمن", color: "#fbbf24" },
  { name: "Spices & Herbs", nameAr: "توابل وأعشاب", color: "#92400e" },
  { name: "Sauces & Condiments", nameAr: "صلصات ومخللات", color: "#7c3aed" },
  { name: "Legumes & Nuts", nameAr: "بقوليات ومكسرات", color: "#854d0e" },
  { name: "Beverages", nameAr: "مشروبات", color: "#3b82f6" },
  { name: "Canned & Packaged", nameAr: "معلبات ومجمدات", color: "#64748b" },
  { name: "Sweets & Desserts", nameAr: "حلويات وسكريات", color: "#ec4899" },
  { name: "Cleaning & Disposables", nameAr: "تنظيف ومستلزمات", color: "#94a3b8" },
  { name: "Other", nameAr: "أخرى", color: "#6b7280" },
];

interface CategorizeResult {
  totalMaterials: number;
  categorized: number;
  failed: number;
  skipped: number;
  categoriesEnsured: number;
  durationMs: number;
}

async function ensureCategories(
  conn: mysql.Connection
): Promise<{ idByName: Map<string, number>; createdCount: number }> {
  const [existing] = (await conn.query(
    "SELECT id, name, nameAr FROM material_categories"
  )) as [any[], any];

  const idByName = new Map<string, number>();
  const haveByName = new Set<string>();
  const haveByNameAr = new Set<string>();
  for (const c of existing as any[]) {
    if (c.name) {
      idByName.set(c.name.toLowerCase(), c.id);
      haveByName.add(c.name.toLowerCase());
    }
    if (c.nameAr) {
      idByName.set(c.nameAr, c.id);
      haveByNameAr.add(c.nameAr);
    }
  }

  let createdCount = 0;
  for (const cat of STANDARD_CATEGORIES) {
    if (haveByName.has(cat.name.toLowerCase()) || haveByNameAr.has(cat.nameAr)) {
      continue;
    }
    const [res] = (await conn.execute(
      "INSERT INTO material_categories (name, nameAr, color, isActive, createdAt, updatedAt) VALUES (?, ?, ?, 1, NOW(), NOW())",
      [cat.name, cat.nameAr, cat.color]
    )) as any[];
    const id = (res as any).insertId;
    idByName.set(cat.name.toLowerCase(), id);
    idByName.set(cat.nameAr, id);
    createdCount += 1;
  }

  return { idByName, createdCount };
}

interface MaterialRow {
  id: number;
  name: string;
  nameAr: string | null;
}

async function askOpenAI(
  materials: MaterialRow[],
  categoryNames: string[]
): Promise<Map<number, string>> {
  // Build a prompt asking for a strict JSON object mapping id → category name.
  const materialList = materials
    .map((m) => `${m.id}: ${m.nameAr || m.name}`)
    .join("\n");
  const catList = categoryNames.join(" | ");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `أنت مساعد متخصص في تصنيف المواد الخام لمطعم. ستحصل على قائمة مواد وقائمة تصنيفات.
أعد JSON object بالشكل { "assignments": { "<id>": "<category>", ... } } حيث:
- المفتاح هو id المادة
- القيمة هي اسم التصنيف بالعربي بالضبط من القائمة المعطاة
- إذا لم تكن متأكداً، استخدم "أخرى"
- لا تخترع تصنيفات خارج القائمة`,
      },
      {
        role: "user",
        content: `التصنيفات المتاحة: ${catList}\n\nالمواد:\n${materialList}\n\nأعد JSON object فقط بدون أي شرح.`,
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

export async function autoCategorizeMaterials(opts?: {
  onlyUncategorized?: boolean;
}): Promise<CategorizeResult> {
  const startedAt = Date.now();
  const onlyUncategorized = opts?.onlyUncategorized !== false; // default true

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith("sk-placeholder")) {
    throw new Error("OPENAI_API_KEY غير مُعد. ضع مفتاح حقيقي في .env");
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  try {
    // 1. Ensure the standard category set exists.
    const { idByName, createdCount } = await ensureCategories(conn);

    // 2. Fetch materials to categorize.
    const where = onlyUncategorized
      ? "WHERE materialType = 'raw' AND categoryId IS NULL AND isActive = 1"
      : "WHERE materialType = 'raw' AND isActive = 1";
    const [rows] = (await conn.query(
      `SELECT id, name, nameAr FROM raw_materials ${where} ORDER BY id`
    )) as [any[], any];
    const materials = rows as MaterialRow[];

    if (materials.length === 0) {
      return {
        totalMaterials: 0,
        categorized: 0,
        failed: 0,
        skipped: 0,
        categoriesEnsured: createdCount,
        durationMs: Date.now() - startedAt,
      };
    }

    // 3. Ask OpenAI in batches (avoid huge prompts).
    const BATCH = 80;
    const categoryArNames = STANDARD_CATEGORIES.map((c) => c.nameAr);
    let categorized = 0;
    let failed = 0;

    for (let i = 0; i < materials.length; i += BATCH) {
      const batch = materials.slice(i, i + BATCH);
      try {
        const assignments = await askOpenAI(batch, categoryArNames);

        for (const mat of batch) {
          const catName = assignments.get(mat.id);
          if (!catName) {
            failed += 1;
            continue;
          }
          const catId = idByName.get(catName) ?? idByName.get(catName.toLowerCase());
          if (!catId) {
            failed += 1;
            continue;
          }
          await conn.execute(
            "UPDATE raw_materials SET categoryId = ?, updatedAt = NOW() WHERE id = ?",
            [catId, mat.id]
          );
          categorized += 1;
        }
      } catch (err) {
        console.error(`[AI Categorizer] Batch ${i / BATCH + 1} failed:`, err);
        failed += batch.length;
      }
    }

    return {
      totalMaterials: materials.length,
      categorized,
      failed,
      skipped: 0,
      categoriesEnsured: createdCount,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await conn.end();
  }
}
