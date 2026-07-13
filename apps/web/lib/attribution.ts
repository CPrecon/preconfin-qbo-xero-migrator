"use client";

const storageKey = "preconfin:migrator:attribution";

const queryMap: Record<string, string> = {
  utm_source: "campaignSource",
  utm_medium: "campaignMedium",
  utm_campaign: "campaignName",
  utm_content: "campaignContent",
  utm_term: "campaignTerm",
  ref: "referralCode",
};

type Attribution = Record<string, string>;

function sanitize(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, 80);
  if (!trimmed) return undefined;
  return /^[a-zA-Z0-9._~:-]+$/.test(trimmed) ? trimmed : undefined;
}

function readStored(): Attribution {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Attribution;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => sanitize(value)),
    );
  } catch {
    return {};
  }
}

function writeStored(value: Attribution) {
  window.sessionStorage.setItem(storageKey, JSON.stringify(value));
}

export function captureAttribution(): Attribution {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const next: Attribution = { ...readStored() };

  for (const [queryKey, storageName] of Object.entries(queryMap)) {
    const value = sanitize(params.get(queryKey));
    if (value) next[storageName] = value;
  }

  if (!next.referralHost && document.referrer) {
    try {
      const referrer = new URL(document.referrer);
      if (referrer.hostname !== window.location.hostname) {
        next.referralHost = referrer.hostname.slice(0, 80);
      }
    } catch {
      // Ignore invalid browser referrer values.
    }
  }

  writeStored(next);
  return next;
}

export function currentAttribution(): Attribution {
  if (typeof window === "undefined") return {};
  return readStored();
}

export function hasAttribution(value: Attribution): boolean {
  return Object.keys(value).length > 0;
}

export function withAttribution(
  href: string,
  source = "qbo_xero_migrator",
): string {
  if (typeof window === "undefined") return href;
  const attribution = currentAttribution();
  const url = new URL(href, window.location.origin);
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", "referral");
  url.searchParams.set("utm_campaign", "qbo_xero_migrator");

  const reverseMap: Record<string, string> = {
    campaignSource: "utm_source",
    campaignMedium: "utm_medium",
    campaignName: "utm_campaign",
    campaignContent: "utm_content",
    campaignTerm: "utm_term",
    referralCode: "ref",
  };

  for (const [storageName, queryKey] of Object.entries(reverseMap)) {
    if (attribution[storageName])
      url.searchParams.set(queryKey, attribution[storageName]);
  }

  return url.toString();
}
