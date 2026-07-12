import type { MetadataRoute } from "next";

const routes = ["", "/features", "/pricing", "/faq", "/privacy", "/terms", "/contact", "/migrate"];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.PUBLIC_APP_URL ?? "https://migrate.preconfin.com";
  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7
  }));
}
