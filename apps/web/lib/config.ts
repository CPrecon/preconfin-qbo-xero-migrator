function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export const appUrl = stripTrailingSlash(
  process.env.NEXT_PUBLIC_APP_URL ??
    process.env.PUBLIC_APP_URL ??
    "https://migrate.preconfin.com",
);

export const apiUrl = stripTrailingSlash(
  process.env.NEXT_PUBLIC_API_URL ?? process.env.PUBLIC_API_URL ?? appUrl,
);

export const marketingUrl = stripTrailingSlash(
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://preconfin.com",
);

export const marketingToolUrl = stripTrailingSlash(
  process.env.NEXT_PUBLIC_MARKETING_TOOL_URL ??
    `${marketingUrl}/tools/quickbooks-to-xero`,
);

export const privacyUrl = stripTrailingSlash(
  process.env.NEXT_PUBLIC_PRIVACY_URL ?? `${appUrl}/privacy`,
);

export const termsUrl = stripTrailingSlash(
  process.env.NEXT_PUBLIC_TERMS_URL ?? `${appUrl}/terms`,
);

export const supportUrl = stripTrailingSlash(
  process.env.NEXT_PUBLIC_SUPPORT_URL ?? `${marketingUrl}/contact`,
);

export const posthogKey =
  process.env.NEXT_PUBLIC_POSTHOG_KEY ?? process.env.POSTHOG_KEY;

export const posthogHost = stripTrailingSlash(
  process.env.NEXT_PUBLIC_POSTHOG_HOST ??
    process.env.POSTHOG_HOST ??
    "https://us.i.posthog.com",
);
