import type { Metadata } from "next";
import "./globals.css";
import { Footer } from "../components/footer";
import { Nav } from "../components/nav";
import { PostHogProvider } from "../components/posthog-provider";
import { appUrl, marketingToolUrl } from "../lib/config";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Free Financial Health Assessment | PreconFin",
    template: "%s | PreconFin Financial Assessment",
  },
  description:
    "Connect QuickBooks to receive a professional Financial Health Assessment covering reconciliation, migration readiness, data quality, and recommended fixes before moving to Xero.",
  alternates: {
    canonical: marketingToolUrl,
  },
  openGraph: {
    title: "Free Financial Health Assessment by PreconFin",
    description:
      "Understand your books before migration with deterministic financial controls and a clear path to Xero.",
    type: "website",
    url: appUrl,
    siteName: "PreconFin Financial Assessment",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Financial Health Assessment by PreconFin",
    description:
      "Assess financial health and migration readiness before moving from QuickBooks to Xero.",
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
