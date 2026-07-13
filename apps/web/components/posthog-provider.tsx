"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { posthogHost, posthogKey } from "../lib/config";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!posthogKey) return;
    posthog.init(posthogKey, {
      api_host: posthogHost,
      autocapture: false,
      capture_pageview: true,
      cross_subdomain_cookie: true,
      disable_session_recording: true,
      mask_all_element_attributes: true,
      mask_all_text: true,
      persistence: "localStorage+cookie",
    });
  }, []);

  return <>{children}</>;
}
