import DailyAccountDialog from "@/components/DailyAccountDialog";
import React, { useState, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Pagination, usePagination } from "@/components/Pagination";
import * as XLSX from "xlsx";
import { KitchenReportPrint } from "@/components/KitchenReportPrint";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/NumericInput";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Search,
  ChevronRight,
  ChevronLeft,
  ClipboardList,
  CheckCircle2,
  Package,
  FlaskConical,
  ChefHat,
  TrendingUp,
  Pencil,
  ArrowRight,
  Flame,
  ArrowLeftRight,
  RotateCcw,
  LockOpen,
  Download,
  Calculator,
  ShoppingCart,
  TrendingDown,
  ArrowRightLeft,
  CheckCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Pull = {
  id: number;
  pullDate: Date;
  materialId: number;
  materialName: string;
  materialNameAr: string | null;
  materialType: string;
  unit: string;
  pulledQuantity: string;
  actualYield: string | null;
  closingCount: string | null;
  ordersConsumed: string | null;
  carriedForward: string | null;
  carriedRawQty: string | null;
  wasteQty: string | null;
  status: "open" | "counted" | "closed";
  notes: string | null;
  unitCost: string | null;
  isCarriedForward: boolean | number | null;
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Pull["status"] }) {
  if (status === "open")
    return <Badge variant="outline" className="text-blue-500 border-blue-500/40 bg-blue-500/10 text-xs">مفتوح</Badge>;
  if (status === "counted")
    return <Badge variant="outline" className="text-amber-500 border-amber-500/40 bg-amber-500/10 text-xs">تم الجرد</Badge>;
  return <Badge variant="outline" className="text-green-500 border-green-500/40 bg-green-500/10 text-xs">مغلق</Badge>;
}

// ─── Count Dialog ─────────────────────────────────────────────────────────────
function CountDialog({
  pull,
  open,
  onClose,
  onSave,
}: {
  pull: Pull;
  open: boolean;
  onClose: () => void;
  onSave: (id: number, remainingQty: string, wasteQty: string, carriedRawQty?: string) => void;
}) {
  const [usedInput, setUsedInput] = useState("");
  const [wasteInput, setWasteInput] = useState("0");

  const isSemiFinished = pull.materialType === "semi_finished";
  const isCarriedRow = !!(pull.isCarriedForward);
  // للمادة المصنّعة المرحّلة: الكمية المسحوبة = carriedRawQty (كمية الخام المرحّلة)
  // للمادة المصنّعة الأصلية: الكمية المسحوبة = pulledQuantity
  const pulledQtyRaw = parseFloat(pull.pulledQuantity);
  const carriedRawQtyVal = pull.carriedRawQty ? parseFloat(pull.carriedRawQty) : 0;
  const pulledQty = (isSemiFinished && isCarriedRow && carriedRawQtyVal > 0) ? carriedRawQtyVal : pulledQtyRaw;
  // إذا كان actualYield محفوظاً (لأي نوع مادة) فيستخدم كأساس للجرد
  const actualYieldQty = pull.actualYield
    ? parseFloat(pull.actualYield)
    : pulledQty;  // الافتراضي: الإنتاج الفعلي = المسحوبة
  const usedNum = parseFloat(usedInput || "0");
  const wasteNum = parseFloat(wasteInput || "0");
  // المتبقي من الإنتاج الفعلي = المتاح - المستخدم - الهدر
  const remainingNum = Math.max(0, actualYieldQty - usedNum - wasteNum);
  // المرحّل من الإنتاج = المتبقي
  const carriedNum = remainingNum;
  // نسبة المتبقي من الإنتاج الفعلي
  const remainingRatio = actualYieldQty > 0 ? remainingNum / actualYieldQty : 0;
  // المرحّل من المواد الخام = كمية الخام المسحوبة × نسبة المتبقي
  const carriedRawNum = isSemiFinished ? pulledQty * remainingRatio : 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col" dir="rtl">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {isSemiFinished ? (
              <><FlaskConical size={18} className="text-purple-400" /> جرد نهاية اليوم — مادة مصنّعة</>
            ) : (
              <><Package size={18} className="text-blue-400" /> جرد نهاية اليوم</>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1 overflow-y-auto flex-1 pr-1">
          {/* Material header - shows pulled qty AND actual yield */}
          <div className="rounded-lg p-3 text-sm bg-muted/30 border border-border/50">
            <p className="font-semibold text-base mb-2">{pull.materialNameAr || pull.materialName}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 flex flex-col items-center gap-0.5">
                <span className="text-xs text-blue-300">❄️ الكمية المسحوبة</span>
                <span className="font-bold text-blue-200 text-base">{pulledQty.toFixed(3)}</span>
                <span className="text-xs text-muted-foreground">{pull.unit}</span>
              </div>
              <div className={`border rounded-lg p-2 flex flex-col items-center gap-0.5 ${
                isSemiFinished
                  ? "bg-purple-500/10 border-purple-500/20"
                  : "bg-emerald-500/10 border-emerald-500/20"
              }`}>
                <span className={`text-xs ${isSemiFinished ? "text-purple-300" : "text-emerald-300"}`}>
                  {isSemiFinished ? "✨ الإنتاج الفعلي" : "✨ المتاح للجرد"}
                </span>
                <span className={`font-bold text-base ${isSemiFinished ? "text-purple-200" : "text-emerald-200"}`}>
                  {actualYieldQty.toFixed(3)}
                </span>
                <span className="text-xs text-muted-foreground">{pull.unit}</span>
              </div>
            </div>
            {isSemiFinished && pull.actualYield && (
              <p className="text-xs text-muted-foreground mt-1.5 text-center">
                نسبة الإنتاج: {((actualYieldQty / pulledQty) * 100).toFixed(1)}%
                {actualYieldQty > pulledQty && <span className="text-amber-400 mr-1"> (زيادة {((actualYieldQty / pulledQty - 1) * 100).toFixed(1)}%)</span>}
              </p>
            )}
          </div>

          {/* Input fields */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-green-400" />
                الكمية المستخدمة
              </label>
              <NumericInput
                value={usedInput}
                onChange={(e) => {
                  const val = parseFloat(e.target.value || "0");
                  if (val > actualYieldQty) {
                    setUsedInput(String(actualYieldQty));
                  } else {
                    setUsedInput(e.target.value);
                  }
                }}
                placeholder="0.000"
                step="0.001"
                min="0"
                max={actualYieldQty}
                numpadLabel={`الكمية المستخدمة من ${pull.materialNameAr || pull.materialName}`}
              />
              <p className="text-xs text-muted-foreground mt-1">الحد الأقصى: {actualYieldQty.toFixed(3)} {pull.unit} (الإنتاج الفعلي)</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                <Flame size={14} className="text-red-400" />
                الهدر (اختياري)
              </label>
              <NumericInput
                value={wasteInput}
                onChange={(e) => setWasteInput(e.target.value)}
                placeholder="0.000"
                step="0.001"
                min="0"
                numpadLabel="كمية الهدر"
              />
              <p className="text-xs text-muted-foreground mt-1">يُسجّل تلقائياً في قائمة الهدر</p>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2.5 flex flex-col items-center gap-1">
              <span className="text-xs text-green-300">مستخدم</span>
              <span className="font-bold text-green-400 text-sm">{usedNum.toFixed(3)}</span>
              <span className="text-xs text-muted-foreground">{pull.unit}</span>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 flex flex-col items-center gap-1">
              <span className="text-xs text-red-300">هدر</span>
              <span className="font-bold text-red-400 text-sm">{wasteNum.toFixed(3)}</span>
              <span className="text-xs text-muted-foreground">{pull.unit}</span>
            </div>
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-2.5 flex flex-col items-center gap-1">
              <span className="text-xs text-cyan-300">متبقي إنتاج</span>
              <span className="font-bold text-cyan-400 text-sm">{carriedNum.toFixed(3)}</span>
              <span className="text-xs text-muted-foreground">{pull.unit}</span>
            </div>
          </div>

          {/* Dual carry-forward for semi-finished */}
          {isSemiFinished && carriedNum > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm">
              <p className="text-amber-300 font-semibold text-xs mb-2">↪️ سيتم ترحيل الغد:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-2 flex flex-col items-center gap-0.5">
                  <span className="text-xs text-purple-300">من الإنتاج</span>
                  <span className="font-bold text-purple-200 text-base">{carriedNum.toFixed(3)}</span>
                  <span className="text-xs text-muted-foreground">{pull.unit}</span>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 flex flex-col items-center gap-0.5">
                  <span className="text-xs text-blue-300">مواد خام مقابلة</span>
                  <span className="font-bold text-blue-200 text-base">{carriedRawNum.toFixed(3)}</span>
                  <span className="text-xs text-muted-foreground">{pull.unit}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 text-center">
                نسبة المتبقي: {(remainingRatio * 100).toFixed(1)}% × {pulledQty.toFixed(3)} مسحوب = {carriedRawNum.toFixed(3)} مواد خام
              </p>
            </div>
          )}

          {/* Flow equation */}
          <div className="bg-muted/30 rounded-lg p-2.5 text-xs">
            <div className="flex items-center gap-1 flex-wrap justify-center">
              <span className="text-white font-bold">{actualYieldQty.toFixed(3)}</span>
              <span className="text-muted-foreground">متاح</span>
              <span className="text-muted-foreground">=</span>
              <span className="text-green-400 font-bold">{usedNum.toFixed(3)}</span>
              <span className="text-muted-foreground">مستخدم</span>
              <span className="text-muted-foreground">+</span>
              <span className="text-red-400 font-bold">{wasteNum.toFixed(3)}</span>
              <span className="text-muted-foreground">هدر</span>
              <span className="text-muted-foreground">+</span>
              <span className="text-cyan-400 font-bold">{carriedNum.toFixed(3)}</span>
              <span className="text-muted-foreground">متبقي</span>
            </div>
            {usedNum + wasteNum > actualYieldQty + 0.001 && (
              <p className="text-center text-yellow-400 mt-1">⚠️ الكمية المستخدمة + الهدر تتجاوز الكمية المتاحة!</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>إلغاء</Button>
          <Button
            size="sm"
            onClick={() => {
              // نرسل المتبقي المحسوب + المقابل من المواد الخام للـ backend
              onSave(pull.id, carriedNum.toFixed(3), wasteInput || "0", isSemiFinished ? carriedRawNum.toFixed(3) : undefined);
              onClose();
            }}
            disabled={usedNum + wasteNum > actualYieldQty + 0.001}
          >
            <ClipboardList size={14} className="ml-1" />
            تأكيد الجرد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pull Row ─────────────────────────────────────────────────────────────────
function PullRow({
  pull,
  onDelete,
  onCount,
  onClose,
  onEdit,
  onUncount,
  onReopen,
  isAdmin,
}: {
  pull: Pull;
  onDelete: (id: number) => void;
  onCount: (pull: Pull) => void;
  onClose: (id: number) => void;
  onEdit: (pull: Pull) => void;
  onUncount: (id: number) => void;
  onReopen: (id: number) => void;
  isAdmin: boolean;
}) {
  const pulledRaw = parseFloat(pull.pulledQuantity);
  const isSemiFinishedRow = pull.materialType === "semi_finished";
  const actualYieldNum = pull.actualYield ? parseFloat(pull.actualYield) : null;
  // عمود المسحوب: دائماً pulledQuantity (الكمية المسحوبة الفعلية)
  const pulled = pulledRaw;
  // الكمية الفعلية للجرد = actualYield إذا محددة، وإلا = pulled
  const unitCost = pull.unitCost ? parseFloat(pull.unitCost) : null;

  // ── Calculation Logic ──────────────────────────────────────────────────────
  // Case 1: Raw items (no actualYield)
  //   Raw Total Cost = pulled × unitCost
  //   Usage Cost     = usedQty × unitCost
  //
  // Case 2: Manufactured items (actualYield exists)
  //   Consumption per Unit = pulled ÷ actualYield  (= 0 if actualYield = 0)
  //   Raw Total Cost       = pulled × unitCost
  //   Usage Cost           = usedQty × consumptionPerUnit × unitCost

  const consumptionPerUnit = isSemiFinishedRow && actualYieldNum !== null && actualYieldNum > 0
    ? pulled / actualYieldNum
    : null; // null = not applicable (raw item or no yield recorded)

  // Raw Total Cost: always pulled × unitCost
  const rawTotalCost = unitCost !== null ? pulled * unitCost : null;

  // Used quantity
  // كمية المستخدم: من الجرد اليدوي أو من الأوردرات المكتملة تلقائياً
  const ordersConsumedQty = pull.ordersConsumed ? parseFloat(pull.ordersConsumed) : 0;
  const usedQtyFromCount = pull.closingCount
    ? parseFloat(pull.closingCount)
    : ordersConsumedQty > 0 ? ordersConsumedQty : null;

  // Usage Cost
  // Manufactured: usedQty × consumptionPerUnit × unitCost
  // Raw:          usedQty × unitCost
  const usedValue = usedQtyFromCount !== null && unitCost !== null
    ? (consumptionPerUnit !== null
        ? usedQtyFromCount * consumptionPerUnit * unitCost
        : usedQtyFromCount * unitCost)
    : null;

  // rowCost (for open items without closingCount) = rawTotalCost
  const rowCost = rawTotalCost;

  // Only show consumption values when item has been counted or closed
  const hasUsageData = pull.status === "counted" || pull.status === "closed";
  const displayConsumptionPerUnit = hasUsageData ? consumptionPerUnit : null;
  const displayUsedValue = hasUsageData ? usedValue : null;

  // ── Waste Calculation ──────────────────────────────────────────────────────
  const wasteQtyNum = pull.wasteQty ? parseFloat(pull.wasteQty) : null;
  // Waste Cost:
  // Manufactured: wasteQty × consumptionPerUnit × unitCost
  // Raw:          wasteQty × unitCost
  const wasteCost = wasteQtyNum !== null && wasteQtyNum > 0 && unitCost !== null
    ? (consumptionPerUnit !== null
        ? wasteQtyNum * consumptionPerUnit * unitCost
        : wasteQtyNum * unitCost)
    : null;

  // ── Transferred (Carried Forward) ─────────────────────────────────────────
  const carriedForwardNum = pull.carriedForward ? parseFloat(pull.carriedForward) : null;

  return (
    <tr className={`border-b border-border/40 transition-colors ${
      pull.status === "open" ? "hover:bg-blue-500/5" :
      pull.status === "counted" ? "bg-amber-500/5 hover:bg-amber-500/10" :
      "bg-green-500/5 hover:bg-green-500/10"
    }`}>
      {/* ── Item Name ── */}
      <td className="py-3 px-3">
        <div className="flex items-center gap-2">
          {pull.materialType === "semi_finished" ? (
            <FlaskConical size={13} className="text-purple-400 shrink-0" />
          ) : (
            <Package size={13} className="text-blue-400 shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium leading-tight">{pull.materialNameAr || pull.materialName}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <p className="text-xs text-muted-foreground">
                {pull.materialType === "semi_finished" ? "مصنّعة" : "خام"}
              </p>
              {/* هدر% */}
              {wasteQtyNum !== null && wasteQtyNum > 0 && pulled > 0 && (() => {
                const wp = (wasteQtyNum / pulled) * 100;
                return (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${wp > 12 ? "bg-red-500/20 text-red-400" : wp > 6 ? "bg-amber-500/20 text-amber-400" : "bg-muted text-muted-foreground"}`}>
                    هدر {wp.toFixed(0)}%{wp > 12 ? " ⚠" : ""}
                  </span>
                );
              })()}
              {/* كفاءة الإنتاج للمصنّعة */}
              {isSemiFinishedRow && actualYieldNum !== null && pulled > 0 && (() => {
                const ep = (actualYieldNum / pulled) * 100;
                return (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ep >= 95 ? "bg-emerald-500/20 text-emerald-400" : ep >= 85 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>
                    كفاءة {ep.toFixed(0)}%{ep < 85 ? " ⚠" : ""}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>
      </td>

      {/* ── 🔶 Raw Material Section ── */}
      {/* Withdrawn Qty */}
      <td className="py-3 px-3 text-center text-sm">
        <span className="font-medium">{pulled.toFixed(2)}</span>
        <span className="text-muted-foreground text-xs mr-1">{pull.unit}</span>
      </td>
      {/* Unit Cost */}
      <td className="py-3 px-3 text-center text-sm">
        {unitCost !== null && unitCost > 0 ? (
          <span className="text-amber-400">{unitCost.toFixed(3)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      {/* Raw Total Cost */}
      <td className="py-3 px-3 text-center text-sm">
        {rawTotalCost !== null ? (
          <span className="text-orange-400 font-medium">
            {rawTotalCost.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* ── 🔷 Production Section ── */}
      {/* Actual Production Qty */}
      <td className="py-3 px-3 text-center text-sm">
        {isSemiFinishedRow ? (
          actualYieldNum !== null ? (
            <span className="text-purple-400 font-medium">{actualYieldNum.toFixed(2)}</span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
        {isSemiFinishedRow && actualYieldNum !== null && (
          <span className="text-muted-foreground text-xs mr-1">{pull.unit}</span>
        )}
      </td>

      {/* ── 🔴 Usage Section ── */}
      {/* Used Qty */}
      <td className="py-3 px-3 text-center text-sm">
        {usedQtyFromCount !== null ? (
          <span className="text-green-400 font-medium">{usedQtyFromCount.toFixed(2)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {usedQtyFromCount !== null && (
          <span className="text-muted-foreground text-xs mr-1">{pull.unit}</span>
        )}
      </td>
      {/* Consumption per Unit */}
      <td className="py-3 px-3 text-center text-sm">
        {isSemiFinishedRow && displayConsumptionPerUnit !== null ? (
          <span className="text-sky-400">{displayConsumptionPerUnit.toFixed(4)}</span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      {/* Usage Cost */}
      <td className="py-3 px-3 text-center text-sm">
        {displayUsedValue !== null ? (
          <span className="text-emerald-400 font-semibold">
            {displayUsedValue.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* ── 🟠 Waste Section ── */}
      {/* Waste Qty */}
      <td className="py-3 px-3 text-center text-sm">
        {wasteQtyNum !== null && wasteQtyNum > 0 ? (
          <span className="text-red-400 font-medium">{wasteQtyNum.toFixed(2)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {wasteQtyNum !== null && wasteQtyNum > 0 && (
          <span className="text-muted-foreground text-xs mr-1">{pull.unit}</span>
        )}
      </td>
      {/* Waste Cost */}
      <td className="py-3 px-3 text-center text-sm">
        {wasteCost !== null ? (
          <span className="text-red-400 font-semibold">
            {wasteCost.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* ── 🔁 Transferred Section ── */}
      {/* Carried Forward Qty */}
      <td className="py-3 px-3 text-center text-sm">
        {carriedForwardNum !== null && carriedForwardNum > 0 ? (
          <span className="text-sky-400 font-medium">{carriedForwardNum.toFixed(2)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {carriedForwardNum !== null && carriedForwardNum > 0 && (
          <span className="text-muted-foreground text-xs mr-1">{pull.unit}</span>
        )}
      </td>

      {/* ── Status & Actions ── */}
      <td className="py-3 px-3">
        <StatusBadge status={pull.status} />
      </td>
      <td className="py-3 px-3">
        <div className="flex items-center gap-1">
          {pull.status === "open" && (
            <>
              {isAdmin && (
                <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-400 hover:text-amber-300" title="تعديل الكمية" onClick={() => onEdit(pull)}>
                  <Pencil size={13} />
                </Button>
              )}
              <Button size="sm" variant="default" className="h-8 text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold px-3" onClick={() => onCount(pull)}>
                <ClipboardList size={13} />
                جرد
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(pull.id)}>
                <Trash2 size={13} />
              </Button>
            </>
          )}
          {pull.status === "counted" && (
            <div className="flex items-center gap-1">
              {isAdmin && (
                <Button size="icon" variant="ghost" className="h-7 w-7 text-orange-400 hover:text-orange-300" title="تراجع عن الجرد" onClick={() => onUncount(pull.id)}>
                  <RotateCcw size={13} />
                </Button>
              )}
              <Button size="sm" variant="default" className="h-8 text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white font-semibold px-3" onClick={() => onClose(pull.id)}>
                <CheckCircle2 size={13} />
                إغلاق
              </Button>
            </div>
          )}
          {pull.status === "closed" && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">مكتمل</span>
              {isAdmin && (
                <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-400 hover:text-amber-300" title="إعادة فتح الجرد (أدمن فقط)" onClick={() => onReopen(pull.id)}>
                  <LockOpen size={13} />
                </Button>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}



// ─── Main Page ────────────────────────────────────────────────────────────────
export default function KitchenProductionPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [tableMode, setTableMode] = useState<"simple" | "detailed">("detailed");
  // Range summary filter
  const [rangeFrom, setRangeFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split("T")[0];
  });
  const [rangeTo, setRangeTo] = useState(today);
  const [showRangeSummary, setShowRangeSummary] = useState(false);
  const { data: rangePulls = [], isLoading: rangeLoading } = trpc.kitchenPulls.getByRange.useQuery(
    { from: rangeFrom, to: rangeTo },
    { enabled: showRangeSummary }
  );
  const { data: kpiData } = trpc.sales.dailyKPIs.useQuery(
    { date: selectedDate },
    { refetchOnWindowFocus: false }
  );
  // Daily revenue for Food Cost% calculation
  const { data: flashData } = trpc.dailyFlash.report.useQuery(
    { date: selectedDate },
    { refetchOnWindowFocus: false }
  );
  // Yesterday's pulls for comparison
  const yesterdayDate = useMemo(() => {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }, [selectedDate]);
  const { data: yesterdayPulls = [] } = trpc.kitchenPulls.getByDate.useQuery(
    { date: yesterdayDate },
    { refetchOnWindowFocus: false }
  );
  const { data: vegData } = trpc.sales.dailyVegetables.useQuery(
    { date: selectedDate },
    { refetchOnWindowFocus: false }
  );
  const { data: salesVsKitchen = [], isLoading: salesVsLoading } = trpc.kitchenPulls.salesVsKitchen.useQuery(
    { from: rangeFrom, to: rangeTo },
    { enabled: showRangeSummary }
  );
  // Pull form (raw/semi manual)
  const [showAddForm, setShowAddForm] = useState(false);
  const [selMaterialId, setSelMaterialId] = useState("");
  const [selMaterialSearch, setSelMaterialSearch] = useState("");
  const [pulledQty, setPulledQty] = useState("");
  const [pullNotes, setPullNotes] = useState("");
  const [hasDifferentYield, setHasDifferentYield] = useState(false);
  const [addActualYield, setAddActualYield] = useState("");
  const [countingPull, setCountingPull] = useState<Pull | null>(null);
  // Edit quantity
  const [editingPull, setEditingPull] = useState<Pull | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editActualYield, setEditActualYield] = useState("");
  // Semi-finished production form
  const [showProduceForm, setShowProduceForm] = useState(false);
  const [prodMaterialId, setProdMaterialId] = useState("");
  const [prodMaterialSearch, setProdMaterialSearch] = useState("");
  const [prodQty, setProdQty] = useState("");
  const [prodActualYield, setProdActualYield] = useState("");
  const [hasProdDifferentYield, setHasProdDifferentYield] = useState(false);
  const [prodNotes, setProdNotes] = useState("");
  const [showProduceConfirm, setShowProduceConfirm] = useState(false);

  // ─── Daily Accounts Dialog ────────────────────────────────────────────────
  const [showDailyDialog, setShowDailyDialog] = useState(false);
  const [showDailyConfirm, setShowDailyConfirm] = useState(false);
  const [dailyForm, setDailyForm] = useState({
    salesCash: "",
    salesCard: "",
    salesKita: "",
    salesOrders: "",
    salesNoon: "",
    salesDeliveroo: "",
    salesCareem: "",
    expensesFixed: "",
    supplyToRestaurant: "",
    supplyToManagement: "",
    supplyExtra: "",
    notes: "",
  });

  const toNum = (v: string) => parseFloat(v) || 0;
  const fmt = (n: number) => n.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const dailyTotalSales =
    toNum(dailyForm.salesCash) + toNum(dailyForm.salesCard) + toNum(dailyForm.salesKita) +
    toNum(dailyForm.salesOrders) + toNum(dailyForm.salesNoon) + toNum(dailyForm.salesDeliveroo) +
    toNum(dailyForm.salesCareem);

  const dailyTotalExpenses = toNum(dailyForm.expensesFixed);
  const dailyNetProfit = dailyTotalSales - dailyTotalExpenses;

  const saveDailyAccount = trpc.dailyAccounts.save.useMutation({
    onSuccess: () => {
      setShowDailyDialog(false);
      setShowDailyConfirm(false);
      setDailyForm({
        salesCash: "", salesCard: "", salesKita: "", salesOrders: "",
        salesNoon: "", salesDeliveroo: "", salesCareem: "",
        expensesFixed: "", supplyToRestaurant: "", supplyToManagement: "",
        supplyExtra: "", notes: "",
      });
      toast.success("تم حفظ بيانات اليوم بنجاح ✓");
    },
    onError: (e) => toast.error(e.message),
  });

  function openDailyDialog() {
    setDailyForm({
      salesCash: "", salesCard: "", salesKita: "", salesOrders: "",
      salesNoon: "", salesDeliveroo: "", salesCareem: "",
      expensesFixed: "", supplyToRestaurant: "", supplyToManagement: "",
      supplyExtra: "", notes: "",
    });
    setShowDailyDialog(true);
  }

  function handleDailySave() {
    setShowDailyConfirm(true);
  }

  function confirmDailySave() {
    saveDailyAccount.mutate({
      accountDate: selectedDate,
      salesCash: toNum(dailyForm.salesCash),
      salesCard: toNum(dailyForm.salesCard),
      salesKita: toNum(dailyForm.salesKita),
      salesOrders: toNum(dailyForm.salesOrders),
      salesNoon: toNum(dailyForm.salesNoon),
      salesDeliveroo: toNum(dailyForm.salesDeliveroo),
      salesCareem: toNum(dailyForm.salesCareem),
      expensesFixed: toNum(dailyForm.expensesFixed),
      supplyToRestaurant: toNum(dailyForm.supplyToRestaurant),
      supplyToManagement: toNum(dailyForm.supplyToManagement),
      supplyExtra: toNum(dailyForm.supplyExtra),
      notes: dailyForm.notes || undefined,
    });
  }

  const utils = trpc.useUtils();

  const { data: pulls = [], isLoading } = trpc.kitchenPulls.getByDate.useQuery({ date: selectedDate });
  const { data: rawMats = [] } = trpc.materials.list.useQuery();
  const { data: semiMats = [] } = trpc.semiFinished.list.useQuery();

  const allMaterials = useMemo(() => [
    ...(rawMats as any[]).filter((m) => m.isActive && m.materialType === "raw").map((m) => ({ ...m, type: "raw" as const })),
    ...(semiMats as any[]).filter((m) => m.isActive).map((m) => ({ ...m, type: "semi_finished" as const })),
  ], [rawMats, semiMats]);

  const filteredMaterials = useMemo(() =>
    allMaterials.filter((m) => {
      if (!selMaterialSearch) return true;
      const q = selMaterialSearch.toLowerCase();
      return m.name.toLowerCase().includes(q) || (m.nameAr && m.nameAr.includes(selMaterialSearch));
    }),
    [allMaterials, selMaterialSearch]
  );

  // Preview query - جلب معاينة المكونات التي ستُخصم
  const prodQtyNum = parseFloat(prodQty) || 0;
  const prodMatIdNum = prodMaterialId ? parseInt(prodMaterialId) : 0;
  const { data: producePreview = [] } = trpc.semiFinished.previewProduce.useQuery(
    { materialId: prodMatIdNum, producedQuantity: prodQtyNum },
    { enabled: !!prodMaterialId && prodQtyNum > 0 }
  );

  // المادة المصنّعة المختارة
  const selectedSemiMat = useMemo(
    () => (semiMats as any[]).find((m) => String(m.id) === prodMaterialId),
    [semiMats, prodMaterialId]
  );

  const produceSemiFinished = trpc.semiFinished.produce.useMutation({
    onSuccess: (data: any) => {
      utils.kitchenPulls.getByDate.invalidate({ date: selectedDate });
      utils.materials.list.invalidate();
      utils.semiFinished.list.invalidate();
      setProdMaterialId("");
      setProdQty("");
      setProdActualYield("");
      setHasProdDifferentYield(false);
      setProdNotes("");
      setShowProduceForm(false);
      setShowProduceConfirm(false);
      const deductCount = data?.deductions?.length ?? 0;
      const yieldDisplay = data?.actualYield ?? data?.producedQuantity;
      toast.success(`تم إنتاج ${yieldDisplay?.toFixed(2)} ${data?.unit} من ${data?.materialName} — تم خصم ${deductCount} مكوّن من المخزون`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleProduce = () => {
    if (!prodMaterialId || !prodQty) {
      toast.error("يرجى اختيار المادة المصنّعة وإدخال الكمية");
      return;
    }
    const qty = parseFloat(prodQty);
    if (isNaN(qty) || qty <= 0) {
      toast.error("الكمية يجب أن تكون أكبر من صفر");
      return;
    }
    const actualYield = hasProdDifferentYield && prodActualYield ? parseFloat(prodActualYield) : undefined;
    if (actualYield !== undefined && (isNaN(actualYield) || actualYield <= 0)) {
      toast.error("الإنتاج الفعلي يجب أن يكون أكبر من صفر");
      return;
    }
    // Show confirmation dialog with preview
    setShowProduceConfirm(true);
  };

  const confirmProduce = () => {
    const qty = parseFloat(prodQty);
    const actualYield = hasProdDifferentYield && prodActualYield ? parseFloat(prodActualYield) : undefined;
    produceSemiFinished.mutate({
      materialId: parseInt(prodMaterialId),
      producedQuantity: qty,
      actualYield,
      notes: prodNotes || undefined,
      addToPulls: true,
    });
  };

  const addPull = trpc.kitchenPulls.add.useMutation({
    onSuccess: () => {
      utils.kitchenPulls.getByDate.invalidate({ date: selectedDate });
      utils.materials.list.invalidate();
      setSelMaterialId("");
      setPulledQty("");
      setPullNotes("");
      setHasDifferentYield(false);
      setAddActualYield("");
      setShowAddForm(false);
      toast.success("تم سحب المادة من المخزون");
    },
    onError: (e) => toast.error(e.message),
  });

  const deletePull = trpc.kitchenPulls.delete.useMutation({
    onSuccess: () => {
      utils.kitchenPulls.getByDate.invalidate({ date: selectedDate });
      utils.materials.list.invalidate();
      toast.success("تم حذف السحب وإعادة الكمية للمخزون");
    },
    onError: (e) => toast.error(e.message),
  });

  const countPull = trpc.kitchenPulls.count.useMutation({
    onSuccess: (data) => {
      utils.kitchenPulls.getByDate.invalidate({ date: selectedDate });
      if ((data as any).wasteQty > 0) {
        toast.warning(`تم تسجيل هدر: ${((data as any).wasteQty as number).toFixed(2)} وحدة`);
      } else {
        toast.success("تم تسجيل الجرد بنجاح");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const uncountPull = trpc.kitchenPulls.uncount.useMutation({
    onSuccess: (data: any) => {
      utils.kitchenPulls.getByDate.invalidate({ date: selectedDate });
      utils.materials.list.invalidate();
      utils.semiFinished.list.invalidate();
      const parts: string[] = [];
      if ((data.usedQty ?? 0) > 0) parts.push(`أُعيد ${(data.usedQty as number).toFixed(2)} مستخدم`);
      if ((data.wasteQty ?? 0) > 0) parts.push(`أُعيد ${(data.wasteQty as number).toFixed(2)} هدر`);
      if ((data.carriedForward ?? 0) > 0) parts.push(`حُذف الترحيل`);
      toast.success(`تم التراجع عن الجرد${parts.length ? ` — ${parts.join("، ")}` : ""}`);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const closePull = trpc.kitchenPulls.close.useMutation({
    onSuccess: () => {
      utils.kitchenPulls.getByDate.invalidate({ date: selectedDate });
      toast.success("تم إغلاق السحب");
    },
    onError: (e) => toast.error(e.message),
  });

  const reopenPull = trpc.kitchenPulls.reopen.useMutation({
    onSuccess: () => {
      utils.kitchenPulls.getByDate.invalidate({ date: selectedDate });
      toast.success("تم إعادة فتح الجرد — يمكن تعديله الآن");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateQuantity = trpc.kitchenPulls.updateQuantity.useMutation({
    onSuccess: (data: any) => {
      utils.kitchenPulls.getByDate.invalidate({ date: selectedDate });
      utils.materials.list.invalidate();
      utils.semiFinished.list.invalidate();
      setEditingPull(null);
      setEditQty("");
      setEditActualYield("");
      const diff = data.diff as number;
      if (diff > 0) {
        toast.success(`تم زيادة الكمية بمقدار ${Math.abs(diff).toFixed(2)} — تم خصم الفرق من المخزون`);
      } else if (diff < 0) {
        toast.success(`تم تقليل الكمية بمقدار ${Math.abs(diff).toFixed(2)} — تم إعادة الفرق للمخزون`);
      } else {
        toast.success("الكمية لم تتغير");
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  // ─── Recipe Calculator Tool ─────────────────────────────────────────────────
  const [calcProductId, setCalcProductId] = useState("");
  const [calcSoldQty, setCalcSoldQty] = useState("");
  const [calcProductSearch, setCalcProductSearch] = useState("");

  const { data: allProducts = [] } = trpc.products.list.useQuery();
  const productsWithRecipes = useMemo(() =>
    (allProducts as any[]).filter((p: any) => p.recipeSource),
    [allProducts]
  );
  const filteredCalcProducts = useMemo(() => {
    if (!calcProductSearch) return productsWithRecipes;
    const q = calcProductSearch.toLowerCase();
    return productsWithRecipes.filter((p: any) =>
      p.name.toLowerCase().includes(q) || (p.nameAr && p.nameAr.includes(calcProductSearch))
    );
  }, [productsWithRecipes, calcProductSearch]);

  const calcProductIdNum = calcProductId ? parseInt(calcProductId) : 0;
  const { data: recipeIngredients = [] } = trpc.recipes.getByProduct.useQuery(
    { productId: calcProductIdNum },
    { enabled: !!calcProductId && calcProductIdNum > 0 }
  );

  const calcSoldQtyNum = parseFloat(calcSoldQty) || 0;
  const calcResults = useMemo(() => {
    if (!calcProductId || calcSoldQtyNum <= 0 || (recipeIngredients as any[]).length === 0) return [];
    return (recipeIngredients as any[]).map((ing: any) => {
      const requiredQty = parseFloat(ing.quantity ?? "0") * calcSoldQtyNum;
      // find matching pull in today's production by materialId
      const pull = (pulls as Pull[]).find((p) => p.materialId === ing.materialId);
      const usedQty = pull
        ? (pull.closingCount ? parseFloat(pull.closingCount) : parseFloat(pull.pulledQuantity ?? "0"))
        : 0;
      const remainingQty = Math.max(0, usedQty - requiredQty);
      const shortageQty = Math.max(0, requiredQty - usedQty);
      return {
        materialId: ing.materialId,
        materialName: ing.materialName,
        unit: ing.unit || ing.materialUnit,
        requiredQty,
        usedQty,
        remainingQty,
        shortageQty,
        status: shortageQty > 0 ? "shortage" : "ok",
      };
    });
  }, [recipeIngredients, calcSoldQtyNum, pulls, calcProductId]);

  const [pullSearch, setPullSearch] = useState("");
  const [pullsPage, setPullsPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "counted" | "closed">("all");

  const filteredPulls = useMemo(() => {
    let list = pulls as Pull[];
    if (statusFilter !== "all") list = list.filter((p) => p.status === statusFilter);
    if (!pullSearch.trim()) return list;
    const q = pullSearch.toLowerCase();
    return list.filter((p) =>
      p.materialName.toLowerCase().includes(q) ||
      (p.materialNameAr && p.materialNameAr.includes(pullSearch))
    );
  }, [pulls, pullSearch, statusFilter]);
  const pullsPagination = usePagination(filteredPulls, 15);
  const pagedPulls = pullsPagination.paginate(pullsPage);

  const openCount = (pulls as Pull[]).filter((p) => p.status === "open").length;
  const totalWaste = (pulls as Pull[]).reduce((sum, p) => sum + parseFloat(p.wasteQty ?? "0"), 0);
  // إجمالي الإنتاج = الكمية المسحوبة × سعر الوحدة لجميع المواد
  const totalProductionCost = (pulls as Pull[]).reduce((sum, p) => {
    return sum + parseFloat(p.pulledQuantity ?? "0") * parseFloat(p.unitCost ?? "0");
  }, 0);
  // تكلفة المطبخ = مجموع Usage Cost فقط (نفس منطق PullRow)
  // للمواد المصنّعة: usedQty × (pulled ÷ actualYield) × unitCost
  // للمواد الخام:    usedQty × unitCost
  // العناصر المفتوحة (open) لا تُحتسب
  const totalUsedValue = (pulls as Pull[]).reduce((sum, p) => {
    if (p.status === "open" || !p.closingCount) return sum;
    const unitCost = parseFloat(p.unitCost ?? "0");
    const usedQty = parseFloat(p.closingCount);
    const pulled = parseFloat(p.pulledQuantity ?? "0");
    const actualYield = p.actualYield ? parseFloat(p.actualYield) : null;
    const isSemi = p.materialType === "semi_finished";
    const consumptionPerUnit = isSemi && actualYield !== null && actualYield > 0
      ? pulled / actualYield
      : null;
    const usageValue = consumptionPerUnit !== null
      ? usedQty * consumptionPerUnit * unitCost
      : usedQty * unitCost;
    return sum + usageValue;
  }, 0);
  // إجمالي تكلفة المواد المفتوحة (لم تُجرد) = pulledQuantity × unitCost للمواد بحالة open
  const totalOpenValue = (pulls as Pull[]).reduce((sum, p) => {
    if (p.status !== "open") return sum;
    return sum + parseFloat(p.pulledQuantity ?? "0") * parseFloat(p.unitCost ?? "0");
  }, 0);
  // قيمة الهدر = مجموع wasteCost لكل صف في الجدول (نفس منطق PullRow)
  // للمواد المصنّعة: wasteQty × (pulled ÷ actualYield) × unitCost
  // للمواد الخام:    wasteQty × unitCost
  const totalWasteValue = (pulls as Pull[]).reduce((sum, p) => {
    const wasteQty = parseFloat(p.wasteQty ?? "0");
    if (wasteQty <= 0) return sum;
    const unitCost = parseFloat(p.unitCost ?? "0");
    const pulled = parseFloat(p.pulledQuantity ?? "0");
    const actualYield = p.actualYield ? parseFloat(p.actualYield) : null;
    const isSemi = p.materialType === "semi_finished";
    const consumptionPerUnit = isSemi && actualYield !== null && actualYield > 0
      ? pulled / actualYield
      : null;
    const wasteCost = consumptionPerUnit !== null
      ? wasteQty * consumptionPerUnit * unitCost
      : wasteQty * unitCost;
    return sum + wasteCost;
  }, 0);

  // ── Food Cost% اليومي ──────────────────────────────────────────────────────
  const todayRevenue = (flashData as any)?.totalRevenue ?? 0;
  const foodCostPct = todayRevenue > 0 ? (totalUsedValue / todayRevenue) * 100 : null;

  // ── هدر% الإجمالي للمواد المجردة ──────────────────────────────────────────
  const totalPulledCounted = (pulls as Pull[]).filter(p => p.status !== "open").reduce(
    (s, p) => s + (parseFloat(p.pulledQuantity ?? "0") || 0), 0
  );
  const totalWasteQty = (pulls as Pull[]).reduce(
    (s, p) => s + (parseFloat(p.wasteQty ?? "0") || 0), 0
  );
  const overallWastePct = totalPulledCounted > 0 ? (totalWasteQty / totalPulledCounted) * 100 : 0;

  // ── مقارنة بالأمس ─────────────────────────────────────────────────────────
  const yesterdayKitchenCost = (yesterdayPulls as any[]).reduce((sum, p) => {
    if (p.status === "open" || !p.closingCount) return sum;
    const uc = parseFloat(p.unitCost ?? "0");
    const used = parseFloat(p.closingCount);
    const pulled2 = parseFloat(p.pulledQuantity ?? "0");
    const ay = p.actualYield ? parseFloat(p.actualYield) : null;
    const isSemi = p.materialType === "semi_finished";
    const cpu = isSemi && ay !== null && ay > 0 ? pulled2 / ay : null;
    return sum + (cpu !== null ? used * cpu * uc : used * uc);
  }, 0);

  // ── فلتر الحالة ──────────────────────────────────────────────────────────
  const statusFilteredPulls = useMemo(() => (pulls as Pull[]).filter(p =>
    statusFilter === "all" || p.status === statusFilter
  ), [pulls, statusFilter]);

  const handleAdd = () => {
    if (!selMaterialId || !pulledQty) {
      toast.error("يرجى اختيار المادة وإدخال الكمية");
      return;
    }
    const mat = allMaterials.find((m) => String(m.id) === selMaterialId);
    if (!mat) return;
    if (hasDifferentYield && addActualYield) {
      const yieldNum = parseFloat(addActualYield);
      if (isNaN(yieldNum) || yieldNum <= 0) {
        toast.error("الإنتاج الفعلي يجب أن يكون أكبر من صفر");
        return;
      }
    }
    addPull.mutate({
      pullDate: selectedDate + "T06:00:00.000Z",
      materialId: mat.id,
      materialName: mat.name,
      materialNameAr: (mat as any).nameAr ?? undefined,
      materialType: mat.type,
      unit: mat.unit,
      pulledQuantity: pulledQty,
      actualYield: hasDifferentYield && addActualYield ? addActualYield : undefined,
      notes: pullNotes || undefined,
    });
  };

  const isToday = selectedDate === today;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-500/10">
            <ChefHat size={22} className="text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">الإنتاج اليومي للمطبخ</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              سحب المواد من المخزون وجرد نهاية اليوم
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          {/* أزرار الإجراءات الرئيسية */}
          <div className="flex gap-2 flex-wrap justify-end">
            <Button
              onClick={() => { setShowAddForm(true); setShowProduceForm(false); }}
              className="gap-2 bg-orange-500 hover:bg-orange-600 text-white h-10 px-4 text-sm font-semibold"
            >
              <Package size={16} />
              سحب مادة
            </Button>
            <Button
              onClick={() => { setShowProduceForm(true); setShowAddForm(false); }}
              className="gap-2 bg-purple-600 hover:bg-purple-700 text-white h-10 px-4 text-sm font-semibold"
            >
              <FlaskConical size={16} />
              إنتاج مادة
            </Button>
            <Button
              onClick={openDailyDialog}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white h-10 px-4 text-sm font-semibold"
            >
              <Calculator size={16} />
              إضافة يوم
            </Button>

          </div>
          {/* أزرار التصدير الثانوية */}
          <div className="flex gap-1.5 flex-wrap justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const rows = (pulls as Pull[]).map((p) => {
                  const pricePerUnit = parseFloat(p.unitCost ?? "0");
                  const pulled = parseFloat(p.pulledQuantity ?? "0");
                  const actualYield = p.actualYield ? parseFloat(p.actualYield) : null;
                  // Used quantity = closingCount if counted, otherwise pulledQuantity
                  const usedQty = p.closingCount
                    ? parseFloat(p.closingCount)
                    : pulled;
                  // Effective unit cost per produced unit:
                  // If actualYield exists and > 0: costPerUnit = (pulled / actualYield) * pricePerUnit
                  // Otherwise: costPerUnit = pricePerUnit (no yield conversion)
                  const costPerProducedUnit = (actualYield && actualYield > 0)
                    ? (pulled / actualYield) * pricePerUnit
                    : pricePerUnit;
                  // Total cost = usedQty × costPerProducedUnit
                  const totalCost = parseFloat((usedQty * costPerProducedUnit).toFixed(4));
                  return {
                    "اسم العنصر": p.materialNameAr || p.materialName,
                    "النوع": p.materialType === "semi_finished" ? "مصنّعة" : "خام",
                    "الكمية المستخدمة": usedQty,
                    "الوحدة": p.unit,
                    "سعر الوحدة": parseFloat(costPerProducedUnit.toFixed(4)),
                    "التكلفة الإجمالية": totalCost,
                  };
                });
                const ws = XLSX.utils.json_to_sheet(rows);
                ws["!cols"] = [
                  { wch: 28 }, { wch: 10 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 16 },
                ];
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "الإنتاج اليومي");
                XLSX.writeFile(wb, `إنتاج-المطبخ-${selectedDate}.xlsx`);
              }}
              className="gap-1.5 border-green-500/40 text-green-400 hover:bg-green-500/10 h-8 text-xs"
            >
              <Download size={13} />
              Excel
            </Button>
            <KitchenReportPrint
              pulls={pulls as any[]}
              selectedDate={selectedDate}
              restaurantName="المطعم"
              preparedBy={user?.name ?? ""}
            />
          </div>
        </div>
      </div>

      {/* Date Navigator */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="icon" onClick={() => changeDate(-1)}>
          <ChevronRight size={16} />
        </Button>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-9 w-44 text-sm"
          />
          {isToday && (
            <Badge variant="outline" className="text-green-500 border-green-500/40">اليوم</Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => changeDate(1)}
          disabled={selectedDate >= today}
        >
          <ChevronLeft size={16} />
        </Button>
        <span className="text-sm text-muted-foreground hidden sm:block">
          {new Date(selectedDate).toLocaleDateString("ar-EG", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </span>
      </div>

      {/* Workflow Progress Bar */}
      {(pulls as Pull[]).length > 0 && (() => {
        const total = (pulls as Pull[]).length;
        const counted = (pulls as Pull[]).filter((p) => p.status !== "open").length;
        const closed = (pulls as Pull[]).filter((p) => p.status === "closed").length;
        const pctCounted = total > 0 ? Math.round((counted / total) * 100) : 0;
        const pctClosed = total > 0 ? Math.round((closed / total) * 100) : 0;
        return (
          <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">سير العمل اليومي</p>
              <span className="text-xs text-muted-foreground">{counted}/{total} تم جردها</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-amber-400 w-20 shrink-0">الجرد</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all duration-500"
                    style={{ width: `${pctCounted}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-left">{pctCounted}%</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-green-400 w-20 shrink-0">الإغلاق</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-400 rounded-full transition-all duration-500"
                    style={{ width: `${pctClosed}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-left">{pctClosed}%</span>
              </div>
            </div>
            {openCount === 0 && total > 0 && (
              <p className="text-xs text-green-400 font-medium text-center">✓ جميع المواد تم جردها لهذا اليوم</p>
            )}
          </div>
        );
      })()}

      {/* Stats Bar - KPIs قابلة للضغط كفلاتر */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">

        {/* Food Cost% — الأهم للمدير */}
        <div className={`rounded-xl border px-3 py-2.5 col-span-1 ${
          foodCostPct === null ? "bg-muted/20 border-border/40" :
          foodCostPct > 40 ? "bg-red-500/10 border-red-500/40 ring-1 ring-red-500/20" :
          foodCostPct > 33 ? "bg-amber-500/10 border-amber-500/40" :
          "bg-emerald-500/10 border-emerald-500/40"
        }`}>
          <p className="text-[10px] text-muted-foreground">Food Cost اليوم</p>
          <p className={`text-lg font-bold ${
            foodCostPct === null ? "text-muted-foreground" :
            foodCostPct > 40 ? "text-red-400" :
            foodCostPct > 33 ? "text-amber-400" : "text-emerald-400"
          }`}>
            {foodCostPct !== null ? `${foodCostPct.toFixed(1)}%` : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {todayRevenue > 0 ? `إيراد: ${todayRevenue.toLocaleString("ar-AE", {maximumFractionDigits: 0})} د.إ` : "لا توجد مبيعات"}
          </p>
        </div>

        {/* إجمالي الإنتاج */}
        <div className="flex flex-col gap-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-muted-foreground">إجمالي الإنتاج</p>
          <p className="text-sm font-bold text-emerald-400">{totalProductionCost.toLocaleString("ar-AE", {maximumFractionDigits: 0})} د.إ</p>
        </div>

        {/* تكلفة المطبخ مع مقارنة الأمس */}
        <div className="flex flex-col gap-0.5 bg-blue-500/10 border border-blue-500/40 rounded-xl px-3 py-2.5 ring-1 ring-blue-500/20">
          <p className="text-[10px] font-semibold text-blue-400">تكلفة المطبخ</p>
          <p className="text-sm font-bold text-blue-400">{totalUsedValue.toLocaleString("ar-AE", {maximumFractionDigits: 0})} د.إ</p>
          {yesterdayKitchenCost > 0 && (
            <p className="text-[10px] text-muted-foreground">
              أمس: {yesterdayKitchenCost.toLocaleString("ar-AE", {maximumFractionDigits: 0})} د.إ
              {totalUsedValue > yesterdayKitchenCost
                ? <span className="text-red-400 mr-1">▲{((totalUsedValue - yesterdayKitchenCost) / yesterdayKitchenCost * 100).toFixed(0)}%</span>
                : <span className="text-emerald-400 mr-1">▼{((yesterdayKitchenCost - totalUsedValue) / yesterdayKitchenCost * 100).toFixed(0)}%</span>
              }
            </p>
          )}
        </div>

        {/* قيمة الهدر مع نسبة */}
        <div className={`flex flex-col gap-0.5 rounded-xl px-3 py-2.5 border ${
          overallWastePct > 12 ? "bg-red-500/10 border-red-500/40" : "bg-red-500/5 border-red-500/20"
        }`}>
          <p className="text-[10px] text-muted-foreground">قيمة الهدر</p>
          <p className="text-sm font-bold text-red-400">{totalWasteValue.toLocaleString("ar-AE", {maximumFractionDigits: 0})} د.إ</p>
          {overallWastePct > 0 && (
            <p className={`text-[10px] font-medium ${overallWastePct > 12 ? "text-red-400" : overallWastePct > 6 ? "text-amber-400" : "text-muted-foreground"}`}>
              {overallWastePct.toFixed(1)}% من الإنتاج {overallWastePct > 12 ? "⚠" : ""}
            </p>
          )}
        </div>

        {/* لم تُجرد - قابلة للضغط */}
        <button
          onClick={() => setStatusFilter(statusFilter === "open" ? "all" : "open")}
          className={`flex flex-col gap-0.5 rounded-xl px-3 py-2.5 border text-start transition-all hover:shadow-md ${
            statusFilter === "open"
              ? "bg-amber-500/20 border-amber-500/60 ring-2 ring-amber-500/40"
              : "bg-amber-500/10 border-amber-500/40 hover:border-amber-500/60"
          }`}
        >
          <p className="text-[10px] font-semibold text-amber-400">لم تُجرد ({openCount}) ▼</p>
          <p className="text-sm font-bold text-amber-400">{totalOpenValue.toLocaleString("ar-AE", {maximumFractionDigits: 0})} د.إ</p>
        </button>

        {/* زر وضع الجدول */}
        <button
          onClick={() => setTableMode(m => m === "simple" ? "detailed" : "simple")}
          className={`flex flex-col gap-0.5 rounded-xl px-3 py-2.5 border text-start transition-all hover:shadow-md ${
            tableMode === "simple"
              ? "bg-primary/10 border-primary/40 ring-1 ring-primary/30"
              : "bg-muted/20 border-border/40 hover:border-primary/30"
          }`}
        >
          <p className="text-[10px] text-muted-foreground">عرض الجدول</p>
          <p className="text-sm font-bold text-foreground">{tableMode === "simple" ? "🔲 بسيط" : "📊 مفصّل"}</p>
          <p className="text-[10px] text-muted-foreground">{tableMode === "simple" ? "3 أعمدة" : "14 عمود"}</p>
        </button>
      </div>

      {/* Produce Semi-Finished Form */}
      {showProduceForm && (
        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical size={16} className="text-purple-400" />
              إنتاج مادة مصنّعة
            </CardTitle>
            <p className="text-xs text-muted-foreground">اختر المادة المصنّعة وأدخل الكمية المنتجة — سيتم خصم المكونات تلقائياً من المخزون</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Semi-finished material selector */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Select value={prodMaterialId} onValueChange={(v) => { setProdMaterialId(v); setProdQty(""); setProdActualYield(""); }}>
                  <SelectTrigger className="h-9 text-sm border-purple-500/30">
                    <SelectValue placeholder="اختر المادة المصنّعة" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1.5 sticky top-0 bg-popover z-10">
                      <div className="relative">
                        <Search size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          className="w-full h-7 text-xs pr-7 pl-2 rounded border border-border bg-background focus:outline-none"
                          placeholder="ابحث في المواد المصنّعة..."
                          value={prodMaterialSearch}
                          onChange={(e) => setProdMaterialSearch(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    {(semiMats as any[])
                      .filter((m) => m.isActive)
                      .filter((m) => {
                        if (!prodMaterialSearch) return true;
                        const q = prodMaterialSearch.toLowerCase();
                        return m.name.toLowerCase().includes(q) || (m.nameAr && m.nameAr.includes(prodMaterialSearch));
                      })
                      .map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          <span className="flex items-center gap-2">
                            <FlaskConical size={12} className="text-purple-400" />
                            {m.nameAr || m.name}
                            <span className="text-muted-foreground text-xs">({m.unit})</span>
                            <span className="text-muted-foreground text-xs">رصيد: {parseFloat(m.currentQuantity ?? "0").toFixed(2)}</span>
                          </span>
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">
                  كمية المادة الخام{selectedSemiMat ? ` (${selectedSemiMat.unit})` : ""}
                </label>
                <NumericInput
                  placeholder={selectedSemiMat ? `0.000 ${selectedSemiMat.unit}` : "0.000"}
                  value={prodQty}
                  onChange={(e) => setProdQty(e.target.value)}
                  className="h-9 text-sm border-purple-500/30"
                  step="0.001"
                  min="0"
                />
              </div>
            </div>
            {/* Preview: مكونات ستُخصم */}
            {prodMaterialId && prodQtyNum > 0 && (producePreview as any[]).length > 0 && (
              <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
                <p className="text-xs font-medium text-purple-300 flex items-center gap-1.5">
                  <FlaskConical size={12} />
                  المكونات التي ستُخصم من المخزون عند إنتاج {prodQtyNum} {selectedSemiMat?.unit}:
                </p>
                <div className="space-y-1.5">
                  {(producePreview as any[]).map((item: any) => (
                    <div key={item.ingredientId} className={`flex items-center justify-between text-xs rounded px-2 py-1.5 ${
                      item.sufficient ? "bg-muted/30" : "bg-red-500/10 border border-red-500/20"
                    }`}>
                      <span className="font-medium">{item.ingredientNameAr || item.ingredientName}</span>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span>
                          خصم: <span className={item.sufficient ? "text-foreground font-medium" : "text-red-400 font-bold"}>
                            {item.deductQty.toFixed(3)} {item.inventoryUnit}
                          </span>
                        </span>
                        <span>متاح: <span className={item.sufficient ? "text-green-400" : "text-red-400"}>{item.currentStock.toFixed(3)}</span></span>
                        {!item.sufficient && <span className="text-red-400 font-bold">⚠ نقص!</span>}
                      </div>
                    </div>
                  ))}
                </div>
                {(producePreview as any[]).some((i: any) => !i.sufficient) && (
                  <p className="text-xs text-red-400 font-medium">⚠️ بعض المكونات غير كافية في المخزون</p>
                )}
              </div>
            )}
            {/* Checkbox: الإنتاج الفعلي مختلف عن كمية المواد الخام */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasProdDifferentYield}
                onChange={(e) => {
                  setHasProdDifferentYield(e.target.checked);
                  if (!e.target.checked) setProdActualYield("");
                }}
                className="w-4 h-4 rounded accent-purple-500"
              />
              <span className="text-sm text-muted-foreground">
                الإنتاج الفعلي يختلف عن كمية المواد الخام
              </span>
            </label>
            {hasProdDifferentYield && (
              <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                <ArrowRight size={14} className="text-purple-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-purple-300 mb-1.5 font-medium">الإنتاج الفعلي (الناتج بعد التصنيع)</p>
                  <NumericInput
                    placeholder={`مثال: إذا الخام ${prodQty || "1"} ${selectedSemiMat?.unit ?? ""} → الناتج ؟`}
                    value={prodActualYield}
                    onChange={(e) => setProdActualYield(e.target.value)}
                    className="h-9 text-sm border-purple-500/30"
                    step="0.001"
                    min="0"
                    numpadLabel="الإنتاج الفعلي"
                  />
                  <p className="text-xs text-muted-foreground mt-1">الجرد سيُحسب على هذه الكمية</p>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">ملاحظات (اختياري)</label>
              <Input
                placeholder="ملاحظات"
                value={prodNotes}
                onChange={(e) => setProdNotes(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleProduce} disabled={!prodMaterialId || !prodQty || produceSemiFinished.isPending} className="bg-purple-600 hover:bg-purple-700">
                مراجعة وتأكيد الإنتاج
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowProduceForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Form */}
      {showAddForm && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">سحب مادة من المخزون</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Select value={selMaterialId} onValueChange={setSelMaterialId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="اختر المادة (خام أو مصنّعة)" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1.5 sticky top-0 bg-popover z-10">
                      <div className="relative">
                        <Search size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          className="w-full h-7 text-xs pr-7 pl-2 rounded border border-border bg-background focus:outline-none"
                          placeholder="ابحث..."
                          value={selMaterialSearch}
                          onChange={(e) => setSelMaterialSearch(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    {filteredMaterials.length === 0 ? (
                      <div className="py-3 text-center text-xs text-muted-foreground">لا توجد نتائج</div>
                    ) : (
                      filteredMaterials.map((m) => (
                        <SelectItem key={`${m.type}-${m.id}`} value={String(m.id)}>
                          <span className="flex items-center gap-2">
                            {m.type === "semi_finished" ? (
                              <FlaskConical size={12} className="text-purple-400" />
                            ) : (
                              <Package size={12} className="text-blue-400" />
                            )}
                            {(m as any).nameAr || m.name}
                            <span className="text-muted-foreground text-xs">({m.unit})</span>
                            <span className="text-muted-foreground text-xs">
                              متاح: {parseFloat((m as any).currentQuantity ?? "0").toFixed(2)}
                            </span>
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <NumericInput
                
                placeholder="الكمية"
                value={pulledQty}
                onChange={(e) => setPulledQty(e.target.value)}
                className="h-9 text-sm"
                step="0.001"
                min="0"
              />
            </div>
            {/* Checkbox: الإنتاج الفعلي مختلف عن الخام */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasDifferentYield}
                onChange={(e) => {
                  setHasDifferentYield(e.target.checked);
                  if (!e.target.checked) setAddActualYield("");
                }}
                className="w-4 h-4 rounded accent-orange-500"
              />
              <span className="text-sm text-muted-foreground">
                الإنتاج الفعلي يختلف عن كمية المواد الخام
              </span>
            </label>
            {hasDifferentYield && (
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <ArrowRight size={14} className="text-amber-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-amber-300 mb-1.5 font-medium">الإنتاج الفعلي (الناتج بعد التصنيع)</p>
                  <NumericInput
                    placeholder={`مثال: إذا الخام ${pulledQty || "1"} ${allMaterials.find(m => String(m.id) === selMaterialId)?.unit ?? ""} → الناتج ؟`}
                    value={addActualYield}
                    onChange={(e) => setAddActualYield(e.target.value)}
                    className="h-9 text-sm"
                    step="0.001"
                    min="0"
                    numpadLabel="الإنتاج الفعلي"
                  />
                  <p className="text-xs text-muted-foreground mt-1">الجرد سيُحسب على هذه الكمية</p>
                </div>
              </div>
            )}
            <Input
              placeholder="ملاحظات (اختياري)"
              value={pullNotes}
              onChange={(e) => setPullNotes(e.target.value)}
              className="h-9 text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={addPull.isPending}>
                {addPull.isPending ? "جاري السحب..." : "تأكيد السحب"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>
                إلغاء
              </Button>
            </div>
          </CardContent>
        </Card>
      )}



      {/* Search + Filter Bar */}
      {!isLoading && (pulls as Pull[]).length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={pullSearch}
              onChange={(e) => { setPullSearch(e.target.value); setPullsPage(1); }}
              placeholder="ابحث عن مادة..."
              className="pr-9 h-9 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPullsPage(1); }}>
            <SelectTrigger className="h-9 w-36 text-sm">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الحالات</SelectItem>
              <SelectItem value="open">مفتوح</SelectItem>
              <SelectItem value="counted">تم الجرد</SelectItem>
              <SelectItem value="closed">مغلق</SelectItem>
            </SelectContent>
          </Select>
          {(pullSearch || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs text-muted-foreground"
              onClick={() => { setPullSearch(""); setStatusFilter("all"); setPullsPage(1); }}
            >
              مسح الفلتر
            </Button>
          )}
          {filteredPulls.length !== (pulls as Pull[]).length && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {filteredPulls.length} نتيجة
            </Badge>
          )}
        </div>
      )}

      {/* Pulls Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
      ) : filteredPulls.length === 0 && pullSearch ? (
        <div className="text-center py-12 text-muted-foreground">
          <Search size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">لا توجد نتائج لـ "{pullSearch}"</p>
          <p className="text-xs mt-1">جرّب كلمة بحث مختلفة</p>
        </div>
      ) : (pulls as Pull[]).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">لا توجد مسحوبات لهذا اليوم</p>
          <p className="text-xs mt-1">اضغط "سحب مادة" لإضافة مواد للمطبخ</p>
        </div>
      ) : tableMode === "simple" ? (
        /* ── وضع المطبخ البسيط ─────────────────────────────────────────── */
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="py-2.5 px-4 text-start font-medium">المادة</th>
                <th className="py-2.5 px-4 text-center font-medium">الكمية / الهدر%</th>
                <th className="py-2.5 px-4 text-center font-medium">الكفاءة</th>
                <th className="py-2.5 px-4 text-center font-medium">الحالة</th>
                <th className="py-2.5 px-4 text-center font-medium">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {pagedPulls.map((pull) => {
                const pulled = parseFloat(pull.pulledQuantity ?? "0");
                const waste  = parseFloat(pull.wasteQty ?? "0");
                const ay     = pull.actualYield ? parseFloat(pull.actualYield) : null;
                const wastePct = pulled > 0 ? (waste / pulled) * 100 : 0;
                const effPct = pull.materialType === "semi_finished" && ay !== null && pulled > 0
                  ? (ay / pulled) * 100 : null;
                const statusCfg = pull.status === "closed"
                  ? { label: "مغلق", cls: "bg-emerald-500/10 text-emerald-400" }
                  : pull.status === "counted"
                  ? { label: "تم الجرد", cls: "bg-blue-500/10 text-blue-400" }
                  : { label: "مفتوح", cls: "bg-amber-500/10 text-amber-400" };
                return (
                  <tr key={pull.id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="py-3 px-4">
                      <p className="font-medium">{pull.materialNameAr || pull.materialName}</p>
                      <p className="text-xs text-muted-foreground">{pulled.toFixed(2)} {pull.unit}</p>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <p className="font-medium">{pulled.toFixed(2)} {pull.unit}</p>
                      {wastePct > 0 && (
                        <p className={`text-xs font-semibold ${wastePct > 12 ? "text-red-400" : wastePct > 6 ? "text-amber-400" : "text-muted-foreground"}`}>
                          هدر {wastePct.toFixed(1)}% {wastePct > 12 ? "⚠" : ""}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {effPct !== null ? (
                        <span className={`text-xs font-semibold ${effPct >= 95 ? "text-emerald-400" : effPct >= 85 ? "text-amber-400" : "text-red-400"}`}>
                          {effPct.toFixed(0)}%
                          {effPct < 85 && " ⚠"}
                        </span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusCfg.cls}`}>{statusCfg.label}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {pull.status === "open" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => setCountingPull(pull)}>
                          جرد
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-border/40 bg-muted/20 text-xs text-muted-foreground">
            {filteredPulls.length} مادة — اضغط "📊 مفصّل" في الأعلى لعرض كل الأعمدة
          </div>
        </div>
      ) : (
        /* ── وضع المدير المفصّل ─────────────────────────────────────────── */
        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              {/* Group header row */}
              <tr className="border-b border-border/30 bg-muted/20 text-xs">
                <th className="py-2 px-3 text-start" rowSpan={2}>المادة</th>
                {/* 🔶 Raw Material */}
                <th className="py-2 px-3 text-center text-orange-400 font-semibold border-r border-border/30" colSpan={3}>
                  🔶 المادة الخام
                </th>
                {/* 🔷 Production */}
                <th className="py-2 px-3 text-center text-purple-400 font-semibold border-r border-border/30" colSpan={1}>
                  🔷 الإنتاج
                </th>
                {/* 🔴 Usage */}
                <th className="py-2 px-3 text-center text-emerald-400 font-semibold border-r border-border/30" colSpan={3}>
                  🔴 الاستهلاك
                </th>
                {/* 🟠 Waste */}
                <th className="py-2 px-3 text-center text-red-400 font-semibold border-r border-border/30" colSpan={2}>
                  🟠 الهدر
                </th>
                {/* 🔁 Transferred */}
                <th className="py-2 px-3 text-center text-sky-400 font-semibold border-r border-border/30" colSpan={1}>
                  🔁 المرحّل
                </th>
                <th className="py-2 px-3" colSpan={2}></th>
              </tr>
              {/* Sub-header row */}
              <tr className="border-b border-border/50 bg-muted/30 text-xs text-muted-foreground">
                {/* Raw Material sub-cols */}
                <th className="py-2 px-3 text-center font-medium">كمية السحب</th>
                <th className="py-2 px-3 text-center font-medium">سعر الوحدة</th>
                <th className="py-2 px-3 text-center font-medium border-r border-border/30">إجمالي الخام</th>
                {/* Production sub-col */}
                <th className="py-2 px-3 text-center font-medium text-purple-400 border-r border-border/30">كمية الإنتاج</th>
                {/* Usage sub-cols */}
                <th className="py-2 px-3 text-center font-medium">كمية المستخدم</th>
                <th className="py-2 px-3 text-center font-medium">استهلاك/وحدة</th>
                <th className="py-2 px-3 text-center font-medium border-r border-border/30">تكلفة الاستهلاك</th>
                {/* Waste sub-cols */}
                <th className="py-2 px-3 text-center font-medium text-red-400">كمية الهدر</th>
                <th className="py-2 px-3 text-center font-medium text-red-400 border-r border-border/30">تكلفة الهدر</th>
                {/* Transferred sub-col */}
                <th className="py-2 px-3 text-center font-medium text-sky-400 border-r border-border/30">كمية المرحّل</th>
                {/* Status & Actions */}
                <th className="py-2 px-3 text-center font-medium">الحالة</th>
                <th className="py-2 px-3 text-center font-medium">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {pagedPulls.map((pull) => (
                <PullRow
                  key={pull.id}
                  pull={pull}
                  onDelete={(id) => {
                    if (confirm("هل تريد حذف هذا السحب؟ سيتم إعادة الكمية للمخزون.")) {
                      deletePull.mutate({ id });
                    }
                  }}
                  onCount={(p) => setCountingPull(p)}
                  onClose={(id) => closePull.mutate({ id })}
                  onEdit={(p) => { setEditingPull(p); setEditQty(p.pulledQuantity); }}
                  onUncount={(id) => {
                    if (confirm("هل تريد التراجع عن هذا الجرد؟\nسيتم إعادة الكميات المستخدمة والهدر للمخزون وحذف الترحيل لليوم التالي.")) {
                      uncountPull.mutate({ id });
                    }
                  }}
                  onReopen={(id) => {
                    if (confirm("إعادة فتح هذا الجرد المغلق؟\nسيعود لحالة (تم الجرد) ويمكن تعديله ثم إغلاقه مرة أخرى.")) {
                      reopenPull.mutate({ id });
                    }
                  }}
                  isAdmin={isAdmin}
                />
              ))}
            </tbody>
            {/* Summary footer */}
            {filteredPulls.length > 0 && (() => {
              // Raw Total Cost = sum(pulled * unitCost)
              const sumRawTotal = filteredPulls.reduce((s, p) => {
                return s + parseFloat(p.pulledQuantity ?? "0") * parseFloat(p.unitCost ?? "0");
              }, 0);
              // Usage Cost = sum(usedValue) using same logic as PullRow
              const sumUsageCost = filteredPulls.reduce((s, p) => {
                if (!p.closingCount) return s;
                const unitCost = parseFloat(p.unitCost ?? "0");
                const usedQty = parseFloat(p.closingCount);
                const pulled = parseFloat(p.pulledQuantity ?? "0");
                const actualYield = p.actualYield ? parseFloat(p.actualYield) : null;
                const isSemi = p.materialType === "semi_finished";
                const consumptionPerUnit = isSemi && actualYield !== null && actualYield > 0
                  ? pulled / actualYield
                  : null;
                const usedValue = consumptionPerUnit !== null
                  ? usedQty * consumptionPerUnit * unitCost
                  : usedQty * unitCost;
                return s + usedValue;
              }, 0);
              // Waste Cost = sum(wasteCost) using same logic as PullRow
              const sumWasteCost = filteredPulls.reduce((s, p) => {
                const wasteQty = p.wasteQty ? parseFloat(p.wasteQty) : 0;
                if (wasteQty <= 0) return s;
                const unitCost = parseFloat(p.unitCost ?? "0");
                const pulled = parseFloat(p.pulledQuantity ?? "0");
                const actualYield = p.actualYield ? parseFloat(p.actualYield) : null;
                const isSemi = p.materialType === "semi_finished";
                const consumptionPerUnit = isSemi && actualYield !== null && actualYield > 0
                  ? pulled / actualYield
                  : null;
                const wasteCost = consumptionPerUnit !== null
                  ? wasteQty * consumptionPerUnit * unitCost
                  : wasteQty * unitCost;
                return s + wasteCost;
              }, 0);
              return (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40 text-xs font-semibold">
                    <td className="py-2.5 px-3 text-muted-foreground">المجموع ({filteredPulls.length} مادة)</td>
                    {/* Raw */}
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3 text-orange-400">{sumRawTotal.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.إ</td>
                    {/* Production */}
                    <td className="py-2.5 px-3"></td>
                    {/* Usage */}
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3 text-emerald-400">{sumUsageCost > 0 ? sumUsageCost.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " د.إ" : "—"}</td>
                    {/* Waste */}
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3 text-red-400">{sumWasteCost > 0 ? sumWasteCost.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " د.إ" : "—"}</td>
                    {/* Transferred */}
                    <td className="py-2.5 px-3"></td>
                    {/* Status & Actions */}
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3"></td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
          <div className="p-3 border-t border-border/50">
            <Pagination currentPage={pullsPage} totalPages={pullsPagination.totalPages} onPageChange={setPullsPage} totalItems={pullsPagination.totalItems} pageSize={15} />
          </div>
        </div>
      )}

      {/* Edit Quantity Dialog */}
      <Dialog open={!!editingPull} onOpenChange={(o) => { if (!o) { setEditingPull(null); setEditQty(""); setEditActualYield(""); } }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base">تعديل كمية السحب</DialogTitle>
          </DialogHeader>
          {editingPull && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-sm font-medium">{editingPull.materialNameAr || editingPull.materialName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  الكمية الحالية: <span className="text-foreground font-medium">{parseFloat(editingPull.pulledQuantity).toFixed(2)} {editingPull.unit}</span>
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">كمية المكونات ({editingPull.unit})</label>
                <NumericInput
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  placeholder="0.000"
                  numpadLabel={`كمية ${editingPull.materialNameAr || editingPull.materialName}`}
                  className="text-center text-lg font-medium"
                />
                <p className="text-xs text-muted-foreground">
                  {editingPull.materialType === "semi_finished"
                    ? "على أساسها يتم خصم المكونات من المخزون"
                    : "سيتم تعديل المخزون تلقائياً بناءً على الفرق بين الكميتين"}
                </p>
              </div>
              {editingPull.materialType === "semi_finished" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <TrendingUp size={14} className="text-emerald-400" />
                    الإنتاج الفعلي (الناتج) ({editingPull.unit})
                  </label>
                  <NumericInput
                    value={editActualYield}
                    onChange={(e) => setEditActualYield(e.target.value)}
                    placeholder="0.000"
                    numpadLabel={`الإنتاج الفعلي لـ ${editingPull.materialNameAr || editingPull.materialName}`}
                    className="text-center text-lg font-medium"
                  />
                  <p className="text-xs text-muted-foreground">
                    الكمية الفعلية التي تُضاف لمخزون المادة المصنّعة
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setEditingPull(null); setEditQty(""); setEditActualYield(""); }}
              disabled={updateQuantity.isPending}
            >
              إلغاء
            </Button>
            <Button
              size="sm"
              disabled={!editQty || updateQuantity.isPending}
              onClick={() => {
                if (!editingPull || !editQty) return;
                const qty = parseFloat(editQty);
                if (isNaN(qty) || qty <= 0) { toast.error("الكمية يجب أن تكون أكبر من صفر"); return; }
                // Guard: actualYield must not exceed 50× the pulled quantity
                if (editingPull.materialType === "semi_finished" && editActualYield) {
                  const yieldVal = parseFloat(editActualYield);
                  if (isNaN(yieldVal) || yieldVal <= 0) { toast.error("الإنتاج الفعلي يجب أن يكون أكبر من صفر"); return; }
                  if (yieldVal > qty * 50) {
                    toast.error(`تحذير: الإنتاج الفعلي (${yieldVal}) كبير جداً مقارنةً بكمية المكونات (${qty}). تحقق من الأرقام قبل الحفظ.`);
                    return;
                  }
                }
                updateQuantity.mutate({
                  id: editingPull.id,
                  newQuantity: editQty,
                  ...(editingPull.materialType === "semi_finished" && editActualYield
                    ? { newActualYield: editActualYield }
                    : {}),
                });
              }}
            >
              {updateQuantity.isPending ? "جاري التعديل..." : "حفظ التعديل"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Count Dialog */}
      {countingPull && (
        <CountDialog
          pull={countingPull}
          open={!!countingPull}
          onClose={() => setCountingPull(null)}
          onSave={(id: number, remainingQty: string, wasteQty: string, carriedRawQty?: string) =>
            countPull.mutate({ id, remainingQty, wasteQty, carriedRawQty })
          }
        />
      )}

      {/* Produce Confirm Dialog */}
      <Dialog open={showProduceConfirm} onOpenChange={(o) => { if (!o) setShowProduceConfirm(false); }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical size={18} className="text-purple-400" />
              تأكيد الإنتاج
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {selectedSemiMat && (
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                <p className="font-semibold">{selectedSemiMat.nameAr || selectedSemiMat.name}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  الكمية المنتجة: <span className="text-purple-300 font-bold">{prodQtyNum.toFixed(3)} {selectedSemiMat.unit}</span>
                </p>
                {prodActualYield && (
                  <p className="text-sm text-muted-foreground">
                    الإنتاج الفعلي: <span className="text-emerald-300 font-bold">{parseFloat(prodActualYield).toFixed(3)} {selectedSemiMat.unit}</span>
                  </p>
                )}
              </div>
            )}
            {(producePreview as any[]).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">المكونات التي ستُخصم من المخزون:</p>
                {(producePreview as any[]).map((item: any) => (
                  <div key={item.ingredientId} className={`flex items-center justify-between text-xs rounded px-2 py-1.5 ${
                    item.sufficient ? "bg-muted/30" : "bg-red-500/10 border border-red-500/20"
                  }`}>
                    <span className="font-medium">{item.ingredientNameAr || item.ingredientName}</span>
                    <div className="flex items-center gap-2">
                      <span className={item.sufficient ? "text-foreground" : "text-red-400 font-bold"}>
                        {item.deductQty.toFixed(3)} {item.inventoryUnit}
                      </span>
                      {!item.sufficient && <span className="text-red-400">⚠ نقص!</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(producePreview as any[]).some((i: any) => !i.sufficient) && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-sm text-red-400 font-medium">⚠️ تحذير: بعض المكونات غير كافية في المخزون</p>
                <p className="text-xs text-muted-foreground mt-1">سيتم الإنتاج لكن قد تكون بعض الكميات سالبة</p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowProduceConfirm(false)}>إلغاء</Button>
            <Button
              size="sm"
              onClick={confirmProduce}
              disabled={produceSemiFinished.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {produceSemiFinished.isPending ? "جاري الإنتاج..." : "تأكيد الإنتاج"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Daily KPIs ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* KPI: استخدام الخضروات والمكونات */}
          {vegData && (
          <div className="rounded-xl border border-green-500/30 bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🥦</span>
              <span className="text-sm font-semibold text-green-400">استخدام المكونات اليوم</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{vegData.items.length} مادة</span>
              <span className="text-lg font-bold text-green-300">
                {vegData.totalCost.toFixed(2)}
                <span className="text-xs font-normal text-muted-foreground mr-1">د.إ</span>
              </span>
            </div>
            <div className="pt-1 border-t border-border/40 max-h-56 overflow-y-auto space-y-0.5">
              {vegData.items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">لا توجد مواد مسجلة اليوم</p>
              ) : (
                vegData.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-0.5 hover:bg-muted/20 rounded px-1 transition-colors">
                    <span className="text-xs text-foreground truncate max-w-[55%]">{item.name}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-green-300">{item.qty.toFixed(2)}</span>
                      <span className="text-muted-foreground">{item.unit}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          )}
        </div>

      {/* ─── Daily Accounts Dialog (shared component) ────────────────────────────────────────────── */}
      <DailyAccountDialog
        open={showDailyDialog}
        onOpenChange={setShowDailyDialog}
        editingDate={null}
        onSaved={() => { /* refetch if needed */ }}
      />
    </div>
  );
}
