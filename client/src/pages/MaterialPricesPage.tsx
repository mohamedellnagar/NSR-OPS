import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  BarChart2,
  Calendar,
  Package,
  ArrowUpDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Material {
  id: number;
  name: string;
  nameAr?: string | null;
  unit: string;
  lastPurchasePrice?: string | null;
}

interface PriceRecord {
  materialId: number;
  materialName: string;
  unitPrice: number;
  quantity: number;
  invoiceDate: string;
  supplierName: string;
  invoiceNumber: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("ar-AE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatPrice(n: number) {
  return n.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

function getMonthRange(offset = 0) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + offset;
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

// ─── Color palette for chart lines ───────────────────────────────────────────
const COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed",
  "#0891b2", "#db2777", "#65a30d", "#ea580c", "#6366f1",
];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MaterialPricesPage() {
  const [search, setSearch] = useState("");
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<number[]>([]);
  const [startDate, setStartDate] = useState(getMonthRange(0).start);
  const [endDate, setEndDate] = useState(getMonthRange(0).end);
  const [sortBy, setSortBy] = useState<"name" | "change" | "price">("name");

  // جلب قائمة المواد
  const { data: materialsData = [] } = trpc.materials.list.useQuery();
  const materials = materialsData as Material[];

  // جلب تاريخ الأسعار
  const { data: historyData, isLoading } = trpc.materials.priceHistory.useQuery(
    {
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate + "T23:59:59").toISOString(),
      materialIds: selectedMaterialIds.length > 0 ? selectedMaterialIds : undefined,
    },
    { enabled: !!startDate && !!endDate }
  );

  const priceHistory: PriceRecord[] = historyData?.priceHistory ?? [];
  const historyMaterials: Material[] = historyData?.materials ?? [];

  // فلترة المواد بالبحث
  const filteredMaterials = useMemo(() => {
    if (!search) return materials;
    const q = search.toLowerCase();
    return materials.filter(m => (m.nameAr || m.name).toLowerCase().includes(q));
  }, [materials, search]);

  // بناء بيانات الرسم البياني لكل مادة محددة
  const chartData = useMemo(() => {
    if (!priceHistory.length) return [];
    // جمع كل التواريخ الفريدة
    const allDates = Array.from(new Set(priceHistory.map(r => r.invoiceDate.slice(0, 10)))).sort();
    return allDates.map(date => {
      const entry: Record<string, any> = { date: formatDate(date) };
      historyMaterials.forEach(m => {
        const records = priceHistory.filter(
          r => r.materialId === m.id && r.invoiceDate.slice(0, 10) === date
        );
        if (records.length > 0) {
          // آخر سعر في هذا اليوم
          entry[`m_${m.id}`] = records[records.length - 1].unitPrice;
        }
      });
      return entry;
    });
  }, [priceHistory, historyMaterials]);

  // حساب إحصائيات كل مادة
  type StatItem = {
    material: Material;
    records: PriceRecord[];
    minPrice: number;
    maxPrice: number;
    firstPrice: number;
    lastPrice: number;
    change: number;
    avgPrice: number;
    color: string;
  };
  const materialStats = useMemo((): StatItem[] => {
    return historyMaterials.map((m, idx): StatItem | null => {
      const records = priceHistory.filter(r => r.materialId === m.id);
      if (!records.length) return null;
      const prices = records.map(r => r.unitPrice);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const firstPrice = prices[0];
      const lastPrice = prices[prices.length - 1];
      const change = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      return {
        material: m,
        records,
        minPrice,
        maxPrice,
        firstPrice,
        lastPrice,
        change,
        avgPrice,
        color: COLORS[idx % COLORS.length],
      };
    }).filter((x): x is StatItem => x !== null);
  }, [historyMaterials, priceHistory]);

  // ترتيب الإحصائيات
  const sortedStats = useMemo((): StatItem[] => {
    return [...materialStats].sort((a, b) => {
      if (sortBy === "change") return Math.abs(b.change) - Math.abs(a.change);
      if (sortBy === "price") return b.lastPrice - a.lastPrice;
      return (a.material.nameAr || a.material.name).localeCompare(b.material.nameAr || b.material.name, "ar");
    });
  }, [materialStats, sortBy]);

  const toggleMaterial = (id: number) => {
    setSelectedMaterialIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const setQuickRange = (offset: number) => {
    const r = getMonthRange(offset);
    setStartDate(r.start);
    setEndDate(r.end);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">تاريخ أسعار المواد الخام</h1>
            <p className="text-sm text-muted-foreground">تتبع تغيرات أسعار الشراء على مدار الفترة الزمنية</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* Date range */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">الفترة:</span>
            </div>
            <Input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-40 text-sm"
            />
            <span className="text-muted-foreground text-sm">إلى</span>
            <Input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-40 text-sm"
            />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setQuickRange(0)}>هذا الشهر</Button>
              <Button variant="outline" size="sm" onClick={() => setQuickRange(-1)}>الشهر الماضي</Button>
              <Button variant="outline" size="sm" onClick={() => {
                const now = new Date();
                setStartDate(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10));
                setEndDate(new Date(now.getFullYear(), 11, 31).toISOString().slice(0, 10));
              }}>هذا العام</Button>
            </div>
          </div>

          {/* Material filter */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">تصفية المواد:</span>
            </div>
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث في المواد..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-9 text-sm"
              />
            </div>
            {selectedMaterialIds.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedMaterialIds([])}>
                إلغاء التحديد ({selectedMaterialIds.length})
              </Button>
            )}
          </div>

          {/* Material chips */}
          {search && (
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {filteredMaterials.slice(0, 50).map(m => (
                <button
                  key={m.id}
                  onClick={() => toggleMaterial(m.id)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    selectedMaterialIds.includes(m.id)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:border-primary"
                  }`}
                >
                  {m.nameAr || m.name}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full ml-3" />
          جاري تحميل البيانات...
        </div>
      )}

      {!isLoading && sortedStats.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">لا توجد بيانات أسعار في هذه الفترة</p>
          <p className="text-sm mt-1">جرب تغيير الفترة الزمنية أو تحديد مواد أخرى</p>
        </div>
      )}

      {/* Summary cards */}
      {sortedStats.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {sortedStats.length} مادة لديها بيانات أسعار
            </h2>
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">ترتيب:</span>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                <SelectTrigger className="w-36 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">الاسم</SelectItem>
                  <SelectItem value="change">أعلى تغيير</SelectItem>
                  <SelectItem value="price">أعلى سعر</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedStats.map(stat => (
              <Card
                key={stat.material.id}
                className="border hover:shadow-md transition-shadow cursor-pointer"
                style={{ borderRightColor: stat.color, borderRightWidth: 3 }}
              >
                <CardContent className="pt-4 pb-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{stat.material.nameAr || stat.material.name}</p>
                      <p className="text-xs text-muted-foreground">{stat.material.unit}</p>
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                      stat.change > 0
                        ? "bg-red-50 text-red-600 dark:bg-red-950/30"
                        : stat.change < 0
                        ? "bg-green-50 text-green-600 dark:bg-green-950/30"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {stat.change > 0 ? <TrendingUp className="w-3 h-3" /> : stat.change < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                      {Math.abs(stat.change).toFixed(1)}%
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted/50 rounded p-2">
                      <p className="text-muted-foreground mb-0.5">آخر سعر</p>
                      <p className="font-bold text-sm">{formatPrice(stat.lastPrice)} د.إ</p>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <p className="text-muted-foreground mb-0.5">متوسط</p>
                      <p className="font-bold text-sm">{formatPrice(stat.avgPrice)} د.إ</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-950/20 rounded p-2">
                      <p className="text-muted-foreground mb-0.5">أدنى</p>
                      <p className="font-bold text-sm text-green-700 dark:text-green-400">{formatPrice(stat.minPrice)}</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-950/20 rounded p-2">
                      <p className="text-muted-foreground mb-0.5">أعلى</p>
                      <p className="font-bold text-sm text-red-700 dark:text-red-400">{formatPrice(stat.maxPrice)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{stat.records.length} عملية شراء</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Chart */}
          {chartData.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  منحنى تغير الأسعار
                </CardTitle>
                <p className="text-xs text-muted-foreground">يعرض تغير سعر الشراء لكل مادة على مدار الفترة المحددة</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={380}>
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        const matId = parseInt(name.replace("m_", ""));
                        const mat = historyMaterials.find(m => m.id === matId);
                        return [`${formatPrice(value)} د.إ`, mat?.nameAr || mat?.name || name];
                      }}
                    />
                    <Legend
                      formatter={(value: string) => {
                        const matId = parseInt(value.replace("m_", ""));
                        const mat = historyMaterials.find(m => m.id === matId);
                        return mat?.nameAr || mat?.name || value;
                      }}
                    />
                    {sortedStats.map(stat => (
                      <Line
                        key={stat.material.id}
                        type="monotone"
                        dataKey={`m_${stat.material.id}`}
                        stroke={stat.color}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Detailed table per material */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">تفاصيل الأسعار لكل مادة</h2>
            {sortedStats.map(stat => (
              <Card key={stat.material.id} className="overflow-hidden">
                <CardHeader className="py-3 px-4" style={{ borderRightColor: stat.color, borderRightWidth: 3 }}>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">
                      {stat.material.nameAr || stat.material.name}
                      <span className="text-muted-foreground font-normal mr-2 text-xs">({stat.material.unit})</span>
                    </CardTitle>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>أدنى: <strong className="text-green-600">{formatPrice(stat.minPrice)}</strong></span>
                      <span>أعلى: <strong className="text-red-600">{formatPrice(stat.maxPrice)}</strong></span>
                      <span>متوسط: <strong>{formatPrice(stat.avgPrice)}</strong></span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">التاريخ</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">المورد</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">رقم الفاتورة</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">الكمية</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">سعر الوحدة</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">التغيير</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {stat.records.map((r: PriceRecord, i: number) => {
                          const prevPrice = i > 0 ? stat.records[i - 1].unitPrice : null;
                          const diff = prevPrice !== null ? r.unitPrice - prevPrice : null;
                          const diffPct = prevPrice && prevPrice > 0 ? ((r.unitPrice - prevPrice) / prevPrice) * 100 : null;
                          return (
                            <tr key={i} className="hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2.5">{formatDate(r.invoiceDate)}</td>
                              <td className="px-4 py-2.5 text-muted-foreground">{r.supplierName || "—"}</td>
                              <td className="px-4 py-2.5 text-muted-foreground text-xs">{r.invoiceNumber || "—"}</td>
                              <td className="px-4 py-2.5">{r.quantity} {stat.material.unit}</td>
                              <td className="px-4 py-2.5 font-semibold">{formatPrice(r.unitPrice)} د.إ</td>
                              <td className="px-4 py-2.5">
                                {diff !== null && diffPct !== null ? (
                                  <span className={`flex items-center gap-1 text-xs font-medium ${
                                    diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : "text-muted-foreground"
                                  }`}>
                                    {diff > 0 ? <TrendingUp className="w-3 h-3" /> : diff < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                                    {diff > 0 ? "+" : ""}{formatPrice(diff)} ({diffPct > 0 ? "+" : ""}{diffPct.toFixed(1)}%)
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">أول سعر</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
