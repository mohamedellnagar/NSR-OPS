/**
 * Price Comparison Router
 * مقارنة أسعار القوائم بين مطاعم مختلفة على نفس المنصة
 * AI يطابق الأصناف المتشابهة تلقائياً رغم اختلاف المسميات
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import {
  priceComparisonSessions,
  comparisonRestaurants,
  comparisonMatchGroups,
  comparisonMatchItems,
  menuImportSessions,
  importedMenuItems,
  importedMenuCategories,
} from "../drizzle/schema";
import { eq, inArray, and } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItemForAI {
  id: number;
  sessionId: number;
  name: string;
  nameAr?: string | null;
  categoryName?: string | null;
  price: string;
}

interface AIMatchGroup {
  unifiedName: string;
  unifiedNameAr: string;
  unifiedCategory: string;
  confidenceScore: number;
  matchReason?: string;
  items: Array<{ sessionId: number; itemId: number }>;
}

// ─── AI Matching Logic ────────────────────────────────────────────────────────

/**
 * Build a rich text block for each restaurant's items so AI has full context.
 * Format: R{sessionId}:{itemId} | "{name}" / "{nameAr}" | cat: {category} | price: {price} AED
 */
function buildItemsBlock(
  items: MenuItemForAI[],
  restaurantLabel: string
): string {
  const lines = items.map(
    (i) =>
      `  R${i.sessionId}:${i.id} | "${i.name}"${
        i.nameAr ? ` / "${i.nameAr}"` : ""
      } | cat: ${i.categoryName || "عام"} | price: ${i.price} AED`
  );
  return `=== ${restaurantLabel} (${items.length} items) ===\n${lines.join("\n")}`;
}

/**
 * Call AI to semantically match menu items across restaurants.
 * The AI receives full item names (Arabic + English), categories, and prices.
 * It groups items that represent the same dish regardless of naming differences.
 */
async function matchItemsWithAI(
  allItems: MenuItemForAI[],
  restaurantLabels: Array<{ sessionId: number; name: string; isMyRestaurant: boolean }>
): Promise<AIMatchGroup[]> {
  // Build per-restaurant blocks for clear context
  const blocks = restaurantLabels
    .map((r) => {
      const items = allItems.filter((i) => i.sessionId === r.sessionId);
      const label = r.isMyRestaurant ? `🏠 مطعمي: ${r.name}` : `منافس: ${r.name}`;
      return buildItemsBlock(items, label);
    })
    .join("\n\n");

  const myRestaurantName =
    restaurantLabels.find((r) => r.isMyRestaurant)?.name || "مطعمي";
  const competitorNames = restaurantLabels
    .filter((r) => !r.isMyRestaurant)
    .map((r) => r.name)
    .join(", ");

  const systemPrompt = `أنت خبير في تحليل قوائم الطعام ومطابقة الأصناف المتشابهة بين مطاعم مختلفة.

مهمتك:
1. تحليل أسماء الوصفات في جميع المطاعم (عربي + إنجليزي) وفهم معناها الفعلي
2. ربط الوصفات المتشابهة معنىً رغم اختلاف المسمى
3. إنشاء مجموعات مطابقة تجمع نفس الطبق من مطاعم مختلفة

قواعد المطابقة الدلالية:
- "فلافل" = "فلافل مصري" = "فلافل مشكل" = "Falafel" → نفس الطبق
- "كشري" = "كشري مصري" = "Koshari" → نفس الطبق
- "فراخ مشوية" = "دجاج مشوي" = "Grilled Chicken" → نفس الطبق
- "شاورما لحم" ≠ "شاورما دجاج" → طبقان مختلفان
- "برجر" ≠ "شاورما" → طبقان مختلفان جوهرياً
- إذا كان الصنف موجوداً في مطعم واحد فقط، أدرجه في مجموعة منفردة
- كل صنف يُدرج في مجموعة واحدة فقط
- أعطِ الأولوية لمطابقة أصناف مطعمي (${myRestaurantName}) مع المنافسين

أعد JSON فقط بدون أي نص إضافي.`;

  const userPrompt = `مطعمي: ${myRestaurantName}
المنافسون: ${competitorNames}

${blocks}

أعد JSON بهذا الشكل الدقيق:
{
  "groups": [
    {
      "unifiedName": "Falafel",
      "unifiedNameAr": "فلافل",
      "unifiedCategory": "مقبلات",
      "confidenceScore": 95,
      "matchReason": "نفس الطبق رغم اختلاف المسمى",
      "items": [
        {"sessionId": 4, "itemId": 101},
        {"sessionId": 6, "itemId": 205}
      ]
    }
  ]
}`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "menu_matching_v2",
        strict: true,
        schema: {
          type: "object",
          properties: {
            groups: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  unifiedName: { type: "string" },
                  unifiedNameAr: { type: "string" },
                  unifiedCategory: { type: "string" },
                  confidenceScore: { type: "number" },
                  matchReason: { type: "string" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        sessionId: { type: "number" },
                        itemId: { type: "number" },
                      },
                      required: ["sessionId", "itemId"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["unifiedName", "unifiedNameAr", "unifiedCategory", "confidenceScore", "matchReason", "items"],
                additionalProperties: false,
              },
            },
          },
          required: ["groups"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned empty response");
  const parsed = typeof content === "string" ? JSON.parse(content) : content;
  return parsed.groups || [];
}

// ─── Noise Category Filter ──────────────────────────────────────────────────────

const NOISE_CATEGORIES = [
  "اختيارات على ذوقك",
  "العروض",
  "عروض",
  "عروض رمضان",
  "رمضان",
  "offers",
  "popular",
  "الأكثر طلباً",
  "الاكثر طلبا",
  "🔥",
];

function isNoiseCategory(name: string): boolean {
  const lower = name.toLowerCase();
  return NOISE_CATEGORIES.some((n) => lower.includes(n.toLowerCase()));
}

// ─── Category Matching ───────────────────────────────────────────────────────

interface CategoryGroup {
  unifiedCategory: string;
  categoryPerSession: Record<number, string>;
}

async function matchCategoriesWithAI(
  myCategories: string[],
  competitorCategories: Map<number, { name: string; categories: string[] }>
): Promise<CategoryGroup[]> {
  const competitorBlocks = Array.from(competitorCategories.entries() as IterableIterator<[number, { name: string; categories: string[] }]>)
    .map(([sid, { name, categories }]) => {
      return `=== ${name} (sessionId=${sid}) ===\n${categories.map((c) => `  - "${c}"`).join("\n")}`;
    })
    .join("\n\n");

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "أنت خبير تحليل قوائم مطاعم. أعد JSON فقط بدون أي نص إضافي." },
      {
        role: "user",
        content: `ربط فئات مطعمي بفئات المنافسين دلالياً.\n\nفئات مطعمي:\n${myCategories.map((c) => `  - "${c}"`).join("\n")}\n\nفئات المنافسين:\n${competitorBlocks}\n\nأعد JSON: {"groups":[{"unifiedCategory":"مشاوي","categoryPerSession":{"5":"مشاوي","6":"المشاوى 🍢🔥"}}]}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "category_matching",
        strict: true,
        schema: {
          type: "object",
          properties: {
            groups: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  unifiedCategory: { type: "string" },
                  categoryPerSession: { type: "object", additionalProperties: { type: "string" } },
                },
                required: ["unifiedCategory", "categoryPerSession"],
                additionalProperties: false,
              },
            },
          },
          required: ["groups"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) return [];
  const parsed = typeof content === "string" ? JSON.parse(content) : content;
  return (parsed.groups || []) as CategoryGroup[];
}

// ─── Item Matching per Category ──────────────────────────────────────────────

interface ItemMatchResult {
  myItemId: number;
  myItemName: string;
  matches: Array<{
    sessionId: number;
    itemId: number;
    matchedName: string;
    price: string;
    similarity: number;
    reason: string;
  }>;
}

async function matchItemsInCategory(
  categoryName: string,
  myItems: MenuItemForAI[],
  competitorItemsBySession: Map<number, { name: string; items: MenuItemForAI[] }>
): Promise<ItemMatchResult[]> {
  if (myItems.length === 0) return [];

  const competitorBlocks = Array.from(competitorItemsBySession.entries() as IterableIterator<[number, { name: string; items: MenuItemForAI[] }]>)
    .map(([sid, { name, items }]) => {
      if (items.length === 0) return null;
      const lines = items.map((i) => `  ID:${i.id} | "${i.nameAr || i.name}" | ${i.price} AED`);
      return `=== ${name} (sessionId=${sid}) ===\n${lines.join("\n")}`;
    })
    .filter(Boolean)
    .join("\n\n");

  if (!competitorBlocks) {
    return myItems.map((item) => ({ myItemId: item.id, myItemName: item.nameAr || item.name, matches: [] }));
  }

  const myLines = myItems.map((i) => `  ID:${i.id} | "${i.nameAr || i.name}" | ${i.price} AED`);

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "أنت خبير تحليل قوائم مطاعم. أعد JSON فقط." },
      {
        role: "user",
        content: `الفئة: "${categoryName}"\n\nلكل صنف من مطعمي، ابحث عن أقرب مشابه في المنافسين (similarity >= 70).\n\nأصناف مطعمي:\n${myLines.join("\n")}\n\nأصناف المنافسين:\n${competitorBlocks}\n\nأعد JSON: {"matches":[{"myItemId":1,"myItemName":"فلافل","matches":[{"sessionId":5,"itemId":201,"matchedName":"فلافل مصري","price":"12","similarity":95,"reason":"نفس الطبق"}]}]}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "item_matching_v5",
        strict: true,
        schema: {
          type: "object",
          properties: {
            matches: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  myItemId: { type: "number" },
                  myItemName: { type: "string" },
                  matches: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        sessionId: { type: "number" },
                        itemId: { type: "number" },
                        matchedName: { type: "string" },
                        price: { type: "string" },
                        similarity: { type: "number" },
                        reason: { type: "string" },
                      },
                      required: ["sessionId", "itemId", "matchedName", "price", "similarity", "reason"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["myItemId", "myItemName", "matches"],
                additionalProperties: false,
              },
            },
          },
          required: ["matches"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) return [];
  const parsed = typeof content === "string" ? JSON.parse(content) : content;
  return (parsed.matches || []) as ItemMatchResult[];
}

// ─── Background Processing (النهج الثلاثي) ───────────────────────────────────

async function runMatchingBackground(
  comparisonSessionId: number,
  myRestaurantSessionId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    const competitors = await db
      .select({ importSessionId: comparisonRestaurants.importSessionId })
      .from(comparisonRestaurants)
      .where(eq(comparisonRestaurants.comparisonSessionId, comparisonSessionId));

    const competitorSessionIds = competitors.map((c: { importSessionId: number }) => c.importSessionId);
    const allSessionIds = [myRestaurantSessionId, ...competitorSessionIds];

    const restaurants = await db
      .select({ id: menuImportSessions.id, restaurantName: menuImportSessions.restaurantName })
      .from(menuImportSessions)
      .where(inArray(menuImportSessions.id, allSessionIds));

    const restaurantNameMap = new Map(
      (restaurants as Array<{ id: number; restaurantName: string | null }>).map((r) => [
        r.id,
        r.restaurantName || "مطعم",
      ])
    );

    // جلب كل الأصناف
    const allItems = (await db
      .select({
        id: importedMenuItems.id,
        sessionId: importedMenuItems.sessionId,
        name: importedMenuItems.name,
        nameAr: importedMenuItems.nameAr,
        categoryName: importedMenuItems.categoryName,
        price: importedMenuItems.price,
      })
      .from(importedMenuItems)
      .where(inArray(importedMenuItems.sessionId, allSessionIds))) as MenuItemForAI[];

    // الخطوة 1: تنظيف الفئات الوهمية
    const cleanItems = allItems.filter(
      (i) => !i.categoryName || !isNoiseCategory(i.categoryName)
    );

    const myItems = cleanItems.filter((i) => i.sessionId === myRestaurantSessionId);
    const competitorItemsAll = cleanItems.filter((i) => i.sessionId !== myRestaurantSessionId);

    // الخطوة 2: ربط الفئات
    const myCategories = Array.from(new Set(myItems.map((i) => i.categoryName || "عام")));

    const competitorCategoriesMap = new Map<number, { name: string; categories: string[] }>();
    for (const sid of competitorSessionIds) {
      const cats = Array.from(
        new Set(competitorItemsAll.filter((i) => i.sessionId === sid).map((i) => i.categoryName || "عام"))
      );
      competitorCategoriesMap.set(sid, { name: restaurantNameMap.get(sid) || "مطعم", categories: cats });
    }

    let categoryGroups: CategoryGroup[] = [];
    try {
      categoryGroups = await matchCategoriesWithAI(myCategories, competitorCategoriesMap);
    } catch (err) {
      console.error("[runMatchingBackground] Category matching error:", err);
      categoryGroups = myCategories.map((cat) => {
        const perSession: Record<number, string> = {};
        for (const [sid, { categories }] of Array.from(competitorCategoriesMap.entries()) as [number, { name: string; categories: string[] }][]) {
          const exact = categories.find((c) => c.trim().toLowerCase() === cat.trim().toLowerCase());
          if (exact) perSession[sid] = exact;
        }
        return { unifiedCategory: cat, categoryPerSession: perSession };
      });
    }

    console.log(`[runMatchingBackground] Category groups: ${categoryGroups.length}`);

    // حذف المجموعات القديمة
    await db
      .delete(comparisonMatchGroups)
      .where(eq(comparisonMatchGroups.comparisonSessionId, comparisonSessionId));

    let savedGroupCount = 0;
    let sortOrder = 0;

    // الخطوة 3: ربط الأصناف داخل كل فئة - بالتوازي لتسريع العملية
    const BATCH_SIZE = 50; // زيادة من 25 إلى 50 لتقليل عدد استدعاءات LLM
    const PARALLEL_CATS = 3; // عدد الفئات التي تعمل بالتوازي

    // تجميع نتائج كل الفئات أولاً ثم حفظها دفعة واحدة
    type PendingGroup = {
      unifiedName: string;
      unifiedNameAr: string;
      unifiedCategory: string;
      confidenceScore: number;
      matchReason: string;
      myItem: MenuItemForAI;
      goodMatches: ItemMatchResult["matches"];
    };
    const pendingGroups: PendingGroup[] = [];

    // تشغيل الفئات بالتوازي (PARALLEL_CATS في نفس الوقت)
    for (let catIdx = 0; catIdx < categoryGroups.length; catIdx += PARALLEL_CATS) {
      const catSlice = categoryGroups.slice(catIdx, catIdx + PARALLEL_CATS);

      await Promise.all(
        catSlice.map(async (catGroup) => {
          const myCatItems = myItems.filter(
            (i) => (i.categoryName || "عام") === catGroup.unifiedCategory
          );
          if (myCatItems.length === 0) return;

          const competitorItemsByCat = new Map<number, { name: string; items: MenuItemForAI[] }>();
          for (const [sidStr, catName] of Object.entries(catGroup.categoryPerSession) as [string, string][]) {
            const sid = parseInt(sidStr);
            const items = competitorItemsAll.filter(
              (i) => i.sessionId === sid && (i.categoryName || "عام") === catName
            );
            if (items.length > 0) {
              competitorItemsByCat.set(sid, { name: restaurantNameMap.get(sid) || "مطعم", items });
            }
          }

          // تشغيل batches الفئة بالتوازي
          const batchPromises: Promise<ItemMatchResult[]>[] = [];
          for (let i = 0; i < myCatItems.length; i += BATCH_SIZE) {
            const batch = myCatItems.slice(i, i + BATCH_SIZE);
            batchPromises.push(
              matchItemsInCategory(catGroup.unifiedCategory, batch, competitorItemsByCat).catch((err) => {
                console.error(`[runMatchingBackground] Item matching error in "${catGroup.unifiedCategory}":`, err);
                return batch.map((item) => ({ myItemId: item.id, myItemName: item.nameAr || item.name, matches: [] }));
              })
            );
          }

          const batchResults = await Promise.all(batchPromises);
          const allResults = batchResults.flat();

          // تجميع النتائج بدل الحفظ الفوري
          for (const result of allResults) {
            const myItem = myCatItems.find((item) => item.id === result.myItemId);
            if (!myItem) continue;

            const goodMatches = result.matches.filter((m) => m.similarity >= 70);
            const matchReasonText =
              goodMatches.length > 0
                ? goodMatches.map((m) => `${restaurantNameMap.get(m.sessionId)}: ${m.reason} (${m.similarity}%)`).join(" | ")
                : "وصفة حصرية في مطعمي";
            const avgConfidence =
              goodMatches.length > 0
                ? Math.round(goodMatches.reduce((sum, m) => sum + m.similarity, 0) / goodMatches.length)
                : 100;

            pendingGroups.push({
              unifiedName: myItem.name,
              unifiedNameAr: myItem.nameAr || myItem.name,
              unifiedCategory: catGroup.unifiedCategory,
              confidenceScore: avgConfidence,
              matchReason: matchReasonText,
              myItem,
              goodMatches,
            });
          }
        })
      );
    }

    // حفظ جميع المجموعات دفعة واحدة (batch INSERT)
    for (const pg of pendingGroups) {
      const [groupResult] = await db.insert(comparisonMatchGroups).values({
        comparisonSessionId,
        unifiedName: pg.unifiedName,
        unifiedNameAr: pg.unifiedNameAr,
        unifiedCategory: pg.unifiedCategory,
        confidenceScore: pg.confidenceScore,
        matchReason: pg.matchReason,
        sortOrder: sortOrder++,
      });

      const groupId = (groupResult as { insertId: number }).insertId;

      // batch INSERT لكل المطابقات معاً
      const matchItemsToInsert = [
        { matchGroupId: groupId, importSessionId: myRestaurantSessionId, menuItemId: pg.myItem.id, priceSnapshot: pg.myItem.price },
        ...pg.goodMatches.map((m) => ({
          matchGroupId: groupId,
          importSessionId: m.sessionId,
          menuItemId: m.itemId,
          priceSnapshot: m.price,
        })),
      ];
      await db.insert(comparisonMatchItems).values(matchItemsToInsert);

      savedGroupCount++;
    }

    await db
      .update(priceComparisonSessions)
      .set({ status: "completed", matchedGroupCount: savedGroupCount })
      .where(eq(priceComparisonSessions.id, comparisonSessionId));

    console.log(`[runMatchingBackground] Done: ${savedGroupCount} groups for session ${comparisonSessionId}`);
  } catch (err) {
    console.error(`[runMatchingBackground] Fatal error for session ${comparisonSessionId}:`, err);
    await db
      .update(priceComparisonSessions)
      .set({ status: "failed" })
      .where(eq(priceComparisonSessions.id, comparisonSessionId));
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const priceComparisonRouter = router({
  /** قائمة جلسات المقارنة */
  list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const sessions = await db
        .select({
          id: priceComparisonSessions.id,
        name: priceComparisonSessions.name,
        status: priceComparisonSessions.status,
        matchedGroupCount: priceComparisonSessions.matchedGroupCount,
        myRestaurantSessionId: priceComparisonSessions.myRestaurantSessionId,
        createdAt: priceComparisonSessions.createdAt,
      })
      .from(priceComparisonSessions)
      .orderBy(priceComparisonSessions.createdAt);

    // Enrich with restaurant names
    const result = await Promise.all(
      sessions.map(async (s) => {
        const myRest = await db
          .select({ restaurantName: menuImportSessions.restaurantName })
          .from(menuImportSessions)
          .where(eq(menuImportSessions.id, s.myRestaurantSessionId))
          .limit(1);

        const competitors = await db
          .select({
            importSessionId: comparisonRestaurants.importSessionId,
          })
          .from(comparisonRestaurants)
          .where(eq(comparisonRestaurants.comparisonSessionId, s.id));

        const competitorNames = await Promise.all(
          competitors.map(async (c: { importSessionId: number }) => {
            const r = await db
              .select({ restaurantName: menuImportSessions.restaurantName })
              .from(menuImportSessions)
              .where(eq(menuImportSessions.id, c.importSessionId))
              .limit(1);
            return r[0]?.restaurantName || "مطعم";
          })
        );

        return {
          ...s,
          myRestaurantName: myRest[0]?.restaurantName || "مطعمي",
          competitorNames,
        };
      })
    );

    return result;
  }),

  /** إنشاء جلسة مقارنة جديدة */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        myRestaurantSessionId: z.number().int().positive(),
        competitorSessionIds: z.array(z.number().int().positive()).min(1).max(5),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      // Create session
      const [result] = await db.insert(priceComparisonSessions).values({
        name: input.name,
        myRestaurantSessionId: input.myRestaurantSessionId,
        status: "pending",
        createdBy: ctx.user.id,
      });

      const sessionId = (result as any).insertId as number;

      // Add competitor restaurants
      for (const compId of input.competitorSessionIds) {
        await db.insert(comparisonRestaurants).values({
          comparisonSessionId: sessionId,
          importSessionId: compId,
        });
      }

      return { id: sessionId };
    }),

  /** تشغيل AI لمطابقة الأصناف - يعمل في الخلفية ويرجع فوراً */
  runMatching: protectedProcedure
    .input(z.object({ comparisonSessionId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const { comparisonSessionId } = input;

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get session
      const [session] = await db
        .select()
        .from(priceComparisonSessions)
        .where(eq(priceComparisonSessions.id, comparisonSessionId))
        .limit(1);

      if (!session) throw new Error("Comparison session not found");

      // Update status to processing immediately
      await db
        .update(priceComparisonSessions)
        .set({ status: "processing" })
        .where(eq(priceComparisonSessions.id, comparisonSessionId));

      // ⭐ Start background processing WITHOUT awaiting - returns immediately to avoid timeout
      runMatchingBackground(comparisonSessionId, session.myRestaurantSessionId).catch((err) => {
        console.error(`[runMatching] Background error for session ${comparisonSessionId}:`, err);
      });

      return { success: true, started: true };
    }),

  /** جلب حالة جلسة معينة (لل polling) */
  getStatus: protectedProcedure
    .input(z.object({ comparisonSessionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [session] = await db
        .select({
          id: priceComparisonSessions.id,
          status: priceComparisonSessions.status,
          matchedGroupCount: priceComparisonSessions.matchedGroupCount,
        })
        .from(priceComparisonSessions)
        .where(eq(priceComparisonSessions.id, input.comparisonSessionId))
        .limit(1);
      return session || null;
    }),

  /** جلب نتيجة المقارنة الكاملة */
  getResult: protectedProcedure
    .input(z.object({ comparisonSessionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const { comparisonSessionId } = input;

      const db = await getDb();
      if (!db) throw new Error("Database not available");
      // Get session
      const [session] = await db
        .select()
        .from(priceComparisonSessions)
        .where(eq(priceComparisonSessions.id, comparisonSessionId))
        .limit(1);

      if (!session) throw new Error("Comparison session not found");

      // Get all restaurant sessions involved
      const competitors = await db
        .select({ importSessionId: comparisonRestaurants.importSessionId })
        .from(comparisonRestaurants)
        .where(eq(comparisonRestaurants.comparisonSessionId, comparisonSessionId));

      const allSessionIds = [
        session.myRestaurantSessionId,
        ...competitors.map((c: { importSessionId: number }) => c.importSessionId),
      ];

      // Get restaurant info
      const restaurants = await db
        .select({
          id: menuImportSessions.id,
          restaurantName: menuImportSessions.restaurantName,
          restaurantNameAr: menuImportSessions.restaurantNameAr,
          restaurantLogoUrl: menuImportSessions.restaurantLogoUrl,
          platform: menuImportSessions.platform,
        })
        .from(menuImportSessions)
        .where(inArray(menuImportSessions.id, allSessionIds));

      // Get match groups
      const groups = await db
        .select()
        .from(comparisonMatchGroups)
        .where(eq(comparisonMatchGroups.comparisonSessionId, comparisonSessionId))
        .orderBy(comparisonMatchGroups.sortOrder);

      // Get match items for all groups
      const groupIds = groups.map((g: { id: number }) => g.id);
      const matchItems =
        groupIds.length > 0
          ? await db
              .select({
                id: comparisonMatchItems.id,
                matchGroupId: comparisonMatchItems.matchGroupId,
                importSessionId: comparisonMatchItems.importSessionId,
                menuItemId: comparisonMatchItems.menuItemId,
                priceSnapshot: comparisonMatchItems.priceSnapshot,
                currency: comparisonMatchItems.currency,
                // Original item details
                itemName: importedMenuItems.name,
                itemNameAr: importedMenuItems.nameAr,
                itemImageUrl: importedMenuItems.imageUrl,
                itemDescription: importedMenuItems.description,
              })
              .from(comparisonMatchItems)
              .leftJoin(importedMenuItems, eq(comparisonMatchItems.menuItemId, importedMenuItems.id))
              .where(inArray(comparisonMatchItems.matchGroupId, groupIds))
          : [];

      // Build result structure
      type RestaurantInfo = {
        id: number;
        restaurantName: string | null;
        restaurantNameAr: string | null;
        restaurantLogoUrl: string | null;
        platform: string;
      };
      type MatchItemRow = {
        id: number;
        matchGroupId: number;
        importSessionId: number;
        menuItemId: number;
        priceSnapshot: string | null;
        currency: string;
        itemName: string | null;
        itemNameAr: string | null;
        itemImageUrl: string | null;
        itemDescription: string | null;
      };

      const restaurantMap = new Map<number, RestaurantInfo>(
        (restaurants as RestaurantInfo[]).map((r) => [r.id, r])
      );
      const typedMatchItems = matchItems as MatchItemRow[];

      const enrichedGroups = groups.map((group: (typeof groups)[number]) => {
        const items = typedMatchItems
          .filter((mi) => mi.matchGroupId === group.id)
          .map((mi) => ({
            sessionId: mi.importSessionId,
            menuItemId: mi.menuItemId,
            priceSnapshot: parseFloat(mi.priceSnapshot || "0"),
            currency: mi.currency,
            itemName: mi.itemName,
            itemNameAr: mi.itemNameAr,
            itemImageUrl: mi.itemImageUrl,
            itemDescription: mi.itemDescription,
            restaurant: restaurantMap.get(mi.importSessionId),
          }));

        // Find min/max price
        const prices = items.map((i) => i.priceSnapshot).filter((p) => p > 0);
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

        return {
          id: group.id,
          unifiedName: group.unifiedName,
          unifiedNameAr: group.unifiedNameAr,
          unifiedCategory: group.unifiedCategory,
          confidenceScore: group.confidenceScore,
          matchReason: group.matchReason,
          sortOrder: group.sortOrder,
          items,
          minPrice,
          maxPrice,
          priceDiff: maxPrice - minPrice,
          priceDiffPct: minPrice > 0 ? Math.round(((maxPrice - minPrice) / minPrice) * 100) : 0,
        };
      });

      return {
        session: {
          ...session,
          myRestaurantName:
            restaurantMap.get(session.myRestaurantSessionId)?.restaurantName || "مطعمي",
        },
        restaurants: (restaurants as RestaurantInfo[]).map((r) => ({
          ...r,
          isMyRestaurant: r.id === session.myRestaurantSessionId,
        })),
        groups: enrichedGroups,
        allSessionIds,
      };
    }),

  /** حذف جلسة مقارنة */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db
        .delete(priceComparisonSessions)
        .where(eq(priceComparisonSessions.id, input.id));
      return { success: true };
    }),
});
