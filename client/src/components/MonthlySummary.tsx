import { useState } from "react";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronDown, Info } from "lucide-react";
import type { MonthlyAccountsSummary } from "@shared/monthlyAccountsSummary";

const fmt = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("ar-AE", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

const pct = (n: number) =>
  `${(Number.isFinite(n) ? n : 0).toLocaleString("ar-AE", {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  })}%`;

/** Industry bands for a table-service restaurant. */
const BANDS = {
  food: { max: 35, label: "28–35%" },
  labour: { max: 35, label: "25–35%" },
  prime: { max: 65, label: "55–65%" },
};

/**
 * The month's result, laid out as an income statement read top-to-bottom
 * rather than a grid of unrelated figures.
 *
 * Deliberately shows ONE profit chain. Intermediate measures that used to sit
 * beside it (profit before inventory settlement, adjusted total expenses) are
 * accurate but invite the question "so which one is the profit?", so they moved
 * into the details panel.
 */
export default function MonthlySummary({
  summary, currency, onDrill,
}: {
  summary: MonthlyAccountsSummary;
  currency: string;
  onDrill: (key: "operational" | "nonOperational" | "foodPurchases" | "operationalExFood" | "nonOperationalExFood" | "unclassified") => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const s = summary;
  const net = s.profits.netProfitAfterInventory;
  const isProfit = net > 0;

  return (
    <div className="space-y-5">
      {/* ═══ 1. The four numbers that answer "how did the month go?" ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="صافي المبيعات" value={`${fmt(s.sales.netSales)}`} unit={currency} />
        <Kpi
          label={isProfit ? "صافي الربح" : "صافي الخسارة"}
          value={fmt(Math.abs(net))}
          unit={currency}
          tone={net === 0 ? "neutral" : isProfit ? "good" : "bad"}
          big
        />
        <Kpi
          label="هامش الربح"
          value={pct(s.profits.netProfitMargin)}
          tone={net === 0 ? "neutral" : isProfit ? "good" : "bad"}
        />
        <Kpi
          label="التكلفة الأولية"
          value={pct(s.keyMetrics.primeCostPercentage)}
          tone={s.keyMetrics.primeCostPercentage === 0 ? "neutral"
            : s.keyMetrics.primeCostPercentage > BANDS.prime.max ? "bad" : "good"}
          hint={`الصحي ${BANDS.prime.label}`}
        />
      </div>

      {/* ═══ 2. The income statement ═══ */}
      <div className="rounded-xl border overflow-hidden">
        <div className="bg-muted/60 px-4 py-2 text-sm font-bold">قائمة الدخل</div>
        <div className="divide-y">
          <Line label="صافي المبيعات" amount={s.sales.netSales} sign="=" strong currency={currency} />

          <Line
            label={s.inventory.staffMealsCredit > 0 ? "تكلفة الطعام (للعملاء)" : "تكلفة الطعام"}
            amount={-s.inventory.foodCost} sign="−" currency={currency}
            note={pct(s.inventory.foodCostPercentage)}
            noteTone={s.inventory.foodCostPercentage > BANDS.food.max ? "bad" : "ok"}
            tooltip={"تكلفة الطعام =\nمخزون أول الشهر + مشتريات الطعام − مخزون آخر الشهر\n− أكل الموظفين\n\nأكل الموظفين يخرج من هنا ويُحمّل على العمالة،\nلأنه ميزة للموظفين وليس تكلفة بيع للعملاء."}
            onClick={() => onDrill("foodPurchases")}
          />

          <Line label="مجمل الربح" amount={s.profits.grossProfitAfterFoodCost} sign="=" subtotal currency={currency} />

          <Line
            label="الرواتب والأجور"
            amount={-(s.keyMetrics.labourCost - s.inventory.staffMealsCredit)}
            sign="−" currency={currency}
            note={pct(s.keyMetrics.labourCostPercentage)}
            noteTone={s.keyMetrics.labourCostPercentage > BANDS.labour.max ? "bad" : "ok"}
          />

          {s.inventory.staffMealsCredit > 0 && (
            <Line
              label="أكل الموظفين (من المخزون)" amount={-s.inventory.staffMealsCredit}
              sign="−" currency={currency}
              tooltip={"قيمة الطعام الذي استهلكه الموظفون.\nخرج من تكلفة الطعام ودخل هنا ضمن العمالة —\nنفس المبلغ، ولا يغيّر صافي الربح."}
            />
          )}

          <Line
            label="مصروفات تشغيلية أخرى"
            amount={-(s.profits.operationalExcludingFood
              - (s.keyMetrics.labourCost - s.inventory.staffMealsCredit))}
            sign="−" currency={currency}
            onClick={() => onDrill("operationalExFood")}
          />

          <Line label="الربح التشغيلي" amount={s.profits.operatingProfit} sign="=" subtotal currency={currency} />

          {s.profits.nonOperationalExcludingFood > 0 && (
            <Line
              label="مصروفات غير تشغيلية" amount={-s.profits.nonOperationalExcludingFood}
              sign="−" currency={currency}
              onClick={() => onDrill("nonOperationalExFood")}
            />
          )}

          <Line
            label={isProfit ? "صافي الربح" : "صافي الخسارة"}
            amount={net} sign="=" result currency={currency}
            tooltip={"صافي الربح =\nصافي المبيعات − تكلفة الطعام − باقي المصروفات التشغيلية − غير التشغيلية"}
          />
        </div>
      </div>

      {/* ═══ 3. Benchmarks ═══ */}
      <div className="rounded-xl border p-4 space-y-3">
        <p className="text-sm font-bold">المؤشرات مقارنة بالمعدل الصحي</p>
        <Gauge label="تكلفة الطعام" value={s.inventory.foodCostPercentage} max={BANDS.food.max} band={BANDS.food.label} />
        <Gauge label="العمالة (شاملة أكل الموظفين)" value={s.keyMetrics.labourCostPercentage} max={BANDS.labour.max} band={BANDS.labour.label} />
        <Gauge label="التكلفة الأولية" value={s.keyMetrics.primeCostPercentage} max={BANDS.prime.max} band={BANDS.prime.label} strong />
        <p className="text-[11px] text-muted-foreground pt-1 border-t">
          التكلفة الأولية = تكلفة الطعام + العمالة. أهم مؤشر تشغيلي في المطاعم.
        </p>
      </div>

      {/* ═══ 4. Everything else, out of the way ═══ */}
      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full rounded-xl border px-4 py-2.5 text-sm font-semibold hover:bg-muted/40">
            <span>تفاصيل إضافية</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-xl border mt-2 p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1">المبيعات والمخزون</p>
              <Detail label="إجمالي المبيعات" value={`${fmt(s.sales.totalSales)} ${currency}`} />
              <Detail label="الخصومات" value={`${fmt(s.sales.totalDiscounts)} ${currency}`} />
              <Detail label="مخزون أول الشهر" value={`${fmt(s.inventory.openingInventory)} ${currency}`} />
              <Detail label="مشتريات الطعام" value={`${fmt(s.inventory.foodPurchases)} ${currency}`} onClick={() => onDrill("foodPurchases")} />
              <Detail label="مخزون آخر الشهر" value={`${fmt(s.inventory.closingInventory)} ${currency}`} />
              {s.inventory.staffMealsCredit > 0 && (
                <Detail
                  label="تكلفة الطعام قبل خصم أكل الموظفين"
                  value={`${fmt(s.inventory.foodCostGross)} ${currency}`}
                  tooltip={"الرقم قبل نقل أكل الموظفين إلى العمالة."}
                />
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1">مصروفات وبنود أخرى</p>
              <Detail label="إجمالي المصروفات التشغيلية" value={`${fmt(s.recordedExpenses.operational)} ${currency}`} onClick={() => onDrill("operational")} />
              <Detail label="إجمالي غير التشغيلية" value={`${fmt(s.recordedExpenses.nonOperational)} ${currency}`} onClick={() => onDrill("nonOperational")} />
              {s.recordedExpenses.unclassified > 0 && (
                <Detail label="غير مصنفة (خارج النتائج)" value={`${fmt(s.recordedExpenses.unclassified)} ${currency}`} onClick={() => onDrill("unclassified")} />
              )}
              {s.recordedExpenses.excludedFromPL > 0 && (
                <Detail
                  label="سحب مالك وأصول"
                  value={`${fmt(s.recordedExpenses.excludedFromPL)} ${currency}`}
                  tooltip={"سحب المالك توزيع أرباح، وشراء الأصول مصروف رأسمالي.\nلا يُخصم أي منهما من ربح الشهر."}
                />
              )}
              <Detail label="أكل الموظفين" value={`${fmt(s.staffMeals.total)} ${currency} (${pct(s.staffMeals.percentage)})`}
                tooltip={"مؤشر تحليلي فقط — غير مخصوم من الربح،\nلأنه مستهلك من نفس مخزون الطعام."} />
              <Detail label="الربح قبل تسوية المخزون" value={`${fmt(s.profits.profitBeforeInventory)} ${currency}`} />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ─── pieces ───────────────────────────────────────────────────────────────────
function Kpi({
  label, value, unit, tone = "neutral", big, hint,
}: {
  label: string; value: string; unit?: string;
  tone?: "good" | "bad" | "neutral"; big?: boolean; hint?: string;
}) {
  const color =
    tone === "good" ? "text-emerald-700 dark:text-emerald-400"
    : tone === "bad" ? "text-rose-700 dark:text-rose-400"
    : "text-foreground";
  const border =
    tone === "good" ? "border-emerald-300 dark:border-emerald-800"
    : tone === "bad" ? "border-rose-300 dark:border-rose-800"
    : "";
  return (
    <div className={`rounded-xl border p-3 text-center ${border}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`${big ? "text-2xl" : "text-xl"} font-bold tabular-nums ${color}`}>
        {value}
        {unit && <span className="text-sm font-normal"> {unit}</span>}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function Line({
  label, amount, sign, currency, note, noteTone, strong, subtotal, result, tooltip, onClick,
}: {
  label: string; amount: number; sign: "=" | "−"; currency: string;
  note?: string; noteTone?: "ok" | "bad";
  strong?: boolean; subtotal?: boolean; result?: boolean;
  tooltip?: string; onClick?: () => void;
}) {
  const rowClass = result
    ? "bg-muted/70 font-bold text-base"
    : subtotal
      ? "bg-muted/30 font-semibold"
      : strong
        ? "font-semibold"
        : "";
  const amountColor = result
    ? amount > 0 ? "text-emerald-700 dark:text-emerald-400"
      : amount < 0 ? "text-rose-700 dark:text-rose-400" : ""
    : sign === "−" ? "text-rose-600 dark:text-rose-400" : "";

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-2.5 ${rowClass}`}>
      <span className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground w-3 shrink-0">{sign === "−" ? "−" : ""}</span>
        {onClick ? (
          <button type="button" onClick={onClick} className="underline decoration-dotted underline-offset-4 hover:opacity-70 text-start">
            {label}
          </button>
        ) : label}
        {tooltip && (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label={`معادلة ${label}`} className="opacity-50 hover:opacity-100">
                  <Info className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[300px] text-right whitespace-pre-line">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </span>
      <span className="flex items-center gap-2 shrink-0">
        {note && (
          <span className={`text-[11px] tabular-nums ${noteTone === "bad" ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-muted-foreground"}`}>
            {note}
          </span>
        )}
        <span className={`text-sm tabular-nums ${amountColor}`}>
          {fmt(Math.abs(amount))} <span className="text-xs font-normal">{currency}</span>
        </span>
      </span>
    </div>
  );
}

/** Where a percentage sits against its healthy ceiling. */
function Gauge({
  label, value, max, band, strong,
}: { label: string; value: number; max: number; band: string; strong?: boolean }) {
  const over = value > max;
  // The bar is scaled so the healthy ceiling sits at 70% of the width, leaving
  // visible room for the overshoot instead of pinning everything at full.
  const width = Math.min(100, (value / (max / 0.7)) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className={strong ? "font-semibold" : ""}>{label}</span>
        <span className={`tabular-nums ${over ? "text-rose-700 dark:text-rose-400 font-bold" : "text-emerald-700 dark:text-emerald-400"}`}>
          {pct(value)}
          <span className="text-[11px] text-muted-foreground font-normal"> / الصحي {band}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden relative">
        <div
          className={`h-full rounded-full ${over ? "bg-rose-500" : "bg-emerald-500"}`}
          style={{ width: `${width}%` }}
        />
        {/* the healthy ceiling marker */}
        <div className="absolute top-0 bottom-0 w-px bg-foreground/40" style={{ right: "70%" }} />
      </div>
    </div>
  );
}

function Detail({
  label, value, onClick, tooltip,
}: { label: string; value: string; onClick?: () => void; tooltip?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b last:border-b-0 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {onClick ? (
          <button type="button" onClick={onClick} className="underline decoration-dotted underline-offset-4 hover:opacity-70">
            {label}
          </button>
        ) : label}
        {tooltip && (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="opacity-50 hover:opacity-100"><Info className="w-3 h-3" /></button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[280px] text-right whitespace-pre-line">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
