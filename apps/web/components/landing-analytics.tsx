"use client";

import { useEffect } from "react";
import { track } from "../lib/analytics";

export function LandingAnalytics() {
  useEffect(() => {
    track("migration_landing_viewed", { source: "landing" });
  }, []);
  return null;
}
