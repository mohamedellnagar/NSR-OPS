-- ============================================================
-- Migration 0042: WhatsApp Conversations & AI Analysis
-- Creates 7 new tables for the WhatsApp integration layer
-- Keeps existing tables (restaurant_wa_numbers, wa_conversations,
-- wa_messages, whatsapp_analyses, whatsapp_customer_analyses)
-- intact for backward compatibility.
-- ============================================================

-- ── 1. whatsapp_instances ────────────────────────────────────
-- Consolidates restaurant_wa_numbers + evolution_settings + whatsapp_settings
-- One row = one WhatsApp number connected via Evolution API
-- restaurantId supports future multi-branch expansion
CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  restaurantId      INT NOT NULL DEFAULT 1
                    COMMENT 'FK to restaurant_settings.id — ready for multi-branch',
  label             VARCHAR(100) NOT NULL
                    COMMENT 'Human-readable name e.g. "الفرع الرئيسي - خدمة العملاء"',
  phoneNumber       VARCHAR(30) NOT NULL,
  evolutionApiUrl   VARCHAR(512) NOT NULL,
  evolutionApiKey   VARCHAR(512) NOT NULL,
  evolutionInstance VARCHAR(200) NOT NULL,
  webhookSecret     VARCHAR(200) NULL
                    COMMENT 'HMAC-SHA256 secret to verify incoming webhook payloads',
  isActive          TINYINT(1) NOT NULL DEFAULT 1,
  connectionStatus  ENUM('connected','disconnected','connecting','qr_pending','unknown')
                    NOT NULL DEFAULT 'unknown',
  lastConnectedAt   BIGINT NULL,
  lastCheckedAt     BIGINT NULL,
  createdAt         BIGINT NOT NULL,
  updatedAt         BIGINT NOT NULL,

  INDEX idx_wi_restaurant (restaurantId),
  UNIQUE KEY uniq_wi_instance (evolutionInstance)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. whatsapp_contacts ─────────────────────────────────────
-- Separates contact identity from conversation state.
-- One contact per phone per instance. Enriched with AI-generated tags.
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  instanceId      INT NOT NULL,
  phone           VARCHAR(50) NOT NULL
                  COMMENT 'E.164 without + e.g. 971501234567',
  pushName        VARCHAR(200) NULL
                  COMMENT 'WhatsApp display name set by the contact',
  profileName     VARCHAR(200) NULL
                  COMMENT 'Name saved in restaurant address book',
  avatarUrl       TEXT NULL,
  isBlocked       TINYINT(1) NOT NULL DEFAULT 0,
  tags            JSON NULL
                  COMMENT 'Array of string tags e.g. ["VIP","complaint","regular"]',
  notes           TEXT NULL
                  COMMENT 'Internal staff notes about this contact',
  firstSeenAt     BIGINT NOT NULL,
  lastSeenAt      BIGINT NULL,
  createdAt       BIGINT NOT NULL,
  updatedAt       BIGINT NOT NULL,

  FOREIGN KEY fk_wc_instance (instanceId) REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_wc_instance_phone (instanceId, phone),
  INDEX idx_wc_phone (phone),
  INDEX idx_wc_instance (instanceId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. whatsapp_conversations ────────────────────────────────
-- Replaces wa_conversations. Adds status lifecycle, agent assignment,
-- priority, and tags. UNIQUE on (instanceId, contactId) prevents duplicates.
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  instanceId          INT NOT NULL,
  contactId           INT NOT NULL,
  assignedUserId      INT NULL
                      COMMENT 'FK to users.id — which staff member handles this',
  status              ENUM('open','pending','resolved','archived','spam')
                      NOT NULL DEFAULT 'open',
  priority            ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  subject             VARCHAR(300) NULL
                      COMMENT 'Auto-generated or manual conversation title',
  lastMessageBody     TEXT NULL,
  lastMessageAt       BIGINT NULL,
  lastMessageFromMe   TINYINT(1) NULL,
  unreadCount         INT NOT NULL DEFAULT 0,
  tags                JSON NULL
                      COMMENT 'e.g. ["order","complaint","feedback"]',
  resolvedAt          BIGINT NULL,
  resolvedByUserId    INT NULL,
  createdAt           BIGINT NOT NULL,
  updatedAt           BIGINT NOT NULL,

  FOREIGN KEY fk_wconv_instance  (instanceId)       REFERENCES whatsapp_instances(id)  ON DELETE CASCADE,
  FOREIGN KEY fk_wconv_contact   (contactId)        REFERENCES whatsapp_contacts(id)   ON DELETE CASCADE,
  FOREIGN KEY fk_wconv_assigned  (assignedUserId)   REFERENCES users(id)               ON DELETE SET NULL,
  UNIQUE KEY uniq_wconv_inst_contact (instanceId, contactId),
  INDEX idx_wconv_status    (status),
  INDEX idx_wconv_assigned  (assignedUserId),
  INDEX idx_wconv_last_msg  (lastMessageAt),
  INDEX idx_wconv_instance  (instanceId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 4. whatsapp_messages ─────────────────────────────────────
-- Replaces wa_messages. Adds threaded replies (replyToMsgId),
-- soft-delete, delivery timestamps, and sender tracking.
-- UNIQUE on (instanceId, evolutionMsgId) prevents webhook retry duplicates.
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  conversationId  INT NOT NULL,
  instanceId      INT NOT NULL,
  evolutionMsgId  VARCHAR(200) NULL
                  COMMENT 'Unique message ID from Evolution API — used for dedup',
  fromMe          TINYINT(1) NOT NULL DEFAULT 0,
  senderUserId    INT NULL
                  COMMENT 'FK to users.id — set when fromMe=1 (staff sent)',
  replyToMsgId    INT NULL
                  COMMENT 'Self-referencing FK for threaded replies',
  messageType     ENUM('text','image','video','audio','document','sticker',
                       'location','contact','reaction','template','unknown')
                  NOT NULL DEFAULT 'text',
  body            TEXT NULL,
  mediaUrl        TEXT NULL,
  mediaMimeType   VARCHAR(100) NULL,
  mediaFileSize   INT NULL,
  caption         TEXT NULL,
  latitude        DECIMAL(10,7) NULL,
  longitude       DECIMAL(10,7) NULL,
  isForwarded     TINYINT(1) NOT NULL DEFAULT 0,
  isDeleted       TINYINT(1) NOT NULL DEFAULT 0,
  deletedAt       BIGINT NULL,
  status          ENUM('pending','sent','delivered','read','failed') NULL,
  sentAt          BIGINT NULL,
  deliveredAt     BIGINT NULL,
  readAt          BIGINT NULL,
  timestamp       BIGINT NOT NULL
                  COMMENT 'Original WhatsApp message timestamp (ms)',
  createdAt       BIGINT NOT NULL,

  FOREIGN KEY fk_wm_conversation (conversationId) REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY fk_wm_instance     (instanceId)     REFERENCES whatsapp_instances(id)     ON DELETE CASCADE,
  FOREIGN KEY fk_wm_sender       (senderUserId)   REFERENCES users(id)                  ON DELETE SET NULL,
  FOREIGN KEY fk_wm_reply        (replyToMsgId)   REFERENCES whatsapp_messages(id)      ON DELETE SET NULL,
  UNIQUE KEY uniq_wm_evolution_msg (instanceId, evolutionMsgId),
  INDEX idx_wm_conversation  (conversationId),
  INDEX idx_wm_timestamp     (timestamp),
  INDEX idx_wm_status        (status),
  INDEX idx_wm_from_me       (fromMe),
  INDEX idx_wm_instance_ts   (instanceId, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 5. whatsapp_message_status_logs ──────────────────────────
-- Time-series log of delivery lifecycle: pending→sent→delivered→read.
-- Evolution API sends webhook events for each transition.
-- Enables delivery analytics and SLA tracking.
CREATE TABLE IF NOT EXISTS whatsapp_message_status_logs (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  messageId       INT NOT NULL,
  instanceId      INT NOT NULL,
  evolutionMsgId  VARCHAR(200) NOT NULL,
  status          ENUM('pending','sent','delivered','read','failed','deleted')
                  NOT NULL,
  errorCode       VARCHAR(50) NULL
                  COMMENT 'Evolution API error code if status=failed',
  errorMessage    TEXT NULL,
  occurredAt      BIGINT NOT NULL
                  COMMENT 'When this status transition happened (ms)',
  createdAt       BIGINT NOT NULL,

  FOREIGN KEY fk_wmsl_message  (messageId)  REFERENCES whatsapp_messages(id)  ON DELETE CASCADE,
  FOREIGN KEY fk_wmsl_instance (instanceId) REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  INDEX idx_wmsl_message    (messageId),
  INDEX idx_wmsl_evolution  (evolutionMsgId),
  INDEX idx_wmsl_status_ts  (status, occurredAt),
  INDEX idx_wmsl_instance   (instanceId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 6. whatsapp_ai_analysis ───────────────────────────────────
-- Replaces and merges whatsapp_analyses + whatsapp_customer_analyses.
-- One analysis record per (conversationId, analysisType, analysisVersion).
-- Stores sentiment, behavior, summary, suggested reply, and order extraction.
CREATE TABLE IF NOT EXISTS whatsapp_ai_analysis (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  conversationId        INT NOT NULL,
  instanceId            INT NOT NULL,
  contactId             INT NOT NULL,
  analysisType          ENUM('full','sentiment','behavior','summary',
                             'auto_reply_suggestion','complaint_detection',
                             'order_extraction')
                        NOT NULL DEFAULT 'full',
  analysisVersion       TINYINT NOT NULL DEFAULT 1
                        COMMENT 'Increments when re-analyzed with improved prompts',
  messageCountAnalyzed  INT NOT NULL DEFAULT 0,
  lastMessageIncluded   BIGINT NULL
                        COMMENT 'Timestamp of last message included in this analysis',

  -- Sentiment
  sentiment             ENUM('positive','neutral','negative','mixed') NULL,
  sentimentScore        DECIMAL(4,2) NULL
                        COMMENT '-1.00 to 1.00 scale',

  -- Behavior
  behaviorCategory      VARCHAR(64) NULL
                        COMMENT 'e.g. "loyal_customer","first_time","complaint","inquiry"',
  behaviorTags          JSON NULL
                        COMMENT 'Array e.g. ["price_sensitive","repeat_order","VIP"]',
  urgencyLevel          ENUM('low','medium','high','critical') NULL,

  -- Summary
  impressionSummary     TEXT NULL
                        COMMENT 'One-paragraph AI summary of the conversation',
  keyTopics             JSON NULL
                        COMMENT 'Array of main topics discussed',
  detectedLanguage      VARCHAR(10) NULL
                        COMMENT 'ISO 639-1 e.g. "ar","en"',

  -- Action
  recommendedAction     TEXT NULL
                        COMMENT 'AI-suggested next step for staff',
  suggestedReply        TEXT NULL
                        COMMENT 'AI-drafted reply message for staff to send',
  extractedOrderItems   JSON NULL
                        COMMENT 'If order detected: [{item, qty, notes}]',

  -- LLM metadata
  rawPromptTokens       INT NULL,
  rawCompletionTokens   INT NULL,
  rawAnalysisJson       JSON NULL
                        COMMENT 'Full LLM response for debugging',

  analyzedAt            BIGINT NOT NULL,
  createdAt             BIGINT NOT NULL,
  updatedAt             BIGINT NOT NULL,

  FOREIGN KEY fk_waa_conversation (conversationId) REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY fk_waa_instance     (instanceId)     REFERENCES whatsapp_instances(id)     ON DELETE CASCADE,
  FOREIGN KEY fk_waa_contact      (contactId)      REFERENCES whatsapp_contacts(id)      ON DELETE CASCADE,
  UNIQUE KEY uniq_waa_conv_type_ver (conversationId, analysisType, analysisVersion),
  INDEX idx_waa_conversation  (conversationId),
  INDEX idx_waa_sentiment     (sentiment),
  INDEX idx_waa_behavior      (behaviorCategory),
  INDEX idx_waa_urgency       (urgencyLevel),
  INDEX idx_waa_analyzed_at   (analyzedAt),
  INDEX idx_waa_instance      (instanceId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 7. whatsapp_auto_reply_rules ──────────────────────────────
-- Rule-based auto-responses per instance.
-- Supports keyword matching, first-message greeting, outside-hours,
-- AI intent detection, and cooldown/scheduling controls.
CREATE TABLE IF NOT EXISTS whatsapp_auto_reply_rules (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  instanceId          INT NOT NULL,
  createdByUserId     INT NULL,
  name                VARCHAR(200) NOT NULL
                      COMMENT 'Internal rule name e.g. "رد على طلب المنيو"',
  isActive            TINYINT(1) NOT NULL DEFAULT 1,
  priority            INT NOT NULL DEFAULT 0
                      COMMENT 'Higher = evaluated first. Ties broken by id ASC',
  triggerType         ENUM('keyword','first_message','outside_hours',
                           'unread_timeout','ai_intent','always')
                      NOT NULL DEFAULT 'keyword',
  triggerKeywords     JSON NULL
                      COMMENT 'Array of keywords/phrases (case-insensitive match)',
  triggerIntent       VARCHAR(100) NULL
                      COMMENT 'AI intent label e.g. "menu_request","price_inquiry"',
  matchMode           ENUM('any','all','exact','regex') NOT NULL DEFAULT 'any',
  replyType           ENUM('text','template','media','ai_generated') NOT NULL DEFAULT 'text',
  replyText           TEXT NULL
                      COMMENT 'Static reply text. Supports {{contact_name}} variables',
  replyMediaUrl       TEXT NULL,
  aiReplyPrompt       TEXT NULL
                      COMMENT 'System prompt for AI-generated replies',
  delaySeconds        INT NOT NULL DEFAULT 0
                      COMMENT 'Delay before sending reply (simulate human typing)',
  maxFiresPerContact  INT NULL
                      COMMENT 'NULL = unlimited. 1 = fire once per contact ever',
  cooldownMinutes     INT NULL
                      COMMENT 'Minimum minutes between fires for same contact',
  activeFrom          TIME NULL
                      COMMENT 'Active hours start (NULL = always)',
  activeTo            TIME NULL
                      COMMENT 'Active hours end (NULL = always)',
  activeDays          JSON NULL
                      COMMENT 'Array of weekday numbers [0=Sun..6=Sat]. NULL = all days',
  fireCount           INT NOT NULL DEFAULT 0
                      COMMENT 'Total times this rule has fired (analytics)',
  lastFiredAt         BIGINT NULL,
  createdAt           BIGINT NOT NULL,
  updatedAt           BIGINT NOT NULL,

  FOREIGN KEY fk_warr_instance (instanceId)      REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  FOREIGN KEY fk_warr_user     (createdByUserId) REFERENCES users(id)              ON DELETE SET NULL,
  INDEX idx_warr_instance_active (instanceId, isActive),
  INDEX idx_warr_priority        (priority),
  INDEX idx_warr_trigger_type    (triggerType)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Webhook Raw Log ───────────────────────────────────────────
-- Stores every raw webhook payload for debugging and replay.
-- Separate from processed data to allow re-processing on schema changes.
CREATE TABLE IF NOT EXISTS whatsapp_webhook_logs (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  instanceId      INT NULL
                  COMMENT 'NULL if instance could not be identified',
  eventType       VARCHAR(100) NOT NULL
                  COMMENT 'e.g. "messages.upsert","messages.update","connection.update"',
  rawPayload      JSON NOT NULL
                  COMMENT 'Full webhook body from Evolution API',
  processingStatus ENUM('pending','processed','failed','skipped','duplicate')
                  NOT NULL DEFAULT 'pending',
  processingError TEXT NULL,
  processedAt     BIGINT NULL,
  createdAt       BIGINT NOT NULL,

  INDEX idx_wwl_instance    (instanceId),
  INDEX idx_wwl_event_type  (eventType),
  INDEX idx_wwl_status      (processingStatus),
  INDEX idx_wwl_created_at  (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
