/**
 * The Videos layout the reader picked: "grid" (cards) or "list" (thumbnail beside the title). No saved
 * choice means the default: a list on phones, a grid on larger screens. Kept as <html
 * data-video-layout>, set before paint by VIDEO_LAYOUT_SCRIPT, so the prerendered cards take the
 * reader's layout from CSS (the `vgrid:` and `vlist:` variants in globals.css) without shifting.
 */
export type VideoLayout = "grid" | "list";

export const VIDEO_LAYOUT_KEY = "bartaboard:video-layout";
export const VIDEO_LAYOUT_ATTR = "data-video-layout";

export const VIDEO_LAYOUT_SCRIPT = `try{var l=localStorage.getItem(${JSON.stringify(VIDEO_LAYOUT_KEY)});
if(l==="grid"||l==="list")document.documentElement.setAttribute(${JSON.stringify(VIDEO_LAYOUT_ATTR)},l)}catch(e){}`;

// Each part of a video card, per layout (VideoCard, VideoSkeleton). Default: a row on phones, a card in
// a grid from `sm`. Grid: cards on phones too. List: rows on every screen, in one column.
// Dense: an open story's coverage (a row of its own, see VideoCard) goes under its card's row, and the
// cards after it fill the rest of that row.
export const VIDEO_LIST =
  "grid grid-flow-row-dense gap-x-4 gap-y-4 sm:grid-cols-2 sm:gap-y-7 lg:grid-cols-3 xl:grid-cols-4 " +
  "vgrid:gap-y-6 vlist:max-w-4xl vlist:grid-cols-1 sm:vlist:gap-y-5";
export const VIDEO_ITEM = "flex gap-3 sm:block vgrid:block vlist:flex sm:vlist:gap-4";
export const VIDEO_THUMB = "w-40 shrink-0 sm:w-full vgrid:w-full vlist:w-40 sm:vlist:w-60";
export const VIDEO_TEXT = "min-w-0 flex-1 sm:mt-2.5 vgrid:mt-2.5 vlist:mt-0";

/** The thumbnail's displayed width per layout, for its `sizes`; null is the default layout. */
export function videoThumbSizes(choice: VideoLayout | null): string {
  const grid = "(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 46vw";
  if (choice === "grid") return `${grid}, 100vw`;
  if (choice === "list") return "(min-width: 640px) 240px, 160px";
  return `${grid}, 160px`;
}
