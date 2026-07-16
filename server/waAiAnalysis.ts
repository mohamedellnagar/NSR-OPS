/**
 * waAiAnalysis.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * OpenAI-powered analysis layer for WhatsApp conversations.
 *
 * Features:
 *  - Per-message analysis: intent, sentiment, priority, suggested reply, tags
 *  - Per-conversation full analysis: summary, behavior, order extraction
 *  - Configurable prompts via ANALYSIS_PROMPTS
 *  - Arabic + English support (auto-detected)
 *  - Retry with exponential back-off (3 attempts)
 *  - Duplicate guard: skips if analysis was run within cooldown window
 *  - Auto-reply disabled by default (opt-in per rule)
 *  - Modular: each analysis type is an independent function
 */

import mysql from "mysql2/promise";
import { getConn } from "./pool";
import { invokeLLM } from "./_core/llm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Intent =
  | "order_inquiry"
  | "complaint"
  | "reservation"
  | "support_request"
  | "menu_question"
  | "delivery_issue"
  | "general_inquiry"
  | "feedback"
  | "greeting"
  | "other";

export type Sentiment = "positive" | "neutral" | "negative" | "mixed";
export type Priority = "low" | "medium" | "high" | "critical";
export type AnalysisType =
  | "full"
  | "sentiment"
  | "behavior"
  | "summary"
  | "auto_reply_suggestion"
  | "complaint_detection"
  | "order_extraction";

export interface MessageAnalysisResult {
  intent: Intent;
  sentiment: Sentiment;
  sentimentScore: number;           // 0.0 – 1.0 (1 = most positive)
  priority: Priority;
  summary: string;                  // max 120 chars
  suggestedReply: string | null;    // null if auto-reply disabled
  tags: string[];                   // max 5 tags
  detectedLanguage: string;         // ISO 639-1 (ar / en / ...)
  extractedOrderItems: string[];    // populated for order_inquiry intent
  requiresHumanEscalation: boolean;
  rawAnalysisJson: Record<string, unknown>;
  promptTokens: number;
  completionTokens: number;
}

export interface ConversationAnalysisResult extends MessageAnalysisResult {
  behaviorCategory: string;         // e.g. "loyal_customer", "first_time", "complainer"
  behaviorTags: string[];
  impressionSummary: string;        // 1-2 sentence overall impression
  satisfactionScore: number | null; // 1–5 or null
  messageCountAnalyzed: number;
  lastMessageIncluded: number;      // timestamp of last message included
}

// ─── Configurable Prompts ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `أنت محلل خدمة عملاء بالذكاء الاصطناعي لمطعم.
تقوم بتحليل رسائل واتساب من العملاء واستخراج رؤى منظمة.
أجب دائماً بصيغة JSON. تدعم الرسائل العربية والإنجليزية.
اكتب جميع النصوص الوصفية (summary, impressionSummary, suggestedReply, tags, behaviorTags) باللغة العربية دائماً بغض النظر عن لغة العميل.
كن دقيقاً وموجزاً ومدركاً لسياق المطاعم.`;

const INTENT_DEFINITIONS = `
Intent definitions (choose the most specific one):
- order_inquiry: asking about a specific order, order status, or placing an order
- complaint: expressing dissatisfaction about food, service, delivery, or staff
- reservation: requesting a table booking or event reservation
- support_request: asking for help with an account, app, or technical issue
- menu_question: asking about menu items, prices, ingredients, or availability
- delivery_issue: problem with delivery (late, wrong, missing items)
- general_inquiry: general questions not fitting other categories
- feedback: providing positive or constructive feedback without complaint
- greeting: simple greeting or farewell with no specific request
- other: does not fit any category above
`;

const PRIORITY_RULES = `
Priority rules:
- critical: complaint about food safety, health issue, urgent delivery problem
- high: complaint, delivery_issue, or message indicating anger/frustration
- medium: support_request, reservation, order_inquiry
- low: general_inquiry, menu_question, greeting, feedback
`;

// ─── DB Connection ────────────────────────────────────────────────────────────

// ─── Retry Helper ─────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        console.warn(`[WA-AI] Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ─── Core: Analyze a Single Message ──────────────────────────────────────────

/**
 * Analyzes a single WhatsApp message.
 * Used for real-time per-message analysis after each incoming message.
 */
export async function analyzeMessage(
  messageBody: string,
  options: {
    includeReply?: boolean;
    conversationContext?: string; // last 3-5 messages for context
    restaurantName?: string;
  } = {}
): Promise<MessageAnalysisResult> {
  const { includeReply = false, conversationContext = "", restaurantName = "the restaurant" } = options;

  const contextSection = conversationContext
    ? `\n\nRecent conversation context (for reference only):\n${conversationContext}`
    : "";

  const replyInstruction = includeReply
    ? `- suggestedReply: رد مهني قصير باللغة العربية (حد أقصى 200 حرف)، أو null إذا لم يكن ضرورياً`
    : `- suggestedReply: دائماً null (الرد التلقائي معطل)`;

  const userPrompt = `حلّل رسالة واتساب التالية المرسلة إلى ${restaurantName}:

"${messageBody}"
${contextSection}

${INTENT_DEFINITIONS}
${PRIORITY_RULES}

أعد JSON يحتوي على:
- intent: أحد الأنواع المحددة
- sentiment: positive | neutral | negative | mixed
- sentimentScore: من 0.0 (أكثر سلبية) إلى 1.0 (أكثر إيجابية)
- priority: low | medium | high | critical
- summary: ملخص بالعربية (حد أقصى 120 حرف) يصف ما يريده العميل
${replyInstruction}
- tags: مصفوفة من 5 وسوم قصيرة بالعربية (مثل: ["توصيل متأخر", "عنصر مفقود"])
- detectedLanguage: رمز ISO 639-1 (ar, en, إلخ)
- extractedOrderItems: مصفوفة بأسماء الأصناف المذكورة (مصفوفة فارغة إذا لم تُذكر)
- requiresHumanEscalation: true إذا كانت المشكلة تحتاج تدخلاً بشرياً فورياً`;

  const schema = {
    type: "object",
    properties: {
      intent: { type: "string", enum: ["order_inquiry","complaint","reservation","support_request","menu_question","delivery_issue","general_inquiry","feedback","greeting","other"] },
      sentiment: { type: "string", enum: ["positive","neutral","negative","mixed"] },
      sentimentScore: { type: "number" },
      priority: { type: "string", enum: ["low","medium","high","critical"] },
      summary: { type: "string" },
      suggestedReply: { type: ["string","null"] },
      tags: { type: "array", items: { type: "string" } },
      detectedLanguage: { type: "string" },
      extractedOrderItems: { type: "array", items: { type: "string" } },
      requiresHumanEscalation: { type: "boolean" },
    },
    required: ["intent","sentiment","sentimentScore","priority","summary","suggestedReply","tags","detectedLanguage","extractedOrderItems","requiresHumanEscalation"],
    additionalProperties: false,
  };

  const response = await withRetry(() =>
    invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_schema", json_schema: { name: "message_analysis", strict: true, schema } },
    })
  );

  const rawContent = response?.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error("[WA-AI] Empty response from LLM");
  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  const parsed = JSON.parse(content) as Omit<MessageAnalysisResult, "rawAnalysisJson" | "promptTokens" | "completionTokens">;

  return {
    ...parsed,
    rawAnalysisJson: parsed as unknown as Record<string, unknown>,
    promptTokens: response?.usage?.prompt_tokens ?? 0,
    completionTokens: response?.usage?.completion_tokens ?? 0,
  };
}

// ─── Core: Analyze Full Conversation ─────────────────────────────────────────

/**
 * Analyzes an entire conversation (all messages).
 * Used for deeper insights: behavior, satisfaction, impression summary.
 */
export async function analyzeConversationFull(
  messages: Array<{ fromMe: boolean; body: string | null; timestamp: number }>,
  options: { includeReply?: boolean; restaurantName?: string } = {}
): Promise<ConversationAnalysisResult> {
  const { includeReply = false, restaurantName = "the restaurant" } = options;

  const textMessages = messages.filter(m => m.body && m.body.trim());
  if (textMessages.length === 0) throw new Error("[WA-AI] No text messages to analyze");

  const transcript = textMessages
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(m => `${m.fromMe ? "Agent" : "Customer"}: ${m.body}`)
    .join("\n");

  const replyInstruction = includeReply
    ? `- suggestedReply: رد مهني قصير بالعربية (حد أقصى 200 حرف)، أو null`
    : `- suggestedReply: دائماً null`;

  const userPrompt = `حلّل محادثة واتساب كاملة مع ${restaurantName}:

${transcript}

${INTENT_DEFINITIONS}
${PRIORITY_RULES}

أعد JSON يحتوي على:
- intent: النية السائدة في المحادثة
- sentiment: المشاعر العامة
- sentimentScore: من 0.0 إلى 1.0
- priority: الأولوية العامة
- summary: ملخص بالعربية (حد أقصى 120 حرف)
${replyInstruction}
- tags: مصفوفة من 5 وسوم بالعربية
- detectedLanguage: رمز ISO 639-1
- extractedOrderItems: أصناف مذكورة بالعربية
- requiresHumanEscalation: true إذا كانت المشكلة تحتاج تدخلاً بشرياً
- behaviorCategory: أحد: loyal_customer | first_time | complainer | price_sensitive | vip | general
- behaviorTags: مصفوفة من 4 وصفات سلوكية بالعربية
- impressionSummary: جملة أو جملتان بالعربية تصف الانطباع العام عن العميل
- satisfactionScore: من 1 (غير راضي) إلى 5 (راضي جداً)، أو null إذا كان غير واضح`;

  const schema = {
    type: "object",
    properties: {
      intent: { type: "string", enum: ["order_inquiry","complaint","reservation","support_request","menu_question","delivery_issue","general_inquiry","feedback","greeting","other"] },
      sentiment: { type: "string", enum: ["positive","neutral","negative","mixed"] },
      sentimentScore: { type: "number" },
      priority: { type: "string", enum: ["low","medium","high","critical"] },
      summary: { type: "string" },
      suggestedReply: { type: ["string","null"] },
      tags: { type: "array", items: { type: "string" } },
      detectedLanguage: { type: "string" },
      extractedOrderItems: { type: "array", items: { type: "string" } },
      requiresHumanEscalation: { type: "boolean" },
      behaviorCategory: { type: "string" },
      behaviorTags: { type: "array", items: { type: "string" } },
      impressionSummary: { type: "string" },
      satisfactionScore: { type: ["number","null"] },
    },
    required: ["intent","sentiment","sentimentScore","priority","summary","suggestedReply","tags","detectedLanguage","extractedOrderItems","requiresHumanEscalation","behaviorCategory","behaviorTags","impressionSummary","satisfactionScore"],
    additionalProperties: false,
  };

  const response = await withRetry(() =>
    invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_schema", json_schema: { name: "conversation_full_analysis", strict: true, schema } },
    })
  );

  const rawContent = response?.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error("[WA-AI] Empty response from LLM");
  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  const parsed = JSON.parse(content) as Omit<ConversationAnalysisResult, "rawAnalysisJson" | "promptTokens" | "completionTokens" | "messageCountAnalyzed" | "lastMessageIncluded">;

  const lastMsg = textMessages[textMessages.length - 1];
  return {
    ...parsed,
    messageCountAnalyzed: textMessages.length,
    lastMessageIncluded: lastMsg.timestamp,
    rawAnalysisJson: parsed as unknown as Record<string, unknown>,
    promptTokens: response?.usage?.prompt_tokens ?? 0,
    completionTokens: response?.usage?.completion_tokens ?? 0,
  };
}

// ─── Storage: Save Analysis to DB ────────────────────────────────────────────

/**
 * Stores a message-level analysis result in whatsapp_ai_analysis.
 */
export async function storeMessageAnalysis(
  conversationId: number,
  instanceId: number,
  contactId: number,
  result: MessageAnalysisResult,
  analysisType: AnalysisType = "full"
): Promise<number | null> {
  const conn = await getConn();
  try {
    const now = Date.now();
    const [res] = await conn.execute(
      `INSERT INTO whatsapp_ai_analysis
       (conversationId, instanceId, contactId, analysisType, analysisVersion,
        messageCountAnalyzed, lastMessageIncluded,
        sentiment, sentimentScore, urgencyLevel,
        impressionSummary, keyTopics, detectedLanguage,
        recommendedAction, suggestedReply, extractedOrderItems,
        rawPromptTokens, rawCompletionTokens, rawAnalysisJson,
        analyzedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        sentiment = VALUES(sentiment), sentimentScore = VALUES(sentimentScore),
        urgencyLevel = VALUES(urgencyLevel), impressionSummary = VALUES(impressionSummary),
        keyTopics = VALUES(keyTopics), detectedLanguage = VALUES(detectedLanguage),
        recommendedAction = VALUES(recommendedAction), suggestedReply = VALUES(suggestedReply),
        extractedOrderItems = VALUES(extractedOrderItems),
        rawPromptTokens = VALUES(rawPromptTokens), rawCompletionTokens = VALUES(rawCompletionTokens),
        rawAnalysisJson = VALUES(rawAnalysisJson), analyzedAt = VALUES(analyzedAt), updatedAt = VALUES(updatedAt)`,
      [
        conversationId,
        instanceId,
        contactId,
        analysisType,
        now,
        result.sentiment,
        result.sentimentScore,
        result.priority,
        result.summary,
        JSON.stringify(result.tags),
        result.detectedLanguage,
        result.requiresHumanEscalation ? "Escalate to human agent" : null,
        result.suggestedReply ?? null,
        JSON.stringify(result.extractedOrderItems),
        result.promptTokens,
        result.completionTokens,
        JSON.stringify(result.rawAnalysisJson),
        now,
        now,
        now,
      ]
    );
    return (res as { insertId: number }).insertId ?? null;
  } finally {
    await conn.end();
  }
}

/**
 * Stores a full conversation analysis result in whatsapp_ai_analysis.
 */
export async function storeConversationAnalysis(
  conversationId: number,
  instanceId: number,
  contactId: number,
  result: ConversationAnalysisResult
): Promise<number | null> {
  const conn = await getConn();
  try {
    const now = Date.now();
    const [res] = await conn.execute(
      `INSERT INTO whatsapp_ai_analysis
       (conversationId, instanceId, contactId, analysisType, analysisVersion,
        messageCountAnalyzed, lastMessageIncluded,
        sentiment, sentimentScore, urgencyLevel,
        behaviorCategory, behaviorTags,
        impressionSummary, keyTopics, detectedLanguage,
        recommendedAction, suggestedReply, extractedOrderItems,
        rawPromptTokens, rawCompletionTokens, rawAnalysisJson,
        analyzedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, 'full', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        messageCountAnalyzed = VALUES(messageCountAnalyzed), lastMessageIncluded = VALUES(lastMessageIncluded),
        sentiment = VALUES(sentiment), sentimentScore = VALUES(sentimentScore),
        urgencyLevel = VALUES(urgencyLevel), behaviorCategory = VALUES(behaviorCategory),
        behaviorTags = VALUES(behaviorTags), impressionSummary = VALUES(impressionSummary),
        keyTopics = VALUES(keyTopics), detectedLanguage = VALUES(detectedLanguage),
        recommendedAction = VALUES(recommendedAction), suggestedReply = VALUES(suggestedReply),
        extractedOrderItems = VALUES(extractedOrderItems),
        rawPromptTokens = VALUES(rawPromptTokens), rawCompletionTokens = VALUES(rawCompletionTokens),
        rawAnalysisJson = VALUES(rawAnalysisJson), analyzedAt = VALUES(analyzedAt), updatedAt = VALUES(updatedAt)`,
      [
        conversationId,
        instanceId,
        contactId,
        result.messageCountAnalyzed,
        result.lastMessageIncluded,
        result.sentiment,
        result.sentimentScore,
        result.priority,
        result.behaviorCategory,
        JSON.stringify(result.behaviorTags),
        result.impressionSummary,
        JSON.stringify(result.tags),
        result.detectedLanguage,
        result.requiresHumanEscalation ? "Escalate to human agent" : null,
        result.suggestedReply ?? null,
        JSON.stringify(result.extractedOrderItems),
        result.promptTokens,
        result.completionTokens,
        JSON.stringify(result.rawAnalysisJson),
        now,
        now,
        now,
      ]
    );
    return (res as { insertId: number }).insertId ?? null;
  } finally {
    await conn.end();
  }
}

// ─── Duplicate Guard ──────────────────────────────────────────────────────────

/**
 * Returns true if a recent analysis already exists for this conversation.
 */
export async function hasRecentAnalysis(
  conversationId: number,
  analysisType: AnalysisType = "full",
  cooldownMs = 5 * 60 * 1000
): Promise<boolean> {
  const conn = await getConn();
  try {
    const since = Date.now() - cooldownMs;
    const [rows] = await conn.execute(
      `SELECT id FROM whatsapp_ai_analysis
       WHERE conversationId = ? AND analysisType = ? AND createdAt > ?
       LIMIT 1`,
      [conversationId, analysisType, since]
    );
    return (rows as unknown[]).length > 0;
  } finally {
    await conn.end();
  }
}

// ─── Main Entry Points ────────────────────────────────────────────────────────

/**
 * Triggered after each incoming message.
 * Runs a lightweight per-message analysis and stores it.
 * This is the function called by waIntegration.ts triggerAiAnalysis.
 */
export async function analyzeConversation(
  conversationId: number,
  instanceId: number,
  contactId: number,
  options: {
    messageBody: string;
    includeReply?: boolean;
    conversationContext?: string;
    restaurantName?: string;
    cooldownMs?: number;
  }
): Promise<{ analysisId: number | null; result: MessageAnalysisResult | null; skipped: boolean }>;

/**
 * Legacy overload: called with a single AnalysisInput object (backward compat).
 */
export async function analyzeConversation(
  input: { conversationId: number; instanceId: number; contactId: number }
): Promise<void>;

export async function analyzeConversation(
  conversationIdOrInput: number | { conversationId: number; instanceId: number; contactId: number },
  instanceId?: number,
  contactId?: number,
  options?: {
    messageBody: string;
    includeReply?: boolean;
    conversationContext?: string;
    restaurantName?: string;
    cooldownMs?: number;
  }
): Promise<{ analysisId: number | null; result: MessageAnalysisResult | null; skipped: boolean } | void> {
  // Legacy call: analyzeConversation({ conversationId, instanceId, contactId })
  if (typeof conversationIdOrInput === "object") {
    const { conversationId, instanceId: iid, contactId: cid } = conversationIdOrInput;
    await _legacyAnalyzeConversation(conversationId, iid, cid);
    return;
  }

  const convId = conversationIdOrInput;
  const iid = instanceId!;
  const cid = contactId!;
  const cooldownMs = options?.cooldownMs ?? 5 * 60 * 1000;

  const alreadyAnalyzed = await hasRecentAnalysis(convId, "full", cooldownMs);
  if (alreadyAnalyzed) {
    return { analysisId: null, result: null, skipped: true };
  }

  try {
    const result = await analyzeMessage(options?.messageBody ?? "", {
      includeReply: options?.includeReply ?? false,
      conversationContext: options?.conversationContext,
      restaurantName: options?.restaurantName,
    });

    const analysisId = await storeMessageAnalysis(convId, iid, cid, result, "full");

    console.log(`[WA-AI] Message analysis stored (id=${analysisId}) conv=${convId} intent=${result.intent} sentiment=${result.sentiment} priority=${result.priority}`);
    return { analysisId, result, skipped: false };
  } catch (err) {
    console.error(`[WA-AI] analyzeConversation failed for conv=${convId}:`, err);
    return { analysisId: null, result: null, skipped: false };
  }
}

/** Legacy implementation used by old callers */
async function _legacyAnalyzeConversation(
  conversationId: number,
  instanceId: number,
  contactId: number
): Promise<void> {
  const conn = await getConn();
  try {
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    const [existing] = await conn.execute(
      `SELECT id FROM whatsapp_ai_analysis
       WHERE conversationId = ? AND analysisType = 'full' AND createdAt > ?
       LIMIT 1`,
      [conversationId, tenMinAgo]
    );
    if ((existing as unknown[]).length > 0) return;

    const [msgRows] = await conn.execute(
      `SELECT fromMe, body, messageType, timestamp
       FROM wa_messages
       WHERE conversationId = ?
       ORDER BY timestamp DESC LIMIT 20`,
      [conversationId]
    );
    const messages = (msgRows as Array<{ fromMe: number; body: string | null; messageType: string; timestamp: number }>)
      .reverse()
      .map(r => ({ ...r, fromMe: r.fromMe === 1 }));

    if (messages.length === 0) return;

    const transcript = messages
      .filter(m => m.body && m.messageType === "text")
      .map(m => `${m.fromMe ? "Agent" : "Customer"}: ${m.body}`)
      .join("\n");

    if (!transcript.trim()) return;

    const lastMsg = messages[messages.length - 1];
    const result = await analyzeMessage(lastMsg.body ?? "", {
      conversationContext: transcript,
    });

    await storeMessageAnalysis(conversationId, instanceId, contactId, result, "full");
    console.log(`[WA-AI] Legacy analysis stored for conversation ${conversationId}`);
  } catch (err) {
    console.error(`[WA-AI] Legacy analysis failed for conversation ${conversationId}:`, err);
  } finally {
    await conn.end();
  }
}

/**
 * Triggered on-demand for full conversation analysis.
 */
export async function runFullConversationAnalysis(
  conversationId: number,
  instanceId: number,
  contactId: number,
  options: {
    includeReply?: boolean;
    restaurantName?: string;
    forceRerun?: boolean;
  } = {}
): Promise<{ analysisId: number | null; result: ConversationAnalysisResult | null; skipped: boolean }> {
  if (!options.forceRerun) {
    const alreadyAnalyzed = await hasRecentAnalysis(conversationId, "full", 15 * 60 * 1000);
    if (alreadyAnalyzed) {
      return { analysisId: null, result: null, skipped: true };
    }
  }

  const conn = await getConn();
  try {
    // Try wa_messages first (old system), then whatsapp_messages (new system via webhook)
    let [rows] = await conn.execute(
      `SELECT fromMe, body, messageType, timestamp FROM wa_messages
       WHERE conversationId = ? AND body IS NOT NULL AND messageType = 'text'
       ORDER BY timestamp ASC LIMIT 100`,
      [conversationId]
    );
    if ((rows as unknown[]).length === 0) {
      [rows] = await conn.execute(
        `SELECT fromMe, body, messageType, timestamp FROM whatsapp_messages
         WHERE conversationId = ? AND body IS NOT NULL AND messageType = 'text'
         ORDER BY timestamp ASC LIMIT 100`,
        [conversationId]
      );
    }
    const messages = (rows as Array<{ fromMe: number; body: string; timestamp: number }>).map(r => ({
      fromMe: r.fromMe === 1,
      body: r.body,
      timestamp: r.timestamp,
    }));

    if (messages.length === 0) {
      return { analysisId: null, result: null, skipped: true };
    }

    const result = await analyzeConversationFull(messages, {
      includeReply: options.includeReply ?? false,
      restaurantName: options.restaurantName,
    });

    const analysisId = await storeConversationAnalysis(conversationId, instanceId, contactId, result);

    console.log(`[WA-AI] Full analysis stored (id=${analysisId}) conv=${conversationId} behavior=${result.behaviorCategory} satisfaction=${result.satisfactionScore}`);
    return { analysisId, result, skipped: false };
  } catch (err) {
    console.error(`[WA-AI] runFullConversationAnalysis failed for conv=${conversationId}:`, err);
    return { analysisId: null, result: null, skipped: false };
  } finally {
    await conn.end();
  }
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

/**
 * Fetches the latest analysis for a conversation.
 */
export async function getLatestAnalysis(conversationId: number) {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      `SELECT * FROM whatsapp_ai_analysis
       WHERE conversationId = ?
       ORDER BY createdAt DESC LIMIT 1`,
      [conversationId]
    );
    const row = (rows as unknown[])[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    if (typeof row.keyTopics === "string") row.keyTopics = JSON.parse(row.keyTopics);
    if (typeof row.behaviorTags === "string") row.behaviorTags = JSON.parse(row.behaviorTags);
    if (typeof row.extractedOrderItems === "string") row.extractedOrderItems = JSON.parse(row.extractedOrderItems);
    return row;
  } finally {
    await conn.end();
  }
}

/**
 * Fetches analytics summary for all conversations of an instance.
 */
export async function getInstanceAnalyticsSummary(instanceId: number) {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      `SELECT
         COUNT(*)                                                      AS totalAnalyzed,
         SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END)     AS positive,
         SUM(CASE WHEN sentiment = 'neutral'  THEN 1 ELSE 0 END)     AS neutral,
         SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END)     AS negative,
         SUM(CASE WHEN sentiment = 'mixed'    THEN 1 ELSE 0 END)     AS mixed,
         SUM(CASE WHEN urgencyLevel = 'critical' THEN 1 ELSE 0 END)  AS critical,
         SUM(CASE WHEN urgencyLevel = 'high'     THEN 1 ELSE 0 END)  AS highPriority,
         SUM(CASE WHEN recommendedAction IS NOT NULL THEN 1 ELSE 0 END) AS needsEscalation,
         AVG(sentimentScore)                                          AS avgSentimentScore,
         COUNT(DISTINCT conversationId)                               AS uniqueConversations
       FROM whatsapp_ai_analysis
       WHERE instanceId = ?`,
      [instanceId]
    );
    return (rows as unknown[])[0] ?? null;
  } finally {
    await conn.end();
  }
}

/**
 * Fetches analyses for a specific conversation (paginated).
 */
export async function getConversationAnalyses(
  conversationId: number,
  limit = 10,
  offset = 0
) {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      `SELECT id, analysisType, sentiment, sentimentScore, urgencyLevel,
              impressionSummary, keyTopics, detectedLanguage, suggestedReply,
              behaviorCategory, extractedOrderItems, recommendedAction, createdAt
       FROM whatsapp_ai_analysis
       WHERE conversationId = ?
       ORDER BY createdAt DESC
       LIMIT ? OFFSET ?`,
      [conversationId, limit, offset]
    );
    return (rows as Record<string, unknown>[]).map(row => {
      if (typeof row.keyTopics === "string") row.keyTopics = JSON.parse(row.keyTopics as string);
      if (typeof row.behaviorTags === "string") row.behaviorTags = JSON.parse(row.behaviorTags as string);
      if (typeof row.extractedOrderItems === "string") row.extractedOrderItems = JSON.parse(row.extractedOrderItems as string);
      return row;
    });
  } finally {
    await conn.end();
  }
}

/**
 * Fetches top issues (high/critical priority) across all conversations.
 */
export async function getTopIssues(instanceId: number, limit = 10) {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      `SELECT impressionSummary, urgencyLevel, sentiment, createdAt
       FROM whatsapp_ai_analysis
       WHERE instanceId = ?
         AND urgencyLevel IN ('high', 'critical')
         AND sentiment IN ('negative', 'mixed')
       ORDER BY createdAt DESC
       LIMIT ?`,
      [instanceId, limit]
    );
    return rows as unknown[];
  } finally {
    await conn.end();
  }
}

// ─── Batch Analysis ───────────────────────────────────────────────────────────

export interface BatchAnalysisProgress {
  total: number;
  processed: number;
  succeeded: number;
  skipped: number;
  failed: number;
  isRunning: boolean;
  startedAt: number | null;
  completedAt: number | null;
  lastError: string | null;
}

// Singleton progress tracker (in-memory, per server process)
let _batchProgress: BatchAnalysisProgress = {
  total: 0, processed: 0, succeeded: 0, skipped: 0, failed: 0,
  isRunning: false, startedAt: null, completedAt: null, lastError: null,
};

export function getBatchProgress(): BatchAnalysisProgress {
  return { ..._batchProgress };
}

/**
 * Runs AI analysis on ALL conversations that don't have a recent analysis.
 * Processes in batches of `concurrency` (default 5) to avoid rate limits.
 * Non-blocking: returns immediately, progress tracked via getBatchProgress().
 */
export async function batchAnalyzeAllConversations(options: {
  numberId?: number;
  forceRerun?: boolean;
  concurrency?: number;
  includeReply?: boolean;
  restaurantName?: string;
} = {}): Promise<void> {
  if (_batchProgress.isRunning) {
    console.log("[WA-AI-Batch] Already running, skipping duplicate trigger");
    return;
  }

  const concurrency = options.concurrency ?? 5;
  const conn = await getConn();

  try {
    // Get conversations that HAVE messages (any type with body)
    // Skip already-analyzed ones unless forceRerun=true
    let query = `
      SELECT c.id AS convId, c.numberId,
             COALESCE(c.contactPushName, c.contactName, c.contactPhone) AS contactLabel
      FROM wa_conversations c
      WHERE EXISTS (
        SELECT 1 FROM wa_messages m
        WHERE m.conversationId = c.id AND m.body IS NOT NULL AND m.body != ''
      )
    `;
    const params: (number | string)[] = [];

    if (options.numberId) {
      query += ` AND c.numberId = ?`;
      params.push(options.numberId);
    }

    if (!options.forceRerun) {
      query += ` AND NOT EXISTS (
        SELECT 1 FROM whatsapp_ai_analysis a
        WHERE a.conversationId = c.id AND a.analysisType = 'full'
      )`;
    }
    query += ` ORDER BY c.id ASC`;

    const [convRows] = await conn.execute(query, params);
    const conversations = convRows as Array<{ convId: number; numberId: number; contactLabel: string }>;

    _batchProgress = {
      total: conversations.length,
      processed: 0,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      isRunning: true,
      startedAt: Date.now(),
      completedAt: null,
      lastError: null,
    };

    console.log(`[WA-AI-Batch] Starting batch analysis: ${conversations.length} conversations, concurrency=${concurrency}`);

    // Process in chunks
    for (let i = 0; i < conversations.length; i += concurrency) {
      const chunk = conversations.slice(i, i + concurrency);
      await Promise.allSettled(
        chunk.map(async (conv) => {
          try {
            const result = await runFullConversationAnalysis(
              conv.convId,
              conv.numberId,  // use numberId as instanceId (same concept in wa_* tables)
              0,              // contactId = 0 (no separate contacts table in wa_*)
              {
                forceRerun: options.forceRerun ?? false,
                includeReply: options.includeReply ?? true,
                restaurantName: options.restaurantName,
              }
            );
            if (result.skipped) {
              _batchProgress.skipped++;
            } else if (result.analysisId) {
              _batchProgress.succeeded++;
            } else {
              _batchProgress.failed++;
            }
          } catch (err) {
            _batchProgress.failed++;
            _batchProgress.lastError = err instanceof Error ? err.message : String(err);
            console.error(`[WA-AI-Batch] Failed conv=${conv.convId}:`, err);
          } finally {
            _batchProgress.processed++;
          }
        })
      );

      // Small delay between chunks to avoid rate limits
      if (i + concurrency < conversations.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    _batchProgress.isRunning = false;
    _batchProgress.completedAt = Date.now();
    console.log(`[WA-AI-Batch] Completed: ${_batchProgress.succeeded} succeeded, ${_batchProgress.skipped} skipped, ${_batchProgress.failed} failed`);

  } catch (err) {
    _batchProgress.isRunning = false;
    _batchProgress.lastError = err instanceof Error ? err.message : String(err);
    console.error("[WA-AI-Batch] Fatal error:", err);
  } finally {
    await conn.end();
  }
}
