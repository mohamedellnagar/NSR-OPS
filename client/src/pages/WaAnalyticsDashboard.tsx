/**
 * WaAnalyticsDashboard.tsx
 * Deep restaurant-focused WhatsApp conversation analytics
 */
import React, { useState, useCallback, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { ConversationDetailDialog } from "@/components/ConversationDetailDialog";
import { useWaRealtime } from "@/hooks/useWaRealtime";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  MessageCircle, AlertTriangle, TrendingUp, Star, ShoppingBag,
  Users, Zap, RefreshCw, ChevronRight, Phone, Clock,
  ThumbsUp, ThumbsDown, Minus, AlertCircle, Sparkles,
  UtensilsCrossed, Loader2,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const intentIcons: Record<string, React.ReactNode> = {
  order_inquiry:   <ShoppingBag size={14} />,
  complaint:       <AlertTriangle size={14} />,
  reservation:     <Clock size={14} />,
  delivery_issue:  <Zap size={14} />,
  menu_question:   <UtensilsCrossed size={14} />,
  feedback:        <ThumbsUp size={14} />,
  support_request: <AlertCircle size={14} />,
  general_inquiry: <MessageCircle size={14} />,
  greeting:        <Users size={14} />,
};

const urgencyColors: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high:     "bg-orange-100 text-orange-700 border-orange-200",
  medium:   "bg-amber-100 text-amber-700 border-amber-200",
  low:      "bg-slate-100 text-slate-500 border-slate-200",
};

const sentimentColors: Record<string, string> = {
  positive: "#10b981",
  neutral:  "#6b7280",
  negative: "#ef4444",
  mixed:    "#f59e0b",
};

function SatisfactionStars({ score }: { score: number | null }) {
  if (!score) return <span className="text-slate-400 text-xs">—</span>;
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={12} className={i <= score ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"} />
      ))}
    </div>
  );
}

function KpiCard({ icon, label, value, sub, color, trend }: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; color?: string; trend?: "up" | "down" | "neutral";
}) {
  const trendColor = trend === "up" ? "text-green-500" : trend === "down" ? "text-red-500" : "text-slate-400";
  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color || "bg-blue-50 text-blue-600"}`}>
            {icon}
          </div>
          {trend && (
            <TrendingUp size={14} className={trendColor} />
          )}
        </div>
        <p className="text-2xl font-bold text-slate-800 mt-3">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WaAnalyticsDashboard() {
  const { language } = useLanguage();
  const ar = language === "ar";
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [selectedConvSource, setSelectedConvSource] = useState<"wa" | "wh" | undefined>(undefined);
  const [batchRunning, setBatchRunning] = useState(false);

  // ── Date Filter State ──────────────────────────────────────────────────────
  type PeriodKey = 'today' | 'week' | 'month' | 'year' | 'all';
  const [activePeriod, setActivePeriod] = useState<PeriodKey>('all');

  const { dateFrom, dateTo, dateFromMs, dateToMs } = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const today = fmt(now);
    // Local midnight = start of today in user's timezone (Unix ms)
    const localMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const tomorrowMs = localMidnight(now) + 86400000; // exclusive upper bound
    if (activePeriod === 'today') {
      return { dateFrom: today, dateTo: today, dateFromMs: localMidnight(now), dateToMs: tomorrowMs };
    }
    if (activePeriod === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 6);
      return { dateFrom: fmt(d), dateTo: today, dateFromMs: localMidnight(d), dateToMs: tomorrowMs };
    }
    if (activePeriod === 'month') {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { dateFrom: fmt(d), dateTo: today, dateFromMs: localMidnight(d), dateToMs: tomorrowMs };
    }
    if (activePeriod === 'year') {
      const d = new Date(now.getFullYear(), 0, 1);
      return { dateFrom: `${now.getFullYear()}-01-01`, dateTo: today, dateFromMs: localMidnight(d), dateToMs: tomorrowMs };
    }
    return { dateFrom: undefined, dateTo: undefined, dateFromMs: undefined, dateToMs: undefined };
  }, [activePeriod]);

  // Deep insights query
  const { data: insights, isLoading: insightsLoading, refetch: refetchInsights } = trpc.waBatch.getRestaurantInsights.useQuery(
    { dateFrom, dateTo, dateFromMs, dateToMs },
    { staleTime: 60_000, refetchInterval: 120_000 }
  );

  // Batch progress
  const { data: progress, refetch: refetchProgress } = trpc.waBatch.progress.useQuery(
    undefined,
    { refetchInterval: batchRunning ? 3000 : false }
  );

  // Conversations with analysis
  const [convPage, setConvPage] = useState(0);
  const convLimit = 15;
  const { data: convsData, isLoading: convsLoading, refetch: refetchConvs } = trpc.waBatch.getConversationsWithAnalysis.useQuery(
    { limit: convLimit, offset: convPage * convLimit, dateFrom, dateTo, dateFromMs, dateToMs },
    { staleTime: 30_000 }
  );

  const batchStartM = trpc.waBatch.start.useMutation({
    onSuccess: () => { setBatchRunning(true); refetchProgress(); },
  });

  const handleRefresh = useCallback(() => {
    refetchInsights();
    refetchConvs();
  }, [refetchInsights, refetchConvs]);

  // Real-time: debounce refetch to avoid flooding on burst messages
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => {
      refetchConvs();
      refetchInsights();
    }, 800);
  }, [refetchConvs, refetchInsights]);

  const [realtimeConnected, setRealtimeConnected] = React.useState(false);
  useWaRealtime({
    onNewMessage: () => {
      setRealtimeConnected(true);
      debouncedRefetch();
    },
    onAnalysisDone: () => {
      debouncedRefetch();
    },
  });

  // Mark connected after first SSE connection
  React.useEffect(() => {
    const es = new EventSource("/api/sse/wa-events");
    es.addEventListener("connected", () => setRealtimeConnected(true));
    es.onerror = () => setRealtimeConnected(false);
    return () => es.close();
  }, []);

  React.useEffect(() => {
    if (progress && !progress.isRunning) setBatchRunning(false);
  }, [progress]);

  const kpi = insights?.kpi;
  const intentDist = insights?.intentDist ?? [];
  const sentimentDist = insights?.sentimentDist ?? [];
  const topMenuItems = insights?.topMenuItems ?? [];
  const behaviorDist = insights?.behaviorDist ?? [];
  const urgentConvs = (insights?.urgentConvs ?? []) as Array<Record<string, unknown>>;
  const topTopics = insights?.topTopics ?? [];
  const convs = (convsData?.conversations ?? []) as Array<Record<string, unknown>>;
  const convsTotal = convsData?.total ?? 0;

  const satisfactionPct = kpi?.avgSatisfaction ? (kpi.avgSatisfaction / 5) * 100 : 0;
  const sentimentPct = kpi?.avgSentiment ? kpi.avgSentiment * 100 : 0;

  const t = {
    title: ar ? "تحليلات محادثات الواتساب" : "WhatsApp Conversation Analytics",
    subtitle: ar ? "رؤى عميقة مدعومة بالذكاء الاصطناعي" : "AI-powered deep insights",
    refresh: ar ? "تحديث" : "Refresh",
    analyzeAll: ar ? "تحليل الكل بالذكاء الاصطناعي" : "Analyze All with AI",
    analyzing: ar ? "جار التحليل..." : "Analyzing...",

    // KPI labels
    analyzedConvs: ar ? "محادثات محللة" : "Analyzed Conversations",
    urgentConvs2: ar ? "محادثات عاجلة" : "Urgent Conversations",
    avgSatisfaction: ar ? "متوسط الرضا" : "Avg Satisfaction",
    responseRate: ar ? "معدل الرد" : "Response Rate",
    ordersDetected: ar ? "طلبات مكتشفة" : "Orders Detected",
    needsEscalation: ar ? "تحتاج تدخل" : "Needs Escalation",

    // Section titles
    intentAnalysis: ar ? "تحليل نوايا العملاء" : "Customer Intent Analysis",
    intentDesc: ar ? "ما الذي يريده عملاؤك؟ توزيع أسباب التواصل" : "What do your customers want? Distribution of contact reasons",
    sentimentAnalysis: ar ? "تحليل المشاعر" : "Sentiment Analysis",
    sentimentDesc: ar ? "الحالة العاطفية العامة لعملائك" : "Overall emotional state of your customers",
    topMenuItems2: ar ? "الأصناف الأكثر طلباً" : "Most Requested Menu Items",
    topMenuDesc: ar ? "مستخرج من محادثات الطلبات" : "Extracted from order conversations",
    behaviorAnalysis: ar ? "تحليل سلوك العملاء" : "Customer Behavior Analysis",
    behaviorDesc: ar ? "تصنيف العملاء حسب نمط تعاملهم" : "Customer classification by interaction pattern",
    urgentSection: ar ? "محادثات تحتاج متابعة فورية" : "Conversations Needing Immediate Action",
    urgentDesc: ar ? "شكاوى، مشاعر سلبية، أو طلبات تصعيد" : "Complaints, negative sentiment, or escalation requests",
    topicsSection: ar ? "المواضيع الأكثر تكراراً" : "Most Frequent Topics",
    topicsDesc: ar ? "الكلمات المفتاحية المستخرجة من المحادثات" : "Keywords extracted from conversations",
    allConvs: ar ? "جميع المحادثات" : "All Conversations",
    allConvsDesc: ar ? "مع تحليل الذكاء الاصطناعي" : "with AI analysis",
    noUrgent: ar ? "لا توجد محادثات عاجلة حالياً" : "No urgent conversations right now",
    noData: ar ? "لا توجد بيانات كافية — قم بتشغيل تحليل الذكاء الاصطناعي أولاً" : "No data yet — run AI analysis first",
    prev: ar ? "السابق" : "Prev",
    next: ar ? "التالي" : "Next",
    viewConv: ar ? "عرض المحادثة" : "View",
    satisfactionLabel: ar ? "مؤشر الرضا العام" : "Overall Satisfaction Index",
    sentimentLabel: ar ? "مؤشر المشاعر الإيجابية" : "Positive Sentiment Index",
  };

  if (insightsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">{ar ? "جار تحميل التحليلات..." : "Loading analytics..."}</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 space-y-6" dir={ar ? "rtl" : "ltr"}>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
              <MessageCircle size={16} className="text-white" />
            </div>
            {t.title}
          </h1>
          <p className="text-sm text-slate-400 mt-0.5 flex items-center gap-1.5">
            <Sparkles size={12} className="text-purple-400" />
            {t.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* ── Period Filter Tabs ── */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 gap-0.5 shadow-sm">
            {([
              { key: 'today', ar: 'اليوم', en: 'Today' },
              { key: 'week',  ar: 'الأسبوع', en: 'Week' },
              { key: 'month', ar: 'الشهر', en: 'Month' },
              { key: 'year',  ar: 'السنة', en: 'Year' },
              { key: 'all',   ar: 'الكل', en: 'All' },
            ] as const).map(p => (
              <button
                key={p.key}
                onClick={() => setActivePeriod(p.key)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                  activePeriod === p.key
                    ? 'bg-green-500 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {ar ? p.ar : p.en}
              </button>
            ))}
          </div>
          {/* Real-time indicator */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
            realtimeConnected
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-slate-50 text-slate-400 border-slate-200'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              realtimeConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-300'
            }`} />
            {realtimeConnected ? (ar ? 'مباشر' : 'Live') : (ar ? 'غير متصل' : 'Offline')}
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleRefresh}>
            <RefreshCw size={13} /> {t.refresh}
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-purple-600 hover:bg-purple-700"
            disabled={batchRunning || batchStartM.isPending}
            onClick={() => batchStartM.mutate({ forceRerun: false, includeReply: true })}
          >
            {batchRunning ? <><Loader2 size={13} className="animate-spin" /> {t.analyzing}</> : <><Sparkles size={13} /> {t.analyzeAll}</>}
          </Button>
        </div>
      </div>

      {/* ── Batch Progress ── */}
      {batchRunning && progress && (
        <Card className="border-0 shadow-sm bg-purple-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-purple-700 flex items-center gap-1.5">
                <Sparkles size={14} /> {ar ? "تحليل المحادثات..." : "Analyzing conversations..."}
              </span>
              <span className="text-xs text-purple-500">{progress.processed} / {progress.total}</span>
            </div>
            <Progress value={progress.total > 0 ? (progress.processed / progress.total) * 100 : 0} className="h-2" />
            <div className="flex gap-4 mt-2 text-xs text-slate-500">
              <span className="text-green-600">✓ {ar ? "نجح" : "OK"}: {progress.succeeded}</span>
              <span className="text-red-500">✗ {ar ? "فشل" : "Failed"}: {progress.failed}</span>
              <span className="text-amber-500">⊘ {ar ? "تخطى" : "Skipped"}: {progress.skipped}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          icon={<MessageCircle size={18} />}
          label={t.analyzedConvs}
          value={kpi?.analyzedConvs ?? 0}
          color="bg-blue-50 text-blue-600"
          sub={kpi ? `${ar ? "من" : "of"} ${convsTotal} ${ar ? "إجمالي" : "total"}` : undefined}
        />
        <KpiCard
          icon={<AlertTriangle size={18} />}
          label={t.urgentConvs2}
          value={kpi?.urgentCount ?? 0}
          color={kpi?.urgentCount ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-400"}
          sub={kpi?.criticalCount ? `${kpi.criticalCount} ${ar ? "حرج" : "critical"}` : undefined}
        />
        <KpiCard
          icon={<Star size={18} />}
          label={t.avgSatisfaction}
          value={kpi?.avgSatisfaction ? `${kpi.avgSatisfaction}/5` : "—"}
          color="bg-amber-50 text-amber-600"
          sub={kpi?.avgSatisfaction ? `${satisfactionPct.toFixed(0)}%` : undefined}
        />
        <KpiCard
          icon={<TrendingUp size={18} />}
          label={t.responseRate}
          value={kpi?.responseRate ? `${kpi.responseRate.toFixed(0)}%` : "—"}
          color="bg-green-50 text-green-600"
        />
        <KpiCard
          icon={<ShoppingBag size={18} />}
          label={t.ordersDetected}
          value={kpi?.convsWithOrders ?? 0}
          color="bg-purple-50 text-purple-600"
          sub={kpi?.orderCount ? `${kpi.orderCount} ${ar ? "استفسار طلب" : "order inquiries"}` : undefined}
        />
        <KpiCard
          icon={<AlertCircle size={18} />}
          label={t.needsEscalation}
          value={kpi?.needsEscalation ?? 0}
          color={kpi?.needsEscalation ? "bg-orange-50 text-orange-600" : "bg-slate-50 text-slate-400"}
        />
      </div>

      {/* ── Satisfaction & Sentiment Meters ── */}
      {kpi && (kpi.avgSatisfaction || kpi.avgSentiment) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {kpi.avgSatisfaction && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{t.satisfactionLabel}</p>
                    <p className="text-xs text-slate-400">{ar ? "بناءً على تحليل AI للمحادثات" : "Based on AI analysis of conversations"}</p>
                  </div>
                  <div className="text-3xl font-bold text-amber-500">{kpi.avgSatisfaction}/5</div>
                </div>
                <Progress value={satisfactionPct} className="h-3 bg-amber-100" />
                <div className="flex justify-between mt-2 text-xs text-slate-400">
                  <span>{ar ? "غير راضٍ" : "Unhappy"}</span>
                  <span>{ar ? "راضٍ جداً" : "Very Happy"}</span>
                </div>
                <div className="flex gap-1 mt-3">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className={`flex-1 h-2 rounded-full ${i <= Math.round(kpi.avgSatisfaction!) ? "bg-amber-400" : "bg-slate-100"}`} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {kpi.avgSentiment && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{t.sentimentLabel}</p>
                    <p className="text-xs text-slate-400">{ar ? "نسبة الإيجابية في المحادثات" : "Positivity ratio across conversations"}</p>
                  </div>
                  <div className={`text-3xl font-bold ${sentimentPct >= 60 ? "text-green-500" : sentimentPct >= 40 ? "text-amber-500" : "text-red-500"}`}>
                    {sentimentPct.toFixed(0)}%
                  </div>
                </div>
                <Progress value={sentimentPct} className="h-3" />
                <div className="flex gap-3 mt-3 text-xs">
                  {sentimentDist.map(s => (
                    <div key={s.sentiment} className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                      <span className="text-slate-500">{ar ? s.label : s.labelEn}: {s.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Intent + Sentiment Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Intent Distribution */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-blue-100 flex items-center justify-center">
                <MessageCircle size={13} className="text-blue-600" />
              </div>
              {t.intentAnalysis}
            </CardTitle>
            <p className="text-xs text-slate-400">{t.intentDesc}</p>
          </CardHeader>
          <CardContent>
            {intentDist.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">{t.noData}</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={intentDist} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey={ar ? "label" : "labelEn"} tick={{ fontSize: 11 }} width={110} />
                    <Tooltip formatter={(v) => [`${v} ${ar ? "محادثة" : "conversations"}`, ""]} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {intentDist.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-blue-700 font-medium">
                    💡 {ar
                      ? `${intentDist[0]?.label || ""} هو السبب الرئيسي للتواصل (${intentDist[0]?.count || 0} محادثة)`
                      : `${intentDist[0]?.labelEn || ""} is the top contact reason (${intentDist[0]?.count || 0} conversations)`
                    }
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Sentiment Donut */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-green-100 flex items-center justify-center">
                <ThumbsUp size={13} className="text-green-600" />
              </div>
              {t.sentimentAnalysis}
            </CardTitle>
            <p className="text-xs text-slate-400">{t.sentimentDesc}</p>
          </CardHeader>
          <CardContent>
            {sentimentDist.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">{t.noData}</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={sentimentDist} dataKey="count" nameKey={ar ? "label" : "labelEn"} cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                      {sentimentDist.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Legend formatter={(v) => <span className="text-xs text-slate-600">{v}</span>} />
                    <Tooltip formatter={(v) => [`${v} ${ar ? "محادثة" : "convs"}`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
                {kpi && kpi.negativeCount > 0 && (
                  <div className="mt-2 p-2 bg-red-50 rounded-lg">
                    <p className="text-xs text-red-600">
                      ⚠️ {ar ? `${kpi.negativeCount} محادثة سلبية تحتاج مراجعة` : `${kpi.negativeCount} negative conversations need review`}
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Menu Items + Topics ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Menu Items */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-orange-100 flex items-center justify-center">
                <UtensilsCrossed size={13} className="text-orange-600" />
              </div>
              {t.topMenuItems2}
            </CardTitle>
            <p className="text-xs text-slate-400">{t.topMenuDesc}</p>
          </CardHeader>
          <CardContent>
            {topMenuItems.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">{t.noData}</p>
            ) : (
              <div className="space-y-2">
                {topMenuItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-400 w-5 text-center">{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-700 truncate">{item.item}</span>
                        <span className="text-xs font-semibold text-orange-600 ml-2">{item.count}x</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-orange-400 to-orange-300 rounded-full"
                          style={{ width: `${(item.count / (topMenuItems[0]?.count || 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="mt-3 p-3 bg-orange-50 rounded-lg">
                  <p className="text-xs text-orange-700 font-medium">
                    💡 {ar
                      ? `"${topMenuItems[0]?.item}" الأكثر طلباً في المحادثات`
                      : `"${topMenuItems[0]?.item}" is the most requested item`
                    }
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Topics */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-purple-100 flex items-center justify-center">
                <TrendingUp size={13} className="text-purple-600" />
              </div>
              {t.topicsSection}
            </CardTitle>
            <p className="text-xs text-slate-400">{t.topicsDesc}</p>
          </CardHeader>
          <CardContent>
            {topTopics.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">{t.noData}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {topTopics.map((t2, i) => {
                  const size = i === 0 ? "text-base" : i < 3 ? "text-sm" : "text-xs";
                  const opacity = i === 0 ? "bg-purple-100 text-purple-700" : i < 4 ? "bg-purple-50 text-purple-600" : "bg-slate-100 text-slate-500";
                  return (
                    <span key={i} className={`px-3 py-1.5 rounded-full font-medium ${size} ${opacity} flex items-center gap-1`}>
                      {t2.topic}
                      <span className="text-xs opacity-60">({t2.count})</span>
                    </span>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Customer Behavior ── */}
      {behaviorDist.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-teal-100 flex items-center justify-center">
                <Users size={13} className="text-teal-600" />
              </div>
              {t.behaviorAnalysis}
            </CardTitle>
            <p className="text-xs text-slate-400">{t.behaviorDesc}</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {behaviorDist.map((b, i) => {
                const colors = ["bg-teal-50 text-teal-700", "bg-blue-50 text-blue-700", "bg-red-50 text-red-700", "bg-amber-50 text-amber-700", "bg-purple-50 text-purple-700", "bg-slate-50 text-slate-600"];
                return (
                  <div key={i} className={`rounded-xl p-3 text-center ${colors[i % colors.length]}`}>
                    <p className="text-2xl font-bold">{b.count}</p>
                    <p className="text-xs mt-1 font-medium">{ar ? b.label : b.category.replace(/_/g, " ")}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Urgent Conversations ── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-red-100 flex items-center justify-center">
              <AlertTriangle size={13} className="text-red-600" />
            </div>
            {t.urgentSection}
            {urgentConvs.length > 0 && (
              <Badge className="bg-red-100 text-red-700 border-0 text-xs">{urgentConvs.length}</Badge>
            )}
          </CardTitle>
          <p className="text-xs text-slate-400">{t.urgentDesc}</p>
        </CardHeader>
        <CardContent>
          {urgentConvs.length === 0 ? (
            <div className="flex items-center justify-center py-8 gap-2 text-green-600">
              <ThumbsUp size={18} />
              <p className="text-sm font-medium">{t.noUrgent}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {urgentConvs.map((conv, i) => {
                const urgency = String(conv.urgencyLevel || "low");
                const intent = String(conv.intent || "").replace(/"/g, "");
                const intentLabel = {
                  order_inquiry: ar ? "استفسار طلب" : "Order Inquiry",
                  complaint: ar ? "شكوى" : "Complaint",
                  delivery_issue: ar ? "مشكلة توصيل" : "Delivery Issue",
                  reservation: ar ? "حجز" : "Reservation",
                  support_request: ar ? "طلب دعم" : "Support",
                }[intent] || intent;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 cursor-pointer transition-all group"
                    onClick={() => { setSelectedConvId(Number(conv.conversationId)); setSelectedConvSource(undefined); }}
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-400 to-orange-400 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {String(conv.contactLabel || conv.contactPhone || "?")[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-slate-800">
                          {String(conv.contactLabel || conv.contactPhone || "—")}
                        </span>
                        <Badge className={`text-xs px-2 py-0 border ${urgencyColors[urgency]}`}>
                          {urgency === "critical" ? (ar ? "حرج" : "Critical") :
                           urgency === "high" ? (ar ? "عالي" : "High") :
                           urgency === "medium" ? (ar ? "متوسط" : "Medium") : (ar ? "منخفض" : "Low")}
                        </Badge>
                        {intentLabel && (
                          <Badge className="text-xs px-2 py-0 bg-slate-100 text-slate-600 border-0 flex items-center gap-1">
                            {intentIcons[intent]}
                            {intentLabel}
                          </Badge>
                        )}
                        {String(conv.requiresEscalation) === "1" && (
                          <Badge className="text-xs px-2 py-0 bg-red-100 text-red-700 border-0">
                            {ar ? "يحتاج تدخل" : "Needs Escalation"}
                          </Badge>
                        )}
                      </div>
                        {conv.impressionSummary ? (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{String(conv.impressionSummary)}</p>
                        ) : null}
                    </div>
                    <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 flex-shrink-0 mt-1" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── All Conversations with AI Analysis ── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center">
                  <MessageCircle size={13} className="text-slate-600" />
                </div>
                {t.allConvs}
                <span className="text-xs text-slate-400 font-normal">— {t.allConvsDesc}</span>
              </CardTitle>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => refetchConvs()}>
              <RefreshCw size={11} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {convsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          ) : convs.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">{t.noData}</p>
          ) : (
            <>
              <div className="divide-y divide-slate-50">
                {convs.map((conv) => {
                  const sentiment = String(conv.sentiment || "");
                  const urgency = String(conv.urgencyLevel || "");
                  const intent = String(conv.intent || "").replace(/"/g, "");
                  return (
                    <div
                      key={String(conv.uid || conv.convId || conv.id)}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors group"
                      onClick={() => { setSelectedConvId(Number(conv.convId || conv.id)); setSelectedConvSource((conv.source as "wa" | "wh") || undefined); }}
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {String(conv.contactLabel || conv.contactPhone || "?")[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-medium text-sm text-slate-800 truncate">
                            {String(conv.contactLabel || conv.contactPhone || "—")}
                          </span>
                          {sentiment && (
                            <span className="text-xs" style={{ color: sentimentColors[sentiment] }}>
                              {sentiment === "positive" ? <ThumbsUp size={11} /> : sentiment === "negative" ? <ThumbsDown size={11} /> : <Minus size={11} />}
                            </span>
                          )}
                          {urgency && urgency !== "low" && (
                            <Badge className={`text-xs px-1.5 py-0 border ${urgencyColors[urgency]}`}>
                              {urgency === "critical" ? (ar ? "حرج" : "Critical") :
                               urgency === "high" ? (ar ? "عالي" : "High") : (ar ? "متوسط" : "Medium")}
                            </Badge>
                          )}
                          {intent && intent !== "other" && intent !== "greeting" && (
                            <span className="text-xs text-slate-400 flex items-center gap-0.5">
                              {intentIcons[intent]}
                            </span>
                          )}
                        </div>
                        {conv.impressionSummary ? (
                          <p className="text-xs text-slate-400 truncate">{String(conv.impressionSummary)}</p>
                        ) : null}
                        <div className="flex items-center gap-3 mt-1">
                          {conv.satisfactionScore ? (
                            <SatisfactionStars score={Number(conv.satisfactionScore)} />
                          ) : null}
                          {conv.messageCount ? (
                            <span className="text-xs text-slate-300">{String(conv.messageCount)} {ar ? "رسالة" : "msgs"}</span>
                          ) : null}
                        </div>
                      </div>
                      <ChevronRight size={13} className="text-slate-200 group-hover:text-slate-400 flex-shrink-0 mt-1.5" />
                    </div>
                  );
                })}
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-50">
                <span className="text-xs text-slate-400">
                  {convPage * convLimit + 1}–{Math.min((convPage + 1) * convLimit, convsTotal)} {ar ? "من" : "of"} {convsTotal}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={convPage === 0} onClick={() => setConvPage(p => p - 1)}>
                    {t.prev}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={(convPage + 1) * convLimit >= convsTotal} onClick={() => setConvPage(p => p + 1)}>
                    {t.next}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

    </div>

    {/* Conversation Detail Popup */}
    <ConversationDetailDialog
      conversationId={selectedConvId}
      source={selectedConvSource}
      onClose={() => { setSelectedConvId(null); setSelectedConvSource(undefined); }}
      ar={ar}
    />
    </>
  );
}
