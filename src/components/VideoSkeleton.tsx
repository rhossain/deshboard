/** The Videos view's shape while its code or data are on the way: cards at the size they'll have. */
export function VideoSkeleton() {
  return (
    <ul className="grid gap-x-4 gap-y-4 sm:grid-cols-2 sm:gap-y-7 lg:grid-cols-3 xl:grid-cols-4" aria-busy aria-label="Loading videos">
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="flex gap-3 sm:block">
          <div className="skeleton aspect-video w-40 shrink-0 rounded-xl sm:w-full" />
          <div className="min-w-0 flex-1 space-y-2.5 pt-1 sm:mt-2.5">
            <div className="skeleton h-3.5 rounded-full" />
            <div className="skeleton h-3.5 w-4/5 rounded-full" />
            <div className="skeleton h-3 w-1/2 rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}
