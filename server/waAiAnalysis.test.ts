/**
 * waAiAnalysis.test.ts
 * Unit tests for the WhatsApp AI Analysis layer.
 * Uses vi.mock to avoid real DB and LLM calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoist mocks so they are available before vi.mock factory runs ──────────────
// `mockEnd` stands for "connection returned when done". Since server/pool.ts the
// code takes a pooled connection and calls release(), so it is wired to release.
const { mockExecute, mockEnd } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockEnd: vi.fn(),
}));

// ─── Mock mysql2/promise ────────────────────────────────────────────────
// server/pool.ts calls createPool(...).getConnection().
vi.mock("mysql2/promise", () => {
  const connection = {
    execute: mockExecute,
    query: mockExecute,
    release: mockEnd,
    end: mockEnd,
  };
  const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
  return {
    default: {
      createPool: vi.fn(() => pool),
      createConnection: vi.fn().mockResolvedValue(connection),
    },
  };
});

// ─── Mock LLM ──────────────────────────────────────────────────────────────────────────────
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "./_core/llm";
import {
  analyzeMessage,
  analyzeConversationFull,
  hasRecentAnalysis,
  storeMessageAnalysis,
  type MessageAnalysisResult,
} from "./waAiAnalysis";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLLMResponse(content: object) {
  return {
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  };
}

const SAMPLE_MESSAGE_RESULT = {
  intent: "complaint",
  sentiment: "negative",
  sentimentScore: 0.15,
  priority: "high",
  summary: "Customer complaining about late delivery",
  suggestedReply: null,
  tags: ["late delivery", "complaint"],
  detectedLanguage: "en",
  extractedOrderItems: [],
  requiresHumanEscalation: true,
};

const SAMPLE_CONV_RESULT = {
  ...SAMPLE_MESSAGE_RESULT,
  behaviorCategory: "complainer",
  behaviorTags: ["repeat_complainer"],
  impressionSummary: "Customer is frustrated with delivery service.",
  satisfactionScore: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = "mysql://test:test@localhost/test";
});

// ─── analyzeMessage ───────────────────────────────────────────────────────────

describe("analyzeMessage", () => {
  it("returns structured analysis for a complaint message", async () => {
    vi.mocked(invokeLLM).mockResolvedValueOnce(makeLLMResponse(SAMPLE_MESSAGE_RESULT));

    const result = await analyzeMessage("My order is 2 hours late!", { includeReply: false });

    expect(result.intent).toBe("complaint");
    expect(result.sentiment).toBe("negative");
    expect(result.priority).toBe("high");
    expect(result.requiresHumanEscalation).toBe(true);
    expect(result.suggestedReply).toBeNull();
    expect(result.promptTokens).toBe(100);
    expect(result.completionTokens).toBe(50);
  });

  it("includes suggestedReply when includeReply is true", async () => {
    const resultWithReply = { ...SAMPLE_MESSAGE_RESULT, suggestedReply: "We apologize for the delay." };
    vi.mocked(invokeLLM).mockResolvedValueOnce(makeLLMResponse(resultWithReply));

    const result = await analyzeMessage("Where is my order?", { includeReply: true });

    expect(result.suggestedReply).toBe("We apologize for the delay.");
  });

  it("handles Arabic messages correctly", async () => {
    const arabicResult = { ...SAMPLE_MESSAGE_RESULT, detectedLanguage: "ar", intent: "order_inquiry" };
    vi.mocked(invokeLLM).mockResolvedValueOnce(makeLLMResponse(arabicResult));

    const result = await analyzeMessage("وين طلبي؟", {});

    expect(result.detectedLanguage).toBe("ar");
    expect(result.intent).toBe("order_inquiry");
  });

  it("throws when LLM returns empty response", async () => {
    vi.mocked(invokeLLM).mockResolvedValueOnce({ choices: [{ message: { content: null } }] });

    await expect(analyzeMessage("test")).rejects.toThrow("[WA-AI] Empty response from LLM");
  });

  it("retries on failure and succeeds on third attempt", async () => {
    vi.mocked(invokeLLM)
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(makeLLMResponse(SAMPLE_MESSAGE_RESULT));

    const result = await analyzeMessage("test message");

    expect(result.intent).toBe("complaint");
    expect(invokeLLM).toHaveBeenCalledTimes(3);
  });

  it("throws after 3 failed attempts", async () => {
    vi.mocked(invokeLLM).mockRejectedValue(new Error("LLM unavailable"));

    await expect(analyzeMessage("test")).rejects.toThrow("LLM unavailable");
    expect(invokeLLM).toHaveBeenCalledTimes(3);
  });
});

// ─── analyzeConversationFull ──────────────────────────────────────────────────

describe("analyzeConversationFull", () => {
  const messages = [
    { fromMe: false, body: "My order is late", timestamp: 1700000000000 },
    { fromMe: true, body: "We are looking into it", timestamp: 1700000060000 },
    { fromMe: false, body: "This is unacceptable!", timestamp: 1700000120000 },
  ];

  it("returns full conversation analysis with behavior fields", async () => {
    vi.mocked(invokeLLM).mockResolvedValueOnce(makeLLMResponse(SAMPLE_CONV_RESULT));

    const result = await analyzeConversationFull(messages);

    expect(result.behaviorCategory).toBe("complainer");
    expect(result.impressionSummary).toBeTruthy();
    expect(result.satisfactionScore).toBe(2);
    expect(result.messageCountAnalyzed).toBe(3);
    expect(result.lastMessageIncluded).toBe(1700000120000);
  });

  it("throws when no text messages are provided", async () => {
    const emptyMessages = [{ fromMe: false, body: null, timestamp: 1700000000000 }];

    await expect(analyzeConversationFull(emptyMessages)).rejects.toThrow(
      "[WA-AI] No text messages to analyze"
    );
  });

  it("sorts messages by timestamp before analysis", async () => {
    const unorderedMessages = [
      { fromMe: false, body: "Second message", timestamp: 1700000060000 },
      { fromMe: false, body: "First message", timestamp: 1700000000000 },
    ];
    vi.mocked(invokeLLM).mockResolvedValueOnce(makeLLMResponse(SAMPLE_CONV_RESULT));

    const result = await analyzeConversationFull(unorderedMessages);

    expect(result.lastMessageIncluded).toBe(1700000060000);
    // Verify LLM was called with sorted transcript
    const callArgs = vi.mocked(invokeLLM).mock.calls[0][0];
    const userMsg = (callArgs.messages as Array<{ role: string; content: string }>).find(m => m.role === "user")?.content ?? "";
    expect(userMsg.indexOf("First message")).toBeLessThan(userMsg.indexOf("Second message"));
  });
});

// ─── hasRecentAnalysis ────────────────────────────────────────────────────────

describe("hasRecentAnalysis", () => {
  it("returns true when recent analysis exists", async () => {
    mockExecute.mockResolvedValueOnce([[{ id: 1 }]]);

    const result = await hasRecentAnalysis(42, "full", 5 * 60 * 1000);

    expect(result).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("whatsapp_ai_analysis"),
      expect.arrayContaining([42, "full"])
    );
  });

  it("returns false when no recent analysis exists", async () => {
    mockExecute.mockResolvedValueOnce([[]]);

    const result = await hasRecentAnalysis(42, "full", 5 * 60 * 1000);

    expect(result).toBe(false);
  });

  it("closes DB connection even on error", async () => {
    mockExecute.mockRejectedValueOnce(new Error("DB error"));

    await expect(hasRecentAnalysis(42)).rejects.toThrow("DB error");
    expect(mockEnd).toHaveBeenCalled();
  });
});

// ─── storeMessageAnalysis ─────────────────────────────────────────────────────

describe("storeMessageAnalysis", () => {
  it("inserts analysis and returns insertId", async () => {
    mockExecute.mockResolvedValueOnce([{ insertId: 99 }]);

    const result: MessageAnalysisResult = {
      intent: "menu_question",
      sentiment: "neutral",
      sentimentScore: 0.5,
      priority: "low",
      summary: "Customer asking about menu",
      suggestedReply: null,
      tags: ["menu"],
      detectedLanguage: "ar",
      extractedOrderItems: [],
      requiresHumanEscalation: false,
      rawAnalysisJson: {},
      promptTokens: 80,
      completionTokens: 30,
    };

    const id = await storeMessageAnalysis(1, 2, 3, result, "full");

    expect(id).toBe(99);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO whatsapp_ai_analysis"),
      expect.any(Array)
    );
  });

  it("closes DB connection after insert", async () => {
    mockExecute.mockResolvedValueOnce([{ insertId: 1 }]);

    const result: MessageAnalysisResult = {
      intent: "greeting",
      sentiment: "positive",
      sentimentScore: 0.9,
      priority: "low",
      summary: "Hello",
      suggestedReply: null,
      tags: [],
      detectedLanguage: "en",
      extractedOrderItems: [],
      requiresHumanEscalation: false,
      rawAnalysisJson: {},
      promptTokens: 10,
      completionTokens: 5,
    };

    await storeMessageAnalysis(1, 2, 3, result);

    expect(mockEnd).toHaveBeenCalled();
  });
});

// ─── Intent Coverage ──────────────────────────────────────────────────────────

describe("intent coverage", () => {
  const intents = [
    "order_inquiry", "complaint", "reservation", "support_request",
    "menu_question", "delivery_issue", "general_inquiry", "feedback",
    "greeting", "other",
  ];

  it.each(intents)("handles intent: %s", async (intent) => {
    vi.mocked(invokeLLM).mockResolvedValueOnce(
      makeLLMResponse({ ...SAMPLE_MESSAGE_RESULT, intent })
    );

    const result = await analyzeMessage("test message for " + intent);

    expect(result.intent).toBe(intent);
  });
});
