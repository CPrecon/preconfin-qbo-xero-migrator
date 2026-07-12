export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.PUBLIC_API_URL ?? "http://localhost:4000";
export const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? process.env.POSTHOG_KEY;
export const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
