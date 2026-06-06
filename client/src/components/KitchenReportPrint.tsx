import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

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
  carriedForward: string | null;
  carriedRawQty: string | null;
  wasteQty: string | null;
  status: "open" | "counted" | "closed";
  notes: string | null;
  unitCost: string | null;
  isCarriedForward: boolean | number | null;
};

interface KitchenReportPrintProps {
  pulls: Pull[];
  selectedDate: string;
  restaurantName?: string;
  preparedBy?: string;
}

function calcUsedCost(p: Pull): number {
  if (p.status === "open") return 0;
  const cost = parseFloat(p.unitCost ?? "0");
  const closingCount = parseFloat(p.closingCount ?? "0");
  const isSemi = p.materialType === "semi_finished";
  const isCarried = !!(p.isCarriedForward);
  const pulledRaw = parseFloat(p.pulledQuantity ?? "0");
  const carriedRaw = p.carriedRawQty ? parseFloat(p.carriedRawQty) : null;
  const actualYieldNum = p.actualYield ? parseFloat(p.actualYield) : null;
  const pulled = isSemi && isCarried && carriedRaw !== null ? carriedRaw : pulledRaw;
  const effectiveYield = actualYieldNum !== null && actualYieldNum > 0 ? actualYieldNum : pulled;
  const usedRaw = isSemi && effectiveYield > 0 ? closingCount * (pulled / effectiveYield) : closingCount;
  return usedRaw * cost;
}

function calcWasteCost(p: Pull): number {
  const waste = parseFloat(p.wasteQty ?? "0");
  if (waste <= 0) return 0;
  const cost = parseFloat(p.unitCost ?? "0");
  const isSemi = p.materialType === "semi_finished";
  const isCarried = !!(p.isCarriedForward);
  const pulledRaw = parseFloat(p.pulledQuantity ?? "0");
  const carriedRaw = p.carriedRawQty ? parseFloat(p.carriedRawQty) : null;
  const actualYieldNum = p.actualYield ? parseFloat(p.actualYield) : null;
  const pulled = isSemi && isCarried && carriedRaw !== null && carriedRaw > 0 ? carriedRaw : pulledRaw;
  const effectiveYield = actualYieldNum !== null && actualYieldNum > 0 ? actualYieldNum : pulled;
  const wasteRaw = isSemi && effectiveYield > 0 ? waste * (pulled / effectiveYield) : waste;
  return wasteRaw * cost;
}

function fmt(n: number) {
  return n.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ar-AE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export function KitchenReportPrint({ pulls, selectedDate, restaurantName = "المطعم", preparedBy = "" }: KitchenReportPrintProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const closedPulls = pulls.filter((p) => p.status !== "open");
  const openPulls = pulls.filter((p) => p.status === "open");

  const totalUsedValue = closedPulls.reduce((s, p) => s + calcUsedCost(p), 0);
  const totalWasteValue = pulls.reduce((s, p) => s + calcWasteCost(p), 0);

  const handlePrint = () => {
    const printWindow = window.open("", "_blank", "width=850,height=700");
    if (!printWindow) return;

    const rows = closedPulls.map((p, i) => {
      const name = p.materialNameAr || p.materialName;
      const isSemi = p.materialType === "semi_finished";
      const isCarried = !!(p.isCarriedForward);
      const pulledRaw = parseFloat(p.pulledQuantity ?? "0");
      const carriedRaw = p.carriedRawQty ? parseFloat(p.carriedRawQty) : null;
      const actualYieldNum = p.actualYield ? parseFloat(p.actualYield) : null;
      const pulled = isSemi && isCarried && carriedRaw !== null ? carriedRaw : pulledRaw;
      const effectiveYield = actualYieldNum !== null && actualYieldNum > 0 ? actualYieldNum : pulled;
      const closingCount = parseFloat(p.closingCount ?? "0");
      const usedRaw = isSemi && effectiveYield > 0 ? closingCount * (pulled / effectiveYield) : closingCount;
      const wasteQty = parseFloat(p.wasteQty ?? "0");
      const usedCost = calcUsedCost(p);
      const wasteCost = calcWasteCost(p);
      const unitCost = parseFloat(p.unitCost ?? "0");

      return `
        <tr>
          <td style="text-align:center;color:#888">${i + 1}</td>
          <td><strong>${name}</strong>${isSemi ? ' <span style="font-size:10px;color:#7b2d8b;background:#f3e5f5;padding:1px 5px;border-radius:8px">مصنّع</span>' : ""}</td>
          <td style="text-align:center">${fmt(pulledRaw)} ${p.unit}</td>
          <td style="text-align:center">${fmt(usedRaw)} ${p.unit}</td>
          <td style="text-align:center;color:${wasteQty > 0 ? "#c0392b" : "#aaa"}">${wasteQty > 0 ? fmt(wasteQty) + " " + p.unit : "—"}</td>
          <td style="text-align:center;color:#888">${fmt(unitCost)}</td>
          <td style="text-align:center;font-weight:700;color:#e85d04">${fmt(usedCost)}</td>
          <td style="text-align:center;color:${wasteCost > 0 ? "#c0392b" : "#aaa"}">${wasteCost > 0 ? fmt(wasteCost) : "—"}</td>
        </tr>
      `;
    }).join("");

    const openRows = openPulls.map((p, i) => {
      const name = p.materialNameAr || p.materialName;
      const pulledRaw = parseFloat(p.pulledQuantity ?? "0");
      return `
        <tr style="color:#888">
          <td style="text-align:center">${i + 1}</td>
          <td>${name}</td>
          <td style="text-align:center">${fmt(pulledRaw)} ${p.unit}</td>
          <td colspan="5" style="text-align:center;color:#f57f17">لم يُجرد بعد</td>
        </tr>
      `;
    }).join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8"/>
        <title>تقرير الإنتاج - ${fmtDate(selectedDate)}</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family:'Cairo',Arial,sans-serif; font-size:13px; color:#222; background:#fff; direction:rtl; padding:32px; }

          /* Header */
          .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; padding-bottom:14px; border-bottom:3px solid #e85d04; }
          .title-block .rest { font-size:20px; font-weight:800; color:#e85d04; }
          .title-block .sub { font-size:13px; color:#555; margin-top:2px; }
          .date-block { text-align:left; }
          .date-block .date { font-size:14px; font-weight:700; }
          .date-block .meta { font-size:11px; color:#888; margin-top:3px; }

          /* Summary boxes */
          .summary { display:flex; gap:16px; margin-bottom:24px; }
          .box { flex:1; border-radius:10px; padding:14px 18px; text-align:center; }
          .box .lbl { font-size:11px; color:#666; margin-bottom:6px; }
          .box .val { font-size:20px; font-weight:800; }
          .box .unit { font-size:11px; color:#888; margin-top:2px; }
          .box-orange { background:#fff5ee; border:2px solid #e85d04; }
          .box-orange .val { color:#e85d04; }
          .box-red { background:#fff5f5; border:2px solid #e74c3c; }
          .box-red .val { color:#c0392b; }
          .box-gray { background:#f5f5f5; border:2px solid #ddd; }
          .box-gray .val { color:#333; }

          /* Table */
          table { width:100%; border-collapse:collapse; margin-bottom:20px; }
          thead th { background:#1a1a2e; color:#fff; padding:10px 12px; font-size:12px; font-weight:600; }
          tbody tr:nth-child(even) { background:#fafafa; }
          tbody td { padding:9px 12px; border-bottom:1px solid #eee; font-size:12.5px; }
          tfoot td { background:#1a1a2e; color:#fff; padding:10px 12px; font-weight:700; font-size:13px; }

          .section-label { font-size:13px; font-weight:700; color:#1a1a2e; margin-bottom:8px; padding-bottom:4px; border-bottom:2px solid #e85d04; }
          .open-note { background:#fff8e1; border:1px solid #f9a825; border-radius:6px; padding:8px 12px; font-size:12px; color:#7b5e00; margin-bottom:10px; }

          /* Footer */
          .footer { margin-top:28px; padding-top:16px; border-top:2px solid #eee; display:flex; gap:24px; }
          .sign { flex:1; text-align:center; }
          .sign-line { border-bottom:1px solid #bbb; margin:30px 12px 6px; }
          .sign-lbl { font-size:11px; color:#666; }
          .print-time { text-align:center; font-size:10px; color:#bbb; margin-top:14px; }

          @media print { body { padding:16px; } * { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
        </style>
      </head>
      <body>

        <div class="header">
          <div class="title-block">
            <div class="rest">${restaurantName}</div>
            <div class="sub">تقرير تكلفة المطبخ اليومي</div>
          </div>
          <div class="date-block">
            <div class="date">${fmtDate(selectedDate)}</div>
            <div class="meta">${preparedBy ? "أعده: " + preparedBy + " · " : ""}طُبع: ${new Date().toLocaleTimeString("ar-AE")}</div>
          </div>
        </div>

        <div class="summary">
          <div class="box box-orange">
            <div class="lbl">تكلفة المطبخ</div>
            <div class="val">${fmt(totalUsedValue)}</div>
            <div class="unit">درهم — قيمة ما استُخدم فعلاً</div>
          </div>
          <div class="box box-red">
            <div class="lbl">قيمة الهدر</div>
            <div class="val">${fmt(totalWasteValue)}</div>
            <div class="unit">درهم</div>
          </div>
          <div class="box box-gray">
            <div class="lbl">عدد المواد المجرودة</div>
            <div class="val">${closedPulls.length}</div>
            <div class="unit">من أصل ${pulls.length} مادة</div>
          </div>
        </div>

        ${closedPulls.length > 0 ? `
        <div class="section-label">تفاصيل المواد المستخدمة</div>
        <table>
          <thead>
            <tr>
              <th style="width:32px">#</th>
              <th>المادة</th>
              <th>الكمية المسحوبة</th>
              <th>المستخدم فعلاً</th>
              <th>الهدر</th>
              <th>سعر الوحدة (د.إ)</th>
              <th>تكلفة الاستخدام (د.إ)</th>
              <th>قيمة الهدر (د.إ)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="6" style="text-align:right">الإجمالي</td>
              <td style="text-align:center">${fmt(totalUsedValue)}</td>
              <td style="text-align:center">${fmt(totalWasteValue)}</td>
            </tr>
          </tfoot>
        </table>
        ` : ""}

        ${openPulls.length > 0 ? `
        <div class="section-label" style="border-color:#f9a825;margin-top:16px">مواد لم يُجرد عليها بعد (${openPulls.length})</div>
        <div class="open-note">⚠️ هذه المواد لم يُسجَّل عليها جرد — لا تُحتسب في تكلفة المطبخ</div>
        <table>
          <thead>
            <tr>
              <th style="width:32px">#</th>
              <th>المادة</th>
              <th>الكمية المسحوبة</th>
              <th colspan="5">الحالة</th>
            </tr>
          </thead>
          <tbody>${openRows}</tbody>
        </table>
        ` : ""}

        <div class="footer">
          <div class="sign"><div class="sign-line"></div><div class="sign-lbl">مدير المطبخ</div></div>
          <div class="sign"><div class="sign-line"></div><div class="sign-lbl">مدير التكاليف</div></div>
          <div class="sign"><div class="sign-line"></div><div class="sign-lbl">المدير العام</div></div>
        </div>

        <div class="print-time">تم إنشاء هذا التقرير تلقائياً بواسطة نظام إدارة المطعم</div>

        <script>window.onload = function(){ window.print(); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={handlePrint}
        className="gap-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
      >
        <FileText size={16} />
        تصدير تقرير PDF
      </Button>
      <div ref={printRef} style={{ display: "none" }} />
    </>
  );
}
