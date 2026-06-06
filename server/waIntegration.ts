/**
 * waIntegration.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * WhatsApp Integration Service Layer
 *
 * Handles the full webhook processing pipeline:
 *   1. Identify the WhatsApp instance
 *   2. Log raw payload to whatsapp_webhook_logs
 *   3. Identify or create the contact
 *   4. Identify or create the conversation
 *   5. Store the message (with dedup protection)
 *   6. Update conversation last activity
 *   7. Log message status transitions
 *   8. Trigger AI analysis job (async, non-blocking)
 *   9. Update connection status
 *
 * Safe retry handling: all operations are idempotent.
 * Duplicate protection: UNIQUE KEY on (instanceId, evolutionMsgId).
 */

import mysql, { type Connection } from "mysql2/promise";
import crypto from "crypto";
import { broadcastNewMessage } from "./sseBroadcaster";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WaInstance {
  id: number;
  restaurantId: number;
  label: string;
  phoneNumber: string;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  evolutionInstance: string;
  webhookSecret: string | null;
  isActive: number;
  connectionStatus: string;
  lastConnectedAt: number | null;
  lastCheckedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface WaContact {
  id: number;
  instanceId: number;
  phone: string;
  pushName: string | null;
  profileName: string | null;
  avatarUrl: string | null;
  isBlocked: number;
  tags: string[] | null;
  notes: string | null;
  firstSeenAt: number;
  lastSeenAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface WaConversation {
  id: number;
  instanceId: number;
  contactId: number;
  assignedUserId: number | null;
  status: "open" | "pending" | "resolved" | "archived" | "spam";
  priority: "low" | "normal" | "high" | "urgent";
  subject: string | null;
  lastMessageBody: string | null;
  lastMessageAt: number | null;
  lastMessageFromMe: number | null;
  unreadCount: number;
  tags: string[] | null;
  resolvedAt: number | null;
  resolvedByUserId: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface WaMessage {
  id: number;
  conversationId: number;
  instanceId: number;
  evolutionMsgId: string | null;
  fromMe: number;
  senderUserId: number | null;
  replyToMsgId: number | null;
  messageType: string;
  body: string | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaFileSize: number | null;
  caption: string | null;
  latitude: number | null;
  longitude: number | null;
  isForwarded: number;
  isDeleted: number;
  deletedAt: number | null;
  status: string | null;
  sentAt: number | null;
  deliveredAt: number | null;
  readAt: number | null;
  timestamp: number;
  createdAt: number;
}

export type WebhookEventType =
  | "messages.upsert"
  | "messages.update"
  | "connection.update"
  | "qrcode.updated"
  | string;

export interface WebhookProcessResult {
  success: boolean;
  logId: number | null;
  action: "message_stored" | "status_updated" | "connection_updated" | "duplicate" | "skipped" | "error";
  messageId?: number;
  conversationId?: number;
  contactId?: number;
  error?: string;
}

// ─── DB Connection ────────────────────────────────────────────────────────────

async function getConn(): Promise<Connection> {
  return mysql.createConnection(process.env.DATABASE_URL!);
}

// ─── Payload Extraction ───────────────────────────────────────────────────────

/**
 * Extracts the message type and body from an Evolution API message payload.
 * Handles all message types: text, image, video, audio, document, sticker,
 * location, contact, reaction, template.
 */
export function extractMessageContent(rawMsg: Record<string, unknown>): {
  messageType: string;
  body: string | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaFileSize: number | null;
  caption: string | null;
  latitude: number | null;
  longitude: number | null;
  isForwarded: boolean;
} {
  const message = (rawMsg?.message ?? {}) as Record<string, unknown>;
  const contextInfo = (message?.contextInfo ?? {}) as Record<string, unknown>;
  const isForwarded = !!(contextInfo?.isForwarded);

  // Text
  if (message?.conversation) {
    return {
      messageType: "text",
      body: message.conversation as string,
      mediaUrl: null, mediaMimeType: null, mediaFileSize: null,
      caption: null, latitude: null, longitude: null, isForwarded,
    };
  }
  if ((message?.extendedTextMessage as Record<string, unknown>)?.text) {
    return {
      messageType: "text",
      body: ((message.extendedTextMessage as Record<string, unknown>).text) as string,
      mediaUrl: null, mediaMimeType: null, mediaFileSize: null,
      caption: null, latitude: null, longitude: null, isForwarded,
    };
  }

  // Image
  if (message?.imageMessage) {
    const img = message.imageMessage as Record<string, unknown>;
    return {
      messageType: "image",
      body: null,
      mediaUrl: (img?.url ?? img?.directPath ?? null) as string | null,
      mediaMimeType: (img?.mimetype ?? null) as string | null,
      mediaFileSize: (img?.fileLength ?? null) as number | null,
      caption: (img?.caption ?? null) as string | null,
      latitude: null, longitude: null, isForwarded,
    };
  }

  // Video
  if (message?.videoMessage) {
    const vid = message.videoMessage as Record<string, unknown>;
    return {
      messageType: "video",
      body: null,
      mediaUrl: (vid?.url ?? vid?.directPath ?? null) as string | null,
      mediaMimeType: (vid?.mimetype ?? null) as string | null,
      mediaFileSize: (vid?.fileLength ?? null) as number | null,
      caption: (vid?.caption ?? null) as string | null,
      latitude: null, longitude: null, isForwarded,
    };
  }

  // Audio
  if (message?.audioMessage) {
    const aud = message.audioMessage as Record<string, unknown>;
    return {
      messageType: "audio",
      body: null,
      mediaUrl: (aud?.url ?? aud?.directPath ?? null) as string | null,
      mediaMimeType: (aud?.mimetype ?? null) as string | null,
      mediaFileSize: (aud?.fileLength ?? null) as number | null,
      caption: null, latitude: null, longitude: null, isForwarded,
    };
  }

  // Document
  if (message?.documentMessage) {
    const doc = message.documentMessage as Record<string, unknown>;
    return {
      messageType: "document",
      body: (doc?.fileName ?? null) as string | null,
      mediaUrl: (doc?.url ?? doc?.directPath ?? null) as string | null,
      mediaMimeType: (doc?.mimetype ?? null) as string | null,
      mediaFileSize: (doc?.fileLength ?? null) as number | null,
      caption: (doc?.caption ?? null) as string | null,
      latitude: null, longitude: null, isForwarded,
    };
  }

  // Sticker
  if (message?.stickerMessage) {
    const stk = message.stickerMessage as Record<string, unknown>;
    return {
      messageType: "sticker",
      body: null,
      mediaUrl: (stk?.url ?? null) as string | null,
      mediaMimeType: (stk?.mimetype ?? null) as string | null,
      mediaFileSize: null,
      caption: null, latitude: null, longitude: null, isForwarded,
    };
  }

  // Location
  if (message?.locationMessage) {
    const loc = message.locationMessage as Record<string, unknown>;
    return {
      messageType: "location",
      body: (loc?.name ?? null) as string | null,
      mediaUrl: null, mediaMimeType: null, mediaFileSize: null, caption: null,
      latitude: (loc?.degreesLatitude ?? null) as number | null,
      longitude: (loc?.degreesLongitude ?? null) as number | null,
      isForwarded,
    };
  }

  // Contact
  if (message?.contactMessage) {
    const ct = message.contactMessage as Record<string, unknown>;
    return {
      messageType: "contact",
      body: (ct?.displayName ?? null) as string | null,
      mediaUrl: null, mediaMimeType: null, mediaFileSize: null,
      caption: null, latitude: null, longitude: null, isForwarded,
    };
  }

  // Reaction
  if (message?.reactionMessage) {
    const rx = message.reactionMessage as Record<string, unknown>;
    return {
      messageType: "reaction",
      body: (rx?.text ?? null) as string | null,
      mediaUrl: null, mediaMimeType: null, mediaFileSize: null,
      caption: null, latitude: null, longitude: null, isForwarded,
    };
  }

  // Template
  if (message?.templateMessage) {
    return {
      messageType: "template",
      body: null,
      mediaUrl: null, mediaMimeType: null, mediaFileSize: null,
      caption: null, latitude: null, longitude: null, isForwarded,
    };
  }

  // Unknown
  return {
    messageType: "unknown",
    body: null,
    mediaUrl: null, mediaMimeType: null, mediaFileSize: null,
    caption: null, latitude: null, longitude: null, isForwarded,
  };
}

// ─── Webhook Signature Verification ──────────────────────────────────────────

/**
 * Verifies the HMAC-SHA256 signature from Evolution API webhook.
 * Returns true if no secret is configured (open mode) or if signature matches.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string | null
): boolean {
  if (!secret) return true; // No secret configured — accept all
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const sig = signature.replace(/^sha256=/, "");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(sig, "hex")
    );
  } catch {
    return false;
  }
}

// ─── Instance Management ──────────────────────────────────────────────────────

export async function getInstanceByName(
  evolutionInstance: string
): Promise<WaInstance | null> {
  const conn = await getConn();
  try {
    // First try whatsapp_instances table
    const [rows] = await conn.execute(
      "SELECT * FROM whatsapp_instances WHERE evolutionInstance = ? LIMIT 1",
      [evolutionInstance]
    );
    if ((rows as WaInstance[]).length > 0) {
      return (rows as WaInstance[])[0];
    }
    // Fallback: try restaurant_wa_numbers (used by WaNumbersPage)
    // If found, auto-sync it into whatsapp_instances so FK constraints work
    const [waRows] = await conn.execute(
      "SELECT * FROM restaurant_wa_numbers WHERE evolutionInstance = ? AND isActive = 1 LIMIT 1",
      [evolutionInstance]
    );
    const waNum = (waRows as any[])[0];
    if (!waNum) return null;

    // Insert into whatsapp_instances (upsert by evolutionInstance)
    const now = Date.now();
    await conn.execute(
      `INSERT INTO whatsapp_instances
       (id, restaurantId, label, phoneNumber, evolutionApiUrl, evolutionApiKey,
        evolutionInstance, webhookSecret, isActive, connectionStatus, lastCheckedAt, createdAt, updatedAt)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         label = VALUES(label),
         phoneNumber = VALUES(phoneNumber),
         evolutionApiUrl = VALUES(evolutionApiUrl),
         evolutionApiKey = VALUES(evolutionApiKey),
         webhookSecret = VALUES(webhookSecret),
         isActive = VALUES(isActive),
         connectionStatus = VALUES(connectionStatus),
         updatedAt = VALUES(updatedAt)`,
      [
        waNum.id, waNum.label, waNum.phoneNumber,
        waNum.evolutionApiUrl, waNum.evolutionApiKey,
        waNum.evolutionInstance, waNum.webhookSecret ?? null,
        waNum.connectionStatus ?? "unknown",
        waNum.lastCheckedAt ?? now, waNum.createdAt ?? now, now
      ]
    );

    // Return the synced instance
    const [synced] = await conn.execute(
      "SELECT * FROM whatsapp_instances WHERE evolutionInstance = ? LIMIT 1",
      [evolutionInstance]
    );
    return (synced as WaInstance[])[0] ?? null;
  } finally {
    await conn.end();
  }
}

export async function listInstances(): Promise<WaInstance[]> {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      "SELECT * FROM whatsapp_instances ORDER BY createdAt ASC"
    );
    return rows as WaInstance[];
  } finally {
    await conn.end();
  }
}

export async function createInstance(data: {
  label: string;
  phoneNumber: string;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  evolutionInstance: string;
  webhookSecret?: string;
  restaurantId?: number;
}): Promise<number> {
  const conn = await getConn();
  try {
    const now = Date.now();
    const [result] = await conn.execute(
      `INSERT INTO whatsapp_instances
       (restaurantId, label, phoneNumber, evolutionApiUrl, evolutionApiKey,
        evolutionInstance, webhookSecret, isActive, connectionStatus, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'unknown', ?, ?)`,
      [
        data.restaurantId ?? 1,
        data.label,
        data.phoneNumber,
        data.evolutionApiUrl.replace(/\/$/, ""),
        data.evolutionApiKey,
        data.evolutionInstance,
        data.webhookSecret ?? null,
        now,
        now,
      ]
    );
    return (result as { insertId: number }).insertId;
  } finally {
    await conn.end();
  }
}

export async function updateInstanceStatus(
  instanceId: number,
  status: string,
  connected: boolean
): Promise<void> {
  const conn = await getConn();
  try {
    const now = Date.now();
    await conn.execute(
      `UPDATE whatsapp_instances
       SET connectionStatus = ?, lastCheckedAt = ?,
           lastConnectedAt = IF(?, ?, lastConnectedAt), updatedAt = ?
       WHERE id = ?`,
      [status, now, connected ? 1 : 0, now, now, instanceId]
    );
  } finally {
    await conn.end();
  }
}

// ─── Contact Management ───────────────────────────────────────────────────────

/**
 * Finds an existing contact or creates a new one.
 * Returns the contact id. Safe to call multiple times (upsert pattern).
 */
export async function upsertContact(
  conn: Connection,
  instanceId: number,
  phone: string,
  pushName: string | null
): Promise<number> {
  const now = Date.now();

  // Try to find existing
  const [existing] = await conn.execute(
    "SELECT id, pushName FROM whatsapp_contacts WHERE instanceId = ? AND phone = ? LIMIT 1",
    [instanceId, phone]
  );
  const row = (existing as { id: number; pushName: string | null }[])[0];

  if (row) {
    // Update pushName if we have a newer one
    if (pushName && pushName !== row.pushName) {
      await conn.execute(
        "UPDATE whatsapp_contacts SET pushName = ?, lastSeenAt = ?, updatedAt = ? WHERE id = ?",
        [pushName, now, now, row.id]
      );
    } else {
      await conn.execute(
        "UPDATE whatsapp_contacts SET lastSeenAt = ?, updatedAt = ? WHERE id = ?",
        [now, now, row.id]
      );
    }
    return row.id;
  }

  // Create new contact
  const [result] = await conn.execute(
    `INSERT INTO whatsapp_contacts
     (instanceId, phone, pushName, isBlocked, firstSeenAt, lastSeenAt, createdAt, updatedAt)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
    [instanceId, phone, pushName ?? null, now, now, now, now]
  );
  return (result as { insertId: number }).insertId;
}

// ─── Conversation Management ──────────────────────────────────────────────────

/**
 * Finds an existing conversation or creates a new one.
 * Returns { conversationId, isNew }.
 */
export async function upsertConversation(
  conn: Connection,
  instanceId: number,
  contactId: number,
  lastMessageBody: string,
  lastMessageAt: number,
  fromMe: boolean
): Promise<{ conversationId: number; isNew: boolean }> {
  const now = Date.now();

  const [existing] = await conn.execute(
    "SELECT id, unreadCount FROM whatsapp_conversations WHERE instanceId = ? AND contactId = ? LIMIT 1",
    [instanceId, contactId]
  );
  const row = (existing as { id: number; unreadCount: number }[])[0];

  if (row) {
    const newUnread = fromMe ? 0 : row.unreadCount + 1;
    await conn.execute(
      `UPDATE whatsapp_conversations
       SET lastMessageBody = ?, lastMessageAt = ?, lastMessageFromMe = ?,
           unreadCount = ?, updatedAt = ?
       WHERE id = ?`,
      [lastMessageBody, lastMessageAt, fromMe ? 1 : 0, newUnread, now, row.id]
    );
    return { conversationId: row.id, isNew: false };
  }

  // Create new conversation
  const [result] = await conn.execute(
    `INSERT INTO whatsapp_conversations
     (instanceId, contactId, status, priority, lastMessageBody, lastMessageAt,
      lastMessageFromMe, unreadCount, createdAt, updatedAt)
     VALUES (?, ?, 'open', 'normal', ?, ?, ?, ?, ?, ?)`,
    [
      instanceId, contactId,
      lastMessageBody, lastMessageAt,
      fromMe ? 1 : 0,
      fromMe ? 0 : 1,
      now, now,
    ]
  );
  return { conversationId: (result as { insertId: number }).insertId, isNew: true };
}

// ─── Message Storage ──────────────────────────────────────────────────────────

/**
 * Stores a message with duplicate protection.
 * Returns { messageId, isDuplicate }.
 */
export async function storeMessage(
  conn: Connection,
  data: {
    conversationId: number;
    instanceId: number;
    evolutionMsgId: string | null;
    fromMe: boolean;
    senderUserId?: number | null;
    messageType: string;
    body: string | null;
    mediaUrl: string | null;
    mediaMimeType: string | null;
    mediaFileSize: number | null;
    caption: string | null;
    latitude: number | null;
    longitude: number | null;
    isForwarded: boolean;
    timestamp: number;
  }
): Promise<{ messageId: number; isDuplicate: boolean }> {
  const now = Date.now();

  // Dedup check
  if (data.evolutionMsgId) {
    const [dupCheck] = await conn.execute(
      "SELECT id FROM whatsapp_messages WHERE instanceId = ? AND evolutionMsgId = ? LIMIT 1",
      [data.instanceId, data.evolutionMsgId]
    );
    if ((dupCheck as { id: number }[]).length > 0) {
      return { messageId: (dupCheck as { id: number }[])[0].id, isDuplicate: true };
    }
  }

  const [result] = await conn.execute(
    `INSERT INTO whatsapp_messages
     (conversationId, instanceId, evolutionMsgId, fromMe, senderUserId,
      messageType, body, mediaUrl, mediaMimeType, mediaFileSize, caption,
      latitude, longitude, isForwarded, isDeleted, status, timestamp, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [
      data.conversationId,
      data.instanceId,
      data.evolutionMsgId ?? null,
      data.fromMe ? 1 : 0,
      data.senderUserId ?? null,
      data.messageType,
      data.body ?? null,
      data.mediaUrl ?? null,
      data.mediaMimeType ?? null,
      data.mediaFileSize ?? null,
      data.caption ?? null,
      data.latitude ?? null,
      data.longitude ?? null,
      data.isForwarded ? 1 : 0,
      data.fromMe ? "sent" : "pending", // ENUM: pending|sent|delivered|read|failed (no 'received')
      data.timestamp,
      now,
    ]
  );
  return { messageId: (result as { insertId: number }).insertId, isDuplicate: false };
}

// ─── Status Log ───────────────────────────────────────────────────────────────

export async function logMessageStatus(
  conn: Connection,
  messageId: number,
  instanceId: number,
  evolutionMsgId: string,
  status: string,
  errorCode?: string,
  errorMessage?: string
): Promise<void> {
  const now = Date.now();
  await conn.execute(
    `INSERT INTO whatsapp_message_status_logs
     (messageId, instanceId, evolutionMsgId, status, errorCode, errorMessage, occurredAt, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [messageId, instanceId, evolutionMsgId, status, errorCode ?? null, errorMessage ?? null, now, now]
  );

  // Also update the message row with delivery timestamps
  if (status === "delivered") {
    await conn.execute(
      "UPDATE whatsapp_messages SET status = 'delivered', deliveredAt = ? WHERE id = ?",
      [now, messageId]
    );
  } else if (status === "read") {
    await conn.execute(
      "UPDATE whatsapp_messages SET status = 'read', readAt = ? WHERE id = ?",
      [now, messageId]
    );
  } else if (status === "failed") {
    await conn.execute(
      "UPDATE whatsapp_messages SET status = 'failed' WHERE id = ?",
      [messageId]
    );
  }
}

// ─── Webhook Raw Log ──────────────────────────────────────────────────────────

async function logWebhookRaw(
  conn: Connection,
  instanceId: number | null,
  eventType: string,
  rawPayload: unknown,
  status: "pending" | "processed" | "failed" | "skipped" | "duplicate"
): Promise<number> {
  const now = Date.now();
  const [result] = await conn.execute(
    `INSERT INTO whatsapp_webhook_logs
     (instanceId, eventType, rawPayload, processingStatus, processedAt, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [instanceId ?? null, eventType, JSON.stringify(rawPayload), status, now, now]
  );
  return (result as { insertId: number }).insertId;
}

async function updateWebhookLog(
  conn: Connection,
  logId: number,
  status: "processed" | "failed" | "skipped" | "duplicate",
  error?: string
): Promise<void> {
  await conn.execute(
    "UPDATE whatsapp_webhook_logs SET processingStatus = ?, processingError = ?, processedAt = ? WHERE id = ?",
    [status, error ?? null, Date.now(), logId]
  );
}

// ─── AI Analysis Trigger ──────────────────────────────────────────────────────

/**
 * Triggers AI analysis asynchronously after a new message is stored.
 * Non-blocking — errors are caught and logged but do not affect the webhook response.
 */
export function triggerAiAnalysis(
  conversationId: number,
  instanceId: number,
  contactId: number
): void {
  // Fire-and-forget: schedule analysis after a short delay to batch rapid messages
  setTimeout(async () => {
    try {
      const { runFullConversationAnalysis } = await import("./waAiAnalysis");
      await runFullConversationAnalysis(conversationId, instanceId, contactId, { includeReply: true, forceRerun: true });
    } catch (err) {
      console.error("[WA-AI] Analysis trigger failed:", err);
    }
  }, 5000); // 5-second delay to batch rapid incoming messages
}

// ─── Main Event Handlers ──────────────────────────────────────────────────────

/**
 * Handles messages.upsert — new incoming or outgoing message.
 * Full pipeline: contact → conversation → message → status log → AI trigger.
 */
export async function handleMessageUpsert(
  instance: WaInstance,
  payload: Record<string, unknown>
): Promise<WebhookProcessResult> {
  const conn = await getConn();
  let logId: number | null = null;

  try {
    // Extract message data (Evolution API v2 format)
    const data = (payload?.data ?? payload) as Record<string, unknown>;
    const key = (data?.key ?? {}) as Record<string, unknown>;
    const fromMe = key?.fromMe === true;
    const remoteJid = (key?.remoteJid ?? "") as string;
    const evolutionMsgId = (key?.id ?? null) as string | null;

    // Skip group messages
    if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid.endsWith("@broadcast")) {
      logId = await logWebhookRaw(conn, instance.id, "messages.upsert", payload, "skipped");
      return { success: true, logId, action: "skipped" };
    }

    const phone = remoteJid.replace("@s.whatsapp.net", "").replace(/[^0-9]/g, "");
    const pushName = (data?.pushName ?? null) as string | null;
    const timestamp = data?.messageTimestamp
      ? Number(data.messageTimestamp) * 1000
      : Date.now();

    const content = extractMessageContent(data);
    const displayBody = content.body ?? content.caption ?? `[${content.messageType}]`;

    // Log raw payload first
    logId = await logWebhookRaw(conn, instance.id, "messages.upsert", payload, "pending");

    // 1. Upsert contact
    const contactId = await upsertContact(conn, instance.id, phone, pushName);

    // 2. Upsert conversation
    const { conversationId, isNew } = await upsertConversation(
      conn, instance.id, contactId, displayBody, timestamp, fromMe
    );

    // 3. Store message (with dedup)
    const { messageId, isDuplicate } = await storeMessage(conn, {
      conversationId,
      instanceId: instance.id,
      evolutionMsgId,
      fromMe,
      messageType: content.messageType,
      body: content.body,
      mediaUrl: content.mediaUrl,
      mediaMimeType: content.mediaMimeType,
      mediaFileSize: content.mediaFileSize,
      caption: content.caption,
      latitude: content.latitude,
      longitude: content.longitude,
      isForwarded: content.isForwarded,
      timestamp,
    });

    if (isDuplicate) {
      await updateWebhookLog(conn, logId, "duplicate");
      return { success: true, logId, action: "duplicate", messageId, conversationId, contactId };
    }

    // 4. Update webhook log
    await updateWebhookLog(conn, logId, "processed");

    // 5. Trigger AI analysis (non-blocking, only for inbound messages)
    if (!fromMe) {
      triggerAiAnalysis(conversationId, instance.id, contactId);
    }

    // 6. Broadcast real-time event to SSE clients (non-blocking)
    try {
      broadcastNewMessage({ conversationId, messageId, instanceId: instance.id });
    } catch { /* ignore broadcast errors */ }

    return {
      success: true,
      logId,
      action: "message_stored",
      messageId,
      conversationId,
      contactId,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[WA-Integration] handleMessageUpsert error:", error);
    if (logId) {
      try { await updateWebhookLog(conn, logId, "failed", error); } catch {}
    }
    return { success: false, logId, action: "error", error };
  } finally {
    await conn.end();
  }
}

/**
 * Handles messages.update — delivery status changes (sent/delivered/read/failed).
 */
export async function handleMessageUpdate(
  instance: WaInstance,
  payload: Record<string, unknown>
): Promise<WebhookProcessResult> {
  const conn = await getConn();
  let logId: number | null = null;

  try {
    logId = await logWebhookRaw(conn, instance.id, "messages.update", payload, "pending");

    const updates = (payload?.data ?? []) as Array<Record<string, unknown>>;
    const updateList = Array.isArray(updates) ? updates : [updates];

    for (const update of updateList) {
      const key = (update?.key ?? {}) as Record<string, unknown>;
      const evolutionMsgId = (key?.id ?? null) as string | null;
      const statusRaw = (update?.update as Record<string, unknown>)?.status ?? update?.status;
      if (!evolutionMsgId || !statusRaw) continue;

      // Map Evolution API status codes to our enum
      const statusMap: Record<string, string> = {
        PENDING: "pending",
        SERVER_ACK: "sent",
        DELIVERY_ACK: "delivered",
        READ: "read",
        PLAYED: "read",
        ERROR: "failed",
        DELETED: "deleted",
        "1": "sent",
        "2": "delivered",
        "3": "read",
        "4": "failed",
      };
      const status = statusMap[String(statusRaw).toUpperCase()] ?? String(statusRaw).toLowerCase();

      // Find the message by evolutionMsgId
      const [msgRows] = await conn.execute(
        "SELECT id FROM whatsapp_messages WHERE instanceId = ? AND evolutionMsgId = ? LIMIT 1",
        [instance.id, evolutionMsgId]
      );
      const msg = (msgRows as { id: number }[])[0];
      if (!msg) continue;

      await logMessageStatus(conn, msg.id, instance.id, evolutionMsgId, status);
    }

    await updateWebhookLog(conn, logId, "processed");
    return { success: true, logId, action: "status_updated" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[WA-Integration] handleMessageUpdate error:", error);
    if (logId) {
      try { await updateWebhookLog(conn, logId, "failed", error); } catch {}
    }
    return { success: false, logId, action: "error", error };
  } finally {
    await conn.end();
  }
}

/**
 * Handles connection.update — WhatsApp connection state changes.
 */
export async function handleConnectionUpdate(
  instance: WaInstance,
  payload: Record<string, unknown>
): Promise<WebhookProcessResult> {
  const conn = await getConn();
  let logId: number | null = null;

  try {
    logId = await logWebhookRaw(conn, instance.id, "connection.update", payload, "pending");

    const data = (payload?.data ?? payload) as Record<string, unknown>;
    const state = (data?.state ?? data?.connection ?? "unknown") as string;

    // Map Evolution API connection states
    const stateMap: Record<string, string> = {
      open: "connected",
      close: "disconnected",
      connecting: "connecting",
      qr: "qr_pending",
    };
    const mappedStatus = stateMap[state.toLowerCase()] ?? "unknown";
    const isConnected = mappedStatus === "connected";

    await updateInstanceStatus(instance.id, mappedStatus, isConnected);
    await updateWebhookLog(conn, logId, "processed");

    return { success: true, logId, action: "connection_updated" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[WA-Integration] handleConnectionUpdate error:", error);
    if (logId) {
      try { await updateWebhookLog(conn, logId, "failed", error); } catch {}
    }
    return { success: false, logId, action: "error", error };
  } finally {
    await conn.end();
  }
}

/**
 * Main webhook dispatcher.
 * Routes events to the appropriate handler based on event type.
 */
export async function processWebhookEvent(
  instanceName: string,
  eventType: WebhookEventType,
  payload: Record<string, unknown>,
  rawBody: string,
  signature?: string
): Promise<WebhookProcessResult> {
  // 1. Identify instance
  const instance = await getInstanceByName(instanceName);
  if (!instance) {
    console.warn(`[WA-Webhook] Unknown instance: ${instanceName}`);
    return { success: false, logId: null, action: "error", error: `Unknown instance: ${instanceName}` };
  }

  if (!instance.isActive) {
    return { success: false, logId: null, action: "skipped", error: "Instance is inactive" };
  }

  // 2. Verify signature
  if (!verifyWebhookSignature(rawBody, signature, instance.webhookSecret)) {
    console.warn(`[WA-Webhook] Invalid signature for instance: ${instanceName}`);
    return { success: false, logId: null, action: "error", error: "Invalid webhook signature" };
  }

  // 3. Route to handler
  const normalizedEvent = eventType.toLowerCase();

  if (
    normalizedEvent === "messages.upsert" ||
    normalizedEvent === "message" ||
    normalizedEvent === "messages_upsert"
  ) {
    return handleMessageUpsert(instance, payload);
  }

  if (
    normalizedEvent === "messages.update" ||
    normalizedEvent === "messages_update" ||
    normalizedEvent === "message.update"
  ) {
    return handleMessageUpdate(instance, payload);
  }

  if (
    normalizedEvent === "connection.update" ||
    normalizedEvent === "connection_update" ||
    normalizedEvent === "qrcode.updated"
  ) {
    return handleConnectionUpdate(instance, payload);
  }

  // Unknown event — log and skip
  const conn = await getConn();
  try {
    await logWebhookRaw(conn, instance.id, eventType, payload, "skipped");
  } finally {
    await conn.end();
  }
  return { success: true, logId: null, action: "skipped" };
}
