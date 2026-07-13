import type { MetadataRoute } from "next";
import { appUrl } from "../lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/features", "/faq", "/privacy", "/terms", "/contact"],
        disallow: ["/dashboard", "/oauth", "/downloads"],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
