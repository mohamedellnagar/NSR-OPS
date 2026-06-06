/**
 * waWebhookController.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Express route handler for WhatsApp webhook events from Evolution API.
 *
 * Endpoints:
 *   POST /api/webhook/whatsapp/:instance
 *     → Receives all Evolution API events for a specific instance
 *     → Verifies HMAC-SHA256 signature (if webhookSecret is set)
 *     → Dispatches to processWebhookEvent()
 *     → Always returns 200 OK to prevent Evolution API retries on server errors
 *
 *   GET /api/webhook/whatsapp/:instance/health
 *     → Health check endpoint for Evolution API to verify webhook is reachable
 *
 * Safe retry handling:
 *   - All processing errors are caught and logged
 *   - Always responds 200 to Evolution API to prevent infinite retries
 *   - Duplicate protection is handled in processWebhookEvent()
 */

import type { Request, Response, NextFunction } from "express";
import { processWebhookEvent } from "./waIntegration";

/**
 * Raw body capture middleware.
 * Must be applied BEFORE express.json() for the webhook routes
 * so we can verify the HMAC signature.
 */
export function captureRawBody(req: Request, res: Response, next: NextFunction): void {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    (req as Request & { rawBody: string }).rawBody = Buffer.concat(chunks).toString("utf8");
    try {
      req.body = JSON.parse((req as Request & { rawBody: string }).rawBody);
    } catch {
      req.body = {};
    }
    next();
  });
  req.on("error", next);
}

/**
 * POST /api/webhook/whatsapp/:instance
 *
 * Accepts Evolution API webhook payloads.
 * Evolution API sends events in two formats:
 *
 * Format 1 (v1): { event: "messages.upsert", instance: "...", data: {...} }
 * Format 2 (v2): { event: "messages.upsert", instance: {...}, data: {...} }
 *
 * We normalize both formats before dispatching.
 */
export async function handleWhatsAppWebhook(req: Request, res: Response): Promise<void> {
  const instanceName = req.params.instance as string;
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
  const signature = req.headers["x-hub-signature-256"] as string | undefined
    ?? req.headers["x-evolution-signature"] as string | undefined;

  // Always respond 200 immediately to prevent Evolution API from retrying
  // (processing happens asynchronously after response)
  res.status(200).json({ received: true });

  // Extract event type from payload
  const body = req.body as Record<string, unknown>;

  // Evolution API can send event in different fields
  const eventType = (
    body?.event ??
    body?.type ??
    body?.action ??
    "unknown"
  ) as string;

  // Process asynchronously (don't await — response already sent)
  processWebhookEvent(instanceName, eventType, body, rawBody, signature)
    .then((result) => {
      if (!result.success && result.action === "error") {
        console.error(`[WA-Webhook] Processing error for ${instanceName}/${eventType}:`, result.error);
      } else {
        console.log(`[WA-Webhook] ${instanceName}/${eventType} → ${result.action} (log: ${result.logId})`);
      }
    })
    .catch((err) => {
      console.error(`[WA-Webhook] Unhandled error for ${instanceName}/${eventType}:`, err);
    });
}

/**
 * GET /api/webhook/whatsapp/:instance/health
 * Health check endpoint for Evolution API connectivity verification.
 */
export function handleWebhookHealthCheck(req: Request, res: Response): void {
  const instanceName = req.params.instance as string;
  res.status(200).json({
    status: "ok",
    instance: instanceName,
    timestamp: new Date().toISOString(),
    service: "matjari-whatsapp-webhook",
  });
}
