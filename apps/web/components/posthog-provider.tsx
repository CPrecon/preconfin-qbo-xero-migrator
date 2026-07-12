"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { posthogHost, posthogKey } from "../lib/config";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!posthogKey) return;
    posthog.init(posthogKey, { api_host: posthogHost, capture_pageview: true, persistence: "localStorage+cookie" });
  }, []);

  return <>{children}</>;
}
