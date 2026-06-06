/**
 * waIntegration.test.ts
 * Tests for WhatsApp webhook integration layer — pure unit tests (no DB calls)
 */
import { describe, it, expect, vi } from "vitest";

// ─── Mock mysql2/promise (prevent real DB connections) ────────────────────────
vi.mock("mysql2/promise", () => ({
  default: {
    createConnection: vi.fn().mockResolvedValue({
      execute: vi.fn().mockResolvedValue([[], []]),
      end: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// ─── Mock waAiAnalysis ────────────────────────────────────────────────────────
vi.mock("./waAiAnalysis", () => ({
  analyzeConversation: vi.fn().mockResolvedValue(undefined),
}));

// ─── Import pure functions after mocks ───────────────────────────────────────
import { extractMessageContent, verifyWebhookSignature } from "./waIntegration";

// ─── extractMessageContent ────────────────────────────────────────────────────
describe("extractMessageContent", () => {
  it("extracts text from conversation field", () => {
    const result = extractMessageContent({
      message: { conversation: "Hello, I want to order" },
    });
    expect(result.messageType).toBe("text");
    expect(result.body).toBe("Hello, I want to order");
    expect(result.mediaUrl).toBeNull();
  });

  it("extracts text from extendedTextMessage", () => {
    const result = extractMessageContent({
      message: { extendedTextMessage: { text: "Your order is ready" } },
    });
    expect(result.messageType).toBe("text");
    expect(result.body).toBe("Your order is ready");
  });

  it("identifies image messages and extracts caption", () => {
    const result = extractMessageContent({
      message: {
        imageMessage: {
          caption: "Check this photo",
          mimetype: "image/jpeg",
          fileLength: 102400,
          url: "https://cdn.example.com/img.jpg",
        },
      },
    });
    expect(result.messageType).toBe("image");
    expect(result.body).toBeNull();
    expect(result.caption).toBe("Check this photo");
    expect(result.mediaMimeType).toBe("image/jpeg");
    expect(result.mediaFileSize).toBe(102400);
  });

  it("identifies audio messages", () => {
    const result = extractMessageContent({
      message: { audioMessage: { mimetype: "audio/ogg; codecs=opus" } },
    });
    expect(result.messageType).toBe("audio");
    expect(result.body).toBeNull();
  });

  it("identifies video messages", () => {
    const result = extractMessageContent({
      message: { videoMessage: { caption: "Watch this", mimetype: "video/mp4" } },
    });
    expect(result.messageType).toBe("video");
    expect(result.caption).toBe("Watch this");
  });

  it("identifies document messages", () => {
    const result = extractMessageContent({
      message: { documentMessage: { fileName: "invoice.pdf", mimetype: "application/pdf" } },
    });
    expect(result.messageType).toBe("document");
    expect(result.mediaMimeType).toBe("application/pdf");
  });

  it("identifies location messages", () => {
    const result = extractMessageContent({
      message: { locationMessage: { degreesLatitude: 25.2048, degreesLongitude: 55.2708 } },
    });
    expect(result.messageType).toBe("location");
    expect(result.latitude).toBe(25.2048);
    expect(result.longitude).toBe(55.2708);
  });

  it("detects forwarded messages", () => {
    const result = extractMessageContent({
      message: {
        conversation: "Forwarded text",
        contextInfo: { isForwarded: true },
      },
    });
    expect(result.isForwarded).toBe(true);
  });

  it("returns unknown type for empty message", () => {
    const result = extractMessageContent({});
    expect(result.messageType).toBe("unknown");
    expect(result.body).toBeNull();
  });

  it("handles missing message field gracefully", () => {
    const result = extractMessageContent({ key: { id: "abc" } });
    expect(result.messageType).toBe("unknown");
  });
});

// ─── verifyWebhookSignature ───────────────────────────────────────────────────
describe("verifyWebhookSignature", () => {
  it("returns true when no secret is configured (open mode)", () => {
    expect(verifyWebhookSignature("body", undefined, null)).toBe(true);
    expect(verifyWebhookSignature("body", "some-sig", null)).toBe(true);
  });

  it("returns false when secret is set but no signature provided", () => {
    expect(verifyWebhookSignature("body", undefined, "my-secret")).toBe(false);
  });

  it("returns false for invalid signature", () => {
    expect(verifyWebhookSignature("body", "sha256=invalid", "my-secret")).toBe(false);
  });

  it("returns true for valid HMAC-SHA256 signature", () => {
    // Pre-computed: HMAC-SHA256("my-secret", "test-body")
    const crypto = require("crypto");
    const expected = crypto
      .createHmac("sha256", "my-secret")
      .update("test-body")
      .digest("hex");
    expect(verifyWebhookSignature("test-body", `sha256=${expected}`, "my-secret")).toBe(true);
  });

  it("accepts signature without sha256= prefix", () => {
    const crypto = require("crypto");
    const expected = crypto
      .createHmac("sha256", "my-secret")
      .update("test-body")
      .digest("hex");
    expect(verifyWebhookSignature("test-body", expected, "my-secret")).toBe(true);
  });
});
