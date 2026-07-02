import type { LengthUnit } from "./models/types";

export const UNIT_OPTIONS: Record<
  LengthUnit,
  {
    label: string;
    name: string;
    mmPerUnit: number;
    digits: number;
  }
> = {
  mm: { label: "mm", name: "millimeters", mmPerUnit: 1, digits: 1 },
  cm: { label: "cm", name: "centimeters", mmPerUnit: 10, digits: 2 },
  in: { label: "in", name: "inches", mmPerUnit: 25.4, digits: 2 },
};

export function isLengthUnit(value: string | null): value is LengthUnit {
  return value === "mm" || value === "cm" || value === "in";
}

export function toUnit(valueMm: number, unit: LengthUnit) {
  return valueMm / UNIT_OPTIONS[unit].mmPerUnit;
}

export function fromUnit(value: number, unit: LengthUnit) {
  return value * UNIT_OPTIONS[unit].mmPerUnit;
}

export function formatLength(valueMm: number, unit: LengthUnit, digits?: number) {
  const option = UNIT_OPTIONS[unit];
  if (unit === "in") {
    return `${formatFractionalInches(toUnit(valueMm, unit))} ${option.label}`;
  }
  return `${toUnit(valueMm, unit).toFixed(digits ?? option.digits)} ${
    option.label
  }`;
}

export function formatSignedLength(valueMm: number, unit: LengthUnit) {
  const normalized = Math.abs(valueMm) < 0.05 ? 0 : valueMm;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${formatLength(normalized, unit)}`;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

function formatFractionalInches(valueIn: number, denominator = 8) {
  const sign = valueIn < 0 ? "-" : "";
  const absoluteValue = Math.abs(valueIn);
  let whole = Math.floor(absoluteValue);
  let numerator = Math.round((absoluteValue - whole) * denominator);

  if (numerator === denominator) {
    whole += 1;
    numerator = 0;
  }

  if (numerator === 0) {
    return `${sign}${whole}`;
  }

  const divisor = greatestCommonDivisor(numerator, denominator);
  const fraction = `${numerator / divisor}/${denominator / divisor}`;
  return whole > 0 ? `${sign}${whole} ${fraction}` : `${sign}${fraction}`;
}

export function formatLengthInput(valueMm: number, unit: LengthUnit) {
  if (unit === "in") {
    return formatFractionalInches(toUnit(valueMm, unit));
  }

  return toUnit(valueMm, unit).toFixed(UNIT_OPTIONS[unit].digits);
}

function parseFractionalNumber(rawValue: string) {
  const cleaned = rawValue
    .toLowerCase()
    .replace(/inches|inch|in|cm|mm|["']/g, "")
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/\bths?\b/g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return null;
  }

  let total = 0;
  for (const part of cleaned.split(" ")) {
    if (!part) {
      continue;
    }
    if (part.includes("/")) {
      const [numerator, denominator] = part.split("/").map(Number);
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
        return null;
      }
      total += numerator / denominator;
    } else {
      const parsed = Number(part);
      if (!Number.isFinite(parsed)) {
        return null;
      }
      total += parsed;
    }
  }

  return total;
}

export function parseLengthInput(rawValue: string, unit: LengthUnit) {
  const cleaned = rawValue
    .toLowerCase()
    .replace(/inches|inch|in|cm|mm|["']/g, "")
    .trim();
  const parsed = unit === "in" ? parseFractionalNumber(rawValue) : Number(cleaned);
  if (!cleaned) {
    return null;
  }
  if (parsed === null || !Number.isFinite(parsed)) {
    return null;
  }
  return fromUnit(parsed, unit);
}
