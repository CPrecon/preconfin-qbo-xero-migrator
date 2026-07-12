import { z } from "zod";

export const moneyAmountSchema = z.object({
  amount: z.number().finite(),
  currency: z.string().min(3).max(3)
});

export const sourceReferenceSchema = z.object({
  sourceSystem: z.enum(["quickbooks-online", "xero", "manual"]),
  sourceId: z.string().min(1),
  sourceType: z.string().min(1),
  sourceTimestamp: z.string().optional(),
  metadata: z.record(z.unknown())
});

export const accountSchema = z.object({
  id: z.string().min(1),
  source: sourceReferenceSchema,
  code: z.string().optional(),
  name: z.string().min(1),
  fullyQualifiedName: z.string().optional(),
  classification: z.enum([
    "asset",
    "liability",
    "equity",
    "revenue",
    "expense",
    "bank",
    "accounts_receivable",
    "accounts_payable",
    "other"
  ]),
  sourceAccountType: z.string().optional(),
  sourceAccountSubType: z.string().optional(),
  currency: z.string().optional(),
  active: z.boolean(),
  parentId: z.string().optional(),
  currentBalance: moneyAmountSchema.optional()
});

export const accountingSnapshotSchema = z.object({
  organization: z.object({
    id: z.string(),
    source: sourceReferenceSchema,
    legalName: z.string(),
    displayName: z.string(),
    baseCurrency: z.string().min(3).max(3),
    country: z.string().optional(),
    fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
    qboRealmId: z.string().optional()
  }),
  accounts: z.array(accountSchema),
  contacts: z.array(z.unknown()),
  items: z.array(z.unknown()),
  invoices: z.array(z.unknown()),
  bills: z.array(z.unknown()),
  payments: z.array(z.unknown()),
  credits: z.array(z.unknown()),
  journals: z.array(z.unknown()),
  taxRates: z.array(z.unknown()),
  currencies: z.array(z.unknown()),
  tracking: z.array(z.unknown()),
  balances: z.array(z.unknown()),
  reports: z.object({
    trialBalance: z.array(z.unknown()),
    profitAndLoss: z.array(z.unknown()),
    balanceSheet: z.array(z.unknown())
  }),
  pulledAt: z.string()
});
