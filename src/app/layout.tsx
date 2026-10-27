import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ANALYTICS_TOKEN, KEYWORDS, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import { OG_LOCALE } from "@/lib/i18n";
import { THEME_SCRIPT } from "@/lib/theme";
import { NEWS_DENSITY_SCRIPT } from "@/lib/news-density";
import { VIDEO_LAYOUT_SCRIPT } from "@/lib/video-layout";

/**
 * One root layout serves both languages (the static 404 page, which shared links rely on, needs a
 * single one), so Next writes <html lang="en"> on every page; scripts/after-build.ts rewrites it to "bn"
 * on the exported Bangla pages. This script does the same in the browser for the pages that aren't
 * exported under /bn/ (the 404 and share page), before they paint.
 */
const LANG_SCRIPT = 'var p=location.pathname;if(p==="/bn"||p.indexOf("/bn/")===0)document.documentElement.lang="bn"';
import { BackToTop } from "@/components/BackToTop";
import { ConsentBanner } from "@/components/ConsentBanner";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { MetaPixel } from "@/components/MetaPixel";
import "./globals.css";

/*
 * The fonts, self-hosted (src/app/fonts): Google Fonts' own woff2 subsets, with the weight axis cut to
 * 400–700 (the only weights the site uses: regular, medium, semibold, bold) by fontTools' instancer. That
 * is 112 KB preloaded instead of 157 KB, the same files on every build, and no fetch from Google at build
 * time. Each file keeps the unicode-range Google gave it, so a browser only downloads what the text needs.
 */
// (next/font wants every option as a written literal, so the unicode-ranges below are spelt out each time.)
const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "400 700",
  variable: "--font-inter",
  display: "swap",
  adjustFontFallback: "Arial",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});
// Accented Latin (Erdoğan, Müller), fetched only when a page shows one. No fallback face of its own: one
// would have no unicode-range and catch every character before Inter did (see globals.css --font-sans).
const interExt = localFont({
  src: "./fonts/inter-latin-ext.woff2",
  weight: "400 700",
  variable: "--font-inter-ext",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
});
const bengali = localFont({
  src: "./fonts/noto-sans-bengali.woff2",
  weight: "400 700",
  variable: "--font-bengali",
  display: "swap",
  adjustFontFallback: "Arial",
  declarations: [{ prop: "unicode-range", value: "U+0951-0952, U+0964-0965, U+0980-09FE, U+1CD0, U+1CD2, U+1CD5-1CD6, U+1CD8, U+1CE1, U+1CEA, U+1CED, U+1CF2, U+1CF5-1CF7, U+200C-200D, U+20B9, U+25CC, U+A8F1, U+11DF0-11DF1" }],
});
// Only the wordmark and a few headings use it, all semibold: one weight, and not preloaded, so it
// doesn't compete with the fonts the headlines are set in.
const fraunces = localFont({
  src: "./fonts/fraunces-600-latin.woff2",
  weight: "600",
  variable: "--font-fraunces",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});

export const metadata: Metadata = {
  // Absolute base for canonical and share image URLs; set SITE_URL to the public address when deploying.
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  keywords: KEYWORDS,
  applicationName: SITE_NAME,
  category: "news",
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
    locale: OG_LOCALE.en,
    alternateLocale: [OG_LOCALE.bn],
  },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // No themeColor here; THEME_SCRIPT manages the theme-color metas so they follow a saved theme.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: THEME_SCRIPT may set data-theme on <html> before React hydrates.
    // English interface; Bangla headlines carry lang="bn" themselves.
    <html
      lang="en"
      className={`h-full antialiased ${inter.variable} ${interExt.variable} ${bengali.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LANG_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: VIDEO_LAYOUT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: NEWS_DENSITY_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {children}
        <BackToTop />
        <ConsentBanner />
        <GoogleAnalytics />
        <MetaPixel />
        {ANALYTICS_TOKEN && (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: ANALYTICS_TOKEN })}
          />
        )}
      </body>
    </html>
  );
}
