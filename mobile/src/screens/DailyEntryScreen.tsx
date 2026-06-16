import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { trpc } from "../lib/trpc";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

type Field = {
  key: string;
  label: string;
  section: string;
};

const SALES_FIELDS: Field[] = [
  { key: "salesCash", label: "كاش", section: "sales" },
  { key: "salesCard", label: "كارت (نقاط البيع)", section: "sales" },
  { key: "salesKita", label: "كيتا", section: "sales" },
  { key: "salesOrders", label: "أوردرز", section: "sales" },
  { key: "salesNoon", label: "نون", section: "sales" },
  { key: "salesDeliveroo", label: "ديليفرو", section: "sales" },
  { key: "salesCareem", label: "كريم", section: "sales" },
];

const EXPENSE_FIELDS: Field[] = [
  { key: "supplyToRestaurant", label: "توريد للمطعم", section: "expenses" },
  { key: "supplyToManagement", label: "توريد للإدارة", section: "expenses" },
  { key: "supplyExtra", label: "مدفوع إضافي", section: "expenses" },
  { key: "expensesFixed", label: "مصروفات ثابتة", section: "expenses" },
];

type FormState = Record<string, string>;

export default function DailyEntryScreen() {
  const [accountDate, setAccountDate] = useState(today());
  const [form, setForm] = useState<FormState>({
    salesCash: "", salesCard: "", salesKita: "", salesOrders: "",
    salesNoon: "", salesDeliveroo: "", salesCareem: "",
    supplyToRestaurant: "", supplyToManagement: "", supplyExtra: "", expensesFixed: "",
    notes: "",
  });

  const expensesQuery = trpc.dailyAccounts.expensesForDate.useQuery(
    { accountDate },
    { enabled: !!accountDate }
  );
  const prevCarryQuery = trpc.dailyAccounts.previousCarryForward.useQuery(
    { accountDate },
    { enabled: !!accountDate }
  );
  const existingQuery = trpc.dailyAccounts.getByDate.useQuery(
    { accountDate },
    { enabled: !!accountDate }
  );

  // Pre-fill form if existing record
  useEffect(() => {
    const d = existingQuery.data;
    if (d) {
      setForm({
        salesCash: String(d.salesCash ?? ""),
        salesCard: String(d.salesCard ?? ""),
        salesKita: String(d.salesKita ?? ""),
        salesOrders: String(d.salesOrders ?? ""),
        salesNoon: String(d.salesNoon ?? ""),
        salesDeliveroo: String(d.salesDeliveroo ?? ""),
        salesCareem: String(d.salesCareem ?? ""),
        supplyToRestaurant: String(d.supplyToRestaurant ?? ""),
        supplyToManagement: String(d.supplyToManagement ?? ""),
        supplyExtra: String(d.supplyExtra ?? ""),
        expensesFixed: String(d.expensesFixed ?? ""),
        notes: d.notes ?? "",
      });
    }
  }, [existingQuery.data]);

  const saveMutation = trpc.dailyAccounts.save.useMutation({
    onSuccess: () => Alert.alert("✓ تم الحفظ", "تم حفظ بيانات اليوم بنجاح"),
    onError: (e) => Alert.alert("خطأ", e.message),
  });

  const n = (v: string) => parseFloat(v) || 0;

  const totalSales = SALES_FIELDS.reduce((s, f) => s + n(form[f.key]), 0);
  const supplierTotal = expensesQuery.data?.supplierInvoicesTotal ?? 0;
  const partialTotal = (expensesQuery.data as any)?.partialSupplierTotal ?? 0;
  const freeTotal = expensesQuery.data?.invoices?.reduce((s: number, i: any) => s + i.totalAmount, 0) ?? 0;
  const totalExpenses = supplierTotal + partialTotal + freeTotal + n(form.supplyToRestaurant)
    + n(form.supplyToManagement) + n(form.supplyExtra) + n(form.expensesFixed);
  const prevCarry = prevCarryQuery.data ?? 0;
  const carryNext = prevCarry + n(form.salesCash) + n(form.supplyToRestaurant)
    + n(form.supplyExtra) - totalExpenses - n(form.supplyToManagement);

  function handleSave() {
    const exp = expensesQuery.data;
    saveMutation.mutate({
      accountDate,
      salesCash: n(form.salesCash),
      salesCard: n(form.salesCard),
      salesKita: n(form.salesKita),
      salesOrders: n(form.salesOrders),
      salesNoon: n(form.salesNoon),
      salesDeliveroo: n(form.salesDeliveroo),
      salesCareem: n(form.salesCareem),
      expensesFixed: n(form.expensesFixed),
      supplyToRestaurant: n(form.supplyToRestaurant),
      supplyToManagement: n(form.supplyToManagement),
      supplyExtra: n(form.supplyExtra),
      notes: form.notes || undefined,
      expensesSupplierInvoices: supplierTotal,
      expensesFreeInvoices: freeTotal,
      expensesPartial: partialTotal,
      carryForwardFromPrev: prevCarry,
      carryForwardToNext: carryNext,
      supplierInvoices: exp?.supplierInvoices?.map((inv: any) => ({
        supplierName: inv.supplierName,
        invoiceNumber: inv.invoiceNumber ?? null,
        totalAmount: inv.paidAmount ?? inv.totalAmount,
        items: [],
      })) ?? [],
      freeInvoices: exp?.invoices?.map((inv: any) => ({
        supplierName: inv.supplierName,
        invoiceNumber: inv.invoiceNumber ?? null,
        totalAmount: inv.totalAmount,
        expenseCategory: inv.expenseCategory ?? "",
        items: [],
      })) ?? [],
      partialInvoices: [],
    });
  }

  const isLoading = expensesQuery.isLoading || prevCarryQuery.isLoading || existingQuery.isLoading;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Date picker */}
        <View style={s.dateRow}>
          <Text style={s.dateLabel}>تاريخ اليوم</Text>
          <TextInput
            style={s.dateInput}
            value={accountDate}
            onChangeText={setAccountDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#475569"
            textAlign="right"
          />
        </View>

        {isLoading && <ActivityIndicator color="#6366f1" style={{ marginVertical: 20 }} />}

        {/* Sales */}
        <SectionHeader title="المبيعات" emoji="💰" />
        {SALES_FIELDS.map((f) => (
          <NumberRow
            key={f.key}
            label={f.label}
            value={form[f.key]}
            onChange={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
          />
        ))}
        <TotalRow label="إجمالي المبيعات" value={totalSales} color="#22c55e" />

        {/* Auto supplier invoices */}
        {(supplierTotal > 0 || partialTotal > 0 || freeTotal > 0) && (
          <>
            <SectionHeader title="فواتير الموردين (تلقائي)" emoji="🧾" />
            {expensesQuery.data?.supplierInvoices?.map((inv: any, i: number) => (
              <InvoiceRow key={i} inv={inv} />
            ))}
            {supplierTotal > 0 && <TotalRow label="إجمالي فواتير الموردين" value={supplierTotal} color="#ef4444" />}
            {freeTotal > 0 && <TotalRow label="فواتير حرة" value={freeTotal} color="#f97316" />}
          </>
        )}

        {/* Other expenses */}
        <SectionHeader title="مصروفات أخرى" emoji="💸" />
        {EXPENSE_FIELDS.map((f) => (
          <NumberRow
            key={f.key}
            label={f.label}
            value={form[f.key]}
            onChange={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
          />
        ))}

        {/* Summary */}
        <SectionHeader title="الملخص" emoji="📊" />
        <TotalRow label="إجمالي المصروفات" value={totalExpenses} color="#ef4444" />
        <TotalRow label="ترحيل سابق" value={prevCarry} color="#94a3b8" />
        <TotalRow label="ترحيل لليوم التالي" value={carryNext} color={carryNext >= 0 ? "#22c55e" : "#ef4444"} />

        {/* Notes */}
        <Text style={s.notesLabel}>ملاحظات</Text>
        <TextInput
          style={s.notesInput}
          value={form.notes}
          onChangeText={(v) => setForm((p) => ({ ...p, notes: v }))}
          placeholder="أي ملاحظات..."
          placeholderTextColor="#475569"
          multiline
          numberOfLines={3}
          textAlign="right"
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[s.saveBtn, saveMutation.isPending && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.saveBtnText}>💾  حفظ بيانات اليوم</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SectionHeader({ title, emoji }: { title: string; emoji: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionEmoji}>{emoji}</Text>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function NumberRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={s.row}>
      <TextInput
        style={s.numInput}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor="#475569"
        textAlign="right"
      />
      <Text style={s.rowLabel}>{label}</Text>
    </View>
  );
}

function TotalRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[s.row, s.totalRow]}>
      <Text style={[s.totalValue, { color }]}>
        {value.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.إ
      </Text>
      <Text style={s.totalLabel}>{label}</Text>
    </View>
  );
}

function InvoiceRow({ inv }: { inv: any }) {
  const amount = inv.paidAmount ?? inv.totalAmount;
  return (
    <View style={[s.row, { backgroundColor: "#1e293b" }]}>
      <Text style={{ color: "#ef4444", fontWeight: "700", fontSize: 14 }}>
        {amount.toLocaleString("ar-AE", { minimumFractionDigits: 2 })} د.إ
      </Text>
      <View style={{ flex: 1, alignItems: "flex-end", marginLeft: 8 }}>
        <Text style={{ color: "#f1f5f9", fontSize: 14 }}>{inv.supplierName}</Text>
        {inv.invoiceNumber && <Text style={{ color: "#64748b", fontSize: 11 }}>{inv.invoiceNumber}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 16 },
  dateRow: { flexDirection: "row-reverse", alignItems: "center", marginBottom: 16, gap: 10 },
  dateLabel: { color: "#94a3b8", fontSize: 14 },
  dateInput: {
    flex: 1, height: 40, backgroundColor: "#1e293b", borderRadius: 8,
    paddingHorizontal: 12, color: "#f1f5f9", fontSize: 14,
    borderWidth: 1, borderColor: "#334155",
  },
  sectionHeader: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    marginTop: 20, marginBottom: 8, paddingBottom: 6,
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
  },
  sectionEmoji: { fontSize: 18 },
  sectionTitle: { color: "#94a3b8", fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1 },
  row: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8,
    backgroundColor: "#1e293b", marginBottom: 6,
  },
  rowLabel: { color: "#cbd5e1", fontSize: 14, flex: 1, textAlign: "right" },
  numInput: {
    width: 110, height: 38, backgroundColor: "#0f172a", borderRadius: 8,
    paddingHorizontal: 10, color: "#f1f5f9", fontSize: 15,
    borderWidth: 1, borderColor: "#334155",
  },
  totalRow: { backgroundColor: "transparent", paddingHorizontal: 4 },
  totalLabel: { color: "#94a3b8", fontSize: 14, flex: 1, textAlign: "right" },
  totalValue: { fontSize: 16, fontWeight: "700" },
  notesLabel: { color: "#94a3b8", fontSize: 13, marginTop: 20, marginBottom: 6, textAlign: "right" },
  notesInput: {
    backgroundColor: "#1e293b", borderRadius: 8, padding: 12,
    color: "#f1f5f9", fontSize: 14, borderWidth: 1, borderColor: "#334155",
    minHeight: 80,
  },
  saveBtn: {
    backgroundColor: "#6366f1", borderRadius: 12, height: 52,
    justifyContent: "center", alignItems: "center", marginTop: 24,
  },
  saveBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
