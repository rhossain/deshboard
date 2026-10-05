/**
 * Shared headlines go out as Deshboard links: `/s/www.prothomalo.com/bangladesh/abc123` opens a
 * page with the headline, its outlet and a button to the article, and gives social sites a preview
 * card. The article URL is the path minus the scheme, so the link stays readable and needs no
 * database.
 */
export function sharePath(link: string): string {
  return `/s/${link.replace(/^https?:\/\//, "")}`;
}

export interface ShareTarget {
  id: string;
  label: string;
  /** Brand colour for the icon. */
  color: string;
  href: (url: string, title: string) => string;
}

const enc = encodeURIComponent;

export const SHARE_TARGETS: ShareTarget[] = [
  {
    id: "facebook",
    label: "Facebook",
    color: "#0866ff",
    href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    color: "#25d366",
    href: (url, title) => `https://wa.me/?text=${enc(`${title}\n${url}`)}`,
  },
  {
    id: "x",
    label: "X",
    color: "currentColor",
    href: (url, title) => `https://x.com/intent/post?text=${enc(title)}&url=${enc(url)}`,
  },
  {
    id: "telegram",
    label: "Telegram",
    color: "#26a5e4",
    href: (url, title) => `https://t.me/share/url?url=${enc(url)}&text=${enc(title)}`,
  },
];
