import type { QboRawDataset } from "@preconfin/canonical-model";
import type { AppEnv } from "../env.js";

export class QboIntegrationError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly qboOperation?: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "QboIntegrationError";
  }
}

export type QboExtractionStage =
  | "company_fetch"
  | "accounts_fetch"
  | "contacts_fetch"
  | "items_fetch"
  | "transaction_extraction"
  | "report_extraction";

export interface QboExtractionProgress {
  stage: QboExtractionStage;
  sourceOperation: string;
}

export type QboExtractionObserver = (progress: QboExtractionProgress) => void;

export class QboClient {
  private readonly baseUrl: string;
  private readonly minorVersion: string;
  private readonly reportBasis: string;

  constructor(
    private readonly env: AppEnv,
    private readonly accessToken: string,
    private readonly realmId: string,
  ) {
    this.baseUrl =
      env.INTUIT_ENVIRONMENT === "production"
        ? "https://quickbooks.api.intuit.com"
        : "https://sandbox-quickbooks.api.intuit.com";
    this.minorVersion = env.QBO_MINOR_VERSION;
    this.reportBasis = env.QBO_REPORT_BASIS;
  }

  async fetchDataset(onStage?: QboExtractionObserver): Promise<QboRawDataset> {
    onStage?.({ stage: "company_fetch", sourceOperation: "companyinfo" });
    const companyInfo = await this.getCompanyInfo();
    onStage?.({ stage: "accounts_fetch", sourceOperation: "query:Account" });
    const accounts = await this.queryAll("Account");
    onStage?.({ stage: "contacts_fetch", sourceOperation: "query:Customer" });
    const customers = await this.queryAll("Customer");
    onStage?.({ stage: "contacts_fetch", sourceOperation: "query:Vendor" });
    const vendors = await this.queryAll("Vendor");
    onStage?.({ stage: "items_fetch", sourceOperation: "query:Item" });
    const items = await this.queryAll("Item");
    onStage?.({
      stage: "transaction_extraction",
      sourceOperation: "query:Invoice",
    });
    const invoices = await this.queryAll("Invoice");
    onStage?.({
      stage: "transaction_extraction",
      sourceOperation: "query:Bill",
    });
    const bills = await this.queryAll("Bill");
    onStage?.({
      stage: "transaction_extraction",
      sourceOperation: "query:Payment",
    });
    const payments = await this.queryAll("Payment");
    onStage?.({
      stage: "transaction_extraction",
      sourceOperation: "query:CreditMemo",
    });
    const creditMemos = await this.queryAll("CreditMemo");
    onStage?.({
      stage: "transaction_extraction",
      sourceOperation: "query:VendorCredit",
    });
    const vendorCredits = await this.queryAll("VendorCredit");
    onStage?.({
      stage: "transaction_extraction",
      sourceOperation: "query:JournalEntry",
    });
    const journalEntries = await this.queryAll("JournalEntry");
    onStage?.({
      stage: "transaction_extraction",
      sourceOperation: "query:TaxRate",
    });
    const taxRates = await this.queryAll("TaxRate");
    onStage?.({
      stage: "transaction_extraction",
      sourceOperation: "query:TaxCode",
    });
    const taxCodes = await this.queryAll("TaxCode");
    onStage?.({
      stage: "transaction_extraction",
      sourceOperation: "query:Class",
    });
    const classes = await this.queryAll("Class");
    onStage?.({
      stage: "transaction_extraction",
      sourceOperation: "query:Department",
    });
    const departments = await this.queryAll("Department");
    onStage?.({
      stage: "transaction_extraction",
      sourceOperation: "query:Currency",
    });
    const currencies = await this.queryAll("Currency");
    onStage?.({
      stage: "report_extraction",
      sourceOperation: "report:TrialBalance",
    });
    const trialBalance = await this.report("TrialBalance");
    onStage?.({
      stage: "report_extraction",
      sourceOperation: "report:ProfitAndLoss",
    });
    const profitAndLoss = await this.report("ProfitAndLoss");
    onStage?.({
      stage: "report_extraction",
      sourceOperation: "report:BalanceSheet",
    });
    const balanceSheet = await this.report("BalanceSheet");
    onStage?.({
      stage: "report_extraction",
      sourceOperation: "report:AgedReceivables",
    });
    const arAging = await this.report("AgedReceivables");
    onStage?.({
      stage: "report_extraction",
      sourceOperation: "report:AgedPayables",
    });
    const apAging = await this.report("AgedPayables");

    return {
      realmId: this.realmId,
      companyInfo,
      accounts,
      customers,
      vendors,
      items,
      invoices,
      bills,
      payments,
      creditMemos,
      vendorCredits,
      journalEntries,
      taxRates,
      taxCodes,
      classes,
      departments,
      currencies,
      reports: { trialBalance, profitAndLoss, balanceSheet, arAging, apAging },
      pulledAt: new Date().toISOString(),
    };
  }

  private minor(path: string): string {
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}minorversion=${this.minorVersion}`;
  }

  private async getCompanyInfo(): Promise<any> {
    return this.request(
      this.minor(`/v3/company/${this.realmId}/companyinfo/${this.realmId}`),
      "companyinfo",
    );
  }

  private async report(name: string): Promise<any> {
    const query = new URLSearchParams({
      accounting_method: this.reportBasis,
    });
    return this.request(
      this.minor(`/v3/company/${this.realmId}/reports/${name}?${query}`),
      `report:${name}`,
    );
  }

  private async queryAll(entity: string): Promise<any[]> {
    const results: any[] = [];
    const pageSize = 1000;
    let startPosition = 1;
    while (true) {
      const query = encodeURIComponent(
        `select * from ${entity} startposition ${startPosition} maxresults ${pageSize}`,
      );
      const json = await this.request(
        this.minor(`/v3/company/${this.realmId}/query?query=${query}`),
        `query:${entity}`,
      );
      const rows = json.QueryResponse?.[entity] ?? [];
      results.push(...rows);
      if (rows.length < pageSize) break;
      startPosition += pageSize;
    }
    return results;
  }

  private async request(
    path: string,
    operation: string,
    attempt = 0,
  ): Promise<any> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
      },
    });
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < 3) {
      await wait(retryDelayMs(response, attempt));
      return this.request(path, operation, attempt + 1);
    }
    if (!response.ok) {
      throw new QboIntegrationError(
        `QuickBooks request failed for ${operation}`,
        response.status,
        operation,
        retryable,
      );
    }
    return response.json();
  }
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0)
      return Math.min(seconds * 1000, 15000);
  }
  return Math.min(500 * 2 ** attempt, 5000);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
