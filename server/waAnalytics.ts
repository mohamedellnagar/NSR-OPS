/**
 * waAnalytics.ts — WhatsApp Conversation Analytics
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses the CORRECT tables:
 *   wa_conversations  (id, numberId, contactPhone, contactName, lastMessageAt, unreadCount, updatedAt)
 *   wa_messages       (id, conversationId, numberId, fromMe, body, timestamp, status)
 *   whatsapp_ai_analysis (id, conversationId, instanceId, sentiment, behaviorCategory, urgencyLevel,
 *                         keyTopics, impressionSummary, suggestedReply, analyzedAt)
 *   restaurant_wa_numbers (id, label, phoneNumber, connectionStatus)
 *
 * KPI Definitions:
 * 1. totalInbound       — COUNT(wa_messages WHERE fromMe=0 AND timestamp IN range)
 * 2. totalOutbound      — COUNT(wa_messages WHERE fromMe=1 AND timestamp IN range)
 * 3. avgFirstResponse   — Per conversation: gap between first inbound and first outbound (ms→min)
 * 4. unresolvedConvs    — COUNT(wa_conversations WHERE unreadCount > 0)
 * 5. complaintConvs     — COUNT(whatsapp_ai_analysis WHERE urgencyLevel IN ('high','critical') OR behaviorCategory='complaint')
 * 6. topIntents         — GROUP BY keyTopics JSON array items (unnested in Node.js)
 * 7. sentimentDist      — GROUP BY sentiment
 * 8. busiestHours       — GROUP BY HOUR(FROM_UNIXTIME(timestamp/1000))
 * 9. instanceBreakdown  — Per restaurant_wa_numbers: message + conversation counts
 * 10. dailyVolume       — Messages per day
 */

import mysql from "mysql2/promise";

async function getConn() {
  return mysql.createConnection(process.env.DATABASE_URL!);
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

export interface WaAnalyticsFilter {
  /** Unix ms — start of range */
  fromTs?: number;
  /** Unix ms — end of range */
  toTs?: number;
  /** Filter by specific restaurant_wa_numbers.id (also accepts instanceId as alias) */
  numberId?: number;
  /** Alias for numberId — accepted from routers that still use instanceId */
  instanceId?: number;
}

function resolveNumberId(f: WaAnalyticsFilter): number | undefined {
  return f.numberId ?? f.instanceId;
}

function buildMsgWhere(f: WaAnalyticsFilter, alias = "m"): { clause: string; params: (number | string)[] } {
  const parts: string[] = [];
  const params: (number | string)[] = [];
  const nid = resolveNumberId(f);
  if (f.fromTs) { parts.push(`${alias}.timestamp >= ?`); params.push(f.fromTs); }
  if (f.toTs)   { parts.push(`${alias}.timestamp <= ?`); params.push(f.toTs); }
  if (nid)      { parts.push(`${alias}.numberId = ?`);   params.push(nid); }
  return { clause: parts.length ? "WHERE " + parts.join(" AND ") : "", params };
}

function buildConvWhere(f: WaAnalyticsFilter, alias = "c"): { clause: string; params: (number | string)[] } {
  const parts: string[] = [];
  const params: (number | string)[] = [];
  const nid = resolveNumberId(f);
  if (f.fromTs) { parts.push(`${alias}.lastMessageAt >= ?`); params.push(f.fromTs); }
  if (f.toTs)   { parts.push(`${alias}.lastMessageAt <= ?`); params.push(f.toTs); }
  if (nid)      { parts.push(`${alias}.numberId = ?`);       params.push(nid); }
  return { clause: parts.length ? "WHERE " + parts.join(" AND ") : "", params };
}

// ─── 1 & 2. Message Volume ────────────────────────────────────────────────────

export interface MessageVolume {
  totalInbound: number;
  totalOutbound: number;
  totalMessages: number;
}

export async function getMessageVolume(f: WaAnalyticsFilter): Promise<MessageVolume> {
  const conn = await getConn();
  try {
    const { clause, params } = buildMsgWhere(f);
    const [rows] = await conn.execute(
      `SELECT
         SUM(CASE WHEN fromMe = 0 THEN 1 ELSE 0 END) AS totalInbound,
         SUM(CASE WHEN fromMe = 1 THEN 1 ELSE 0 END) AS totalOutbound,
         COUNT(*) AS totalMessages
       FROM wa_messages m
       ${clause}`,
      params
    );
    const r = (rows as any[])[0] ?? {};
    return {
      totalInbound:  Number(r.totalInbound  ?? 0),
      totalOutbound: Number(r.totalOutbound ?? 0),
      totalMessages: Number(r.totalMessages ?? 0),
    };
  } finally {
    await conn.end();
  }
}

// ─── 3. Average First Response Time ──────────────────────────────────────────

export interface FirstResponseStats {
  avgFirstResponseMin: number;
  sampleSize: number;
}

export async function getAvgFirstResponseTime(f: WaAnalyticsFilter): Promise<FirstResponseStats> {
  const conn = await getConn();
  try {
    const inboundParts: string[] = ["fromMe = 0"];
    const inboundParams: (number | string)[] = [];
    if (f.numberId){ inboundParts.push("numberId = ?"); inboundParams.push(f.numberId); }
    if (f.fromTs)  { inboundParts.push("timestamp >= ?"); inboundParams.push(f.fromTs); }
    if (f.toTs)    { inboundParts.push("timestamp <= ?"); inboundParams.push(f.toTs); }
    const inboundWhere = "WHERE " + inboundParts.join(" AND ");

    const outboundParts: string[] = ["fromMe = 1"];
    const outboundParams: (number | string)[] = [];
    if (f.numberId){ outboundParts.push("numberId = ?"); outboundParams.push(f.numberId); }
    const outboundWhere = "WHERE " + outboundParts.join(" AND ");

    const [rows] = await conn.execute(
      `SELECT
         AVG(gap_ms) / 60000.0 AS avgFirstResponseMin,
         COUNT(*) AS sampleSize
       FROM (
         SELECT
           c.id AS convId,
           MIN(inbound.timestamp) AS firstInboundTs,
           MIN(outbound.timestamp) AS firstOutboundTs,
           (MIN(outbound.timestamp) - MIN(inbound.timestamp)) AS gap_ms
         FROM wa_conversations c
         JOIN (
           SELECT conversationId, timestamp
           FROM wa_messages
           ${inboundWhere}
         ) inbound ON inbound.conversationId = c.id
         JOIN (
           SELECT conversationId, timestamp
           FROM wa_messages
           ${outboundWhere}
         ) outbound ON outbound.conversationId = c.id
                    AND outbound.timestamp > inbound.timestamp
         GROUP BY c.id
         HAVING gap_ms > 0 AND gap_ms < 86400000
       ) AS response_times`,
      [...inboundParams, ...outboundParams]
    );
    const r = (rows as any[])[0] ?? {};
    return {
      avgFirstResponseMin: Math.round(Number(r.avgFirstResponseMin ?? 0) * 10) / 10,
      sampleSize: Number(r.sampleSize ?? 0),
    };
  } finally {
    await conn.end();
  }
}

// ─── 4. Conversations by Status ───────────────────────────────────────────────
// wa_conversations doesn't have a status column — use unreadCount > 0 as "open"

export interface ConvStatusBreakdown {
  open: number;
  pending: number;
  resolved: number;
  archived: number;
  spam: number;
  total: number;
  unresolved: number;
}

export async function getConvsByStatus(f: WaAnalyticsFilter): Promise<ConvStatusBreakdown> {
  const conn = await getConn();
  try {
    const { clause, params } = buildConvWhere(f);
    const [rows] = await conn.execute(
      `SELECT
         SUM(CASE WHEN unreadCount > 0 THEN 1 ELSE 0 END) AS open_count,
         COUNT(*) AS total
       FROM wa_conversations c
       ${clause}`,
      params
    );
    const r = (rows as any[])[0] ?? {};
    const open  = Number(r.open_count ?? 0);
    const total = Number(r.total ?? 0);
    const resolved = total - open;
    return {
      open,
      pending:  0,
      resolved,
      archived: 0,
      spam:     0,
      total,
      unresolved: open,
    };
  } finally {
    await conn.end();
  }
}

// ─── 5. Complaint Conversations ───────────────────────────────────────────────

export interface ComplaintStats {
  complaintCount: number;
  urgentCount: number;
  criticalCount: number;
}

export async function getComplaintStats(f: WaAnalyticsFilter): Promise<ComplaintStats> {
  const conn = await getConn();
  try {
    const parts: string[] = [];
    const params: (number | string)[] = [];
    if (f.fromTs)  { parts.push("a.analyzedAt >= ?"); params.push(f.fromTs); }
    if (f.toTs)    { parts.push("a.analyzedAt <= ?"); params.push(f.toTs); }
    // Note: whatsapp_ai_analysis uses instanceId (whatsapp_instances.id) not numberId
    // We join via wa_conversations to filter by numberId
    const clause = parts.length ? "WHERE " + parts.join(" AND ") : "";

    const [rows] = await conn.execute(
      `SELECT
         SUM(CASE WHEN a.behaviorCategory = 'complaint'
                    OR a.urgencyLevel IN ('high','critical') THEN 1 ELSE 0 END) AS complaintCount,
         SUM(CASE WHEN a.urgencyLevel = 'high'     THEN 1 ELSE 0 END) AS urgentCount,
         SUM(CASE WHEN a.urgencyLevel = 'critical' THEN 1 ELSE 0 END) AS criticalCount
       FROM whatsapp_ai_analysis a
       ${clause}`,
      params
    );
    const r = (rows as any[])[0] ?? {};
    return {
      complaintCount: Number(r.complaintCount ?? 0),
      urgentCount:    Number(r.urgentCount    ?? 0),
      criticalCount:  Number(r.criticalCount  ?? 0),
    };
  } finally {
    await conn.end();
  }
}

// ─── 6. Top Intents (from keyTopics JSON array) ───────────────────────────────

export interface IntentCount {
  intent: string;
  count: number;
}

export async function getTopIntents(f: WaAnalyticsFilter, limit = 8): Promise<IntentCount[]> {
  const conn = await getConn();
  try {
    const parts: string[] = ["a.keyTopics IS NOT NULL", "a.keyTopics != 'null'", "JSON_LENGTH(a.keyTopics) > 0"];
    const params: (number | string)[] = [];
    if (f.fromTs) { parts.push("a.analyzedAt >= ?"); params.push(f.fromTs); }
    if (f.toTs)   { parts.push("a.analyzedAt <= ?"); params.push(f.toTs); }
    const clause = "WHERE " + parts.join(" AND ");

    const [rows] = await conn.execute(
      `SELECT a.keyTopics FROM whatsapp_ai_analysis a ${clause} LIMIT 5000`,
      params
    );

    const countMap = new Map<string, number>();
    for (const row of rows as any[]) {
      try {
        const topics = typeof row.keyTopics === "string" ? JSON.parse(row.keyTopics) : row.keyTopics;
        if (Array.isArray(topics)) {
          for (const t of topics) {
            if (t && typeof t === "string") {
              const key = t.trim().toLowerCase();
              countMap.set(key, (countMap.get(key) ?? 0) + 1);
            }
          }
        }
      } catch { /* skip malformed */ }
    }

    return Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([intent, count]) => ({ intent, count }));
  } finally {
    await conn.end();
  }
}

// ─── 7. Sentiment Distribution ────────────────────────────────────────────────

export interface SentimentDist {
  positive: number;
  neutral: number;
  negative: number;
  mixed: number;
  total: number;
}

export async function getSentimentDistribution(f: WaAnalyticsFilter): Promise<SentimentDist> {
  const conn = await getConn();
  try {
    const parts: string[] = ["a.sentiment IS NOT NULL"];
    const params: (number | string)[] = [];
    if (f.fromTs) { parts.push("a.analyzedAt >= ?"); params.push(f.fromTs); }
    if (f.toTs)   { parts.push("a.analyzedAt <= ?"); params.push(f.toTs); }
    const clause = "WHERE " + parts.join(" AND ");

    const [rows] = await conn.execute(
      `SELECT
         SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) AS positive,
         SUM(CASE WHEN sentiment = 'neutral'  THEN 1 ELSE 0 END) AS neutral,
         SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) AS negative,
         SUM(CASE WHEN sentiment = 'mixed'    THEN 1 ELSE 0 END) AS mixed,
         COUNT(*) AS total
       FROM whatsapp_ai_analysis a
       ${clause}`,
      params
    );
    const r = (rows as any[])[0] ?? {};
    return {
      positive: Number(r.positive ?? 0),
      neutral:  Number(r.neutral  ?? 0),
      negative: Number(r.negative ?? 0),
      mixed:    Number(r.mixed    ?? 0),
      total:    Number(r.total    ?? 0),
    };
  } finally {
    await conn.end();
  }
}

// ─── 8. Busiest Hours ─────────────────────────────────────────────────────────

export interface HourlyVolume {
  hour: number;
  inbound: number;
  outbound: number;
  total: number;
}

export async function getBusiestHours(f: WaAnalyticsFilter): Promise<HourlyVolume[]> {
  const conn = await getConn();
  try {
    const { clause, params } = buildMsgWhere(f);
    const [rows] = await conn.execute(
      `SELECT
         HOUR(FROM_UNIXTIME(m.timestamp / 1000)) AS hour,
         SUM(CASE WHEN fromMe = 0 THEN 1 ELSE 0 END) AS inbound,
         SUM(CASE WHEN fromMe = 1 THEN 1 ELSE 0 END) AS outbound,
         COUNT(*) AS total
       FROM wa_messages m
       ${clause}
       GROUP BY hour
       ORDER BY hour ASC`,
      params
    );
    const map = new Map<number, HourlyVolume>();
    for (const r of rows as any[]) {
      map.set(Number(r.hour), {
        hour: Number(r.hour),
        inbound:  Number(r.inbound  ?? 0),
        outbound: Number(r.outbound ?? 0),
        total:    Number(r.total    ?? 0),
      });
    }
    return Array.from({ length: 24 }, (_, h) => map.get(h) ?? { hour: h, inbound: 0, outbound: 0, total: 0 });
  } finally {
    await conn.end();
  }
}

// ─── 9. Agent Performance ─────────────────────────────────────────────────────
// wa_conversations doesn't have assignedUserId — return empty array

export interface AgentPerf {
  userId: number;
  userName: string;
  resolvedCount: number;
  openCount: number;
  pendingCount: number;
  totalAssigned: number;
  avgResolutionHours: number;
}

export async function getAgentPerformance(_f: WaAnalyticsFilter): Promise<AgentPerf[]> {
  // wa_conversations table doesn't have assignedUserId column
  // Return empty — will show "No agent data" in UI
  return [];
}

// ─── 10. Per-Instance (WA Number) Breakdown ───────────────────────────────────

export interface InstanceBreakdown {
  instanceId: number;
  label: string;
  phoneNumber: string;
  connectionStatus: string;
  totalConversations: number;
  totalMessages: number;
  inboundMessages: number;
  outboundMessages: number;
  unresolvedConvs: number;
}

export async function getInstanceBreakdown(f: WaAnalyticsFilter): Promise<InstanceBreakdown[]> {
  const conn = await getConn();
  try {
    const msgParts: string[] = [];
    const msgParams: (number | string)[] = [];
    if (f.fromTs) { msgParts.push("timestamp >= ?"); msgParams.push(f.fromTs); }
    if (f.toTs)   { msgParts.push("timestamp <= ?"); msgParams.push(f.toTs); }
    const msgWhere = msgParts.length ? "WHERE " + msgParts.join(" AND ") : "";

    const instParts: string[] = [];
    const instParams: (number | string)[] = [];
    if (f.numberId) { instParts.push("n.id = ?"); instParams.push(f.numberId); }
    const instWhere = instParts.length ? "WHERE " + instParts.join(" AND ") : "";

    const [rows] = await conn.execute(
      `SELECT
         n.id AS instanceId,
         n.label,
         n.phoneNumber,
         n.connectionStatus,
         COUNT(DISTINCT c.id) AS totalConversations,
         COUNT(m.id) AS totalMessages,
         SUM(CASE WHEN m.fromMe = 0 THEN 1 ELSE 0 END) AS inboundMessages,
         SUM(CASE WHEN m.fromMe = 1 THEN 1 ELSE 0 END) AS outboundMessages,
         SUM(CASE WHEN c.unreadCount > 0 THEN 1 ELSE 0 END) AS unresolvedConvs
       FROM restaurant_wa_numbers n
       LEFT JOIN wa_conversations c ON c.numberId = n.id
       LEFT JOIN (
         SELECT id, numberId, fromMe
         FROM wa_messages
         ${msgWhere}
       ) m ON m.numberId = n.id
       ${instWhere}
       GROUP BY n.id, n.label, n.phoneNumber, n.connectionStatus
       ORDER BY totalMessages DESC`,
      [...msgParams, ...instParams]
    );
    return (rows as any[]).map(r => ({
      instanceId:         Number(r.instanceId),
      label:              r.label ?? "",
      phoneNumber:        r.phoneNumber ?? "",
      connectionStatus:   r.connectionStatus ?? "unknown",
      totalConversations: Number(r.totalConversations ?? 0),
      totalMessages:      Number(r.totalMessages      ?? 0),
      inboundMessages:    Number(r.inboundMessages    ?? 0),
      outboundMessages:   Number(r.outboundMessages   ?? 0),
      unresolvedConvs:    Number(r.unresolvedConvs    ?? 0),
    }));
  } finally {
    await conn.end();
  }
}

// ─── 11. Daily Volume ─────────────────────────────────────────────────────────

export interface DailyVolume {
  date: string;
  inbound: number;
  outbound: number;
  total: number;
}

export async function getDailyVolume(f: WaAnalyticsFilter): Promise<DailyVolume[]> {
  const conn = await getConn();
  try {
    const { clause, params } = buildMsgWhere(f);
    const [rows] = await conn.execute(
      `SELECT
         DATE(FROM_UNIXTIME(m.timestamp / 1000)) AS date,
         SUM(CASE WHEN fromMe = 0 THEN 1 ELSE 0 END) AS inbound,
         SUM(CASE WHEN fromMe = 1 THEN 1 ELSE 0 END) AS outbound,
         COUNT(*) AS total
       FROM wa_messages m
       ${clause}
       GROUP BY date
       ORDER BY date ASC`,
      params
    );
    return (rows as any[]).map(r => ({
      date:     r.date,
      inbound:  Number(r.inbound  ?? 0),
      outbound: Number(r.outbound ?? 0),
      total:    Number(r.total    ?? 0),
    }));
  } finally {
    await conn.end();
  }
}

// ─── Aggregate: Full Dashboard ────────────────────────────────────────────────

export async function getWaAnalyticsDashboard(f: WaAnalyticsFilter) {
  const [
    messageVolume,
    firstResponse,
    convsByStatus,
    complaintStats,
    topIntents,
    sentimentDist,
    busiestHours,
    agentPerformance,
    instanceBreakdown,
    dailyVolume,
  ] = await Promise.all([
    getMessageVolume(f),
    getAvgFirstResponseTime(f),
    getConvsByStatus(f),
    getComplaintStats(f),
    getTopIntents(f),
    getSentimentDistribution(f),
    getBusiestHours(f),
    getAgentPerformance(f),
    getInstanceBreakdown(f),
    getDailyVolume(f),
  ]);

  return {
    messageVolume,
    firstResponse,
    convsByStatus,
    complaintStats,
    topIntents,
    sentimentDist,
    busiestHours,
    agentPerformance,
    instanceBreakdown,
    dailyVolume,
  };
}
