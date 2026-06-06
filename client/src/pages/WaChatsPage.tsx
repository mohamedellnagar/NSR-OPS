import React from "react";
/**
 * WaChatsPage — WhatsApp CRM Inbox
 * Three-panel layout:
 *   Left  : number selector + conversation list + search/filter
 *   Center: chat window with message bubbles + direction indicators
 *   Right : contact info + AI analysis panel
 */
import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  MessageSquare,
  MessageCircle,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
  User,
  Bot,
  Sparkles,
  AlertTriangle,
  CheckCheck,
  Check,
  Clock,
  XCircle,
  Image,
  FileText,
  Mic,
  Video,
  MapPin,
  Filter,
  SlidersHorizontal,
  Tag,
  TrendingUp,
  Zap,
  ThumbsUp,
  ThumbsDown,
  Minus,
  RefreshCw,
  Phone,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WaNumber {
  id: number;
  label: string;
  phoneNumber: string;
  connectionStatus: string;
}

interface Conversation {
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

interface Message {
  id: number;
  conversationId: number;
  fromMe: number;
  messageType: string;
  body: string | null;
  mediaUrl: string | null;
  caption: string | null;
  timestamp: number;
  status: string;
}

interface AiAnalysis {
  id: number;
  // DB actual columns
  sentiment: string | null;
  sentimentScore: number | null;
  urgencyLevel: string | null;       // low|medium|high|critical
  behaviorCategory: string | null;   // complaint|inquiry|reservation|support|etc
  behaviorTags: string[] | null;
  impressionSummary: string | null;  // summary of the conversation
  keyTopics: string[] | null;        // detected topics/intents
  suggestedReply: string | null;
  recommendedAction: string | null;
  detectedLanguage: string | null;
  analysisType: string | null;
  createdAt: number;
  // Legacy aliases (kept for backward compat)
  intent?: string | null;
  priority?: string | null;
  summary?: string | null;
  tags?: string | null;
  requiresHumanEscalation?: number | null;
  satisfactionScore?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: number | null, ar: boolean): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString(ar ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(ar ? "ar-SA" : "en-US", { month: "short", day: "numeric" });
}

function getContactDisplay(conv: Conversation): string {
  return conv.contactPushName || conv.contactName || conv.contactPhone;
}

function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500",
  "bg-amber-500", "bg-rose-500", "bg-cyan-500",
  "bg-indigo-500", "bg-pink-500",
];

function avatarColor(phone: string): string {
  let hash = 0;
  for (let i = 0; i < phone.length; i++) hash = phone.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MsgStatus({ status, fromMe }: { status: string; fromMe: boolean }) {
  if (!fromMe) return null;
  if (status === "read")      return <CheckCheck size={13} className="text-blue-400 flex-shrink-0" />;
  if (status === "delivered") return <CheckCheck size={13} className="text-muted-foreground flex-shrink-0" />;
  if (status === "sent")      return <Check size={13} className="text-muted-foreground flex-shrink-0" />;
  if (status === "pending")   return <Clock size={13} className="text-muted-foreground flex-shrink-0" />;
  if (status === "failed")    return <XCircle size={13} className="text-destructive flex-shrink-0" />;
  return null;
}

function SentimentBadge({ sentiment, ar }: { sentiment: string | null; ar: boolean }) {
  if (!sentiment) return null;
  const map: Record<string, { icon: React.ReactNode; cls: string; labelAr: string; label: string }> = {
    positive: { icon: <ThumbsUp size={11} />, cls: "bg-emerald-100 text-emerald-700", labelAr: "إيجابي", label: "Positive" },
    negative: { icon: <ThumbsDown size={11} />, cls: "bg-red-100 text-red-700",       labelAr: "سلبي",   label: "Negative" },
    neutral:  { icon: <Minus size={11} />,      cls: "bg-slate-100 text-slate-600",   labelAr: "محايد",  label: "Neutral"  },
    mixed:    { icon: <Minus size={11} />,      cls: "bg-amber-100 text-amber-700",   labelAr: "مختلط",  label: "Mixed"    },
  };
  const info = map[sentiment] ?? map.neutral;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${info.cls}`}>
      {info.icon}{ar ? info.labelAr : info.label}
    </span>
  );
}

function PriorityBadge({ priority, ar }: { priority: string | null; ar: boolean }) {
  if (!priority) return null;
  const map: Record<string, { cls: string; labelAr: string; label: string }> = {
    urgent: { cls: "bg-red-100 text-red-700 border-red-200",       labelAr: "عاجل",    label: "Urgent" },
    high:   { cls: "bg-orange-100 text-orange-700 border-orange-200", labelAr: "عالي", label: "High"   },
    normal: { cls: "bg-blue-100 text-blue-700 border-blue-200",    labelAr: "عادي",    label: "Normal" },
    low:    { cls: "bg-slate-100 text-slate-600 border-slate-200", labelAr: "منخفض",   label: "Low"    },
  };
  const info = map[priority] ?? map.normal;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${info.cls}`}>
      {ar ? info.labelAr : info.label}
    </span>
  );
}

const INTENT_LABELS: Record<string, { ar: string; en: string }> = {
  order_inquiry:   { ar: "استفسار طلب",      en: "Order Inquiry"   },
  complaint:       { ar: "شكوى",             en: "Complaint"       },
  reservation:     { ar: "حجز",              en: "Reservation"     },
  support_request: { ar: "طلب دعم",          en: "Support Request" },
  menu_question:   { ar: "سؤال عن القائمة",  en: "Menu Question"   },
  delivery_issue:  { ar: "مشكلة توصيل",      en: "Delivery Issue"  },
  general_inquiry: { ar: "استفسار عام",       en: "General Inquiry" },
  feedback:        { ar: "تقييم",            en: "Feedback"        },
  greeting:        { ar: "تحية",             en: "Greeting"        },
  other:           { ar: "أخرى",             en: "Other"           },
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function WaChatsPage() {
  const { language, isRTL } = useLanguage();
  const ar = language === "ar";
  const utils = trpc.useUtils();

  const [selectedNumberId, setSelectedNumberId] = useState<number | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filterUnread, setFilterUnread] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(true);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: numbers = [] } = trpc.waNumbers.list.useQuery(
    undefined,
    { refetchInterval: 60000 } // refresh number list every 60s
  );
  const { data: conversations = [], isLoading: convsLoading, refetch: refetchConvs } = trpc.waNumbers.conversations.useQuery(
    { numberId: selectedNumberId! },
    { enabled: selectedNumberId !== null, refetchInterval: 60000 } // poll every 60s
  );
  const { data: messages = [], isLoading: msgsLoading, refetch: refetchMsgs } = trpc.waNumbers.messages.useQuery(
    { conversationId: selectedConvId!, limit: 100 },
    { enabled: selectedConvId !== null, refetchInterval: 60000 } // poll every 60s
  );
  const { data: aiAnalysis, refetch: refetchAi } = trpc.waAnalysis.getLatest.useQuery(
    { conversationId: selectedConvId! },
    { enabled: selectedConvId !== null, refetchInterval: 15000 } // check AI analysis every 15s
  );

  // ── Mutations ──────────────────────────────────────────────────────────────
  const markReadM = trpc.waNumbers.markRead.useMutation({
    onSuccess: () => utils.waNumbers.conversations.invalidate({ numberId: selectedNumberId! }),
  });
  const fetchMsgsM = trpc.waNumbers.fetchMessages.useMutation({
    onSuccess: (d: any) => {
      toast.success(ar ? `تم جلب ${d.saved} رسالة` : `Fetched ${d.saved} messages`);
      refetchMsgs();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const runAiM = trpc.waAnalysis.runFull.useMutation({
    onSuccess: () => {
      toast.success(ar ? "اكتمل التحليل" : "Analysis complete");
      refetchAi();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const nums = numbers as WaNumber[];
    if (nums.length > 0 && selectedNumberId === null) setSelectedNumberId(nums[0].id);
  }, [numbers, selectedNumberId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-refresh AI analysis when new messages arrive
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    const msgs = messages as Message[];
    if (msgs.length > prevMsgCountRef.current && prevMsgCountRef.current > 0) {
      // New messages detected — refresh AI analysis after 6s (backend needs ~5s to analyze)
      const timer = setTimeout(() => { refetchAi(); }, 6000);
      return () => clearTimeout(timer);
    }
    prevMsgCountRef.current = msgs.length;
  }, [(messages as Message[]).length, refetchAi]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const convs = conversations as Conversation[];
  const msgs = messages as Message[];
  const analysis = aiAnalysis as AiAnalysis | null | undefined;
  const nums = numbers as WaNumber[];
  const selectedConv = convs.find(c => c.id === selectedConvId) ?? null;

  // ── Multi-analysis for sentiment badges in conversation list ────────────────
  const convIds = convs.map(c => c.id);
  const { data: multiAnalysis = {} } = trpc.waBatch.getMultiAnalysis.useQuery(
    { conversationIds: convIds.slice(0, 100) },
    { enabled: convIds.length > 0, refetchInterval: 30000, staleTime: 20000 }
  );

  const filteredConvs = convs.filter(c => {
    const q = search.toLowerCase();
    const name = getContactDisplay(c).toLowerCase();
    const matchSearch = !q || name.includes(q) || c.contactPhone.includes(q) || (c.lastMessage ?? "").toLowerCase().includes(q);
    const matchUnread = !filterUnread || c.unreadCount > 0;
    return matchSearch && matchUnread;
  });

  const aiTags: string[] = (() => {
    // keyTopics is already parsed as array by server, behaviorTags too
    if (analysis?.keyTopics && Array.isArray(analysis.keyTopics)) return analysis.keyTopics;
    if (analysis?.behaviorTags && Array.isArray(analysis.behaviorTags)) return analysis.behaviorTags;
    if (!analysis?.tags) return [];
    try { return JSON.parse(analysis.tags as string); } catch { return []; }
  })();

  const handleSelectConv = (conv: Conversation) => {
    setSelectedConvId(conv.id);
    setMobileView("chat");
    if (conv.unreadCount > 0) markReadM.mutate({ conversationId: conv.id });
  };

  const handleRunAi = () => {
    if (!selectedConv || !selectedNumberId) return;
    runAiM.mutate({
      conversationId: selectedConv.id,
      instanceId: selectedNumberId,
      contactId: selectedConv.id,
      includeReply: true,
      forceRerun: true,
    });
  };

  const handleFetchMsgs = () => {
    if (!selectedConv || !selectedNumberId) return;
    fetchMsgsM.mutate({
      numberId: selectedNumberId,
      conversationId: selectedConv.id,
      contactPhone: selectedConv.contactPhone,
      limit: 50,
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden bg-background" dir={isRTL ? "rtl" : "ltr"}>

      {/* ═══════════════════════════════════════════════════════════════════
          LEFT PANEL — Conversation List
      ═══════════════════════════════════════════════════════════════════ */}
      <div className={`flex flex-col border-e border-border bg-card ${mobileView === "chat" ? "hidden md:flex" : "flex"} w-full md:w-80 lg:w-96 flex-shrink-0`}>

        {/* Number selector */}
        <div className="p-3 border-b border-border">
          <Select
            value={selectedNumberId?.toString() ?? ""}
            onValueChange={v => { setSelectedNumberId(Number(v)); setSelectedConvId(null); }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder={ar ? "اختر رقم الواتساب" : "Select WhatsApp number"} />
            </SelectTrigger>
            <SelectContent>
              {nums.map(n => (
                <SelectItem key={n.id} value={n.id.toString()}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${n.connectionStatus === "connected" ? "bg-emerald-500" : "bg-slate-300"}`} />
                    <span className="truncate">{n.label}</span>
                    <span className="text-muted-foreground text-xs font-mono ms-auto">{n.phoneNumber}</span>
                  </div>
                </SelectItem>
              ))}
              {nums.length === 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {ar ? "لا توجد أرقام مضافة" : "No numbers added"}
                </div>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Search + filter */}
        <div className="p-3 border-b border-border space-y-2">
          <div className="relative">
            <Search size={14} className={`absolute top-1/2 -translate-y-1/2 text-muted-foreground ${isRTL ? "right-3" : "left-3"}`} />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={ar ? "بحث في المحادثات..." : "Search conversations..."}
              className={`h-8 text-sm ${isRTL ? "pr-8" : "pl-8"}`}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterUnread(f => !f)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterUnread ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              <Filter size={11} />
              {ar ? "غير مقروء" : "Unread"}
            </button>
            <button
              onClick={() => refetchConvs()}
              className="ms-auto text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
            >
              <RefreshCw size={13} />
            </button>
            <span className="text-xs text-muted-foreground">
              {filteredConvs.length} {ar ? "محادثة" : "chats"}
            </span>
          </div>
        </div>

        {/* Conversations list */}
        <ScrollArea className="flex-1">
          {convsLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin text-muted-foreground" size={24} />
            </div>
          )}
          {!convsLoading && selectedNumberId && filteredConvs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
              <MessageSquare size={32} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {ar ? "لا توجد محادثات" : "No conversations"}
              </p>
            </div>
          )}
          {!convsLoading && !selectedNumberId && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
              <Phone size={28} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {ar ? "اختر رقماً للبدء" : "Select a number to start"}
              </p>
            </div>
          )}
          {filteredConvs.map(conv => {
            const name = getContactDisplay(conv);
            const isActive = conv.id === selectedConvId;
            const convAnalysis = (multiAnalysis as Record<number, { sentiment?: string | null }>)[conv.id];
            return (
              <button
                key={conv.id}
                onClick={() => handleSelectConv(conv)}
                className={`w-full flex items-start gap-3 px-3 py-3 hover:bg-accent/50 transition-colors border-b border-border/50 text-start ${isActive ? "bg-accent" : ""}`}
              >
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full ${avatarColor(conv.contactPhone)} flex items-center justify-center text-white text-sm font-semibold flex-shrink-0`}>
                  {getInitials(name)}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-sm text-foreground truncate">{name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{formatTime(conv.lastMessageAt, ar)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">{conv.lastMessage ?? (ar ? "لا توجد رسائل" : "No messages")}</p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {convAnalysis?.sentiment && (
                        <SentimentBadge sentiment={convAnalysis.sentiment} ar={ar} />
                      )}
                      {conv.unreadCount > 0 && (
                        <span className="min-w-[20px] h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold px-1">
                          {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </ScrollArea>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          CENTER PANEL — Chat Window
      ═══════════════════════════════════════════════════════════════════ */}
      <div className={`flex flex-col flex-1 min-w-0 ${mobileView === "list" ? "hidden md:flex" : "flex"}`}>
        {!selectedConv ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center">
              <MessageSquare size={36} className="text-muted-foreground/40" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{ar ? "اختر محادثة للبدء" : "Select a conversation"}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {ar ? "اختر من القائمة على الجانب" : "Choose from the list on the side"}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card flex-shrink-0">
              {/* Mobile back */}
              <button onClick={() => setMobileView("list")} className="md:hidden text-muted-foreground hover:text-foreground p-1">
                {isRTL ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
              </button>
              {/* Avatar */}
              <div className={`w-9 h-9 rounded-full ${avatarColor(selectedConv.contactPhone)} flex items-center justify-center text-white text-sm font-semibold flex-shrink-0`}>
                {getInitials(getContactDisplay(selectedConv))}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground">{getContactDisplay(selectedConv)}</p>
                <p className="text-xs text-muted-foreground font-mono">{selectedConv.contactPhone}</p>
              </div>
              {/* Actions */}
              <TooltipProvider>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => refetchMsgs()}>
                        <RefreshCw size={14} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{ar ? "تحديث" : "Refresh"}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleFetchMsgs} disabled={fetchMsgsM.isPending}>
                        {fetchMsgsM.isPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{ar ? "جلب الرسائل من API" : "Fetch from API"}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={handleRunAi} disabled={runAiM.isPending}>
                        {runAiM.isPending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                        {ar ? "تحليل AI" : "AI Analysis"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{ar ? "تشغيل تحليل AI" : "Run AI analysis"}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hidden lg:flex" onClick={() => setShowAiPanel(v => !v)}>
                        <SlidersHorizontal size={14} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{ar ? "لوحة AI" : "AI Panel"}</TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {msgsLoading && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="animate-spin text-muted-foreground" size={24} />
                </div>
              )}
              {!msgsLoading && msgs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <MessageCircle size={32} className="text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{ar ? "لا توجد رسائل محفوظة" : "No messages saved"}</p>
                  <Button size="sm" variant="outline" onClick={handleFetchMsgs} disabled={fetchMsgsM.isPending} className="gap-1.5 text-xs">
                    {fetchMsgsM.isPending ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    {ar ? "جلب الرسائل" : "Fetch Messages"}
                  </Button>
                </div>
              )}

              <div className="space-y-1">
                {msgs.map((msg, idx) => {
                  const fromMe = msg.fromMe === 1;
                  const prevMsg = idx > 0 ? msgs[idx - 1] : null;
                  const showDate = !prevMsg || new Date(msg.timestamp).toDateString() !== new Date(prevMsg.timestamp).toDateString();

                  return (
                    <div key={msg.id}>
                      {/* Date separator */}
                      {showDate && (
                        <div className="flex items-center gap-3 my-4">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-xs text-muted-foreground px-2 bg-background rounded-full border border-border py-0.5">
                            {new Date(msg.timestamp).toLocaleDateString(ar ? "ar-SA" : "en-US", { weekday: "short", month: "short", day: "numeric" })}
                          </span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}

                      {/* Bubble row */}
                      <div className={`flex items-end gap-2 mb-1 ${fromMe ? (isRTL ? "justify-start" : "justify-end") : (isRTL ? "justify-end" : "justify-start")}`}>
                        {/* Incoming avatar */}
                        {!fromMe && (
                          <div className={`w-7 h-7 rounded-full ${avatarColor(selectedConv.contactPhone)} flex items-center justify-center text-white text-xs font-semibold flex-shrink-0`}>
                            {getInitials(getContactDisplay(selectedConv)).slice(0, 1)}
                          </div>
                        )}

                        <div className="max-w-[70%]">
                          {/* Direction indicator */}
                          <div className={`flex items-center gap-1 mb-0.5 ${fromMe ? (isRTL ? "justify-start" : "justify-end") : (isRTL ? "justify-end" : "justify-start")}`}>
                            {fromMe ? (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                {isRTL ? <ChevronLeft size={10} /> : <ChevronRight size={10} />}
                                {ar ? "أنت" : "You"}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                {ar ? "العميل" : "Customer"}
                                {isRTL ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
                              </span>
                            )}
                          </div>

                          {/* Bubble */}
                          <div className={`rounded-2xl px-3 py-2 text-sm shadow-sm ${
                            fromMe
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-card border border-border text-foreground rounded-bl-sm"
                          }`}>
                            {/* Media type */}
                            {msg.messageType !== "text" && (
                              <div className="flex items-center gap-1.5 mb-1 text-xs opacity-70">
                                {msg.messageType === "image"    && <Image size={12} />}
                                {msg.messageType === "video"    && <Video size={12} />}
                                {msg.messageType === "audio"    && <Mic size={12} />}
                                {msg.messageType === "document" && <FileText size={12} />}
                                {msg.messageType === "location" && <MapPin size={12} />}
                                <span className="capitalize">{msg.messageType}</span>
                              </div>
                            )}
                            {msg.body ? (
                              <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.body}</p>
                            ) : (
                              <p className="italic opacity-60 text-xs">{ar ? "[رسالة وسائط]" : "[Media message]"}</p>
                            )}
                          </div>

                          {/* Time + status */}
                          <div className={`flex items-center gap-1 mt-0.5 ${fromMe ? (isRTL ? "justify-start" : "justify-end") : (isRTL ? "justify-end" : "justify-start")}`}>
                            <span className="text-xs text-muted-foreground">
                              {new Date(msg.timestamp).toLocaleTimeString(ar ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <MsgStatus status={msg.status} fromMe={fromMe} />
                          </div>
                        </div>

                        {/* Outgoing icon */}
                        {fromMe && (
                          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                            <User size={13} className="text-primary" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Read-only footer */}
            <div className="px-4 py-2 border-t border-border bg-muted/30 flex-shrink-0">
              <p className="text-xs text-muted-foreground text-center">
                {ar ? "عرض المحادثات فقط — الردود تُرسل من Evolution API" : "Read-only view — replies are sent via Evolution API"}
              </p>
            </div>
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          RIGHT PANEL — Contact Info + AI Analysis
      ═══════════════════════════════════════════════════════════════════ */}
      {selectedConv && showAiPanel && (
        <div className="hidden lg:flex flex-col w-72 xl:w-80 border-s border-border bg-card flex-shrink-0">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">

              {/* Contact card */}
              <div className="bg-muted/30 rounded-xl p-4 text-center">
                <div className={`w-14 h-14 rounded-full ${avatarColor(selectedConv.contactPhone)} flex items-center justify-center text-white text-lg font-bold mx-auto mb-2`}>
                  {getInitials(getContactDisplay(selectedConv))}
                </div>
                <p className="font-semibold text-foreground">{getContactDisplay(selectedConv)}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{selectedConv.contactPhone}</p>
                {selectedConv.unreadCount > 0 && (
                  <Badge className="mt-2 text-xs">{selectedConv.unreadCount} {ar ? "غير مقروء" : "unread"}</Badge>
                )}
              </div>

              <Separator />

              {/* AI Analysis section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Sparkles size={14} className="text-primary" />
                    {ar ? "تحليل AI" : "AI Analysis"}
                  </h3>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={handleRunAi} disabled={runAiM.isPending}>
                    {runAiM.isPending ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                    {ar ? "تحليل" : "Analyze"}
                  </Button>
                </div>

                {!analysis ? (
                  <div className="bg-muted/30 rounded-xl p-4 text-center">
                    <Bot size={24} className="text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">{ar ? "لا يوجد تحليل بعد" : "No analysis yet"}</p>
                    <p className="text-xs text-muted-foreground mt-1">{ar ? "اضغط \"تحليل\" لتشغيل AI" : "Click \"Analyze\" to run AI"}</p>
                  </div>
                ) : (
                  <div className="space-y-3">

                    {/* Intent / Behavior Category */}
                    {(analysis.behaviorCategory || analysis.intent) && (
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <MessageCircle size={11} />{ar ? "النية" : "Intent"}
                        </p>
                        <p className="text-sm font-medium text-foreground capitalize">
                          {(() => {
                            const val = analysis.behaviorCategory || analysis.intent || "";
                            return ar ? (INTENT_LABELS[val]?.ar ?? val.replace(/_/g, " ")) : (INTENT_LABELS[val]?.en ?? val.replace(/_/g, " "));
                          })()}
                        </p>
                      </div>
                    )}

                    {/* Sentiment */}
                    {analysis.sentiment && (
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                          <TrendingUp size={11} />{ar ? "المشاعر" : "Sentiment"}
                        </p>
                        <div className="flex items-center gap-2">
                          <SentimentBadge sentiment={analysis.sentiment} ar={ar} />
                          {analysis.sentimentScore !== null && (
                            <span className="text-xs text-muted-foreground">
                              ({analysis.sentimentScore > 0 ? "+" : ""}{Number(analysis.sentimentScore).toFixed(2)})
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Priority / Urgency */}
                    {(analysis.urgencyLevel || analysis.priority) && (
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                          <AlertTriangle size={11} />{ar ? "الأولوية" : "Priority"}
                        </p>
                        <PriorityBadge priority={analysis.urgencyLevel ?? analysis.priority ?? null} ar={ar} />
                        {(analysis.urgencyLevel === "critical" || analysis.urgencyLevel === "high" || analysis.requiresHumanEscalation === 1) && (
                          <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                            <AlertTriangle size={10} />
                            {ar ? "يحتاج تدخل بشري" : "Requires human escalation"}
                          </p>
                        )}
                        {analysis.recommendedAction && (
                          <p className="text-xs text-muted-foreground mt-1">{analysis.recommendedAction}</p>
                        )}
                      </div>
                    )}

                    {/* Summary / Impression */}
                    {(analysis.impressionSummary || analysis.summary) && (
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <FileText size={11} />{ar ? "الملخص" : "Summary"}
                        </p>
                        <p className="text-xs text-foreground leading-relaxed">{analysis.impressionSummary || analysis.summary}</p>
                      </div>
                    )}

                    {/* Suggested Reply */}
                    {analysis.suggestedReply && (
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                        <p className="text-xs text-primary mb-1 flex items-center gap-1 font-medium">
                          <Bot size={11} />{ar ? "الرد المقترح" : "Suggested Reply"}
                        </p>
                        <p className="text-xs text-foreground leading-relaxed">{analysis.suggestedReply}</p>
                      </div>
                    )}

                    {/* Tags */}
                    {aiTags.length > 0 && (
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                          <Tag size={11} />{ar ? "الوسوم" : "Tags"}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {aiTags.map((tag, i) => (
                            <span key={i} className="px-2 py-0.5 bg-secondary text-secondary-foreground rounded-full text-xs">{tag}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Language detected */}
                    {analysis.detectedLanguage && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{ar ? "اللغة المكتشفة:" : "Language:"}</span>
                        <span className="font-medium uppercase">{analysis.detectedLanguage}</span>
                      </div>
                    )}

                    {/* Timestamp */}
                    <p className="text-xs text-muted-foreground text-center">
                      {ar ? "آخر تحليل:" : "Last analyzed:"} {formatTime(analysis.createdAt, ar)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
