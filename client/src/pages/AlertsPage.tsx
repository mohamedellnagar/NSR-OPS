import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Bell, CheckCircle2, PackagePlus, XCircle, Clock } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AlertsPage() {
  const { t, isRTL, language } = useLanguage();
  const { data: alerts, isLoading } = trpc.alerts.lowStock.useQuery();
  const { data: expiringItems = [] } = trpc.alerts.expiring.useQuery({ daysAhead: 30 });

  const outOfStock = alerts?.filter((a: any) => Number(a.currentQuantity) <= 0) || [];
  const lowStockItems = alerts?.filter((a: any) => Number(a.currentQuantity) > 0 && Number(a.currentQuantity) <= Number(a.minimumQuantity)) || [];

  const formatQty = (qty: string | number) =>
    Number(qty).toLocaleString(language === "ar" ? "ar-SA" : "en-US");

  const getUrgencyColor = (current: number, minimum: number) => {
    if (current === 0) return "border-red-200 bg-red-50";
    const ratio = current / minimum;
    if (ratio < 0.25) return "border-red-200 bg-red-50";
    if (ratio < 0.5) return "border-amber-200 bg-amber-50";
    return "border-yellow-200 bg-yellow-50";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-bold text-foreground">{t("alertsTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {(alerts?.length ?? 0) === 0
              ? (language === "ar" ? "جميع المواد في مستوى جيد" : "All materials are at good levels")
              : `${alerts?.length} ${language === "ar" ? "مادة تحتاج انتباهاً" : "materials need attention"}`}
          </p>
        </div>
        <Link href="/stock-in">
          <Button className="gap-2">
            <PackagePlus size={16} />
            {t("stockIn")}
          </Button>
        </Link>
      </div>

      {/* All Clear State */}
      {!isLoading && alerts?.length === 0 && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="pt-8 pb-8">
            <div className="flex flex-col items-center justify-center text-center gap-3">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-emerald-800">
                {language === "ar" ? "المخزون في حالة ممتازة!" : "Stock is in excellent condition!"}
              </h3>
              <p className="text-sm text-emerald-600 max-w-sm">
                {language === "ar"
                  ? "جميع المواد الخام تتجاوز مستوى الحد الأدنى المطلوب"
                  : "All raw materials exceed the required minimum level"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Out of Stock Section */}
      {(isLoading || outOfStock.length > 0) && (
        <div>
          <div className={`flex items-center gap-2 mb-3 ${isRTL ? "flex-row-reverse" : ""}`}>
            <XCircle size={18} className="text-red-500" />
            <h2 className="text-base font-semibold text-foreground">
              {t("outOfStock")} ({outOfStock.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="bg-card rounded-xl border border-red-200 p-5 h-36 animate-pulse" />
              ))
            ) : (
              outOfStock.map((m: any) => (
                <div key={m.id} className="bg-card rounded-xl border-2 border-red-200 p-5 shadow-sm hover:shadow-md transition-all">
                  <div className={`flex items-start justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                    <div className={isRTL ? "text-right" : ""}>
                      <div className="flex items-center gap-2 mb-1">
                        <XCircle size={14} className="text-red-500 flex-shrink-0" />
                        <h3 className="font-semibold text-foreground text-sm">
                          {isRTL && m.nameAr ? m.nameAr : m.name}
                        </h3>
                      </div>
                      {m.categoryName && (
                        <span className="text-xs text-muted-foreground">{m.categoryName}</span>
                      )}
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded-lg bg-red-100 text-red-700">
                      {language === "ar" ? "نفد المخزون" : "Out of Stock"}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1">
                    <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : ""}`}>
                      <span className="text-muted-foreground">{t("currentQuantity")}</span>
                      <span className="font-bold text-red-600 number-display">0 {m.unit}</span>
                    </div>
                    <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : ""}`}>
                      <span className="text-muted-foreground">{t("reorderQuantity")}</span>
                      <span className="number-display">{formatQty(m.reorderQuantity || m.minimumQuantity)} {m.unit}</span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="h-1.5 bg-red-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: "0%" }} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Expiring Soon Section */}
      {(expiringItems as any[]).length > 0 && (
        <div>
          <div className={`flex items-center gap-2 mb-3 ${isRTL ? "flex-row-reverse" : ""}`}>
            <Clock size={18} className="text-purple-500" />
            <h2 className="text-base font-semibold text-foreground">
              {language === "ar" ? "قرب انتهاء الصلاحية" : "Expiring Soon"} ({(expiringItems as any[]).length})
            </h2>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">المادة</th>
                  <th className="px-4 py-3 text-center font-medium">الكمية</th>
                  <th className="px-4 py-3 text-center font-medium">تاريخ الانتهاء</th>
                  <th className="px-4 py-3 text-center font-medium">المورد</th>
                  <th className="px-4 py-3 text-center font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {(expiringItems as any[]).map((item: any) => {
                  const days = item.daysUntilExpiry;
                  const urgency = days <= 3
                    ? { label: "حرج", cls: "bg-red-100 text-red-700 border-red-200" }
                    : days <= 7
                    ? { label: "تحذير", cls: "bg-amber-100 text-amber-700 border-amber-200" }
                    : { label: "قريب", cls: "bg-yellow-100 text-yellow-700 border-yellow-200" };
                  return (
                    <tr key={item.txId} className={`border-b hover:bg-muted/20 transition-colors ${days <= 3 ? "bg-red-50/40" : days <= 7 ? "bg-amber-50/40" : ""}`}>
                      <td className="px-4 py-3 font-medium">{item.materialNameAr || item.materialName}</td>
                      <td className="px-4 py-3 text-center">{Number(item.quantity).toLocaleString("ar-AE", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} {item.unit}</td>
                      <td className="px-4 py-3 text-center font-mono">{item.expiryDate}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{item.supplierName || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={`${urgency.cls} border text-xs`}>
                          {days <= 0 ? "منتهٍ" : `${days} يوم — ${urgency.label}`}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Low Stock Section */}
      {(isLoading || lowStockItems.length > 0) && (
        <div>
          <div className={`flex items-center gap-2 mb-3 ${isRTL ? "flex-row-reverse" : ""}`}>
            <AlertTriangle size={18} className="text-amber-500" />
            <h2 className="text-base font-semibold text-foreground">
              {language === "ar" ? "مخزون منخفض" : "Low Stock"} ({lowStockItems.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="bg-card rounded-xl border border-amber-200 p-5 h-36 animate-pulse" />
              ))
            ) : (
              lowStockItems.map((m: any) => {
                const pct = Math.min(100, (Number(m.currentQuantity) / Number(m.minimumQuantity)) * 100);
                return (
                  <div key={m.id} className={`bg-card rounded-xl border-2 p-5 shadow-sm hover:shadow-md transition-all ${getUrgencyColor(Number(m.currentQuantity), Number(m.minimumQuantity))}`}>
                    <div className={`flex items-start justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                      <div className={isRTL ? "text-right" : ""}>
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
                          <h3 className="font-semibold text-foreground text-sm">
                            {isRTL && m.nameAr ? m.nameAr : m.name}
                          </h3>
                        </div>
                        {m.categoryName && (
                          <span className="text-xs text-muted-foreground">{m.categoryName}</span>
                        )}
                      </div>
                      <span className="text-xs font-bold px-2 py-1 rounded-lg bg-amber-100 text-amber-700">
                        {language === "ar" ? "مخزون منخفض" : "Low Stock"}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1">
                      <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : ""}`}>
                        <span className="text-muted-foreground">{t("currentQuantity")}</span>
                        <span className="font-bold text-amber-700 number-display">{formatQty(m.currentQuantity)} {m.unit}</span>
                      </div>
                      <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : ""}`}>
                        <span className="text-muted-foreground">{t("minimumQuantity")}</span>
                        <span className="number-display">{formatQty(m.minimumQuantity)} {m.unit}</span>
                      </div>
                      {m.reorderQuantity && (
                        <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : ""}`}>
                          <span className="text-muted-foreground">{t("reorderQuantity")}</span>
                          <span className="number-display text-primary font-medium">{formatQty(m.reorderQuantity)} {m.unit}</span>
                        </div>
                      )}
                    </div>
                    {/* Progress bar */}
                    <div className="mt-3">
                      <div className="h-1.5 bg-amber-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: pct < 25 ? "#ef4444" : pct < 50 ? "#f97316" : "#eab308",
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 number-display">{Math.round(pct)}% {language === "ar" ? "من الحد الأدنى" : "of minimum"}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
