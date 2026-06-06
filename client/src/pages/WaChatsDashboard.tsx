import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageCircle, TrendingUp, Users, ArrowDownLeft, ArrowUpRight, Brain, AlertCircle, CheckCircle2, Lightbulb, BarChart2, Clock } from "lucide-react";
import { toast } from "sonner";

// Simple bar chart component
function HourlyBar({ data }: { data: { hour: number; count: number }[] }) {
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">لا توجد بيانات</p>;
  const max = Math.max(...data.map((d) => d.count), 1);
  const allHours = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: data.find((d) => d.hour === i)?.count ?? 0,
  }));
  return (
    <div className="flex items-end gap-0.5 h-24 w-full" dir="ltr">
      {allHours.map((d) => (
        <div key={d.hour} className="flex flex-col items-center flex-1 gap-0.5 group relative">
          <div
            className="w-full rounded-t bg-blue-400 hover:bg-blue-500 transition-colors cursor-default"
            style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? "4px" : "0" }}
          />
          {/* Tooltip */}
          {d.count > 0 && (
            <div className="absolute bottom-full mb-1 hidden group-hover:flex bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
              {d.hour}:00 — {d.count} رسالة
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function HourLabels() {
  return (
    <div className="flex w-full" dir="ltr">
      {[0, 6, 12, 18, 23].map((h) => (
        <div key={h} className="text-[9px] text-muted-foreground" style={{ marginLeft: h === 0 ? 0 : `${(h / 24) * 100}%`, position: h === 0 ? "relative" : "absolute" }}>
          {h}:00
        </div>
      ))}
    </div>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  if (sentiment === "إيجابي" || sentiment === "positive")
    return <Badge className="bg-green-100 text-green-700 border-green-200">😊 إيجابي</Badge>;
  if (sentiment === "سلبي" || sentiment === "negative")
    return <Badge className="bg-red-100 text-red-700 border-red-200">😟 سلبي</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">😐 محايد</Badge>;
}

export default function WaChatsDashboard() {
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [selectedNumberId, setSelectedNumberId] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [analysis, setAnalysis] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const { data: numbers = [], isLoading: numbersLoading } = trpc.waNumbers.list.useQuery();

  // Auto-select first number
  useMemo(() => {
    if (numbers.length > 0 && !selectedNumberId) {
      setSelectedNumberId(numbers[0].id);
    }
  }, [numbers]);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = trpc.waNumbers.getDailyStats.useQuery(
    { numberId: selectedNumberId!, date },
    { enabled: !!selectedNumberId }
  );

  const analyzeMutation = trpc.waNumbers.analyzeDay.useMutation({
    onSuccess: (data) => {
      setAnalysis(data);
      setAnalyzing(false);
    },
    onError: (e) => {
      toast.error("فشل التحليل: " + e.message);
      setAnalyzing(false);
    },
  });

  const handleAnalyze = () => {
    if (!selectedNumberId) return;
    setAnalyzing(true);
    setAnalysis(null);
    analyzeMutation.mutate({ numberId: selectedNumberId, date });
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-blue-500" />
            تحليل محادثات واتساب
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">تحليل يومي شامل للمحادثات بالذكاء الاصطناعي</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Number selector */}
          {numbersLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            numbers.map((num) => (
              <button
                key={num.id}
                onClick={() => { setSelectedNumberId(num.id); setAnalysis(null); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedNumberId === num.id
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-background text-foreground border-border hover:border-blue-400"
                }`}
              >
                {num.label}
              </button>
            ))
          )}
          {/* Date picker */}
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => { setDate(e.target.value); setAnalysis(null); }}
            className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background"
          />
        </div>
      </div>

      {/* Stats Cards */}
      {statsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : stats ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <MessageCircle className="w-5 h-5 text-blue-500" />
                  <span className="text-xs text-blue-600 font-medium">إجمالي</span>
                </div>
                <div className="text-3xl font-bold text-blue-700">{stats.total}</div>
                <div className="text-xs text-blue-600 mt-1">رسالة اليوم</div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-gradient-to-br from-green-50 to-green-100/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <ArrowDownLeft className="w-5 h-5 text-green-500" />
                  <span className="text-xs text-green-600 font-medium">واردة</span>
                </div>
                <div className="text-3xl font-bold text-green-700">{stats.incoming}</div>
                <div className="text-xs text-green-600 mt-1">رسالة من العملاء</div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-purple-100/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <ArrowUpRight className="w-5 h-5 text-purple-500" />
                  <span className="text-xs text-purple-600 font-medium">صادرة</span>
                </div>
                <div className="text-3xl font-bold text-purple-700">{stats.outgoing}</div>
                <div className="text-xs text-purple-600 mt-1">ردود المطعم</div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-gradient-to-br from-orange-50 to-orange-100/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Users className="w-5 h-5 text-orange-500" />
                  <span className="text-xs text-orange-600 font-medium">محادثات</span>
                </div>
                <div className="text-3xl font-bold text-orange-700">{stats.activeConversations}</div>
                <div className="text-xs text-orange-600 mt-1">عميل نشط</div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Hourly Distribution */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" />
                  توزيع الرسائل بالساعة
                </CardTitle>
                <CardDescription className="text-xs">أوقات الذروة في التواصل مع العملاء</CardDescription>
              </CardHeader>
              <CardContent>
                <HourlyBar data={stats.hourlyDistribution} />
                <div className="relative mt-1">
                  <div className="flex justify-between text-[9px] text-muted-foreground" dir="ltr">
                    <span>12 ص</span>
                    <span>6 ص</span>
                    <span>12 م</span>
                    <span>6 م</span>
                    <span>11 م</span>
                  </div>
                </div>
                {stats.hourlyDistribution.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    ذروة التواصل عند الساعة{" "}
                    <span className="font-semibold text-foreground">
                      {stats.hourlyDistribution.reduce((a, b) => (a.count > b.count ? a : b)).hour}:00
                    </span>
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Top Contacts */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  أكثر العملاء تواصلاً
                </CardTitle>
                <CardDescription className="text-xs">العملاء الأكثر إرسالاً للرسائل اليوم</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.topContacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">لا توجد بيانات</p>
                ) : (
                  <div className="space-y-2">
                    {stats.topContacts.slice(0, 6).map((c: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{c.name}</div>
                          <div className="h-1.5 bg-muted rounded-full mt-0.5">
                            <div
                              className="h-1.5 bg-green-400 rounded-full"
                              style={{ width: `${(c.msgCount / stats.topContacts[0].msgCount) * 100}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-green-600">{c.msgCount}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* AI Analysis Button */}
          <Card className="border-0 shadow-sm bg-gradient-to-r from-indigo-50 to-purple-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                    <Brain className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">تحليل ذكي للمحادثات</div>
                    <div className="text-xs text-muted-foreground">
                      يحلل الذكاء الاصطناعي جميع رسائل اليوم ويستخرج الأنماط والشكاوى والتوصيات
                    </div>
                  </div>
                </div>
                <Button
                  onClick={handleAnalyze}
                  disabled={analyzing || stats.total === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin ml-2" />
                      جاري التحليل...
                    </>
                  ) : (
                    <>
                      <Brain className="w-4 h-4 ml-2" />
                      تحليل بالذكاء الاصطناعي
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* AI Analysis Results */}
          {analysis && (
            <div className="space-y-4">
              {/* Summary + Sentiment */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="sm:col-span-2 border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">ملخص اليوم</CardTitle>
                      <SentimentBadge sentiment={analysis.sentiment} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-foreground">{analysis.summary}</p>
                    {analysis.sentimentExplanation && (
                      <p className="text-xs text-muted-foreground mt-2 border-t pt-2">{analysis.sentimentExplanation}</p>
                    )}
                  </CardContent>
                </Card>

                {/* Topics */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">أبرز الموضوعات</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analysis.topics.length === 0 ? (
                      <p className="text-xs text-muted-foreground">لا توجد موضوعات محددة</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.topics.map((t: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Complaints + Requests + Recommendations */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Complaints */}
                <Card className="border-0 shadow-sm border-l-4 border-l-red-400">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-600">
                      <AlertCircle className="w-4 h-4" />
                      الشكاوى ({analysis.complaints.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analysis.complaints.length === 0 ? (
                      <div className="flex items-center gap-2 text-green-600 text-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>لا توجد شكاوى 🎉</span>
                      </div>
                    ) : (
                      <ul className="space-y-1.5">
                        {analysis.complaints.map((c: string, i: number) => (
                          <li key={i} className="text-xs flex items-start gap-1.5">
                            <span className="text-red-400 mt-0.5">•</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                {/* Requests */}
                <Card className="border-0 shadow-sm border-l-4 border-l-blue-400">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2 text-blue-600">
                      <MessageCircle className="w-4 h-4" />
                      الطلبات والاستفسارات ({analysis.requests.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analysis.requests.length === 0 ? (
                      <p className="text-xs text-muted-foreground">لا توجد طلبات محددة</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {analysis.requests.map((r: string, i: number) => (
                          <li key={i} className="text-xs flex items-start gap-1.5">
                            <span className="text-blue-400 mt-0.5">•</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                {/* Recommendations */}
                <Card className="border-0 shadow-sm border-l-4 border-l-yellow-400">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2 text-yellow-600">
                      <Lightbulb className="w-4 h-4" />
                      توصيات للتحسين
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!analysis.recommendations || analysis.recommendations.length === 0 ? (
                      <p className="text-xs text-muted-foreground">لا توجد توصيات</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {analysis.recommendations.map((r: string, i: number) => (
                          <li key={i} className="text-xs flex items-start gap-1.5">
                            <span className="text-yellow-500 mt-0.5">💡</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>اختر رقماً وتاريخاً لعرض الإحصائيات</p>
        </div>
      )}
    </div>
  );
}
