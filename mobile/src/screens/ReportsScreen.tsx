import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { trpc } from "../lib/trpc";

const today = () => new Date().toLocaleDateString("en-CA");

const MONTHS_AR = [
  "", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export default function ReportsScreen() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data: accounts = [], isLoading: loadingList } = trpc.dailyAccounts.list.useQuery({ year, month });
  const { data: kpi, isLoading: loadingKpi } = trpc.dailyAccounts.financialKpi.useQuery({ year, month });

  const totalSales = accounts.reduce((s, a) => s + (a.salesCash ?? 0) + (a.salesCard ?? 0)
    + (a.salesKita ?? 0) + (a.salesOrders ?? 0) + (a.salesNoon ?? 0)
    + (a.salesDeliveroo ?? 0) + (a.salesCareem ?? 0), 0);
  const totalExpenses = accounts.reduce((s, a) =>
    s + (a.expensesSupplierInvoices ?? 0) + (a.expensesFreeInvoices ?? 0) + (a.expensesPartial ?? 0) + (a.expensesFixed ?? 0), 0);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const isLoading = loadingList || loadingKpi;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Month navigator */}
      <View style={s.monthNav}>
        <TouchableOpacity onPress={nextMonth} style={s.navBtn}><Text style={s.navArrow}>›</Text></TouchableOpacity>
        <Text style={s.monthTitle}>{MONTHS_AR[month]} {year}</Text>
        <TouchableOpacity onPress={prevMonth} style={s.navBtn}><Text style={s.navArrow}>‹</Text></TouchableOpacity>
      </View>

      {isLoading && <ActivityIndicator color="#6366f1" style={{ marginVertical: 24 }} />}

      {/* KPI cards */}
      <View style={s.kpiGrid}>
        <KpiCard label="صافي المبيعات" value={kpi?.netSales ?? 0} color="#22c55e" emoji="💰" />
        <KpiCard label="مجمل الربح" value={kpi?.grossProfit ?? 0} color="#6366f1" emoji="📈" />
        <KpiCard label="تكلفة البضاعة" value={kpi?.cogsValue ?? 0} color="#ef4444" emoji="📦" />
        <KpiCard label="إجمالي المديونية" value={kpi?.totalDebt ?? 0} color="#f97316" emoji="⚠️" />
      </View>

      {/* Monthly totals */}
      <View style={s.summaryCard}>
        <Text style={s.summaryTitle}>ملخص الشهر</Text>
        <SummaryRow label="إجمالي المبيعات" value={totalSales} color="#22c55e" />
        <SummaryRow label="إجمالي المصروفات" value={totalExpenses} color="#ef4444" />
        <View style={s.divider} />
        <SummaryRow
          label="صافي الربح التشغيلي"
          value={totalSales - totalExpenses}
          color={totalSales - totalExpenses >= 0 ? "#22c55e" : "#ef4444"}
          bold
        />
      </View>

      {/* Daily records */}
      <Text style={s.sectionLabel}>سجلات اليوم ({accounts.length} يوم)</Text>
      {accounts.length === 0 && !isLoading && (
        <Text style={s.empty}>لا توجد بيانات لهذا الشهر</Text>
      )}
      {accounts.slice().reverse().map((a) => (
        <DayCard key={a.accountDate} account={a} />
      ))}
    </ScrollView>
  );
}

function KpiCard({ label, value, color, emoji }: { label: string; value: number; color: string; emoji: string }) {
  return (
    <View style={s.kpiCard}>
      <Text style={s.kpiEmoji}>{emoji}</Text>
      <Text style={[s.kpiValue, { color }]}>
        {value.toLocaleString("ar-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

function SummaryRow({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  return (
    <View style={s.summaryRow}>
      <Text style={[s.summaryValue, { color }, bold && { fontSize: 18, fontWeight: "800" }]}>
        {value.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.إ
      </Text>
      <Text style={[s.summaryLabel, bold && { fontWeight: "700", color: "#f1f5f9" }]}>{label}</Text>
    </View>
  );
}

function DayCard({ account }: { account: any }) {
  const sales = (account.salesCash ?? 0) + (account.salesCard ?? 0) + (account.salesKita ?? 0)
    + (account.salesOrders ?? 0) + (account.salesNoon ?? 0) + (account.salesDeliveroo ?? 0) + (account.salesCareem ?? 0);
  const expenses = (account.expensesSupplierInvoices ?? 0) + (account.expensesFreeInvoices ?? 0)
    + (account.expensesPartial ?? 0) + (account.expensesFixed ?? 0);
  const profit = sales - expenses;
  return (
    <View style={s.dayCard}>
      <View style={s.dayCardTop}>
        <Text style={[s.dayProfit, { color: profit >= 0 ? "#22c55e" : "#ef4444" }]}>
          {profit >= 0 ? "+" : ""}{profit.toLocaleString("ar-AE", { minimumFractionDigits: 0 })}
        </Text>
        <Text style={s.dayDate}>{account.accountDate}</Text>
      </View>
      <View style={s.dayCardBottom}>
        <Text style={s.dayMeta}>مبيعات: <Text style={{ color: "#22c55e" }}>{sales.toLocaleString("ar-AE", { maximumFractionDigits: 0 })}</Text></Text>
        <Text style={s.dayMeta}>مصروفات: <Text style={{ color: "#ef4444" }}>{expenses.toLocaleString("ar-AE", { maximumFractionDigits: 0 })}</Text></Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 16 },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  navBtn: { width: 40, height: 40, backgroundColor: "#1e293b", borderRadius: 20, justifyContent: "center", alignItems: "center" },
  navArrow: { color: "#6366f1", fontSize: 22, fontWeight: "700" },
  monthTitle: { color: "#f1f5f9", fontSize: 18, fontWeight: "700" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  kpiCard: {
    flex: 1, minWidth: "45%", backgroundColor: "#1e293b", borderRadius: 12,
    padding: 14, alignItems: "center",
  },
  kpiEmoji: { fontSize: 22, marginBottom: 6 },
  kpiValue: { fontSize: 20, fontWeight: "800" },
  kpiLabel: { color: "#64748b", fontSize: 11, marginTop: 4, textAlign: "center" },
  summaryCard: { backgroundColor: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 20 },
  summaryTitle: { color: "#94a3b8", fontSize: 12, fontWeight: "600", marginBottom: 12, textAlign: "right" },
  summaryRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  summaryLabel: { color: "#94a3b8", fontSize: 14 },
  summaryValue: { fontSize: 15, fontWeight: "600" },
  divider: { height: 1, backgroundColor: "#334155", marginVertical: 8 },
  sectionLabel: { color: "#64748b", fontSize: 12, marginBottom: 10, textAlign: "right" },
  empty: { color: "#475569", textAlign: "center", marginTop: 40, fontSize: 15 },
  dayCard: { backgroundColor: "#1e293b", borderRadius: 10, padding: 12, marginBottom: 8 },
  dayCardTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  dayDate: { color: "#64748b", fontSize: 13 },
  dayProfit: { fontSize: 17, fontWeight: "700" },
  dayCardBottom: { flexDirection: "row-reverse", gap: 16 },
  dayMeta: { color: "#94a3b8", fontSize: 12 },
});
