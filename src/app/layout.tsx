import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BD News Desk",
  description: "Latest headlines from Bangladeshi news portals, collected from RSS feeds, news sitemaps and homepages.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
