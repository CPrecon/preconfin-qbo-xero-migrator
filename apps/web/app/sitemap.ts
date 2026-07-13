import type { MetadataRoute } from "next";
import { appUrl } from "../lib/config";

const routes = ["", "/features", "/faq", "/privacy", "/terms", "/contact"];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${appUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 0.6 : 0.4,
  }));
}
