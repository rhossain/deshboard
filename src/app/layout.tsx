import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, Noto_Sans_Bengali } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const bengali = Noto_Sans_Bengali({ subsets: ["bengali"], variable: "--font-bengali", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = {
  title: "BD News Desk",
  description: "Latest headlines from Bangladeshi news portals, collected from RSS feeds, news sitemaps and homepages.",
  appleWebApp: { capable: true, title: "BD News Desk", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f11" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn" className={`h-full antialiased ${inter.variable} ${bengali.variable} ${fraunces.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
