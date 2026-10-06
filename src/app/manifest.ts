import type { MetadataRoute } from "next";
import { BRAND_GREEN } from "@/components/Logo";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

// Rendered once at build time (static export).
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME}: Bangladesh news headlines`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: BRAND_GREEN,
    lang: "en",
    categories: ["news"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
