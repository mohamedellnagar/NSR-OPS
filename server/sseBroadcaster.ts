/**
 * SSE (Server-Sent Events) broadcaster for real-time dashboard updates.
 * Clients subscribe to /api/sse/wa-events and receive events when:
 *  - A new WhatsApp message is stored (event: "new_message")
 *  - An AI analysis completes (event: "analysis_done")
 */

import type { Request, Response } from "express";

// Set of active SSE response objects
const clients = new Set<Response>();

/**
 * Express route handler: GET /api/sse/wa-events
 * Keeps the connection open and streams events to the client.
 */
export function handleSseConnection(req: Request, res: Response): void {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  res.flushHeaders();

  // Send initial heartbeat so client knows connection is alive
  res.write("event: connected\ndata: {}\n\n");

  // Register client
  clients.add(res);

  // Heartbeat every 25 seconds to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
      clients.delete(res);
    }
  }, 25_000);

  // Cleanup on disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

/**
 * Broadcast an event to all connected SSE clients.
 */
export function broadcastSseEvent(
  eventName: string,
  data: Record<string, unknown>
): void {
  if (clients.size === 0) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of Array.from(clients)) {
    try {
      client.write(payload);
    } catch {
      // Client disconnected — remove it
      clients.delete(client);
    }
  }
}

/** Convenience: broadcast a new_message event */
export function broadcastNewMessage(data: {
  conversationId: number;
  messageId: number;
  instanceId?: number;
}): void {
  broadcastSseEvent("new_message", data);
}

/** Broadcast when an order is sent to kitchen (real-time KDS update) */
export function broadcastKitchenOrder(data: {
  orderId: number;
  orderNumber: string;
  orderType?: string;
}): void {
  broadcastSseEvent("kitchen_order", data);
}

/** Convenience: broadcast an analysis_done event */
export function broadcastAnalysisDone(data: {
  conversationId: number;
}): void {
  broadcastSseEvent("analysis_done", data);
}
