/**
 * Webhook Handler for Evolution API
 * Receives incoming WhatsApp messages and stores them in DB
 * POST /api/wa-webhook/:numberId
 */
import type { Request, Response } from "express";
import mysql from "mysql2/promise";
import { getConn } from "./pool";
import { broadcastWaEvent } from "./waWebSocket";

function extractMessageBody(msg: any): {
  body: string | null;
  messageType: string;
  mediaUrl: string | null;
  caption: string | null;
} {
  const msgContent = msg.message ?? {};
  if (msgContent.conversation) {
    return { body: msgContent.conversation, messageType: "text", mediaUrl: null, caption: null };
  }
  if (msgContent.extendedTextMessage?.text) {
    return { body: msgContent.extendedTextMessage.text, messageType: "text", mediaUrl: null, caption: null };
  }
  if (msgContent.imageMessage) {
    return {
      body: null,
      messageType: "image",
      mediaUrl: msgContent.imageMessage.url ?? null,
      caption: msgContent.imageMessage.caption ?? null,
    };
  }
  if (msgContent.videoMessage) {
    return {
      body: null,
      messageType: "video",
      mediaUrl: msgContent.videoMessage.url ?? null,
      caption: msgContent.videoMessage.caption ?? null,
    };
  }
  if (msgContent.audioMessage || msgContent.pttMessage) {
    return {
      body: null,
      messageType: "audio",
      mediaUrl: (msgContent.audioMessage ?? msgContent.pttMessage)?.url ?? null,
      caption: null,
    };
  }
  if (msgContent.documentMessage) {
    return {
      body: msgContent.documentMessage.fileName ?? null,
      messageType: "document",
      mediaUrl: msgContent.documentMessage.url ?? null,
      caption: msgContent.documentMessage.caption ?? null,
    };
  }
  if (msgContent.stickerMessage) {
    return { body: null, messageType: "sticker", mediaUrl: msgContent.stickerMessage.url ?? null, caption: null };
  }
  return { body: null, messageType: "unknown", mediaUrl: null, caption: null };
}

export async function handleWaWebhook(req: Request, res: Response): Promise<void> {
  try {
    const numberId = parseInt(req.params.numberId);
    if (isNaN(numberId)) {
      res.status(400).json({ error: "Invalid numberId" });
      return;
    }

    const body = req.body;
    const event = body?.event ?? body?.type ?? "";

    // Only handle message events
    if (!["messages.upsert", "message", "MESSAGES_UPSERT"].includes(event)) {
      res.status(200).json({ ok: true });
      return;
    }

    // Extract message data (Evolution API v2 format)
    const rawMsg = body?.data ?? body?.message ?? body;
    const keyData = rawMsg?.key ?? {};
    const fromMe = keyData?.fromMe === true;
    const remoteJid: string = keyData?.remoteJid ?? "";
    const msgId: string = keyData?.id ?? "";

    if (!remoteJid || remoteJid.endsWith("@g.us")) {
      // Skip group messages for now
      res.status(200).json({ ok: true });
      return;
    }

    const contactPhone = remoteJid.replace("@s.whatsapp.net", "");
    const pushName: string = rawMsg?.pushName ?? "";
    const timestamp = rawMsg?.messageTimestamp
      ? Number(rawMsg.messageTimestamp) * 1000
      : Date.now();

    const { body: msgBody, messageType, mediaUrl, caption } = extractMessageBody(rawMsg);
    const displayText = msgBody ?? caption ?? `[${messageType}]`;

    const conn = await getConn();
    try {
      // Verify number exists
      const [numRows] = await conn.execute(
        "SELECT id FROM restaurant_wa_numbers WHERE id=? AND isActive=1 LIMIT 1",
        [numberId]
      );
      if ((numRows as any[]).length === 0) {
        res.status(404).json({ error: "Number not found" });
        return;
      }

      // Upsert conversation
      const now = Date.now();
      const [convRows] = await conn.execute(
        "SELECT id, unreadCount FROM wa_conversations WHERE numberId=? AND contactPhone=? LIMIT 1",
        [numberId, contactPhone]
      );
      const existing = (convRows as any[])[0];
      let conversationId: number;

      if (existing) {
        conversationId = existing.id;
        const newUnread = fromMe ? existing.unreadCount : existing.unreadCount + 1;
        await conn.execute(
          `UPDATE wa_conversations SET 
           contactPushName=COALESCE(NULLIF(?,\'\'),contactPushName),
           lastMessage=?, lastMessageAt=?, unreadCount=?, updatedAt=? WHERE id=?`,
          [pushName || null, displayText, timestamp, newUnread, now, conversationId]
        );
      } else {
        const [insertResult] = await conn.execute(
          `INSERT INTO wa_conversations 
           (numberId, contactPhone, contactName, contactPushName, lastMessage, lastMessageAt, unreadCount, updatedAt)
           VALUES (?,?,?,?,?,?,?,?)`,
          [numberId, contactPhone, pushName || null, pushName || null, displayText, timestamp, fromMe ? 0 : 1, now]
        );
        conversationId = (insertResult as any).insertId;
      }

      // Deduplicate + insert message
      let messageId: number | null = null;
      if (msgId) {
        const [dupCheck] = await conn.execute(
          "SELECT id FROM wa_messages WHERE evolutionMsgId=? LIMIT 1",
          [msgId]
        );
        if ((dupCheck as any[]).length > 0) {
          res.status(200).json({ ok: true, duplicate: true });
          return;
        }
      }

      const [msgResult] = await conn.execute(
        `INSERT INTO wa_messages 
         (conversationId, numberId, fromMe, evolutionMsgId, messageType, body, mediaUrl, caption, timestamp, status, createdAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          conversationId,
          numberId,
          fromMe ? 1 : 0,
          msgId || null,
          messageType,
          msgBody ?? null,
          mediaUrl ?? null,
          caption ?? null,
          timestamp,
          fromMe ? "sent" : "received",
          now,
        ]
      );
      messageId = (msgResult as any).insertId;

      // Broadcast via WebSocket
      const messagePayload = {
        id: messageId,
        conversationId,
        numberId,
        fromMe: fromMe ? 1 : 0,
        evolutionMsgId: msgId || null,
        messageType,
        body: msgBody ?? null,
        mediaUrl: mediaUrl ?? null,
        caption: caption ?? null,
        timestamp,
        status: fromMe ? "sent" : "received",
        createdAt: now,
      };

      broadcastWaEvent({
        type: existing ? "new_message" : "new_conversation",
        numberId,
        conversationId,
        data: {
          message: messagePayload,
          conversation: {
            id: conversationId,
            numberId,
            contactPhone,
            contactPushName: pushName || null,
            lastMessage: displayText,
            lastMessageAt: timestamp,
          },
        },
      });

      res.status(200).json({ ok: true });

      // Trigger AI analysis after inbound message (non-blocking, 5s delay to batch rapid messages)
      if (!fromMe && messageId && (msgBody || caption)) {
        setTimeout(async () => {
          try {
            const { runFullConversationAnalysis } = await import("./waAiAnalysis");
            await runFullConversationAnalysis(conversationId, numberId, 0, {
              includeReply: true,
              forceRerun: true,
            });
            console.log(`[WA-AI] Auto-analysis done for conv=${conversationId}`);
          } catch (aiErr) {
            console.error("[WA-AI] Auto-analysis failed:", aiErr);
          }
        }, 5000);
      }
    } finally {
      await conn.release();
    }
  } catch (err) {
    console.error("[WA-Webhook] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
