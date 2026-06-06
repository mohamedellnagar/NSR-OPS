import { useState } from "react";
import { Sparkles, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Props {
  pageName: string;
  getPageStats: () => Record<string, string | number>;
}

export default function AIWhatsAppTemplateButton({ pageName, getPageStats }: Props) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState("");
  const [result, setResult] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const generateMutation = trpc.whatsapp.generateTemplateFromPageContext.useMutation({
    onSuccess: (data: any) => {
      const tmpl = typeof data === "string" ? data : (data?.template || data?.message || JSON.stringify(data));
      setResult(tmpl);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleGenerate = () => {
    try {
      const stats = getPageStats();
      generateMutation.mutate({
        pageName,
        pageStats: JSON.stringify(stats),
        userHint: hint || undefined,
      });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    toast.success("تم النسخ");
    setTimeout(() => setCopied(false), 1500);
  };

  const close = () => {
    setOpen(false);
    setResult("");
    setHint("");
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
        <Sparkles size={14} />
        إنشاء قالب WhatsApp
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>إنشاء قالب رسالة WhatsApp بالذكاء الاصطناعي</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>الصفحة</Label>
              <Input value={pageName} disabled />
            </div>

            <div>
              <Label>تلميح إضافي (اختياري)</Label>
              <Input
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="مثلاً: ركّز على المبيعات والربح..."
              />
            </div>

            {result && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>القالب المُنشأ</Label>
                  <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 gap-1">
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? "تم" : "نسخ"}
                  </Button>
                </div>
                <Textarea
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                  rows={10}
                  dir="rtl"
                  className="font-mono text-sm"
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex-row-reverse">
            <Button onClick={handleGenerate} disabled={generateMutation.isPending} className="gap-2">
              <Sparkles size={14} />
              {generateMutation.isPending ? "جاري الإنشاء..." : result ? "إعادة الإنشاء" : "إنشاء"}
            </Button>
            <Button variant="outline" onClick={close}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
