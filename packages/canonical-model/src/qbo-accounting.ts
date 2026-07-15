import type {
  AccountingBasis,
  AccountingReportMetadata,
  DocumentNormalization,
  Item,
  MoneyAmount,
  ReportValue,
  TaxCode,
  TaxRate,
  TransactionLine,
} from "./types.js";
import { compactId, firstString, money, sourceRef } from "./utils.js";

export type QboDocumentKind = "sales" | "purchase";

export interface NormalizedDocument {
  subtotal: MoneyAmount;
  tax: MoneyAmount;
  normalization: DocumentNormalization;
}

export interface NormalizedReport {
  values: ReportValue[];
  metadata: AccountingReportMetadata;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function finiteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function flattenLines(lines: any[] | undefined): any[] {
  return (lines ?? []).flatMap((line) => [
    line,
    ...flattenLines(line?.GroupLineDetail?.Line),
  ]);
}

function detailForLine(line: any): any {
  return (
    line?.SalesItemLineDetail ??
    line?.ItemBasedExpenseLineDetail ??
    line?.AccountBasedExpenseLineDetail ??
    line?.DiscountLineDetail ??
    {}
  );
}

function isShipping(detail: any, item: Item | undefined): boolean {
  const name = firstString(detail?.ItemRef?.name, item?.name);
  return Boolean(name && /^shipping$/i.test(name));
}

export function normalizeQboLines(
  rawLines: any[] | undefined,
  currency: string,
  documentKind: QboDocumentKind,
  itemsById: ReadonlyMap<string, Item>,
  defaultTaxCodeId?: string,
): TransactionLine[] {
  const lines: TransactionLine[] = [];
  let runningSubtotal = 0;

  for (const [index, line] of flattenLines(rawLines).entries()) {
    const detailType = String(line?.DetailType ?? "");
    if (
      ![
        "SalesItemLineDetail",
        "ItemBasedExpenseLineDetail",
        "AccountBasedExpenseLineDetail",
        "DiscountLineDetail",
      ].includes(detailType)
    ) {
      continue;
    }

    const detail = detailForLine(line);
    const sourceItemId = firstString(detail.ItemRef?.value);
    const itemId = sourceItemId ? compactId("item", sourceItemId) : undefined;
    const item = itemId ? itemsById.get(itemId) : undefined;
    const directAccountId = firstString(
      detail.AccountRef?.value,
      detail.ItemAccountRef?.value,
      detail.DiscountAccountRef?.value,
    );
    const itemAccountId =
      documentKind === "sales"
        ? item?.incomeAccountId
        : (item?.expenseAccountId ?? item?.inventoryAssetAccountId);
    const accountId = directAccountId
      ? compactId("acct", directAccountId)
      : itemAccountId;
    const accountResolution = directAccountId
      ? ("direct" as const)
      : itemAccountId
        ? documentKind === "sales"
          ? ("item_income" as const)
          : ("item_expense" as const)
        : ("unresolved" as const);

    const discountDetail =
      detailType === "DiscountLineDetail" ? detail : undefined;
    const statedAmount = finiteNumber(line?.Amount);
    const discountAmount = discountDetail
      ? Math.abs(
          statedAmount ??
            (discountDetail.PercentBased
              ? (runningSubtotal *
                  (finiteNumber(discountDetail.DiscountPercent) ?? 0)) /
                100
              : 0),
        )
      : undefined;
    const amount = discountDetail
      ? money(-(discountAmount ?? 0), currency)
      : money(statedAmount ?? 0, currency);
    const kind = discountDetail
      ? ("discount" as const)
      : isShipping(detail, item)
        ? ("shipping" as const)
        : itemId
          ? ("item" as const)
          : detailType === "AccountBasedExpenseLineDetail"
            ? ("account" as const)
            : ("other" as const);

    if (kind !== "discount") runningSubtotal += amount.amount;

    const sourceTaxCodeId = firstString(
      detail.TaxCodeRef?.value,
      defaultTaxCodeId,
    );
    lines.push({
      id: compactId("line", line?.Id ?? index),
      description: firstString(line?.Description, detail.Description),
      accountId,
      accountResolution,
      itemId,
      quantity: detail.Qty === undefined ? undefined : finiteNumber(detail.Qty),
      unitAmount:
        detail.UnitPrice === undefined
          ? undefined
          : money(detail.UnitPrice, currency),
      amount,
      taxCodeId: sourceTaxCodeId
        ? compactId("tax_code", sourceTaxCodeId)
        : undefined,
      taxInclusiveAmount:
        detail.TaxInclusiveAmt === undefined
          ? undefined
          : money(detail.TaxInclusiveAmt, currency),
      discountAmount:
        detail.DiscountAmt === undefined
          ? discountAmount === undefined
            ? undefined
            : money(discountAmount, currency)
          : money(Math.abs(Number(detail.DiscountAmt)), currency),
      kind,
      tracking: {
        class: detail.ClassRef?.name,
        location: detail.DepartmentRef?.name,
      },
    });
  }

  return lines;
}

function taxCalculation(
  value: unknown,
): DocumentNormalization["taxCalculation"] {
  if (value === "TaxExcluded") return "tax_exclusive";
  if (value === "TaxInclusive") return "tax_inclusive";
  if (value === "NotApplicable") return "not_applicable";
  return "unknown";
}

function sumAmounts(values: MoneyAmount[]): number {
  return values.reduce((total, value) => total + value.amount, 0);
}

export function normalizeQboDocument(
  raw: any,
  lines: TransactionLine[],
  currency: string,
): NormalizedDocument {
  const sourceTotal = money(raw?.TotalAmt ?? 0, currency);
  const tax = money(raw?.TxnTaxDetail?.TotalTax ?? 0, currency);
  const calculation = taxCalculation(raw?.GlobalTaxCalculation);
  const explicitDiscount = Math.abs(
    sumAmounts(
      lines
        .filter((line) => line.kind === "discount")
        .map((line) => line.amount),
    ),
  );
  const embeddedDiscount = sumAmounts(
    lines
      .filter((line) => line.kind !== "discount")
      .flatMap((line) => (line.discountAmount ? [line.discountAmount] : [])),
  );
  const headerDiscount = Math.abs(finiteNumber(raw?.DiscountAmt) ?? 0);
  const discount = money(
    Math.max(headerDiscount, explicitDiscount + embeddedDiscount),
    currency,
  );
  const shipping = money(
    sumAmounts(
      lines
        .filter((line) => line.kind === "shipping")
        .map((line) => line.amount),
    ),
    currency,
  );
  const subtotal = money(
    sumAmounts(
      lines
        .filter((line) => line.kind !== "discount" && line.kind !== "shipping")
        .map((line) => line.amount),
    ) + embeddedDiscount,
    currency,
  );

  const lineTotal = sumAmounts(
    lines.map((line) => {
      if (
        calculation === "tax_inclusive" &&
        line.kind !== "discount" &&
        line.taxInclusiveAmount
      ) {
        return line.taxInclusiveAmount;
      }
      return line.amount;
    }),
  );
  const unappliedHeaderDiscount = explicitDiscount === 0 ? headerDiscount : 0;
  const inclusiveTotal = lineTotal - unappliedHeaderDiscount;
  const exclusiveTotal = inclusiveTotal + tax.amount;
  const calculatedAmount =
    calculation === "tax_inclusive" || calculation === "not_applicable"
      ? inclusiveTotal
      : calculation === "tax_exclusive"
        ? exclusiveTotal
        : Math.abs(sourceTotal.amount - inclusiveTotal) <
            Math.abs(sourceTotal.amount - exclusiveTotal)
          ? inclusiveTotal
          : exclusiveTotal;
  const calculatedTotal = money(calculatedAmount, currency);

  return {
    subtotal,
    tax,
    normalization: {
      taxCalculation: calculation,
      discount,
      shipping,
      calculatedTotal,
      rounding: money(sourceTotal.amount - calculatedTotal.amount, currency),
    },
  };
}

export function normalizeQboTaxRates(rawTaxRates: any[]): TaxRate[] {
  return rawTaxRates.map((taxRate) => ({
    id: compactId("tax_rate", taxRate.Id),
    source: sourceRef(taxRate.Id, "tax-rate", taxRate),
    name: firstString(taxRate.Name, taxRate.Id) ?? String(taxRate.Id),
    rate: finiteNumber(taxRate.RateValue) ?? 0,
    active: taxRate.Active !== false,
    agency: firstString(taxRate.AgencyRef?.name),
  }));
}

function taxRateDetails(list: any): any[] {
  return asArray(list?.TaxRateDetail);
}

export function normalizeQboTaxCodes(
  rawTaxCodes: any[],
  rawTaxRates: any[],
): TaxCode[] {
  const rateById = new Map(
    rawTaxRates.map((rate) => [
      String(rate.Id),
      finiteNumber(rate.RateValue) ?? 0,
    ]),
  );

  return rawTaxCodes.map((taxCode) => {
    const sales = taxRateDetails(taxCode.SalesTaxRateList);
    const purchase = taxRateDetails(taxCode.PurchaseTaxRateList);
    const componentSourceIds = [...sales, ...purchase]
      .map((detail) => firstString(detail?.TaxRateRef?.value))
      .filter((id): id is string => Boolean(id));
    const componentRateIds = [...new Set(componentSourceIds)].map((id) =>
      compactId("tax_rate", id),
    );
    const rateTotal = (details: any[]) =>
      Number(
        details
          .reduce((total, detail) => {
            const id = firstString(detail?.TaxRateRef?.value);
            return total + (id ? (rateById.get(id) ?? 0) : 0);
          }, 0)
          .toFixed(6),
      );
    const salesRate = rateTotal(sales);
    const purchaseRate = rateTotal(purchase);

    return {
      id: compactId("tax_code", taxCode.Id),
      source: sourceRef(taxCode.Id, "tax-code", taxCode),
      name: firstString(taxCode.Name, taxCode.Id) ?? String(taxCode.Id),
      active: taxCode.Active !== false,
      taxable:
        taxCode.Taxable === true || salesRate !== 0 || purchaseRate !== 0,
      salesRate,
      purchaseRate,
      componentRateIds,
    };
  });
}

function reportNumber(value: unknown): number | undefined {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  const negative = /^\(.*\)$/.test(trimmed);
  const normalized = trimmed.replace(/[(),]/g, "").replace(/[^0-9.+-]/g, "");
  const number = Number(normalized);
  if (!Number.isFinite(number)) return undefined;
  return negative ? -number : number;
}

function reportBasis(value: unknown): AccountingBasis {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "cash") return "cash";
  if (normalized === "accrual") return "accrual";
  return "unknown";
}

export function normalizeQboReport(
  report: any,
  fallbackCurrency: string,
): NormalizedReport {
  const header = report?.Header ?? {};
  const columns = asArray<any>(report?.Columns?.Column);
  const labelIndex = Math.max(
    0,
    columns.findIndex(
      (column) => String(column?.ColType ?? "").toLowerCase() !== "money",
    ),
  );
  const accountColumn =
    String(columns[labelIndex]?.ColType ?? "").toLowerCase() === "account";
  const moneyIndexes = columns
    .map((column, index) => ({ column, index }))
    .filter(
      ({ column }) => String(column?.ColType ?? "").toLowerCase() === "money",
    )
    .map(({ index }) => index);
  const titleAt = (index: number) =>
    String(columns[index]?.ColTitle ?? "")
      .trim()
      .toLowerCase();
  const debitIndex = moneyIndexes.find((index) => titleAt(index) === "debit");
  const creditIndex = moneyIndexes.find((index) => titleAt(index) === "credit");
  const totalIndex =
    moneyIndexes.find((index) => titleAt(index) === "total") ??
    moneyIndexes[moneyIndexes.length - 1];
  const currency =
    firstString(header.Currency, fallbackCurrency) ?? fallbackCurrency;
  const values: ReportValue[] = [];

  const walk = (node: any) => {
    if (!node) return;
    const rowType = String(node.type ?? "").toLowerCase();
    if (Array.isArray(node.ColData) && (!rowType || rowType === "data")) {
      const labelCell = node.ColData[labelIndex];
      const label = String(labelCell?.value ?? "").trim();
      let amount: number | undefined;
      if (debitIndex !== undefined || creditIndex !== undefined) {
        const debit =
          debitIndex === undefined
            ? 0
            : (reportNumber(node.ColData[debitIndex]?.value) ?? 0);
        const credit =
          creditIndex === undefined
            ? 0
            : (reportNumber(node.ColData[creditIndex]?.value) ?? 0);
        amount = debit - credit;
      } else if (totalIndex !== undefined) {
        amount = reportNumber(node.ColData[totalIndex]?.value);
      }
      if (label && amount !== undefined) {
        values.push({
          label,
          amount: money(amount, currency),
          accountId:
            accountColumn && labelCell?.id
              ? compactId("acct", labelCell.id)
              : undefined,
        });
      }
    }
    for (const child of asArray<any>(node?.Rows?.Row)) walk(child);
  };

  for (const row of asArray<any>(report?.Rows?.Row)) walk(row);

  const noData = asArray<any>(header.Option).some(
    (option) =>
      String(option?.Name ?? "").toLowerCase() === "noreportdata" &&
      String(option?.Value ?? "").toLowerCase() === "true",
  );

  return {
    values,
    metadata: {
      name: firstString(header.ReportName),
      basis: reportBasis(header.ReportBasis),
      startDate: firstString(header.StartPeriod),
      endDate: firstString(header.EndPeriod),
      generatedAt: firstString(header.Time),
      currency,
      noData,
    },
  };
}
