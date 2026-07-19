import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";

/**
 * Every month at a glance.
 *
 * Colours are role-based, and the two categorical hues (food / labour) were run
 * through the palette validator for both surfaces rather than picked by eye:
 * light #2a78d6 / #d97706 and dark #3987e5 / #cf8000 both clear the lightness
 * band, chroma floor, CVD separation and contrast checks.
 *
 * Green and red are reserved for profit/loss status and never used as a series
 * colour, so a colour can only ever mean one thing on this page.
 */
const SERIES = {
  food: { light: "#2a78d6", dark: "#3987e5", label: "تكلفة الطعام" },
  labour: { light: "#d97706", dark: "#cf8000", label: "العمالة" },
};
const GOOD = "#059669";
const BAD = "#e11d48";
const PRIME_CEILING = 65;

const fmtMoney = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("ar-AE", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(1)}%`;

type MonthRow = {
  year: number; month: number; label: string; daysRecorded: number;
  netSales: number; foodCostPercentage: number; labourCostPercentage: number;
  primeCostPercentage: number; netProfit: number; netProfitMargin: number;
  partial: boolean; inventoryMissing: boolean;
};

export default function AccountsOverview({
  data, currency, onPickMonth,
}: {
  data: {
    months: MonthRow[];
    totals: {
      netSales: number; netProfit: number;
      avgPrimeCostPercentage: number; avgFoodCostPercentage: number;
      avgLabourCostPercentage: number;
      profitableMonths: number; monthsCount: number;
    };
  };
  currency: string;
  onPickMonth: (year: number, month: number) => void;
}) {
  const { months, totals } = data;
  if (months.length === 0) {
    return <p className="text-sm text-muted-foreground p-6 text-center">لا توجد شهور مسجّلة بعد.</p>;
  }

  // Direction is read from COMPLETE months only — a half-recorded month always
  // looks like a collapse and would fake a trend that isn't there.
  const complete = months.filter((m) => !m.partial);
  const trend =
    complete.length >= 2
      ? complete[complete.length - 1].netSales - complete[complete.length - 2].netSales
      : 0;

  const chartData = months.map((m) => ({
    ...m,
    short: m.label.replace(/ \d{4}$/, ""),
    // A month with no inventory has no real food cost; plotting 0 would draw it
    // as an achievement, so it is left out of the stack and flagged instead.
    foodPlot: m.inventoryMissing ? null : m.foodCostPercentage,
    labourPlot: m.inventoryMissing ? null : m.labourCostPercentage,
  }));

  const missing = months.filter((m) => m.inventoryMissing);

  return (
    <div className="space-y-5">
      {/* ═══ Headline ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={`إجمالي المبيعات · ${totals.monthsCount} شهور`}
          value={fmtMoney(totals.netSales)} unit={currency} />
        <Stat
          label={totals.netProfit >= 0 ? "إجمالي الربح" : "إجمالي الخسارة"}
          value={fmtMoney(Math.abs(totals.netProfit))} unit={currency}
          tone={totals.netProfit > 0 ? "good" : totals.netProfit < 0 ? "bad" : "neutral"} big
        />
        <Stat
          label="متوسط التكلفة الأولية"
          value={fmtPct(totals.avgPrimeCostPercentage)}
          tone={totals.avgPrimeCostPercentage > PRIME_CEILING ? "bad" : "good"}
          hint={`الصحي ≤ ${PRIME_CEILING}%`}
        />
        <Stat
          label="شهور رابحة"
          value={`${totals.profitableMonths} من ${totals.monthsCount}`}
          tone={totals.profitableMonths * 2 >= totals.monthsCount ? "good" : "bad"}
        />
      </div>

      {/* ═══ Direction ═══ */}
      {complete.length >= 2 && (
        <div className={`flex items-center gap-2.5 rounded-xl border p-3 text-sm ${
          trend >= 0 ? "border-emerald-300 dark:border-emerald-800" : "border-rose-300 dark:border-rose-800"
        }`}>
          {trend >= 0
            ? <TrendingUp className="w-5 h-5 text-emerald-600 shrink-0" />
            : <TrendingDown className="w-5 h-5 text-rose-600 shrink-0" />}
          <span>
            آخر شهرين مكتملين:{" "}
            <b className={trend >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>
              {trend >= 0 ? "ارتفاع" : "انخفاض"} {fmtMoney(Math.abs(trend))} {currency}
            </b>{" "}
            في المبيعات ({complete[complete.length - 2].label} ← {complete[complete.length - 1].label})
          </span>
        </div>
      )}

      {missing.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <span>
            <b>{missing.map((m) => m.label).join("، ")}</b> — الجرد غير مُدخل، فتكلفة الطعام تظهر صفرًا
            والربح أعلى من الحقيقة. هذه الشهور مستبعدة من المتوسطات وغير مرسومة.
          </span>
        </div>
      )}

      {/* ═══ Sales ═══ */}
      <Panel title="صافي المبيعات شهريًا" subtitle={currency}>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="short" reversed tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--viz-grid)" }} />
            <YAxis orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
              tickFormatter={(v) => fmtMoney(v as number)} width={58} />
            <Tooltip content={<MoneyTip currency={currency} />} cursor={{ fill: "var(--viz-grid)" }} />
            <Bar dataKey="netSales" radius={[4, 4, 0, 0]} maxBarSize={24}
              fill={SERIES.food.light} isAnimationActive={false}>
              {chartData.map((m) => (
                <Cell key={`${m.year}-${m.month}`} fill="var(--viz-sales)" fillOpacity={m.partial ? 0.45 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <Note>الأعمدة الباهتة شهور لم تكتمل بعد.</Note>
      </Panel>

      {/* ═══ Profit — polarity, so a diverging pair around a zero baseline ═══ */}
      <Panel title="صافي الربح أو الخسارة شهريًا" subtitle={currency}>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="short" reversed tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
              tickFormatter={(v) => fmtMoney(v as number)} width={58} />
            <ReferenceLine y={0} stroke="var(--viz-axis)" />
            <Tooltip content={<MoneyTip currency={currency} field="netProfit" />} cursor={{ fill: "var(--viz-grid)" }} />
            <Bar dataKey="netProfit" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
              {chartData.map((m) => (
                <Cell key={`${m.year}-${m.month}`} fill={m.netProfit >= 0 ? GOOD : BAD}
                  fillOpacity={m.partial ? 0.45 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {/* ═══ Prime cost: food + labour stack to the whole, so a stacked bar ═══ */}
      <Panel title="التكلفة الأولية" subtitle="% من صافي المبيعات">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="short" reversed tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
              tickFormatter={(v) => `${v}%`} width={44} />
            <ReferenceLine y={PRIME_CEILING} stroke={BAD} strokeWidth={1}
              label={{ value: `الحد الصحي ${PRIME_CEILING}%`, position: "insideTopRight", fontSize: 10, fill: BAD }} />
            <Tooltip content={<PrimeTip />} cursor={{ fill: "var(--viz-grid)" }} />
            <Legend verticalAlign="top" align="right" height={28} iconType="circle" iconSize={9}
              wrapperStyle={{ fontSize: 12 }} />
            {/* 2px surface gap between the two segments, per the mark spec */}
            <Bar dataKey="foodPlot" stackId="prime" name={SERIES.food.label}
              fill="var(--viz-food)" maxBarSize={24} stroke="var(--viz-surface)" strokeWidth={2}
              isAnimationActive={false} />
            <Bar dataKey="labourPlot" stackId="prime" name={SERIES.labour.label}
              fill="var(--viz-labour)" maxBarSize={24} radius={[4, 4, 0, 0]}
              stroke="var(--viz-surface)" strokeWidth={2} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
        <Note>التكلفة الأولية = تكلفة الطعام + العمالة. أهم مؤشر تشغيلي في المطاعم.</Note>
      </Panel>

      {/* ═══ The table — identity never rests on colour alone ═══ */}
      <Panel title="كل الشهور">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                {["الشهر", "أيام", "صافي المبيعات", "طعام", "عمالة", "أولية", "صافي الربح", "الهامش"]
                  .map((h) => <th key={h} className="px-2 py-2 text-center font-medium whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...months].reverse().map((m) => (
                <tr key={`${m.year}-${m.month}`}
                  className="hover:bg-muted/40 cursor-pointer"
                  onClick={() => onPickMonth(m.year, m.month)}>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {m.label}
                    {m.partial && <span className="text-[10px] text-muted-foreground block">لم يكتمل</span>}
                    {m.inventoryMissing && <span className="text-[10px] text-amber-600 dark:text-amber-400 block">جرد ناقص</span>}
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">{m.daysRecorded}</td>
                  <td className="px-2 py-2 text-center tabular-nums font-medium">{fmtMoney(m.netSales)}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{m.inventoryMissing ? "—" : fmtPct(m.foodCostPercentage)}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{fmtPct(m.labourCostPercentage)}</td>
                  <td className={`px-2 py-2 text-center tabular-nums font-medium ${
                    m.inventoryMissing ? "" : m.primeCostPercentage > PRIME_CEILING ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"
                  }`}>
                    {m.inventoryMissing ? "—" : fmtPct(m.primeCostPercentage)}
                  </td>
                  <td className={`px-2 py-2 text-center tabular-nums font-semibold ${
                    m.netProfit > 0 ? "text-emerald-700 dark:text-emerald-400" : m.netProfit < 0 ? "text-rose-700 dark:text-rose-400" : ""
                  }`}>
                    {m.netProfit < 0 && "−"}{fmtMoney(Math.abs(m.netProfit))}
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">{fmtPct(m.netProfitMargin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note>اضغط على أي شهر لفتح تفاصيله.</Note>
      </Panel>
    </div>
  );
}

// ─── pieces ───────────────────────────────────────────────────────────────────
function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4 viz-root">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-bold">{title}</h3>
        {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground mt-2 pt-2 border-t">{children}</p>;
}

function Stat({
  label, value, unit, tone = "neutral", big, hint,
}: {
  label: string; value: string; unit?: string;
  tone?: "good" | "bad" | "neutral"; big?: boolean; hint?: string;
}) {
  const color = tone === "good" ? "text-emerald-700 dark:text-emerald-400"
    : tone === "bad" ? "text-rose-700 dark:text-rose-400" : "text-foreground";
  const border = tone === "good" ? "border-emerald-300 dark:border-emerald-800"
    : tone === "bad" ? "border-rose-300 dark:border-rose-800" : "";
  return (
    <div className={`rounded-xl border p-3 text-center ${border}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`${big ? "text-2xl" : "text-xl"} font-bold tabular-nums ${color}`}>
        {value}{unit && <span className="text-sm font-normal"> {unit}</span>}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function TipShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md" dir="rtl">
      <p className="font-semibold mb-1">{title}</p>
      {children}
    </div>
  );
}

function MoneyTip({ active, payload, currency, field = "netSales" }: any) {
  if (!active || !payload?.length) return null;
  const m: MonthRow = payload[0].payload;
  const v = field === "netProfit" ? m.netProfit : m.netSales;
  return (
    <TipShell title={m.label}>
      <p className="tabular-nums">
        {field === "netProfit" ? (v >= 0 ? "ربح" : "خسارة") : "صافي المبيعات"}:{" "}
        <b>{fmtMoney(Math.abs(v))} {currency}</b>
      </p>
      {m.partial && <p className="text-muted-foreground mt-0.5">{m.daysRecorded} يوم مسجّل فقط</p>}
    </TipShell>
  );
}

function PrimeTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const m: MonthRow = payload[0].payload;
  if (m.inventoryMissing) {
    return <TipShell title={m.label}><p className="text-amber-600">الجرد غير مُدخل</p></TipShell>;
  }
  return (
    <TipShell title={m.label}>
      <p className="tabular-nums">تكلفة الطعام: <b>{fmtPct(m.foodCostPercentage)}</b></p>
      <p className="tabular-nums">العمالة: <b>{fmtPct(m.labourCostPercentage)}</b></p>
      <p className={`tabular-nums mt-1 pt-1 border-t ${m.primeCostPercentage > PRIME_CEILING ? "text-rose-600" : "text-emerald-600"}`}>
        التكلفة الأولية: <b>{fmtPct(m.primeCostPercentage)}</b>
      </p>
    </TipShell>
  );
}
