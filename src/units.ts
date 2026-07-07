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

const FRACTIONAL_INCH_DENOMINATORS = [1, 2, 4, 8, 16, 32] as const;
const FRACTIONAL_INCH_EPSILON = 1e-6;

function getFractionalInchStepDenominator(valueIn: number) {
  const absoluteValue = Math.abs(valueIn);
  if (absoluteValue < 0.5) {
    return 32;
  }
  if (absoluteValue < 1) {
    return 16;
  }
  return 8;
}

function getFractionalInchFormatDenominator(valueIn: number) {
  const absoluteValue = Math.abs(valueIn);
  const fraction = absoluteValue - Math.floor(absoluteValue);

  for (const denominator of FRACTIONAL_INCH_DENOMINATORS) {
    const rounded = Math.round(fraction * denominator) / denominator;
    if (Math.abs(rounded - fraction) < FRACTIONAL_INCH_EPSILON) {
      return denominator;
    }
  }

  return getFractionalInchStepDenominator(valueIn);
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

function formatFractionalInches(
  valueIn: number,
  denominator = getFractionalInchFormatDenominator(valueIn),
) {
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

const UNICODE_FRACTIONS: Record<string, string> = {
  "¼": " 1/4",
  "½": " 1/2",
  "¾": " 3/4",
  "⅐": " 1/7",
  "⅑": " 1/9",
  "⅒": " 1/10",
  "⅓": " 1/3",
  "⅔": " 2/3",
  "⅕": " 1/5",
  "⅖": " 2/5",
  "⅗": " 3/5",
  "⅘": " 4/5",
  "⅙": " 1/6",
  "⅚": " 5/6",
  "⅛": " 1/8",
  "⅜": " 3/8",
  "⅝": " 5/8",
  "⅞": " 7/8",
};

function normalizeFractionText(rawValue: string) {
  return rawValue
    .replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (match) => {
      return UNICODE_FRACTIONS[match] ?? match;
    })
    .replace(/\u2044/g, "/");
}

function parseFractionalNumber(rawValue: string) {
  const cleaned = normalizeFractionText(rawValue)
    .toLowerCase()
    .replace(/inches|inch|in|cm|mm|["']/g, "")
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/\bths?\b/g, "")
    .replace(/[+-]/g, " ")
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

export function stepLengthInput(
  valueMm: number,
  unit: LengthUnit,
  fallbackStepMm: number,
  direction: -1 | 1,
) {
  const value = toUnit(valueMm, unit);
  const step =
    unit === "in"
      ? 1 / getFractionalInchStepDenominator(value)
      : toUnit(fallbackStepMm, unit);

  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    return valueMm;
  }

  const ratio = value / step;
  const index =
    direction > 0
      ? Math.floor(ratio + FRACTIONAL_INCH_EPSILON) + 1
      : Math.ceil(ratio - FRACTIONAL_INCH_EPSILON) - 1;

  return fromUnit(Number((index * step).toFixed(6)), unit);
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
