import { SharedHeadline } from "@/components/SharedHeadline";

// Exported as 404.html. The host serves it for shared headlines (/s/…, see public/.htaccess and
// public/_redirects) and for unknown addresses; it tells them apart in the browser.
export default function NotFound() {
  return <SharedHeadline />;
}
