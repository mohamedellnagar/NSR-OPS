import { useState, useMemo, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Play,
  BarChart3,
  ChevronRight,
  ArrowLeft,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  Filter,
  Star,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ComparisonSession = {
  id: number;
  name: string;
  status: string;
  matchedGroupCount: number | null;
  myRestaurantSessionId: number;
  myRestaurantName: string;
  competitorNames: (string | null)[];
  createdAt: Date;
};

type RestaurantInfo = {
  id: number;
  restaurantName: string | null;
  restaurantNameAr: string | null;
  restaurantLogoUrl: string | null;
  platform: string;
  isMyRestaurant?: boolean;
};

type MatchItem = {
  sessionId: number;
  menuItemId: number;
  priceSnapshot: number;
  currency: string;
  itemName: string | null;
  itemNameAr: string | null;
  itemImageUrl: string | null;
  restaurant?: RestaurantInfo;
};

type MatchGroup = {
  id: number;
  unifiedName: string;
  unifiedNameAr: string | null;
  unifiedCategory: string | null;
  confidenceScore: number | null;
  matchReason?: string | null;
  items: MatchItem[];
  minPrice: number;
  maxPrice: number;
  priceDiff: number;
  priceDiffPct: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "في الانتظار", variant: "secondary" },
    processing: { label: "جارٍ المعالجة", variant: "default" },
    completed: { label: "مكتمل", variant: "default" },
    failed: { label: "فشل", variant: "destructive" },
  };
  const s = map[status] || { label: status, variant: "outline" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function PriceCell({
  price,
  isMin,
  isMax,
  isMyRestaurant,
  currency,
}: {
  price?: number;
  isMin: boolean;
  isMax: boolean;
  isMyRestaurant: boolean;
  currency: string;
}) {
  if (price === undefined || price === 0) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  let bg = "";
  let icon = null;
  if (isMin) {
    bg = "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    icon = <TrendingDown className="w-3 h-3 inline mr-1" />;
  } else if (isMax) {
    bg = "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    icon = <TrendingUp className="w-3 h-3 inline mr-1" />;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium text-sm ${bg} ${
        isMyRestaurant ? "ring-2 ring-blue-400 ring-offset-1" : ""
      }`}
    >
      {icon}
      {price.toFixed(2)} {currency}
      {isMyRestaurant && <Star className="w-3 h-3 text-blue-500 fill-blue-500" />}
    </span>
  );
}

// ─── New Comparison Dialog ────────────────────────────────────────────────────

function NewComparisonDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [myRestaurantId, setMyRestaurantId] = useState<string>("");
  const [selectedCompetitors, setSelectedCompetitors] = useState<number[]>([]);
  const { data: importSessions } = trpc.menuImport.listSessions.useQuery();
  const createMutation = trpc.priceComparison.create.useMutation({
    onSuccess: () => {
      toast.success("تم إنشاء المقارنة", { description: "يمكنك الآن تشغيل AI لمطابقة الأصناف" });
      setOpen(false);
      setName("");
      setMyRestaurantId("");
      setSelectedCompetitors([]);
      onCreated();
    },
    onError: (err) => toast.error(err.message),
  });

  // Accept sessions with status 'completed' or 'done' (both indicate successful import)
  const savedSessions = importSessions?.filter((s: any) =>
    s.status === "completed" || s.status === "done"
  ) || [];

  const availableCompetitors = savedSessions.filter(
    (s: any) => s.id !== parseInt(myRestaurantId)
  );

  const toggleCompetitor = (id: number) => {
    setSelectedCompetitors((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCreate = () => {
    if (!name.trim()) return void toast.error("أدخل اسم المقارنة");
    if (!myRestaurantId) return void toast.error("اختر مطعمك");
    if (selectedCompetitors.length === 0)
      return void toast.error("اختر مطعماً منافساً واحداً على الأقل");

    createMutation.mutate({
      name: name.trim(),
      myRestaurantSessionId: parseInt(myRestaurantId),
      competitorSessionIds: selectedCompetitors,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          مقارنة جديدة
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>إنشاء مقارنة أسعار جديدة</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label>اسم المقارنة</Label>
            <Input
              placeholder="مثال: مقارنة مع المنافسين - أبريل 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label>مطعمي (المطعم الأساسي)</Label>
            <Select value={myRestaurantId} onValueChange={setMyRestaurantId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="اختر مطعمك..." />
              </SelectTrigger>
              <SelectContent>
                {savedSessions.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.restaurantName || "مطعم"} — {s.itemCount} صنف
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {myRestaurantId && (
            <div>
              <Label>المطاعم المنافسة (اختر 1-5)</Label>
              <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                {availableCompetitors.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    لا توجد قوائم أخرى محفوظة. استورد قوائم المنافسين أولاً.
                  </p>
                ) : (
                  availableCompetitors.map((s: any) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`comp-${s.id}`}
                        checked={selectedCompetitors.includes(s.id)}
                        onCheckedChange={() => toggleCompetitor(s.id)}
                        disabled={
                          !selectedCompetitors.includes(s.id) && selectedCompetitors.length >= 5
                        }
                      />
                      <label htmlFor={`comp-${s.id}`} className="text-sm cursor-pointer flex-1">
                        {s.restaurantName || "مطعم"}{" "}
                        <span className="text-muted-foreground">— {s.itemCount} صنف</span>
                      </label>
                    </div>
                  ))
                )}
              </div>
              {selectedCompetitors.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedCompetitors.length} مطعم مختار
                </p>
              )}
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            إنشاء المقارنة
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Comparison Result View ───────────────────────────────────────────────────

function ComparisonResultView({
  sessionId,
  onBack,
}: {
  sessionId: number;
  onBack: () => void;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data, isLoading, refetch } = trpc.priceComparison.getResult.useQuery(
    { comparisonSessionId: sessionId },
    { staleTime: 0 }
  );

  // Polling مخصص باستخدام useEffect - يعمل فقط عند status === processing
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = () => {
    if (pollingRef.current) return; // لا تبدأ مرتين
    pollingRef.current = setInterval(() => {
      refetch();
    }, 4000);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  // مراقبة تغيير status
  useEffect(() => {
    const status = data?.session?.status;
    if (status === "processing") {
      startPolling();
    } else {
      stopPolling();
    }
    return () => stopPolling(); // cleanup عند unmount
  }, [data?.session?.status]);

  const runMatchingMutation = trpc.priceComparison.runMatching.useMutation({
    onSuccess: () => {
      // بدء polling فوراً بعد تشغيل AI
      setTimeout(() => refetch(), 1500);
    },
    onError: (err) => console.error(err),
  });

  const categories = useMemo(() => {
    if (!data?.groups) return [];
    return Array.from(new Set(data.groups.map((g: MatchGroup) => g.unifiedCategory || "عام")));
  }, [data?.groups]);

  const filteredGroups = useMemo(() => {
    if (!data?.groups) return [];
    return (data.groups as MatchGroup[]).filter((g) => {
      const matchesSearch =
        !search ||
        g.unifiedName.toLowerCase().includes(search.toLowerCase()) ||
        (g.unifiedNameAr || "").includes(search);
      const matchesCategory =
        categoryFilter === "all" || (g.unifiedCategory || "عام") === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [data?.groups, search, categoryFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return null;

  const { session, restaurants } = data;
  const myRestaurant = (restaurants as RestaurantInfo[]).find((r) => r.isMyRestaurant);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          رجوع
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-bold">{session.name}</h2>
          <p className="text-sm text-muted-foreground">
            مطعمي: <strong>{session.myRestaurantName}</strong> |{" "}
            {(restaurants as RestaurantInfo[]).filter((r) => !r.isMyRestaurant).map((r) => r.restaurantName).join("، ")}
          </p>
        </div>
        {session.status !== "completed" && (
          <Button
            onClick={() => runMatchingMutation.mutate({ comparisonSessionId: sessionId })}
            disabled={runMatchingMutation.isPending || session.status === "processing"}
          >
            {runMatchingMutation.isPending || session.status === "processing" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                AI يعمل...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                تشغيل AI للمطابقة
              </>
            )}
          </Button>
        )}
        {session.status === "completed" && (
          <Button
            variant="outline"
            onClick={() => runMatchingMutation.mutate({ comparisonSessionId: sessionId })}
            disabled={runMatchingMutation.isPending}
          >
            {runMatchingMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            إعادة المطابقة
          </Button>
        )}
      </div>

      {/* Stats */}
      {session.status === "completed" && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-2xl font-bold">{session.matchedGroupCount}</p>
              <p className="text-xs text-muted-foreground">صنف مطابق</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-2xl font-bold">{(restaurants as RestaurantInfo[]).length}</p>
              <p className="text-xs text-muted-foreground">مطاعم</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-2xl font-bold text-orange-500">
                {filteredGroups.filter((g) => g.priceDiffPct > 20).length}
              </p>
              <p className="text-xs text-muted-foreground">فرق سعر &gt;20%</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pending state */}
      {session.status === "pending" && (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-lg font-medium">جاهز للمقارنة</p>
            <p className="text-sm text-muted-foreground mt-1">
              اضغط "تشغيل AI للمطابقة" ليقوم الذكاء الاصطناعي بمطابقة الأصناف المتشابهة تلقائياً
            </p>
          </CardContent>
        </Card>
      )}

      {/* Processing state */}
      {(session.status === "processing" || runMatchingMutation.isPending) && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="py-10 text-center space-y-3">
            <div className="relative inline-flex">
              <Loader2 className="w-14 h-14 text-blue-500 animate-spin" />
            </div>
            <div>
              <p className="text-lg font-semibold text-blue-700">AI يحلل ويطابق الأصناف...</p>
              <p className="text-sm text-muted-foreground mt-1">
                الذكاء الاصطناعي يعمل في الخلفية — ستتحدّث الصفحة تلقائياً عند الانتهاء
              </p>
              <p className="text-xs text-blue-500 mt-2 font-medium">
                • مطابقة الفئات • تحليل الأسماء • مقارنة الأسعار
              </p>
            </div>
            <div className="w-full max-w-xs mx-auto bg-blue-100 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: "60%" }} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results table */}
      {session.status === "completed" && filteredGroups.length > 0 && (
        <>
          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث في الأصناف..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="كل الفئات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفئات</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Legend */}
          <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-green-200 inline-block" /> أقل سعر
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-red-200 inline-block" /> أعلى سعر
            </span>
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3 text-blue-500 fill-blue-500" /> مطعمي
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-48 text-right">الصنف</TableHead>
                  <TableHead className="text-right">الفئة</TableHead>
                  {(restaurants as RestaurantInfo[]).map((r) => (
                    <TableHead key={r.id} className="text-center min-w-32">
                      <div className="flex flex-col items-center gap-1">
                        {r.restaurantLogoUrl && (
                          <img
                            src={r.restaurantLogoUrl}
                            alt={r.restaurantName || ""}
                            className="w-6 h-6 rounded-full object-cover"
                            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                          />
                        )}
                        <span className={`text-xs ${r.isMyRestaurant ? "font-bold text-blue-600" : ""}`}>
                          {r.isMyRestaurant ? "⭐ " : ""}
                          {r.restaurantName || "مطعم"}
                        </span>
                      </div>
                    </TableHead>
                  ))}
                  <TableHead className="text-center">فرق السعر</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.map((group) => {
                  // Build price map: sessionId → item
                  const priceMap = new Map<number, MatchItem>(
                    group.items.map((item) => [item.sessionId, item])
                  );

                  return (
                    <TableRow key={group.id} className="hover:bg-muted/30">
                      <TableCell className="text-right">
                        <div>
                          <p className="font-medium text-sm">{group.unifiedNameAr || group.unifiedName}</p>
                          {group.unifiedNameAr && group.unifiedName !== group.unifiedNameAr && (
                            <p className="text-xs text-muted-foreground">{group.unifiedName}</p>
                          )}
                          {group.matchReason && (
                            <p className="text-xs text-blue-500/70 mt-0.5 italic">{group.matchReason}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs bg-secondary px-2 py-0.5 rounded-full">
                          {group.unifiedCategory || "عام"}
                        </span>
                      </TableCell>
                      {(restaurants as RestaurantInfo[]).map((r) => {
                        const item = priceMap.get(r.id);
                        const isMin = item?.priceSnapshot === group.minPrice && group.minPrice > 0;
                        const isMax = item?.priceSnapshot === group.maxPrice && group.minPrice !== group.maxPrice;
                        return (
                          <TableCell key={r.id} className="text-center">
                            <PriceCell
                              price={item?.priceSnapshot}
                              isMin={isMin}
                              isMax={isMax}
                              isMyRestaurant={r.isMyRestaurant ?? false}
                              currency={item?.currency || "AED"}
                            />
                            {item?.itemName && (
                              <p className="text-xs text-muted-foreground mt-0.5 max-w-32 truncate mx-auto" title={item.itemName}>
                                "{item.itemName}"
                              </p>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center">
                        {group.priceDiff > 0 ? (
                          <span
                            className={`text-xs font-medium ${
                              group.priceDiffPct > 30
                                ? "text-red-600"
                                : group.priceDiffPct > 15
                                ? "text-orange-500"
                                : "text-muted-foreground"
                            }`}
                          >
                            {group.priceDiffPct}%
                          </span>
                        ) : (
                          <Minus className="w-3 h-3 mx-auto text-muted-foreground" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PriceComparisonPage() {
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  const { data: sessions, isLoading, refetch } = trpc.priceComparison.list.useQuery();

  const deleteMutation = trpc.priceComparison.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف المقارنة");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  if (selectedSessionId !== null) {
    return (
      <div className="p-6">
        <ComparisonResultView
          sessionId={selectedSessionId}
          onBack={() => setSelectedSessionId(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">مقارنة أسعار القوائم</h1>
          <p className="text-muted-foreground text-sm mt-1">
            قارن أسعار مطعمك مع المنافسين — AI يطابق الأصناف المتشابهة تلقائياً
          </p>
        </div>
        <NewComparisonDialog onCreated={refetch} />
      </div>

      {/* Sessions list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !sessions || sessions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BarChart3 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">لا توجد مقارنات بعد</h3>
            <p className="text-muted-foreground text-sm mb-4">
              أنشئ مقارنة جديدة لتحليل أسعار مطعمك مقارنةً بالمنافسين
            </p>
            <NewComparisonDialog onCreated={refetch} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {(sessions as ComparisonSession[]).map((session) => (
            <Card
              key={session.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSelectedSessionId(session.id)}
            >
              <CardContent className="py-4 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{session.name}</h3>
                      {statusBadge(session.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <Star className="w-3 h-3 inline text-blue-500 fill-blue-500 mr-1" />
                      {session.myRestaurantName}
                      {session.competitorNames.length > 0 && (
                        <> vs {session.competitorNames.slice(0, 3).join("، ")}</>
                      )}
                    </p>
                    {session.status === "completed" && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {session.matchedGroupCount} صنف مطابق
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("هل تريد حذف هذه المقارنة؟")) {
                          deleteMutation.mutate({ id: session.id });
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
