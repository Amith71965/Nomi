/**
 * Unit parsing for listing titles. A per-kilogram price is derived ONLY when
 * the title states an explicit weight; "each", "bunch", or no unit stays null.
 */

export interface ParsedUnit {
  /** Weight in kilograms when the title states one; null otherwise. */
  quantityKg: number | null;
  /** Human label as written, e.g. "5 lb", "16 oz", "each". */
  label: string | null;
}

const LB_PER_KG = 2.20462;
const OZ_PER_KG = 35.274;

const WEIGHT = /(\d+(?:\.\d+)?)\s*(kg|kilograms?|g|grams?|lbs?|pounds?|oz|ounces?)\b/i;
const COUNT = /\b(each|ea\.?|per\s+piece|bunch|head|bag|pack)\b/i;

export function parseUnit(title: string): ParsedUnit {
  const w = WEIGHT.exec(title);
  if (w) {
    const amount = Number(w[1]);
    const unit = w[2].toLowerCase();
    if (Number.isFinite(amount) && amount > 0) {
      let kg: number | null = null;
      if (unit.startsWith("kg") || unit.startsWith("kilo")) kg = amount;
      else if (unit === "g" || unit.startsWith("gram")) kg = amount / 1000;
      else if (unit.startsWith("lb") || unit.startsWith("pound")) kg = amount / LB_PER_KG;
      else if (unit === "oz" || unit.startsWith("ounce")) kg = amount / OZ_PER_KG;
      return { quantityKg: kg, label: `${w[1]} ${shortUnit(unit)}` };
    }
  }
  const c = COUNT.exec(title);
  if (c) return { quantityKg: null, label: c[1].toLowerCase().replace(/\.$/, "") };
  return { quantityKg: null, label: null };
}

function shortUnit(unit: string): string {
  if (unit.startsWith("kg") || unit.startsWith("kilo")) return "kg";
  if (unit === "g" || unit.startsWith("gram")) return "g";
  if (unit.startsWith("lb") || unit.startsWith("pound")) return "lb";
  return "oz";
}

/** Price per kilogram, or null when either side is unknown. Never 0 from a missing price. */
export function pricePerKg(priceAmount: number | null, quantityKg: number | null): number | null {
  if (priceAmount === null || quantityKg === null || quantityKg <= 0 || priceAmount <= 0) return null;
  return Math.round((priceAmount / quantityKg) * 100) / 100;
}

/** "$2.99" → 2.99; anything without a clean number → null. */
export function parsePrice(text: string | undefined): number | null {
  if (!text) return null;
  const m = /(\d+(?:[.,]\d{1,2})?)/.exec(text.replace(/,/g, ""));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}
