"use client";

import { useEffect } from "react";
import { track } from "../lib/analytics";
import { captureAttribution, hasAttribution } from "../lib/attribution";

export function LandingAnalytics() {
  useEffect(() => {
    const attribution = captureAttribution();
    if (hasAttribution(attribution)) {
      track("migration_referral_received", {
        source: "landing",
        ...attribution,
      });
    }
    track("migration_landing_viewed", { source: "landing" });
  }, []);
  return null;
}
