"use client";

import posthog from "posthog-js";

type FunnelEvent =
  | "migration_referral_received"
  | "migration_landing_viewed"
  | "qbo_connect_clicked"
  | "qbo_oauth_started"
  | "qbo_oauth_completed"
  | "migration_scan_started"
  | "migration_scan_completed"
  | "migration_mapping_reviewed"
  | "migration_validation_completed"
  | "migration_package_generated"
  | "migration_package_downloaded"
  | "migration_report_viewed"
  | "preconfin_cta_clicked"
  | "migration_lead_submitted"
  | "migration_failed";

const allowedProperties = new Set([
  "source",
  "status",
  "readiness",
  "kind",
  "hasJob",
  "stage",
  "reason",
  "campaignSource",
  "campaignMedium",
  "campaignName",
  "campaignContent",
  "campaignTerm",
  "referralCode",
  "referralHost",
]);

export function track(
  event: FunnelEvent,
  properties: Record<string, string | number | boolean | undefined> = {},
) {
  if (typeof window === "undefined") return;
  const safeProperties = Object.fromEntries(
    Object.entries(properties).filter(
      ([key, value]) => allowedProperties.has(key) && value !== undefined,
    ),
  );
  posthog.capture(event, safeProperties);
}
