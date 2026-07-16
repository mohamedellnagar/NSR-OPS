/**
 * WhatsApp Numbers Management - DB Helpers & Evolution API Integration
 * Manages restaurant WhatsApp numbers connected via Evolution API
 */
import mysql from "mysql2/promise";

import { getConn } from "./pool";
export interface WaNumber {
  id: number;
  label: string;
  phoneNumber: string;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  evolutionInstance: string;
  webhookSecret: string | null;
  isActive: number;
  connectionStatus: string;
  lastCheckedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface WaConversation {
  id: number;
  numberId: number;
  contactPhone: string;
  contactName: string | null;
  contactPushName: string | null;
  lastMessage: string | null;
  lastMessageAt: number | null;
  unreadCount: number;
  updatedAt: number;
}

export interface WaMessage {
  id: number;
  conversationId: number;
  numberId: number;
  fromMe: number;
  evolutionMsgId: string | null;
  messageType: string;
  body: string | null;
  mediaUrl: string | null;
  caption: string | null;
  timestamp: number;
  status: string;
  createdAt: number;
}

// ─── Numbers CRUD ─────────────────────────────────────────────────────────────

export async function listWaNumbers(): Promise<WaNumber[]> {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      "SELECT * FROM restaurant_wa_numbers ORDER BY createdAt ASC"
    );
    return rows as WaNumber[];
  } finally {
    await conn.end();
  }
}

export async function getWaNumber(id: number): Promise<WaNumber | null> {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      "SELECT * FROM restaurant_wa_numbers WHERE id = ? LIMIT 1",
      [id]
    );
    return (rows as WaNumber[])[0] ?? null;
  } finally {
    await conn.end();
  }
}

export async function createWaNumber(data: {
  label: string;
  phoneNumber: string;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  evolutionInstance: string;
  webhookSecret?: string;
}): Promise<number> {
  const conn = await getConn();
  try {
    const now = Date.now();
    const [result] = await conn.execute(
      `INSERT INTO restaurant_wa_numbers 
       (label, phoneNumber, evolutionApiUrl, evolutionApiKey, evolutionInstance, webhookSecret, isActive, connectionStatus, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'unknown', ?, ?)`,
      [
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
    return (result as any).insertId;
  } finally {
    await conn.end();
  }
}

export async function updateWaNumber(
  id: number,
  data: {
    label?: string;
    phoneNumber?: string;
    evolutionApiUrl?: string;
    evolutionApiKey?: string;
    evolutionInstance?: string;
    webhookSecret?: string | null;
    isActive?: number;
  }
): Promise<void> {
  const conn = await getConn();
  try {
    const fields: string[] = [];
    const values: any[] = [];
    if (data.label !== undefined) { fields.push("label=?"); values.push(data.label); }
    if (data.phoneNumber !== undefined) { fields.push("phoneNumber=?"); values.push(data.phoneNumber); }
    if (data.evolutionApiUrl !== undefined) { fields.push("evolutionApiUrl=?"); values.push(data.evolutionApiUrl.replace(/\/$/, "")); }
    if (data.evolutionApiKey !== undefined) { fields.push("evolutionApiKey=?"); values.push(data.evolutionApiKey); }
    if (data.evolutionInstance !== undefined) { fields.push("evolutionInstance=?"); values.push(data.evolutionInstance); }
    if (data.webhookSecret !== undefined) { fields.push("webhookSecret=?"); values.push(data.webhookSecret); }
    if (data.isActive !== undefined) { fields.push("isActive=?"); values.push(data.isActive); }
    fields.push("updatedAt=?");
    values.push(Date.now());
    values.push(id);
    await conn.execute(`UPDATE restaurant_wa_numbers SET ${fields.join(",")} WHERE id=?`, values);
  } finally {
    await conn.end();
  }
}

export async function deleteWaNumber(id: number): Promise<void> {
  const conn = await getConn();
  try {
    await conn.execute("DELETE FROM restaurant_wa_numbers WHERE id=?", [id]);
  } finally {
    await conn.end();
  }
}

export async function updateWaNumberStatus(
  id: number,
  status: string
): Promise<void> {
  const conn = await getConn();
  try {
    await conn.execute(
      "UPDATE restaurant_wa_numbers SET connectionStatus=?, lastCheckedAt=?, updatedAt=? WHERE id=?",
      [status, Date.now(), Date.now(), id]
    );
  } finally {
    await conn.end();
  }
}

// ─── Evolution API Integration ────────────────────────────────────────────────

export async function testEvolutionConnection(num: WaNumber): Promise<{
  success: boolean;
  status: string;
  error?: string;
}> {
  try {
    const url = `${num.evolutionApiUrl}/instance/connectionState/${num.evolutionInstance}`;
    const res = await fetch(url, {
      headers: { apikey: num.evolutionApiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { success: false, status: "disconnected", error: `HTTP ${res.status}` };
    }
    const data = await res.json() as any;
    const state = data?.instance?.state ?? data?.state ?? "unknown";
    // Normalize Evolution API states to our internal status values
    let status: string;
    if (state === "open") status = "connected";
    else if (state === "close" || state === "closed") status = "disconnected";
    else if (state === "connecting") status = "connecting";
    else if (state === "qr") status = "qr_pending";
    else status = "disconnected"; // treat unknown as disconnected
    return { success: status === "connected", status };
  } catch (err: any) {
    return { success: false, status: "disconnected", error: err.message };
  }
}

export async function fetchEvolutionChats(num: WaNumber): Promise<any[]> {
  try {
    const url = `${num.evolutionApiUrl}/chat/findChats/${num.evolutionInstance}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { apikey: num.evolutionApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json() as any;
    if (!Array.isArray(data)) return [];
    
    // Normalize @lid chats: extract real phone from remoteJidAlt
    return data.map((chat: any) => {
      const remoteJid: string = chat.remoteJid ?? '';
      if (remoteJid.endsWith('@lid')) {
        // Get real phone number from lastMessage.key.remoteJidAlt
        const altJid: string = chat.lastMessage?.key?.remoteJidAlt ?? '';
        if (altJid && altJid.includes('@s.whatsapp.net')) {
          return { ...chat, remoteJid: altJid, _originalLid: remoteJid };
        }
        // If no alt, skip by marking as group (will be filtered)
        return { ...chat, remoteJid: remoteJid.replace('@lid', '@g.us') };
      }
      return chat;
    });
  } catch {
    return [];
  }
}

export async function fetchEvolutionMessages(
  num: WaNumber,
  remoteJid: string,
  limit = 50
): Promise<any[]> {
  try {
    const url = `${num.evolutionApiUrl}/chat/findMessages/${num.evolutionInstance}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { apikey: num.evolutionApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ where: { key: { remoteJid } }, limit }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json() as any;
    const msgs = data?.messages?.records ?? data?.records ?? data ?? [];
    return Array.isArray(msgs) ? msgs : [];
  } catch {
    return [];
  }
}

// ─── Conversations & Messages DB ──────────────────────────────────────────────

export async function upsertConversation(data: {
  numberId: number;
  contactPhone: string;
  contactName?: string | null;
  contactPushName?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: number | null;
  incrementUnread?: boolean;
}): Promise<number> {
  const conn = await getConn();
  try {
    const now = Date.now();
    // Try insert
    const [existing] = await conn.execute(
      "SELECT id, unreadCount FROM wa_conversations WHERE numberId=? AND contactPhone=? LIMIT 1",
      [data.numberId, data.contactPhone]
    );
    const rows = existing as any[];
    if (rows.length > 0) {
      const newUnread = data.incrementUnread ? rows[0].unreadCount + 1 : rows[0].unreadCount;
      await conn.execute(
        `UPDATE wa_conversations SET 
         contactName=COALESCE(?,contactName), contactPushName=COALESCE(?,contactPushName),
         lastMessage=COALESCE(?,lastMessage), lastMessageAt=COALESCE(?,lastMessageAt),
         unreadCount=?, updatedAt=? WHERE id=?`,
        [
          data.contactName ?? null,
          data.contactPushName ?? null,
          data.lastMessage ?? null,
          data.lastMessageAt ?? null,
          newUnread,
          now,
          rows[0].id,
        ]
      );
      return rows[0].id;
    } else {
      const [result] = await conn.execute(
        `INSERT INTO wa_conversations 
         (numberId, contactPhone, contactName, contactPushName, lastMessage, lastMessageAt, unreadCount, updatedAt)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          data.numberId,
          data.contactPhone,
          data.contactName ?? null,
          data.contactPushName ?? null,
          data.lastMessage ?? null,
          data.lastMessageAt ?? null,
          data.incrementUnread ? 1 : 0,
          now,
        ]
      );
      return (result as any).insertId;
    }
  } finally {
    await conn.end();
  }
}

export async function insertWaMessage(data: {
  conversationId: number;
  numberId: number;
  fromMe: boolean;
  evolutionMsgId?: string | null;
  messageType: string;
  body?: string | null;
  mediaUrl?: string | null;
  caption?: string | null;
  timestamp: number;
  status?: string;
}): Promise<number> {
  const conn = await getConn();
  try {
    // Deduplicate by evolutionMsgId
    if (data.evolutionMsgId) {
      const [existing] = await conn.execute(
        "SELECT id FROM wa_messages WHERE evolutionMsgId=? LIMIT 1",
        [data.evolutionMsgId]
      );
      if ((existing as any[]).length > 0) return (existing as any[])[0].id;
    }
    const now = Date.now();
    const [result] = await conn.execute(
      `INSERT INTO wa_messages 
       (conversationId, numberId, fromMe, evolutionMsgId, messageType, body, mediaUrl, caption, timestamp, status, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        data.conversationId,
        data.numberId,
        data.fromMe ? 1 : 0,
        data.evolutionMsgId ?? null,
        data.messageType,
        data.body ?? null,
        data.mediaUrl ?? null,
        data.caption ?? null,
        data.timestamp,
        data.status ?? "received",
        now,
      ]
    );
    return (result as any).insertId;
  } finally {
    await conn.end();
  }
}

export async function batchUpsertConversations(items: Array<{
  numberId: number;
  contactPhone: string;
  contactName?: string | null;
  contactPushName?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: number | null;
}>): Promise<number> {
  if (items.length === 0) return 0;
  const conn = await getConn();
  try {
    const now = Date.now();
    // Build batch INSERT ... ON DUPLICATE KEY UPDATE
    const placeholders = items.map(() => '(?,?,?,?,?,?,?,?)').join(',');
    const values: any[] = [];
    for (const item of items) {
      values.push(
        item.numberId,
        item.contactPhone,
        item.contactName ?? null,
        item.contactPushName ?? null,
        item.lastMessage ?? null,
        item.lastMessageAt ?? null,
        0, // unreadCount default
        now
      );
    }
    await conn.execute(
      `INSERT INTO wa_conversations 
       (numberId, contactPhone, contactName, contactPushName, lastMessage, lastMessageAt, unreadCount, updatedAt)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         contactName = COALESCE(VALUES(contactName), contactName),
         contactPushName = COALESCE(VALUES(contactPushName), contactPushName),
         lastMessage = COALESCE(VALUES(lastMessage), lastMessage),
         lastMessageAt = COALESCE(VALUES(lastMessageAt), lastMessageAt),
         updatedAt = VALUES(updatedAt)`,
      values
    );
    return items.length;
  } finally {
    await conn.end();
  }
}

export async function listConversations(numberId: number): Promise<WaConversation[]> {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      "SELECT * FROM wa_conversations WHERE numberId=? ORDER BY lastMessageAt DESC, updatedAt DESC",
      [numberId]
    );
    return rows as WaConversation[];
  } finally {
    await conn.end();
  }
}

export async function listMessages(
  conversationId: number,
  limit = 100
): Promise<WaMessage[]> {
  const safeLimit = Math.max(1, Math.min(Math.floor(Number(limit) || 100), 1000));
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      `SELECT * FROM wa_messages WHERE conversationId=? ORDER BY timestamp ASC LIMIT ${safeLimit}`,
      [conversationId]
    );
    return rows as WaMessage[];
  } finally {
    await conn.end();
  }
}

export async function markConversationRead(conversationId: number): Promise<void> {
  const conn = await getConn();
  try {
    await conn.execute(
      "UPDATE wa_conversations SET unreadCount=0, updatedAt=? WHERE id=?",
      [Date.now(), conversationId]
    );
  } finally {
    await conn.end();
  }
}

export async function getConversationByPhone(
  numberId: number,
  contactPhone: string
): Promise<WaConversation | null> {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      "SELECT * FROM wa_conversations WHERE numberId=? AND contactPhone=? LIMIT 1",
      [numberId, contactPhone]
    );
    return (rows as WaConversation[])[0] ?? null;
  } finally {
    await conn.end();
  }
}

// ─── Webhook Registration ─────────────────────────────────────────────────────

/**
 * Registers the webhook URL in Evolution API for this instance.
 * Evolution API endpoint: PUT /webhook/set/{instance}
 * This is called automatically after connection is confirmed.
 */
export async function registerEvolutionWebhook(
  num: WaNumber,
  webhookUrl: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `${num.evolutionApiUrl}/webhook/set/${num.evolutionInstance}`;
    const body = {
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: [
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "CONNECTION_UPDATE",
          "QRCODE_UPDATED",
          "SEND_MESSAGE",
        ],
      },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: num.evolutionApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${errText}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

// ─── Full Sync: All Chats + Messages + AI Analysis ────────────────────────────

export interface SyncProgress {
  totalChats: number;
  syncedChats: number;
  totalMessages: number;
  analyzedConversations: number;
  errors: string[];
}

/**
 * Full sync: fetches all chats from Evolution API, then for each chat
 * fetches the last N messages, stores them in DB, and triggers AI analysis.
 * Designed to run in the background — does not throw, returns progress.
 */
export async function syncAllChatsWithMessages(
  num: WaNumber,
  options: {
    messagesPerChat?: number;
    analyzeAi?: boolean;
    onProgress?: (p: SyncProgress) => void;
  } = {}
): Promise<SyncProgress> {
  const {
    messagesPerChat = 50,
    analyzeAi = true,
  } = options;

  const progress: SyncProgress = {
    totalChats: 0,
    syncedChats: 0,
    totalMessages: 0,
    analyzedConversations: 0,
    errors: [],
  };

  try {
    // 1. Fetch all chats
    const chats = await fetchEvolutionChats(num);
    const individualChats = chats.filter((c: any) => {
      const jid: string = c.remoteJid ?? c.id ?? "";
      return jid && !jid.endsWith("@g.us") && !jid.endsWith("@broadcast");
    });
    progress.totalChats = individualChats.length;
    console.log(`[WA-Sync] Starting full sync for ${num.evolutionInstance}: ${individualChats.length} chats`);

    // 2. Process each chat
    for (const chat of individualChats.slice(0, 500)) {
      try {
        const remoteJid: string = chat.remoteJid ?? chat.id ?? "";
        const contactPhone = remoteJid.replace("@s.whatsapp.net", "");
        const pushName = chat.pushName ?? chat.name ?? null;
        const lm = chat.lastMessage;
        const lastMsg =
          lm?.message?.conversation ??
          lm?.message?.extendedTextMessage?.text ??
          lm?.message?.imageMessage?.caption ??
          null;
        const rawTs = lm?.messageTimestamp ?? null;
        const lastTs = rawTs ? Number(rawTs) * 1000 : null;

        // 3. Upsert conversation
        const convId = await upsertConversation({
          numberId: num.id,
          contactPhone,
          contactName: pushName,
          contactPushName: pushName,
          lastMessage: lastMsg,
          lastMessageAt: lastTs,
        });
        progress.syncedChats++;

        // 4. Fetch messages for this chat
        const msgs = await fetchEvolutionMessages(num, remoteJid, messagesPerChat);
        let savedMsgs = 0;
        for (const rawMsg of msgs) {
          try {
            const keyData = rawMsg?.key ?? {};
            const fromMe = keyData?.fromMe === true;
            const msgId = keyData?.id ?? null;
            const ts = rawMsg?.messageTimestamp
              ? Number(rawMsg.messageTimestamp) * 1000
              : Date.now();
            const msgContent = rawMsg?.message ?? {};
            let body: string | null = null;
            let messageType = "text";
            if (msgContent.conversation) body = msgContent.conversation;
            else if (msgContent.extendedTextMessage?.text) body = msgContent.extendedTextMessage.text;
            else if (msgContent.imageMessage) {
              messageType = "image";
              body = msgContent.imageMessage.caption ?? null;
            } else if (msgContent.audioMessage || msgContent.pttMessage) messageType = "audio";
            else if (msgContent.videoMessage) messageType = "video";
            else if (msgContent.documentMessage) {
              messageType = "document";
              body = msgContent.documentMessage.fileName ?? null;
            }
            await insertWaMessage({
              conversationId: convId,
              numberId: num.id,
              fromMe,
              evolutionMsgId: msgId,
              messageType,
              body,
              timestamp: ts,
              status: fromMe ? "sent" : "pending",
            });
            savedMsgs++;
          } catch {
            // skip individual message errors
          }
        }
        progress.totalMessages += savedMsgs;

        // 5. Trigger AI analysis for this conversation (background, non-blocking)
        if (analyzeAi && savedMsgs > 0) {
          try {
            const { runFullConversationAnalysis } = await import("./waAiAnalysis");
            // Get or create instance record for AI analysis
            const conn = await getConn();
            try {
              // Ensure whatsapp_instances has this number (for FK)
              await conn.execute(
                `INSERT INTO whatsapp_instances
                 (evolutionInstance, evolutionApiUrl, evolutionApiKey, webhookSecret, isActive, connectionStatus, createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, 1, 'connected', ?, ?)
                 ON DUPLICATE KEY UPDATE
                   evolutionApiUrl = VALUES(evolutionApiUrl),
                   evolutionApiKey = VALUES(evolutionApiKey),
                   connectionStatus = 'connected',
                   updatedAt = VALUES(updatedAt)`,
                [
                  num.evolutionInstance,
                  num.evolutionApiUrl,
                  num.evolutionApiKey,
                  num.webhookSecret ?? null,
                  Date.now(),
                  Date.now(),
                ]
              );
              const [instRows] = await conn.execute(
                "SELECT id FROM whatsapp_instances WHERE evolutionInstance = ? LIMIT 1",
                [num.evolutionInstance]
              ) as any[];
              const instanceId = (instRows as any[])[0]?.id;
              if (instanceId) {
                // Get or create contact
                await conn.execute(
                  `INSERT INTO whatsapp_contacts (instanceId, phoneNumber, pushName, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, ?)
                   ON DUPLICATE KEY UPDATE pushName = COALESCE(VALUES(pushName), pushName), updatedAt = VALUES(updatedAt)`,
                  [instanceId, contactPhone, pushName, Date.now(), Date.now()]
                );
                const [contactRows] = await conn.execute(
                  "SELECT id FROM whatsapp_contacts WHERE instanceId = ? AND phoneNumber = ? LIMIT 1",
                  [instanceId, contactPhone]
                ) as any[];
                const contactId = (contactRows as any[])[0]?.id;
                if (contactId) {
                  await runFullConversationAnalysis(convId, instanceId, contactId, {
                    includeReply: true,
                    forceRerun: false, // don't re-analyze if already done recently
                  });
                  progress.analyzedConversations++;
                }
              }
            } finally {
              await conn.end();
            }
          } catch (aiErr: any) {
            // AI errors are non-fatal
            progress.errors.push(`AI error for ${contactPhone}: ${aiErr?.message ?? "unknown"}`);
          }
        }
      } catch (chatErr: any) {
        progress.errors.push(`Chat error: ${chatErr?.message ?? "unknown"}`);
      }
    }

    console.log(
      `[WA-Sync] Completed for ${num.evolutionInstance}: ${progress.syncedChats} chats, ${progress.totalMessages} messages, ${progress.analyzedConversations} analyzed`
    );
  } catch (err: any) {
    progress.errors.push(`Fatal sync error: ${err?.message ?? "unknown"}`);
    console.error(`[WA-Sync] Fatal error for ${num.evolutionInstance}:`, err);
  }

  return progress;
}
