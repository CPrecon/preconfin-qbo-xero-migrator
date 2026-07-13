import type { Metadata } from "next";
import { MigrationWizard } from "../../components/migration-wizard";

export const metadata: Metadata = {
  title: "Migration Wizard",
  description:
    "Connect QuickBooks Online and generate Xero-ready migration files.",
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
