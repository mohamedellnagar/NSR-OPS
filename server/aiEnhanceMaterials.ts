/**
 * aiEnhanceMaterials.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses OpenAI to improve raw material records:
 *   - Cleaner/standardized Arabic + English names
 *   - Professional SKU codes (CAT-XXX-NNN)
 *   - Suggested minimum and reorder quantities based on category & usage
 */
import OpenAI from "openai";
import mysql from "mysql2/promise";
import { getEffectiveOpenAIApiKey } from "./db";

async function getOpenAI(): Promise<OpenAI> {
  const apiKey = await getEffectiveOpenAIApiKey();
  if (!apiKey) {
    throw new Error("AI feature is not configured. Missing OPENAI_API_KEY.");
  }
  return new OpenAI({ apiKey });
}

interface MaterialIn {
  id: number;
  name: string;
  nameAr: string | null;
  unit: string;
  categoryName: string | null;
  currentQuantity: number;
}

interface AIEnhancement {
  nameAr: string;
  nameEn: string;
  code: string;
  minimumQuantity: number;
  reorderQuantity: number;
}

interface EnhanceResult {
  totalMaterials: number;
  enhanced: number;
  failed: number;
  conflicts: number; // code collisions resolved by suffix
  durationMs: number;
}

interface EnhanceOptions {
  updateNames?: boolean;
  updateCodes?: boolean;
  updateThresholds?: boolean;
  onlyMissing?: boolean; // only materials missing the targeted fields
}

async function askOpenAI(materials: MaterialIn[]): Promise<Map<number, AIEnhancement>> {
  const listText = materials
    .map(
      (m) =>
        `${m.id} | ${m.nameAr || m.name} | ${m.unit} | ${m.categoryName || "غير مصنّف"} | الكمية الحالية: ${m.currentQuantity}`
    )
    .join("\n");

  const completion = await (await getOpenAI()).chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `أنت خبير في إدارة المخزون لمطعم. ستحصل على قائمة مواد خام (id | اسم | وحدة | تصنيف | كمية حالية).
المهمة: لكل مادة، أعد JSON object بالشكل:
{
  "results": {
    "<id>": {
      "nameAr": "اسم عربي نظيف ومنظم",
      "nameEn": "Clean English name",
      "code": "SKU code فريد بصيغة PREFIX-NAME-NUM",
      "minimumQuantity": <رقم>,
      "reorderQuantity": <رقم>
    }
  }
}

قواعد:
1. nameAr: نظّف الاسم العربي، استخدم تسمية معيارية. مثل "فراخ" → "دجاج كامل"، "بصل احمر" → "بصل أحمر"
2. nameEn: ترجمة احترافية موحّدة (lowercase first letter except proper). مثل "Whole Chicken"، "Red Onion"، "Tomato"
3. code: صيغة موحّدة بـ3 أجزاء: {category-prefix}-{name-abbr}-{nnn} مثل:
   - VEG-TOM-001 للطماطم (خضروات)
   - MEAT-BEEF-001 للحم بقري
   - POUL-CHIC-001 للدجاج
   - SPC-CUM-001 للكمون
   - DAI-MLK-001 للحليب
   - GRN-RIC-001 للأرز
   - OIL-SUN-001 لزيت دوار الشمس
   - SAU-TOM-001 لصلصة الطماطم
   استخدم أرقام تسلسلية بدءاً من 001 لكل مادة. اجعل الأكواد فريدة قدر الإمكان.
4. minimumQuantity: حد أدنى منطقي لمطعم متوسط (لو كمية حالية 100kg والاستهلاك متوسط، حط مثلاً 10-20kg). راعِ نوع المادة:
   - خضروات/فواكه طازجة: حد أدنى قليل (تتلف بسرعة)
   - توابل/معلبات: حد أدنى أكبر
   - لحوم/دجاج: حد أدنى متوسط
5. reorderQuantity: عادة 2-3 أضعاف الحد الأدنى

أعد JSON object فقط، بدون أي شرح.`,
      },
      {
        role: "user",
        content: `المواد:\n${listText}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content || "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error("OpenAI returned non-JSON: " + content.slice(0, 200));
  }

  const results = parsed.results || parsed;
  const out = new Map<number, AIEnhancement>();
  for (const [idStr, val] of Object.entries(results)) {
    const id = Number(idStr);
    if (!Number.isFinite(id) || !val || typeof val !== "object") continue;
    const v = val as any;
    out.set(id, {
      nameAr: String(v.nameAr || "").trim(),
      nameEn: String(v.nameEn || "").trim(),
      code: String(v.code || "").trim().toUpperCase().replace(/\s+/g, "-"),
      minimumQuantity: Number(v.minimumQuantity) || 0,
      reorderQuantity: Number(v.reorderQuantity) || 0,
    });
  }
  return out;
}

export async function enhanceMaterialsWithAI(
  opts?: EnhanceOptions
): Promise<EnhanceResult> {
  const startedAt = Date.now();
  const updateNames = opts?.updateNames !== false;
  const updateCodes = opts?.updateCodes !== false;
  const updateThresholds = opts?.updateThresholds !== false;
  const onlyMissing = opts?.onlyMissing === true;

  const apiKey = await getEffectiveOpenAIApiKey();
  if (!apiKey || apiKey.startsWith("sk-placeholder")) {
    throw new Error("OPENAI_API_KEY غير مُعد. أضف مفتاح حقيقي من صفحة الإعدادات أو ملف .env");
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  try {
    // Fetch materials (with category name for richer prompt).
    let where = "WHERE m.materialType = 'raw' AND m.isActive = 1";
    if (onlyMissing) {
      const conds: string[] = [];
      if (updateNames) conds.push("(m.nameAr IS NULL OR m.nameAr = '')");
      if (updateCodes) conds.push("(m.code IS NULL OR m.code = '' OR m.code LIKE 'TEMP%' OR m.code REGEXP '^[0-9]+$')");
      if (updateThresholds) conds.push("(m.minimumQuantity IS NULL OR m.minimumQuantity = 0)");
      if (conds.length) where += ` AND (${conds.join(" OR ")})`;
    }

    const [rows] = (await conn.query(
      `SELECT m.id, m.name, m.nameAr, m.unit, m.currentQuantity, c.nameAr AS categoryName
       FROM raw_materials m
       LEFT JOIN material_categories c ON c.id = m.categoryId
       ${where}
       ORDER BY m.id`
    )) as [any[], any];
    const materials: MaterialIn[] = (rows as any[]).map((r) => ({
      id: r.id,
      name: r.name,
      nameAr: r.nameAr,
      unit: r.unit,
      categoryName: r.categoryName,
      currentQuantity: Number(r.currentQuantity) || 0,
    }));

    if (materials.length === 0) {
      return {
        totalMaterials: 0,
        enhanced: 0,
        failed: 0,
        conflicts: 0,
        durationMs: Date.now() - startedAt,
      };
    }

    // Track existing codes (so we can dedupe AI-generated ones).
    const [existingCodesRows] = (await conn.query(
      "SELECT code FROM raw_materials WHERE code IS NOT NULL AND code != ''"
    )) as [any[], any];
    const usedCodes = new Set<string>(
      (existingCodesRows as any[]).map((r) => String(r.code).toUpperCase())
    );

    const BATCH = 40;
    let enhanced = 0;
    let failed = 0;
    let conflicts = 0;

    for (let i = 0; i < materials.length; i += BATCH) {
      const batch = materials.slice(i, i + BATCH);
      let assignments: Map<number, AIEnhancement>;
      try {
        assignments = await askOpenAI(batch);
      } catch (err) {
        console.error(`[AI Enhance] Batch ${i / BATCH + 1} failed:`, err);
        failed += batch.length;
        continue;
      }

      for (const mat of batch) {
        const e = assignments.get(mat.id);
        if (!e) {
          failed += 1;
          continue;
        }

        // De-dupe code: if collision, append -2, -3, ...
        let finalCode = e.code;
        if (updateCodes && finalCode) {
          // Remove from used set the material's OWN existing code so it doesn't conflict with itself
          let attempt = 1;
          let candidate = finalCode;
          while (usedCodes.has(candidate.toUpperCase())) {
            attempt += 1;
            candidate = `${finalCode}-${attempt}`;
            if (attempt > 50) break;
          }
          if (candidate !== finalCode) conflicts += 1;
          finalCode = candidate;
          usedCodes.add(finalCode.toUpperCase());
        }

        // Build dynamic UPDATE.
        const setParts: string[] = [];
        const vals: any[] = [];
        if (updateNames && e.nameAr) {
          setParts.push("nameAr = ?");
          vals.push(e.nameAr);
        }
        if (updateNames && e.nameEn) {
          setParts.push("name = ?");
          vals.push(e.nameEn);
        }
        if (updateCodes && finalCode) {
          setParts.push("code = ?");
          vals.push(finalCode);
        }
        if (updateThresholds && e.minimumQuantity > 0) {
          setParts.push("minimumQuantity = ?");
          vals.push(String(e.minimumQuantity));
        }
        if (updateThresholds && e.reorderQuantity > 0) {
          setParts.push("reorderQuantity = ?");
          vals.push(String(e.reorderQuantity));
        }

        if (setParts.length === 0) {
          failed += 1;
          continue;
        }

        setParts.push("updatedAt = NOW()");
        vals.push(mat.id);

        try {
          await conn.execute(
            `UPDATE raw_materials SET ${setParts.join(", ")} WHERE id = ?`,
            vals
          );
          enhanced += 1;
        } catch (err) {
          console.error(`[AI Enhance] Update failed for material ${mat.id}:`, err);
          failed += 1;
        }
      }
    }

    return {
      totalMaterials: materials.length,
      enhanced,
      failed,
      conflicts,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await conn.end();
  }
}
