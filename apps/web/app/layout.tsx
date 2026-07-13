import type { Metadata } from "next";
import "./globals.css";
import { Footer } from "../components/footer";
import { Nav } from "../components/nav";
import { PostHogProvider } from "../components/posthog-provider";
import { appUrl, marketingToolUrl } from "../lib/config";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "QBO to Xero Migrator by PreconFin",
    template: "%s | PreconFin Migrator",
  },
  description:
    "Connect QuickBooks Online, validate migration readiness, and generate Xero-ready CSV files with a branded financial validation report.",
  alternates: {
    canonical: marketingToolUrl,
  },
  openGraph: {
    title: "QBO to Xero Migrator by PreconFin",
    description:
      "Secure QuickBooks Online to Xero migration files and validation report.",
    type: "website",
    url: appUrl,
    siteName: "PreconFin Migrator",
  },
  twitter: {
    card: "summary_large_image",
    title: "QBO to Xero Migrator by PreconFin",
    description: "Generate Xero-ready migration files from QuickBooks Online.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PostHogProvider>
          <Nav />
          {children}
          <Footer />
        </PostHogProvider>
      </body>
    </html>
  );
}
