import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { trpc } from "../lib/trpc";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  paid: { label: "مدفوع", color: "#22c55e" },
  deferred: { label: "مؤجل", color: "#ef4444" },
  partial: { label: "جزئي", color: "#f97316" },
  under_review: { label: "قيد المراجعة", color: "#eab308" },
};

const FILTER_TABS = [
  { key: undefined, label: "الكل" },
  { key: "deferred", label: "مؤجل" },
  { key: "partial", label: "جزئي" },
  { key: "paid", label: "مدفوع" },
] as const;

export default function InvoicesScreen() {
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  const { data: invoices = [], isLoading, refetch } = trpc.invoices.list.useQuery(
    filter ? { paymentStatus: filter as any } : undefined
  );

  const totalDeferred = invoices
    .filter((i) => i.paymentStatus === "deferred" || i.paymentStatus === "partial")
    .reduce((s, i) => s + parseFloat(i.remainingAmount as unknown as string || "0"), 0);

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  return (
    <View style={s.container}>
      {/* Debt banner */}
      {totalDeferred > 0 && (
        <View style={s.debtBanner}>
          <Text style={s.debtLabel}>إجمالي المديونية</Text>
          <Text style={s.debtValue}>
            {totalDeferred.toLocaleString("ar-AE", { minimumFractionDigits: 2 })} د.إ
          </Text>
        </View>
      )}

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterRow}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={String(tab.key)}
            style={[s.filterTab, filter === tab.key && s.filterTabActive]}
            onPress={() => setFilter(tab.key)}
          >
            <Text style={[s.filterTabText, filter === tab.key && s.filterTabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading && <ActivityIndicator color="#6366f1" style={{ marginVertical: 24 }} />}

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >
        {invoices.length === 0 && !isLoading && (
          <Text style={s.empty}>لا توجد فواتير</Text>
        )}
        {invoices.map((inv) => (
          <InvoiceCard key={inv.id} inv={inv} />
        ))}
      </ScrollView>
    </View>
  );
}

function InvoiceCard({ inv }: { inv: any }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_LABELS[inv.paymentStatus] ?? { label: inv.paymentStatus, color: "#94a3b8" };
  const total = parseFloat(inv.totalAmount ?? "0");
  const remaining = parseFloat(inv.remainingAmount ?? "0");

  return (
    <TouchableOpacity style={s.card} onPress={() => setExpanded((e) => !e)} activeOpacity={0.85}>
      <View style={s.cardTop}>
        <View style={[s.statusBadge, { backgroundColor: status.color + "22" }]}>
          <Text style={[s.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
        <View style={s.cardRight}>
          <Text style={s.supplierName}>{inv.supplierName ?? "—"}</Text>
          {inv.invoiceNumber && <Text style={s.invoiceNum}>{inv.invoiceNumber}</Text>}
        </View>
      </View>

      <View style={s.cardAmounts}>
        <View style={s.amountItem}>
          <Text style={s.amountValue}>{total.toLocaleString("ar-AE", { minimumFractionDigits: 2 })}</Text>
          <Text style={s.amountLabel}>الإجمالي</Text>
        </View>
        {remaining > 0 && (
          <View style={s.amountItem}>
            <Text style={[s.amountValue, { color: "#ef4444" }]}>
              {remaining.toLocaleString("ar-AE", { minimumFractionDigits: 2 })}
            </Text>
            <Text style={s.amountLabel}>المتبقي</Text>
          </View>
        )}
        {inv.invoiceDate && (
          <View style={s.amountItem}>
            <Text style={s.amountValue}>{new Date(inv.invoiceDate).toLocaleDateString("ar-AE")}</Text>
            <Text style={s.amountLabel}>التاريخ</Text>
          </View>
        )}
      </View>

      {/* Payment history */}
      {expanded && inv.paymentHistory && inv.paymentHistory.length > 0 && (
        <View style={s.historySection}>
          <Text style={s.historyTitle}>سجل الدفعات</Text>
          {inv.paymentHistory.map((ph: any, i: number) => (
            <View key={i} style={s.historyRow}>
              <Text style={s.historyAmount}>
                {parseFloat(ph.paidAmount).toLocaleString("ar-AE", { minimumFractionDigits: 2 })} د.إ
              </Text>
              <Text style={s.historyDate}>{new Date(ph.paymentDate).toLocaleDateString("ar-AE")}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  debtBanner: {
    flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#7f1d1d", paddingHorizontal: 16, paddingVertical: 10,
  },
  debtLabel: { color: "#fca5a5", fontSize: 13 },
  debtValue: { color: "#fef2f2", fontSize: 17, fontWeight: "800" },
  filterScroll: { maxHeight: 52, backgroundColor: "#1e293b" },
  filterRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8, paddingVertical: 8 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: "#0f172a" },
  filterTabActive: { backgroundColor: "#6366f1" },
  filterTabText: { color: "#64748b", fontSize: 13 },
  filterTabTextActive: { color: "#fff", fontWeight: "700" },
  empty: { color: "#475569", textAlign: "center", marginTop: 60, fontSize: 15 },
  card: { backgroundColor: "#1e293b", borderRadius: 12, padding: 14, marginBottom: 10, marginTop: 6 },
  cardTop: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  cardRight: { flex: 1, alignItems: "flex-end" },
  supplierName: { color: "#f1f5f9", fontSize: 15, fontWeight: "700" },
  invoiceNum: { color: "#64748b", fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: "700" },
  cardAmounts: { flexDirection: "row-reverse", gap: 16 },
  amountItem: { alignItems: "center" },
  amountValue: { color: "#f1f5f9", fontSize: 14, fontWeight: "600" },
  amountLabel: { color: "#64748b", fontSize: 11, marginTop: 2 },
  historySection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#334155" },
  historyTitle: { color: "#64748b", fontSize: 11, textAlign: "right", marginBottom: 6 },
  historyRow: { flexDirection: "row-reverse", justifyContent: "space-between", paddingVertical: 4 },
  historyAmount: { color: "#22c55e", fontSize: 13, fontWeight: "600" },
  historyDate: { color: "#94a3b8", fontSize: 13 },
});
