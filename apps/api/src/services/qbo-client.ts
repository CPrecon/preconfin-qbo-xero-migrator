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

export class QboClient {
  private readonly baseUrl: string;
  private readonly minorVersion: string;

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
  }

  async fetchDataset(): Promise<QboRawDataset> {
    const companyInfo = await this.getCompanyInfo();
    const accounts = await this.queryAll("Account");
    const customers = await this.queryAll("Customer");
    const vendors = await this.queryAll("Vendor");
    const items = await this.queryAll("Item");
    const invoices = await this.queryAll("Invoice");
    const bills = await this.queryAll("Bill");
    const payments = await this.queryAll("Payment");
    const creditMemos = await this.queryAll("CreditMemo");
    const vendorCredits = await this.queryAll("VendorCredit");
    const journalEntries = await this.queryAll("JournalEntry");
    const taxRates = await this.queryAll("TaxRate");
    const taxCodes = await this.queryAll("TaxCode");
    const classes = await this.queryAll("Class");
    const departments = await this.queryAll("Department");
    const currencies = await this.queryAll("Currency");
    const trialBalance = await this.report("TrialBalance");
    const profitAndLoss = await this.report("ProfitAndLoss");
    const balanceSheet = await this.report("BalanceSheet");
    const arAging = await this.report("AgedReceivables");
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
    return this.request(
      this.minor(`/v3/company/${this.realmId}/reports/${name}`),
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
