import type { QboRawDataset } from "@preconfin/canonical-model";
import type { AppEnv } from "../env.js";

export class QboClient {
  private readonly baseUrl: string;

  constructor(private readonly env: AppEnv, private readonly accessToken: string, private readonly realmId: string) {
    this.baseUrl = env.INTUIT_ENVIRONMENT === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";
  }

  async fetchDataset(): Promise<QboRawDataset> {
    const [companyInfo, accounts, customers, vendors, items, invoices, bills, payments, creditMemos, vendorCredits, journalEntries, taxRates, classes, departments, currencies, trialBalance, profitAndLoss, balanceSheet] = await Promise.all([
      this.getCompanyInfo(),
      this.queryAll("Account"),
      this.queryAll("Customer"),
      this.queryAll("Vendor"),
      this.queryAll("Item"),
      this.queryAll("Invoice"),
      this.queryAll("Bill"),
      this.queryAll("Payment"),
      this.queryAll("CreditMemo"),
      this.queryAll("VendorCredit"),
      this.queryAll("JournalEntry"),
      this.queryAll("TaxRate"),
      this.queryAll("Class"),
      this.queryAll("Department"),
      this.queryAll("Currency"),
      this.report("TrialBalance"),
      this.report("ProfitAndLoss"),
      this.report("BalanceSheet")
    ]);

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
      classes,
      departments,
      currencies,
      reports: { trialBalance, profitAndLoss, balanceSheet },
      pulledAt: new Date().toISOString()
    };
  }

  private async getCompanyInfo(): Promise<any> {
    return this.request(`/v3/company/${this.realmId}/companyinfo/${this.realmId}?minorversion=75`);
  }

  private async report(name: string): Promise<any> {
    return this.request(`/v3/company/${this.realmId}/reports/${name}?minorversion=75`);
  }

  private async queryAll(entity: string): Promise<any[]> {
    const results: any[] = [];
    const pageSize = 1000;
    let startPosition = 1;
    while (true) {
      const query = encodeURIComponent(`select * from ${entity} startposition ${startPosition} maxresults ${pageSize}`);
      const json = await this.request(`/v3/company/${this.realmId}/query?query=${query}&minorversion=75`);
      const rows = json.QueryResponse?.[entity] ?? [];
      results.push(...rows);
      if (rows.length < pageSize) break;
      startPosition += pageSize;
    }
    return results;
  }

  private async request(path: string, attempt = 0): Promise<any> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json"
      }
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      return this.request(path, attempt + 1);
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`QBO request failed ${response.status} for ${path}: ${text}`);
    }
    return response.json();
  }
}
