import type { Metadata } from "next";
import { MigrationWizard } from "../../components/migration-wizard";

export const metadata: Metadata = {
  title: "Free Financial Health Assessment",
  description:
    "Connect QuickBooks to assess financial health and Xero migration readiness before generating migration files.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function MigratePage() {
  return (
    <main className="py-20">
      <div className="container">
        <MigrationWizard />
      </div>
    </main>
  );
}
