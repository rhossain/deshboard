import type { MetadataRoute } from "next";
import { BARTA_GREEN } from "@/components/BartaboardLogo";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME}: Bangladesh news headlines`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: BARTA_GREEN,
    lang: "en",
    categories: ["news"],
    icons: [
      { src: "/brand/bartaboard-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/bartaboard-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
