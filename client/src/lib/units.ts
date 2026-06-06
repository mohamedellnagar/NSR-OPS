/**
 * Unit display normalization. Stored DB values are never changed — these helpers
 * only translate unit codes to Arabic display strings.
 */

type Locale = "ar" | "en";

// Lowercased keys map to Arabic display; English passes through with cosmetic casing.
const UNIT_AR: Record<string, string> = {
  kg: "كجم",
  g: "جم",
  gm: "جم",
  gram: "جم",
  grams: "جم",
  pcs: "قطعة",
  pc: "قطعة",
  piece: "قطعة",
  pieces: "قطعة",
  liter: "لتر",
  liters: "لتر",
  litre: "لتر",
  l: "لتر",
  ml: "مل",
  bottle: "زجاجة",
  bottles: "زجاجة",
  box: "علبة",
  boxes: "علبة",
  pack: "عبوة",
  packs: "عبوة",
  bag: "كيس",
  bags: "كيس",
};

const UNIT_EN: Record<string, string> = {
  kg: "kg",
  g: "g",
  pcs: "pcs",
  piece: "pcs",
  pieces: "pcs",
  liter: "L",
  litre: "L",
  l: "L",
  ml: "ml",
};

export function formatUnit(unit: string | null | undefined, locale: Locale = "ar"): string {
  if (!unit) return "";
  const key = unit.trim().toLowerCase();
  if (locale === "ar") {
    return UNIT_AR[key] ?? unit;
  }
  return UNIT_EN[key] ?? unit;
}

export function formatQtyWithUnit(
  qty: number | string | null | undefined,
  unit: string | null | undefined,
  locale: Locale = "ar"
): string {
  const n = typeof qty === "string" ? parseFloat(qty) : Number(qty ?? 0);
  if (!Number.isFinite(n)) return formatUnit(unit, locale);
  const numStr = n.toLocaleString(locale === "ar" ? "ar-EG" : "en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
  const unitStr = formatUnit(unit, locale);
  return unitStr ? `${numStr} ${unitStr}` : numStr;
}
