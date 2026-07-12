import type { MoneyAmount, SourceReference, SourceType } from "./types.js";

export function compactId(prefix: string, sourceId: unknown): string {
  const value = String(sourceId || "unknown")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `${prefix}_${value}`;
}

export function money(amount: unknown, currency = "USD"): MoneyAmount {
  const n = Number(amount ?? 0);
  return {
    amount: Number.isFinite(n) ? Number(n.toFixed(2)) : 0,
    currency: currency.toUpperCase(),
  };
}

export function sourceRef(
  sourceId: unknown,
  sourceType: SourceType,
  metadata: Record<string, unknown> = {},
): SourceReference {
  const lastUpdated =
    typeof metadata.LastUpdatedTime === "string"
      ? metadata.LastUpdatedTime
      : undefined;
  return {
    sourceSystem: "quickbooks-online",
    sourceId: String(sourceId || "unknown"),
    sourceType,
    sourceTimestamp: lastUpdated,
    metadata,
  };
}

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function normalizeDate(value: unknown): string | undefined {
  if (!value || typeof value !== "string") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

export function lineAmount(line: any, currency: string): MoneyAmount {
  return money(line?.Amount ?? line?.amount ?? 0, currency);
}

export function sumMoney(values: MoneyAmount[], currency: string): MoneyAmount {
  return money(
    values.reduce((total, next) => total + next.amount, 0),
    currency,
  );
}
