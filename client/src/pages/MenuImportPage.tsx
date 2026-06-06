import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Link2, Trash2, Eye, CheckCircle2, XCircle, Clock, Download, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

// ─── Platform badge ───────────────────────────────────────────────────────────
const platformColors: Record<string, string> = {
  talabat: "bg-orange-500 text-white",
  keeta:   "bg-green-600 text-white",
  noon:    "bg-yellow-500 text-black",
  unknown: "bg-gray-500 text-white",
};
const platformLabels: Record<string, string> = {
  talabat: "طلبات",
  keeta:   "كيتا",
  noon:    "نون",
  unknown: "غير معروف",
};

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${platformColors[platform] || platformColors.unknown}`}>
      {platformLabels[platform] || platform}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "done") return <Badge className="bg-green-600 text-white gap-1"><CheckCircle2 size={12} /> مكتمل</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="gap-1"><XCircle size={12} /> فشل</Badge>;
  if (status === "processing") return <Badge className="bg-blue-600 text-white gap-1"><Loader2 size={12} className="animate-spin" /> جاري...</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock size={12} /> {status}</Badge>;
}

// ─── Preview Dialog ───────────────────────────────────────────────────────────
function PreviewDialog({ sessionId, open, onClose }: { sessionId: number | null; open: boolean; onClose: () => void }) {
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const { data, isLoading } = trpc.menuImport.getSessionItems.useQuery(
    { sessionId: sessionId! },
    { enabled: !!sessionId && open }
  );

  const toggleCat = (cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // Group items by category
  const grouped = data ? (data.items as Array<Record<string, unknown>>).reduce((acc: Record<string, Array<Record<string, unknown>>>, item) => {
    const cat = String(item.categoryName || "غير مصنف");
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, Array<Record<string, unknown>>>) : {};

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right font-bold text-lg">معاينة القائمة المستوردة</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : !data || (data.items as unknown[]).length === 0 ? (
          <p className="text-center text-muted-foreground py-8">لا توجد عناصر في هذه الجلسة</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-right">
              إجمالي العناصر: <strong>{(data.items as unknown[]).length}</strong> | الفئات: <strong>{Object.keys(grouped).length}</strong>
            </p>
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat} className="border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted transition-colors text-right font-semibold"
                  onClick={() => toggleCat(cat)}
                >
                  <span className="flex items-center gap-2 text-sm">
                    {expandedCats.has(cat) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    {cat}
                    <Badge variant="outline" className="text-xs">{items.length} عنصر</Badge>
                  </span>
                </button>
                {expandedCats.has(cat) && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right w-16">صورة</TableHead>
                        <TableHead className="text-right">الاسم</TableHead>
                        <TableHead className="text-right">الاسم بالعربي</TableHead>
                        <TableHead className="text-right">الوصف</TableHead>
                        <TableHead className="text-right w-24">السعر</TableHead>
                        <TableHead className="text-right w-20">متاح</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(items as Array<Record<string, unknown>>).map((item) => (
                        <TableRow key={String(item.id)}>
                          <TableCell>
                            {item.imageUrl ? (
                              <img
                                src={String(item.imageUrl)}
                                alt={String(item.name)}
                                className="w-12 h-12 object-cover rounded"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            ) : (
                              <div className="w-12 h-12 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">—</div>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{String(item.name)}</TableCell>
                          <TableCell className="text-muted-foreground">{item.nameAr ? String(item.nameAr) : "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{item.description ? String(item.description) : "—"}</TableCell>
                          <TableCell className="font-semibold">{Number(item.price).toFixed(2)} {String(item.currency || "AED")}</TableCell>
                          <TableCell>
                            {item.isAvailable ? (
                              <Badge className="bg-green-600 text-white text-xs">متاح</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">غير متاح</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MenuImportPage() {
  const [url, setUrl] = useState("");
  const [previewSessionId, setPreviewSessionId] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data: sessions, isLoading: sessionsLoading } = trpc.menuImport.listSessions.useQuery();

  const importMutation = trpc.menuImport.importFromUrl.useMutation({
    onSuccess: (data) => {
      toast.success(`تم استيراد قائمة "${data.restaurantName}" بنجاح! (${data.itemCount} عنصر)`);
      setUrl("");
      utils.menuImport.listSessions.invalidate();
    },
    onError: (err) => {
      toast.error(`فشل الاستيراد: ${err.message}`);
      utils.menuImport.listSessions.invalidate();
    },
  });

  const deleteMutation = trpc.menuImport.deleteSession.useMutation({
    onSuccess: () => {
      toast.success("تم حذف جلسة الاستيراد");
      utils.menuImport.listSessions.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleImport = () => {
    if (!url.trim()) { toast.error("أدخل رابط المطعم"); return; }
    try { new URL(url); } catch { toast.error("الرابط غير صحيح"); return; }
    importMutation.mutate({ url: url.trim() });
  };

  const handlePreview = (sessionId: number) => {
    setPreviewSessionId(sessionId);
    setPreviewOpen(true);
  };

  const detectPlatformFromUrl = (u: string) => {
    if (u.includes("talabat.com")) return "talabat";
    if (u.includes("keeta")) return "keeta";
    if (u.includes("noon.com")) return "noon";
    return "unknown";
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">استيراد قوائم الطعام</h1>
        <p className="text-muted-foreground text-sm mt-1">
          الصق رابط مطعم من منصة توصيل (طلبات، كيتا، نون) وسيقوم النظام باستخراج القائمة تلقائياً
        </p>
      </div>

      {/* Import Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 size={18} />
            استيراد من رابط
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.talabat.com/uae/restaurant/..."
              className="flex-1 text-left"
              dir="ltr"
              onKeyDown={(e) => e.key === "Enter" && !importMutation.isPending && handleImport()}
              disabled={importMutation.isPending}
            />
            <Button
              onClick={handleImport}
              disabled={importMutation.isPending || !url.trim()}
              className="min-w-[120px]"
            >
              {importMutation.isPending ? (
                <><Loader2 size={16} className="animate-spin ml-2" /> جاري الاستيراد...</>
              ) : (
                <><Download size={16} className="ml-2" /> استيراد</>
              )}
            </Button>
          </div>

          {/* Platform detection hint */}
          {url.trim() && (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <span>المنصة المكتشفة:</span>
              <PlatformBadge platform={detectPlatformFromUrl(url)} />
            </div>
          )}

          {/* Supported platforms */}
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground">المنصات المدعومة:</span>
            <PlatformBadge platform="talabat" />
            <PlatformBadge platform="keeta" />
            <PlatformBadge platform="noon" />
          </div>

          {importMutation.isPending && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 text-sm">
                <Loader2 size={14} className="animate-spin" />
                <span>جاري تحميل الصفحة واستخراج القائمة بالذكاء الاصطناعي... قد يستغرق هذا 30-60 ثانية</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sessions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">سجل الاستيرادات</CardTitle>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : !sessions || (sessions as unknown[]).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Download size={40} className="mx-auto mb-3 opacity-30" />
              <p>لا توجد استيرادات سابقة</p>
              <p className="text-xs mt-1">الصق رابط مطعم أعلاه للبدء</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">المطعم</TableHead>
                  <TableHead className="text-right">المنصة</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">العناصر</TableHead>
                  <TableHead className="text-right">الفئات</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">الرابط</TableHead>
                  <TableHead className="text-right w-24">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sessions as Array<Record<string, unknown>>).map((session) => (
                  <TableRow key={String(session.id)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {!!session.restaurantLogoUrl && (
                          <img
                            src={String(session.restaurantLogoUrl)}
                            alt=""
                            className="w-8 h-8 rounded object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        )}
                        <div>
                          <p>{session.restaurantName ? String(session.restaurantName) : "—"}</p>
                          {!!session.restaurantNameAr && (
                            <p className="text-xs text-muted-foreground">{String(session.restaurantNameAr)}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><PlatformBadge platform={String(session.platform)} /></TableCell>
                    <TableCell>
                      <StatusBadge status={String(session.status)} />
                      {session.status === "failed" && !!session.errorMessage && (
                        <p className="text-xs text-red-500 mt-1 max-w-[200px] truncate" title={String(session.errorMessage)}>
                          {String(session.errorMessage)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>{session.itemCount !== null ? String(session.itemCount) : "—"}</TableCell>
                    <TableCell>{session.categoryCount !== null ? String(session.categoryCount) : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {session.createdAt ? new Date(String(session.createdAt)).toLocaleString("ar-AE") : "—"}
                    </TableCell>
                    <TableCell>
                      <a
                        href={String(session.sourceUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:underline truncate block max-w-[160px]"
                        dir="ltr"
                      >
                        {String(session.sourceUrl).replace(/^https?:\/\//, "").substring(0, 40)}...
                      </a>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {session.status === "done" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-blue-600 hover:text-blue-700"
                            onClick={() => handlePreview(Number(session.id))}
                            title="معاينة القائمة"
                          >
                            <Eye size={14} />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-500 hover:text-red-600"
                          onClick={() => {
                            if (confirm("هل تريد حذف هذه الجلسة؟")) {
                              deleteMutation.mutate({ sessionId: Number(session.id) });
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          title="حذف"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <PreviewDialog
        sessionId={previewSessionId}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
