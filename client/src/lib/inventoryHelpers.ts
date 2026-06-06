/**
 * Inventory calculation helpers — pure functions, no React, no tRPC.
 * Single source of truth for stock status logic + display config.
 */

export type StockStatus = "available" | "low" | "out" | "inactive";

export interface MaterialLike {
  currentQuantity?: number | string | null;
  minimumQuantity?: number | string | null;
  lastPurchasePrice?: number | string | null;
  isActive?: boolean | number | null;
}

const toNum = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function getStockStatus(material: MaterialLike): StockStatus {
  // isActive can come as boolean, 1/0, or null. Treat null/undefined as active (default).
  const active = material.isActive === null || material.isActive === undefined
    ? true
    : Boolean(material.isActive);
  if (!active) return "inactive";

  const qty = toNum(material.currentQuantity);
  const min = toNum(material.minimumQuantity);

  if (qty <= 0) return "out";
  if (min > 0 && qty <= min) return "low";
  return "available";
}

export interface StatusConfigEntry {
  labelAr: string;
  labelEn: string;
  // Tailwind classes for the badge pill.
  badgeClass: string;
  // Soft background for KPI cards / row highlight.
  softClass: string;
  // Icon color hint for KPI cards.
  iconClass: string;
}

export const STATUS_CONFIG: Record<StockStatus, StatusConfigEntry> = {
  available: {
    labelAr: "متوفر",
    labelEn: "Available",
    badgeClass: "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50",
    softClass: "bg-emerald-50 dark:bg-emerald-950/20",
    iconClass: "text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40",
  },
  low: {
    labelAr: "مخزون منخفض",
    labelEn: "Low stock",
    badgeClass: "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
    softClass: "bg-amber-50 dark:bg-amber-950/20",
    iconClass: "text-amber-600 bg-amber-100 dark:bg-amber-950/40",
  },
  out: {
    labelAr: "نفد المخزون",
    labelEn: "Out of stock",
    badgeClass: "bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50",
    softClass: "bg-red-50 dark:bg-red-950/20",
    iconClass: "text-red-600 bg-red-100 dark:bg-red-950/40",
  },
  inactive: {
    labelAr: "غير مفعّل",
    labelEn: "Inactive",
    badgeClass: "bg-muted text-muted-foreground border border-border",
    softClass: "bg-muted/30",
    iconClass: "text-muted-foreground bg-muted",
  },
};

export function estimatedStockValue(
  qty: number | string | null | undefined,
  lastPrice: number | string | null | undefined
): number {
  const q = toNum(qty);
  const p = toNum(lastPrice);
  return q * p;
}

export function recommendedReorderQty(
  qty: number | string | null | undefined,
  min: number | string | null | undefined
): number {
  const q = toNum(qty);
  const m = toNum(min);
  if (q > m) return 0;
  return Math.max(0, m - q);
}

export function fmtCurrency(
  value: number | string | null | undefined,
  locale: "ar" | "en" = "ar"
): string {
  const n = toNum(value);
  const formatted = n.toLocaleString(locale === "ar" ? "ar-AE" : "en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return locale === "ar" ? `${formatted} د.إ` : `AED ${formatted}`;
}
