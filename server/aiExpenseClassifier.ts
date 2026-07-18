/**
 * aiExpenseClassifier.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Classifies expenses (expenseType + expenseCategoryCode) with an LLM acting as
 * an accounting expert, using the invoice HEADER (vendor, number, notes) and its
 * LINE ITEMS.
 *
 * Safety rules — this writes to financial records, so:
 *   1. Only values inside the shared enums are ever persisted. Anything else the
 *      model returns is discarded.
 *   2. Low-confidence answers are SKIPPED, not guessed. An unclassified row is
 *      better than a wrong one; the summary keeps it visibly out of the P&L.
 *   3. It only touches rows the caller asked for, and by default only rows that
 *      are actually missing a classification.
 *   4. The legacy `expenseCategory` column is never touched.
 *
 * The model call is injectable (`askModel`) so the prompt building, validation
 * and persistence can be tested without a live model.
 */
import OpenAI from "openai";
import { getConn } from "./pool";
import { getEffectiveOpenAIApiKey } from "./db";
import {
  EXPENSE_TYPES,
  EXPENSE_CATEGORY_CODES,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_TYPE_LABELS,
  type ExpenseCategoryCode,
  type ExpenseType,
} from "@shared/expenseClassification";

const MODEL = "gpt-4o-mini";
/** Invoices per request — keeps each prompt small enough to stay accurate. */
const BATCH_SIZE = 20;
/** Below this the answer is discarded and the row is left for a human. */
const MIN_CONFIDENCE = 0.6;

export type ClassifiableSource = "SUPPLIER_INVOICE" | "FREE_INVOICE" | "MONTHLY_PAYMENT";

export interface ClassifiableInvoice {
  id: number;
  sourceType: ClassifiableSource;
  invoiceNumber: string | null;
  vendorName: string | null;
  notes: string | null;
  total: number;
  items: Array<{ description: string; qty: number; unitPrice: number }>;
  currentType: ExpenseType | null;
  currentCategory: ExpenseCategoryCode | null;
}

export interface AiSuggestion {
  id: number;
  sourceType: ClassifiableSource;
  expenseType: ExpenseType;
  expenseCategoryCode: ExpenseCategoryCode;
  confidence: number;
  reason: string;
}

export interface AiClassifyChange extends AiSuggestion {
  invoiceNumber: string | null;
  vendorName: string | null;
  fromType: ExpenseType | null;
  fromCategory: ExpenseCategoryCode | null;
}

export interface AiClassifyResult {
  analyzed: number;
  applied: number;
  skippedLowConfidence: number;
  failed: number;
  durationMs: number;
  changes: AiClassifyChange[];
  /** Rows the model was unsure about, so a human can look at them. */
  skipped: Array<{
    id: number; sourceType: ClassifiableSource;
    invoiceNumber: string | null; vendorName: string | null;
    confidence: number; reason: string;
  }>;
}

// ─── Prompt ───────────────────────────────────────────────────────────────────
const CATEGORY_LIST = EXPENSE_CATEGORY_CODES
  .map((c) => `${c} (${EXPENSE_CATEGORY_LABELS[c]})`)
  .join("\n");

export const SYSTEM_PROMPT = `أنت خبير محاسبي متخصص في حسابات المطاعم. مهمتك تصنيف فواتير المصروفات.

لكل فاتورة، حدد:
1) expenseType — نوع المصروف، واحد من:
   - OPERATIONAL (${EXPENSE_TYPE_LABELS.OPERATIONAL}): مصروف يتعلق بالتشغيل اليومي للمطعم (مشتريات، رواتب، إيجار، مرافق، صيانة، تغليف، توصيل، عمولات...).
   - NON_OPERATIONAL (${EXPENSE_TYPE_LABELS.NON_OPERATIONAL}): مصروف خارج التشغيل (سحب المالك، شراء أصول ومعدات رأسمالية، ضرائب، رسوم بنكية، تراخيص).

2) expenseCategoryCode — التصنيف، واحد من هذه الأكواد بالضبط:
${CATEGORY_LIST}

قواعد إلزامية:
- استخدم بنود الفاتورة (الأصناف) كأهم دليل، ثم اسم المورد والملاحظات.
- "مشتريات غذائية" (FOOD_PURCHASES) فقط للمواد الغذائية التي تدخل في الطعام (لحوم، خضار، دجاج، أرز، زيت، خبز، بهارات...).
- مواد التنظيف والتغليف ليست مشتريات غذائية.
- الفحم = CHARCOAL. اللحوم من الملحمة = BUTCHERY أو FOOD_PURCHASES حسب السياق.
- لا تخترع أكواداً خارج القائمة إطلاقاً.
- إذا لم تكن واثقاً، اخفض قيمة confidence بدلاً من التخمين.
- confidence رقم بين 0 و 1.
- reason جملة عربية قصيرة جداً تشرح سبب التصنيف.

أعد JSON فقط بالشكل:
{"results":[{"id":123,"sourceType":"SUPPLIER_INVOICE","expenseType":"OPERATIONAL","expenseCategoryCode":"FOOD_PURCHASES","confidence":0.95,"reason":"بنود دجاج وخضار"}]}`;

/** Renders one invoice for the prompt. Pure — unit tested. */
export function renderInvoiceForPrompt(inv: ClassifiableInvoice): string {
  const head = [
    `id: ${inv.id}`,
    `sourceType: ${inv.sourceType}`,
    inv.invoiceNumber ? `رقم الفاتورة: ${inv.invoiceNumber}` : null,
    inv.vendorName ? `المورد/الجهة: ${inv.vendorName}` : null,
    inv.notes ? `ملاحظات: ${inv.notes}` : null,
    `الإجمالي: ${inv.total}`,
  ].filter(Boolean).join(" | ");

  if (inv.items.length === 0) return `${head}\n  (لا توجد بنود)`;

  const items = inv.items
    .slice(0, 25) // a very long invoice adds noise, not signal
    .map((it) => `  - ${it.description} × ${it.qty} @ ${it.unitPrice}`)
    .join("\n");
  const more = inv.items.length > 25 ? `\n  ... و${inv.items.length - 25} بند آخر` : "";
  return `${head}\n${items}${more}`;
}

export function buildUserPrompt(batch: ClassifiableInvoice[]): string {
  return `صنّف الفواتير التالية (${batch.length} فاتورة):\n\n${batch
    .map(renderInvoiceForPrompt)
    .join("\n\n")}\n\nأعد JSON فقط.`;
}

// ─── Validation ───────────────────────────────────────────────────────────────
const TYPE_SET = new Set<string>(EXPENSE_TYPES);
const CODE_SET = new Set<string>(EXPENSE_CATEGORY_CODES);

/**
 * Strictly validates the model's reply against the enums and the batch that was
 * actually sent. Anything unknown, malformed or hallucinated is dropped.
 * Pure — unit tested.
 */
export function parseSuggestions(
  raw: string,
  batch: ClassifiableInvoice[]
): AiSuggestion[] {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const list = Array.isArray(parsed?.results)
    ? parsed.results
    : Array.isArray(parsed)
      ? parsed
      : [];

  // Only ids that were actually in this batch may be updated.
  const allowed = new Map(batch.map((b) => [`${b.sourceType}:${b.id}`, b]));
  const seen = new Set<string>();
  const out: AiSuggestion[] = [];

  for (const r of list) {
    const id = Number(r?.id);
    const sourceType = String(r?.sourceType ?? "");
    if (!Number.isFinite(id)) continue;

    const key = `${sourceType}:${id}`;
    if (!allowed.has(key) || seen.has(key)) continue;

    const expenseType = String(r?.expenseType ?? "");
    const expenseCategoryCode = String(r?.expenseCategoryCode ?? "");
    if (!TYPE_SET.has(expenseType) || !CODE_SET.has(expenseCategoryCode)) continue;

    const confRaw = Number(r?.confidence);
    const confidence = Number.isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw)) : 0;

    seen.add(key);
    out.push({
      id,
      sourceType: sourceType as ClassifiableSource,
      expenseType: expenseType as ExpenseType,
      expenseCategoryCode: expenseCategoryCode as ExpenseCategoryCode,
      confidence,
      reason: typeof r?.reason === "string" ? r.reason.slice(0, 200) : "",
    });
  }
  return out;
}

// ─── Data loading ─────────────────────────────────────────────────────────────
const TABLE_BY_SOURCE: Record<ClassifiableSource, string> = {
  SUPPLIER_INVOICE: "invoices",
  FREE_INVOICE: "free_invoices",
  MONTHLY_PAYMENT: "monthly_payments",
};

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Loads a month's classifiable expenses with their line items.
 * Four queries total regardless of invoice count — no N+1.
 */
export async function loadClassifiableInvoices(
  conn: any,
  year: number,
  month: number,
  onlyUnclassified: boolean
): Promise<ClassifiableInvoice[]> {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  const start = `${year}-${mm}-01`;
  const end = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
  const TZ = "+04:00";
  const gate = onlyUnclassified ? "AND (expenseType IS NULL OR expenseCategoryCode IS NULL)" : "";

  const [supplier] = await conn.execute(
    `SELECT id, invoiceNumber, supplierName, notes, totalAmount, expenseType, expenseCategoryCode
       FROM invoices
      WHERE DATE(CONVERT_TZ(invoiceDate,'+00:00','${TZ}')) BETWEEN ? AND ? ${gate}
      ORDER BY id`,
    [start, end]
  );
  const [free] = await conn.execute(
    `SELECT id, invoiceNumber, supplierName, notes, totalAmount, expenseType, expenseCategoryCode
       FROM free_invoices
      WHERE DATE(CONVERT_TZ(date,'+00:00','${TZ}')) BETWEEN ? AND ? ${gate}
      ORDER BY id`,
    [start, end]
  );
  const [payments] = await conn.execute(
    `SELECT id, name, category, notes, totalAmount, expenseType, expenseCategoryCode
       FROM monthly_payments
      WHERE year = ? AND month = ? ${gate}
      ORDER BY id`,
    [year, month]
  );

  const supplierIds = (supplier as any[]).map((r) => r.id);
  const freeIds = (free as any[]).map((r) => r.id);

  const itemsBySupplier = new Map<number, ClassifiableInvoice["items"]>();
  if (supplierIds.length > 0) {
    const [rows] = await conn.execute(
      `SELECT invoiceId, materialName AS description, quantity AS qty, unitPrice
         FROM invoice_items WHERE invoiceId IN (${supplierIds.map(() => "?").join(",")})`,
      supplierIds
    );
    for (const it of rows as any[]) {
      const arr = itemsBySupplier.get(it.invoiceId) ?? [];
      arr.push({ description: it.description ?? "", qty: num(it.qty), unitPrice: num(it.unitPrice) });
      itemsBySupplier.set(it.invoiceId, arr);
    }
  }

  const itemsByFree = new Map<number, ClassifiableInvoice["items"]>();
  if (freeIds.length > 0) {
    const [rows] = await conn.execute(
      `SELECT invoiceId, description, qty, unitPrice
         FROM free_invoice_items WHERE invoiceId IN (${freeIds.map(() => "?").join(",")})`,
      freeIds
    );
    for (const it of rows as any[]) {
      const arr = itemsByFree.get(it.invoiceId) ?? [];
      arr.push({ description: it.description ?? "", qty: num(it.qty), unitPrice: num(it.unitPrice) });
      itemsByFree.set(it.invoiceId, arr);
    }
  }

  return [
    ...(supplier as any[]).map((r) => ({
      id: r.id, sourceType: "SUPPLIER_INVOICE" as const,
      invoiceNumber: r.invoiceNumber ?? null, vendorName: r.supplierName ?? null,
      notes: r.notes ?? null, total: num(r.totalAmount),
      items: itemsBySupplier.get(r.id) ?? [],
      currentType: r.expenseType ?? null, currentCategory: r.expenseCategoryCode ?? null,
    })),
    ...(free as any[]).map((r) => ({
      id: r.id, sourceType: "FREE_INVOICE" as const,
      invoiceNumber: r.invoiceNumber ?? null, vendorName: r.supplierName ?? null,
      notes: r.notes ?? null, total: num(r.totalAmount),
      items: itemsByFree.get(r.id) ?? [],
      currentType: r.expenseType ?? null, currentCategory: r.expenseCategoryCode ?? null,
    })),
    ...(payments as any[]).map((r) => ({
      id: r.id, sourceType: "MONTHLY_PAYMENT" as const,
      invoiceNumber: null, vendorName: r.name ?? null,
      // A monthly payment has no items; its own category is the useful signal.
      notes: [r.notes, r.category ? `تصنيف مسجل: ${r.category}` : null].filter(Boolean).join(" | ") || null,
      total: num(r.totalAmount), items: [],
      currentType: r.expenseType ?? null, currentCategory: r.expenseCategoryCode ?? null,
    })),
  ];
}

// ─── Orchestration ────────────────────────────────────────────────────────────
export type AskModel = (systemPrompt: string, userPrompt: string) => Promise<string>;

const MISSING_KEY_MESSAGE =
  "مفتاح OpenAI غير مُعد. أضفه من صفحة الإعدادات أو في ملف .env";

/**
 * Fails fast when the key is missing. Without this the run would fire one
 * doomed request per batch and report every invoice as "failed" with no
 * explanation of why.
 */
async function assertAiConfigured(): Promise<void> {
  const apiKey = await getEffectiveOpenAIApiKey();
  if (!apiKey || apiKey.startsWith("sk-placeholder")) {
    throw new Error(MISSING_KEY_MESSAGE);
  }
}

const defaultAskModel: AskModel = async (systemPrompt, userPrompt) => {
  const apiKey = await getEffectiveOpenAIApiKey();
  if (!apiKey || apiKey.startsWith("sk-placeholder")) {
    throw new Error(MISSING_KEY_MESSAGE);
  }
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  return completion.choices[0]?.message?.content ?? "{}";
};

export async function classifyExpensesWithAI(opts: {
  year: number;
  month: number;
  onlyUnclassified?: boolean;
  askModel?: AskModel;
}): Promise<AiClassifyResult> {
  const startedAt = Date.now();
  const onlyUnclassified = opts.onlyUnclassified !== false; // default true
  const askModel = opts.askModel ?? defaultAskModel;

  // Check configuration once, before doing any work or opening a connection.
  if (!opts.askModel) await assertAiConfigured();

  const conn = await getConn();
  try {
    const invoices = await loadClassifiableInvoices(conn, opts.year, opts.month, onlyUnclassified);

    const result: AiClassifyResult = {
      analyzed: invoices.length, applied: 0, skippedLowConfidence: 0, failed: 0,
      durationMs: 0, changes: [], skipped: [],
    };
    if (invoices.length === 0) {
      result.durationMs = Date.now() - startedAt;
      return result;
    }

    const byKey = new Map(invoices.map((i) => [`${i.sourceType}:${i.id}`, i]));
    let batchesRun = 0;
    let batchesFailed = 0;
    let lastError: unknown = null;

    for (let i = 0; i < invoices.length; i += BATCH_SIZE) {
      const batch = invoices.slice(i, i + BATCH_SIZE);
      batchesRun++;
      let suggestions: AiSuggestion[] = [];
      try {
        const raw = await askModel(SYSTEM_PROMPT, buildUserPrompt(batch));
        suggestions = parseSuggestions(raw, batch);
      } catch (err) {
        // One bad batch must not abort the whole run.
        console.error("[aiExpenseClassifier] batch failed:", err);
        lastError = err;
        batchesFailed++;
        result.failed += batch.length;
        continue;
      }

      const answered = new Set(suggestions.map((s) => `${s.sourceType}:${s.id}`));
      result.failed += batch.filter((b) => !answered.has(`${b.sourceType}:${b.id}`)).length;

      for (const sug of suggestions) {
        const inv = byKey.get(`${sug.sourceType}:${sug.id}`);
        if (!inv) continue;

        if (sug.confidence < MIN_CONFIDENCE) {
          result.skippedLowConfidence++;
          result.skipped.push({
            id: sug.id, sourceType: sug.sourceType,
            invoiceNumber: inv.invoiceNumber, vendorName: inv.vendorName,
            confidence: sug.confidence, reason: sug.reason,
          });
          continue;
        }

        const table = TABLE_BY_SOURCE[sug.sourceType];
        await conn.execute(
          `UPDATE \`${table}\` SET expenseType = ?, expenseCategoryCode = ? WHERE id = ?`,
          [sug.expenseType, sug.expenseCategoryCode, sug.id]
        );
        result.applied++;
        result.changes.push({
          ...sug,
          invoiceNumber: inv.invoiceNumber, vendorName: inv.vendorName,
          fromType: inv.currentType, fromCategory: inv.currentCategory,
        });
      }
    }

    // Every single call failed — surface the cause instead of quietly
    // returning a result that looks like the model simply had no opinion.
    if (batchesRun > 0 && batchesFailed === batchesRun) {
      const detail = lastError instanceof Error ? lastError.message : String(lastError ?? "");
      throw new Error(`تعذّر الاتصال بخدمة الذكاء الاصطناعي: ${detail}`.trim());
    }

    result.durationMs = Date.now() - startedAt;
    return result;
  } finally {
    conn.release();
  }
}
