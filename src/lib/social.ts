/**
 * Bartaboard's own pages on social networks: icons at the foot of every page, a line on the About page, and
 * `sameAs` in the site's Organization data (src/lib/site.ts), which tells search engines they are ours.
 * Add a network here, with its icon in SocialIcon (src/components/InfoPage.tsx).
 */
export const SOCIAL_LINKS = [
  { id: "facebook", name: "Facebook", nameBn: "ফেসবুক", href: "https://www.facebook.com/bartaboard.bd" },
  { id: "instagram", name: "Instagram", nameBn: "ইনস্টাগ্রাম", href: "https://www.instagram.com/bartaboard.bd" },
] as const;

export type SocialLink = (typeof SOCIAL_LINKS)[number];
