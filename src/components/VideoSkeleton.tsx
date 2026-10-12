import { VIDEO_ITEM, VIDEO_LIST, VIDEO_TEXT, VIDEO_THUMB } from "@/lib/video-layout";

/** The Videos view's shape while its code or data are on the way: cards at the size they'll have. */
export function VideoSkeleton() {
  return (
    <ul className={VIDEO_LIST} aria-busy aria-label="Loading videos">
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className={VIDEO_ITEM}>
          <div className={`skeleton aspect-video self-start rounded-xl ${VIDEO_THUMB}`} />
          <div className={`space-y-2.5 pt-1 ${VIDEO_TEXT}`}>
            <div className="skeleton h-3.5 rounded-full" />
            <div className="skeleton h-3.5 w-4/5 rounded-full" />
            <div className="skeleton h-3 w-1/2 rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}
