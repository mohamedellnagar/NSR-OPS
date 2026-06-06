import OpenAI from "openai";

function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("AI feature is not configured. Missing OPENAI_API_KEY.");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface MaterialOption {
  id: number;
  name: string;
  unit: string;
  materialType?: "raw" | "semi_finished";
}

export interface RecipeIngredient {
  materialId: number;
  materialName: string;
  quantity: number;
  unit: string;
  notes?: string;
}

export interface GeneratedRecipe {
  ingredients: RecipeIngredient[];
  notes?: string;
}

// مرجع وصفات مطعم مصري (للاسترشاد بالكميات فقط)
const RECIPE_REFERENCE = `
أرز بالشعيرية: أرز 200g + شعيرية 50g + زيت 15ml + ملح 5g + مياه 300ml + مرقة دجاج 5g
ربع دجاج شوي فحم: دجاج كاملة 0.25pcs + أرز 200g + تتبيلة (فلفل أسود+بهارات+ملح) + سلطة 100g + مخلل 50g + طحينه 30g + عيش بلدي 1pcs
1/3 كيلو كباب ضاني: لحم كباب 333g + بصل 50g + بقدونس + بهارات + ملح + أرز 200g + سلطة + مخلل + طحينه + عيش بلدي
سندوتش حواوشي: لحم كباب 150g + بصل 30g + فلفل أخضر 20g + بهارات + ملح + عيش بلدي 1pcs
طاجن باميه بالحمه: لحم ضاني 200g + باميه 300g + طماطم 150g + بصل 100g + ثوم 10g + زيت 20ml + ملح + بهارات + أرز 200g + عيش بلدي + سلطة
ملوخيه: ملوخيه 300g + مرقة دجاج 200ml + ثوم 15g + كزبره 10g + زيت 20ml + ملح + أرز 200g + عيش بلدي
مكرونه بشاميل: مكرونة 200g + لحم كباب 150g + لبن 200ml + سمن 30g + بيض 1pcs + ملح + بهارات + جوز الطيب
`;

export async function generateRecipeWithAI(
  productName: string,
  productCategory: string,
  availableMaterials: MaterialOption[],
  productDescription?: string | null
): Promise<GeneratedRecipe> {
  // Filter out non-food materials (packaging, cleaning supplies, etc.)
  const filteredMaterials = availableMaterials.filter(
    (m) =>
      !m.name.startsWith("إنتاج -") &&
      !["صابون", "معالق", "مناديل", "كيس", "علبة", "ورق", "قفاز"].some((skip) =>
        m.name.includes(skip)
      )
  );

  if (filteredMaterials.length === 0) {
    throw new Error("لا توجد مواد خام متاحة في المنصة لتوليد الوصفة");
  }

  // Build a strict materials list with IDs and their EXACT registered units
  // The AI MUST use these exact units — no substitution allowed
  const rawMaterialsList = filteredMaterials.filter(m => m.materialType !== "semi_finished");
  const semiFinishedList = filteredMaterials.filter(m => m.materialType === "semi_finished");

  const formatMaterial = (m: MaterialOption) =>
    `ID:${m.id} | الاسم: "${m.name}" | الوحدة المسجلة: "${m.unit}"`;

  const rawText = rawMaterialsList.map(formatMaterial).join("\n");
  const semiText = semiFinishedList.map(formatMaterial).join("\n");

  const materialsListText = [
    rawMaterialsList.length > 0 ? `--- المواد الخام ---\n${rawText}` : "",
    semiFinishedList.length > 0 ? `--- المواد المصنّعة (جاهزة للاستخدام) ---\n${semiText}` : "",
  ].filter(Boolean).join("\n\n");

  const systemPrompt = `أنت طاهي خبير متخصص في المطبخ المصري والمطاعم المصرية الشعبية.
مهمتك: توليد وصفة دقيقة واحترافية لصنف من قائمة مطعم مصري.

⚠️ قواعد صارمة جداً — لا استثناء:
1. يجب أن تختار المكونات من قائمة المواد المتاحة فقط (مواد خام + مواد مصنّعة) — ممنوع اختراع مكونات جديدة
2. يجب استخدام الـ ID الصحيح لكل مادة من القائمة
3. ⚠️ وحدة القياس (unit) يجب أن تكون نفس "الوحدة المسجلة" للمادة في القائمة بالضبط — ممنوع تغيير الوحدة
   مثال: إذا كانت الوحدة المسجلة "kg" فيجب إرجاع "kg" وليس "g"
   مثال: إذا كانت الوحدة المسجلة "pcs" فيجب إرجاع "pcs" وليس "قطعة"
4. الكميات يجب أن تكون واقعية لحصة مطعم واحدة (وجبة لشخص واحد)
5. لا تكرر نفس المادة في نفس الوصفة
6. اختر المادة الأنسب للصنف من القائمة المتاحة فقط
7. المواد المصنّعة هي مواد جاهزة تم تحضيرها مسبقاً (مثل الصلصات، العجائن، المخللات، التتبيلات) — استخدمها عند الحاجة بدلاً من تفصيل مكوناتها
8. استعن بمرجع الوصفات المرفق كدليل للكميات فقط، لكن المكونات يجب أن تكون من القائمة المتاحة
9. ⭐ قاعدة تفضيل المواد:
   - المكونات التي تحتاج إلى تحضير أو طهي (مثل دجاج مشوي، لحم مطبوخ، سلطة محضرة، صلصة، عجينة): استخدم المواد المصنّعة (semi_finished) من القائمة إن وجدت
   - المكونات الجاهزة التي لا تحتاج إنتاج (مثل خبز، ملح، زيت، بهارات، مخلل معبّأ، مشروبات): استخدم المواد الخام (raw) من القائمة

مرجع وصفات مطعم مصري (للاسترشاد بالكميات فقط):
${RECIPE_REFERENCE}`;

  const userPrompt = `اصنع وصفة دقيقة للصنف التالي:
الاسم: ${productName}
الفئة: ${productCategory}${productDescription ? `\nوصف الصنف: ${productDescription}` : ""}

⚠️ تذكير مهم: استخدم المواد من القائمة التالية فقط (مواد خام ومواد مصنّعة)، والوحدة يجب أن تكون نفس "الوحدة المسجّلة" بالضبط.
⭐ تذكير بقاعدة التفضيل: المكونات التي تحتاج طهي/تحضير → استخدم المواد المصنّعة إن وجدت. المكونات الجاهزة (خبز، ملح، زيت، بهارات) → استخدم المواد الخام:
المواد المتاحة في المنصة:
${materialsListText}

أرجع JSON بالشكل التالي فقط:
{
  "ingredients": [
    {"materialId": <رقم ID من القائمة أعلاه>, "materialName": "<اسم المادة كما في القائمة>", "quantity": <رقم عشري>, "unit": "<الوحدة المسجلة للمادة بالضبط>", "notes": "<ملاحظة اختيارية>"}
  ],
  "notes": "<ملاحظة عامة عن الوصفة اختيارية>"
}`;

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2, // Lower temperature for more deterministic/accurate results
  });

  const responseText = response.choices[0]?.message?.content ?? "{}";

  let parsed: GeneratedRecipe;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error("فشل تحليل استجابة الـ AI");
  }

  // Build a lookup map: materialId -> material
  const materialMap = new Map(filteredMaterials.map((m) => [m.id, m]));

  // Strict post-processing:
  // 1. Remove any ingredient whose materialId is not in our list
  // 2. Force the unit to be exactly the registered unit (override whatever AI returned)
  // 3. Remove duplicates
  const seenIds = new Set<number>();
  parsed.ingredients = (parsed.ingredients || [])
    .filter((ing) => {
      const material = materialMap.get(ing.materialId);
      if (!material) return false; // Invalid materialId — reject
      if (seenIds.has(ing.materialId)) return false; // Duplicate — reject
      seenIds.add(ing.materialId);
      return true;
    })
    .map((ing) => {
      const material = materialMap.get(ing.materialId)!;
      return {
        ...ing,
        materialName: material.name, // Use the registered name, not AI's name
        unit: material.unit,          // ⚠️ ALWAYS use the registered unit — override AI
      };
    });

  if (parsed.ingredients.length === 0) {
    throw new Error(
      "لم يتمكن الـ AI من اختيار مكونات من قائمة المواد المتاحة. تأكد من وجود مواد خام أو مواد مصنّعة في المنصة."
    );
  }

  return parsed;
}
