import type { Metadata } from "next";
import { SharedHeadline } from "@/components/SharedHeadline";

// Its own title (the layout's template adds the site name): a missing page shouldn't be titled like the board.
// For a shared headline the Pages Function rewrites the title and description with the headline's.
export const metadata: Metadata = {
  title: "Page not found",
  description: "That address isn't on Bartaboard. The board, its sections and every newspaper are a tap away.",
};

// Exported as 404.html: the page for shared headlines (/s/…) and for unknown addresses, which it tells
// apart in the browser. On bartaboard.com the Pages Function in functions/s/[[path]].ts serves it for
// shared links with the headline written in; Apache hosts rewrite /s/… to it (public/.htaccess).
export default function NotFound() {
  return <SharedHeadline />;
}
