import { SharedHeadline } from "@/components/SharedHeadline";

// Exported as 404.html: the page for shared headlines (/s/…) and for unknown addresses, which it tells
// apart in the browser. On bartaboard.com the Pages Function in functions/s/[[path]].ts serves it for
// shared links with the headline written in; Apache hosts rewrite /s/… to it (public/.htaccess).
export default function NotFound() {
  return <SharedHeadline />;
}
