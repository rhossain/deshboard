"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "../ui";
import type { Card, Platform } from "./api";
import { dhakaTime, PLATFORM_LABEL } from "./api";

/** What a preview needs of a post: a queued one, or one being composed. */
export interface PreviewPost {
  platform: Platform;
  content: string;
  message: string;
  /** The post's own link (a single post's item, or the board for a carousel). */
  link: string;
  cards: Card[];
  /** Instagram's pictures, as drawn by the deploy (postImages); empty until a run has drawn them. */
  images?: string[];
  scheduledAt?: string;
}

const PAGE_NAME = "Bartaboard";
const IG_HANDLE = "bartaboard.bd";
const AVATAR = "/brand/bartaboard-icon-192.png";
const DOMAIN = "BARTABOARD.COM";

/** Facebook's and Instagram's own colours, so the preview reads like the apps and not like the admin. */
const FB = { ink: "#050505", muted: "#65676B", line: "#CED0D4", card: "#F0F2F5", feed: "#F0F2F5", blue: "#1877F2" };
const IG = { ink: "#000000", muted: "#737373", line: "#DBDBDB", feed: "#FAFAFA" };

/**
 * The post as the Facebook or Instagram app will show it, near enough to judge the text, the picture and the cards
 * by: the apps' own layout, type sizes and colours, with the text folded the way they fold it ("See more", "more").
 * A dialog; Esc closes it.
 */
export function PreviewDialog({ post, onClose }: { post: PreviewPost; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const instagram = post.platform === "instagram";
  return (
    <dialog ref={ref} className="preview" onClose={onClose} onClick={(e) => e.target === e.currentTarget && onClose()} aria-label={`Preview on ${PLATFORM_LABEL[post.platform]}`}>
      <div className="flex h-full max-h-full flex-col bg-surface sm:rounded-3xl sm:border sm:border-line sm:shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-5">
          <h2 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">
            Preview · {PLATFORM_LABEL[post.platform]}
            {post.scheduledAt && <span className="ml-2 text-sm font-normal text-muted">goes out {dhakaTime(post.scheduledAt)}</span>}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted hover:text-foreground">
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ background: instagram ? IG.feed : FB.feed }}>
          <div className="mx-auto max-w-[30rem] py-3 sm:py-5">{instagram ? <InstagramPost post={post} /> : <FacebookPost post={post} />}</div>
        </div>
        <footer className="shrink-0 border-t border-line px-4 py-2.5 pb-[max(env(safe-area-inset-bottom),0.625rem)] text-[11px] leading-snug text-muted sm:px-5">
          {instagram
            ? post.images?.length
              ? "The pictures as drawn; Instagram shows them at the phone's width. The caption folds after two lines until tapped."
              : "The pictures aren't drawn yet (the next run draws them, within 15 minutes): these stand in, with the same words. The caption folds after two lines until tapped."
            : post.cards.length > 1
              ? "Near enough to judge by: the deploy redraws each card square from the outlet's picture before posting, so a crop may differ a little. Facebook folds long text after a few lines."
              : "Near enough to judge by: Facebook reads the link's own title and picture when it posts, and folds long text after a few lines."}
        </footer>
      </div>
    </dialog>
  );
}

/** Text folded the way the apps fold it: `lines` lines, then "See more" / "more". */
function Folded({
  text,
  lines,
  more,
  color,
  size = 15,
  lineHeight = 1.3333,
  prefix,
}: {
  text: string;
  lines: number;
  more: string;
  color: string;
  size?: number;
  lineHeight?: number;
  /** Instagram's caption starts with the handle, on the first line. */
  prefix?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const all = text.split("\n");
  // A line of the text may wrap: count roughly 45 characters a line on a phone.
  const rows = all.flatMap((l) => Array(Math.max(1, Math.ceil(l.length / 45))).fill(l));
  const folds = !open && rows.length > lines;
  return (
    <div lang="bn" className="whitespace-pre-line break-words" style={{ color, fontSize: size, lineHeight }}>
      <span style={folds ? { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden" } : undefined}>
        {prefix}
        {text}
      </span>
      {folds && (
        <button type="button" className="font-semibold" style={{ color: FB.muted }} onClick={() => setOpen(true)}>
          {more}
        </button>
      )}
    </div>
  );
}

function Avatar({ size, ring }: { size: number; ring?: boolean }) {
  return (
    <span className="shrink-0 rounded-full" style={{ padding: ring ? 2 : 0, background: ring ? "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)" : undefined }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={AVATAR} alt="" width={size} height={size} className="block rounded-full bg-white" style={{ width: size, height: size, border: ring ? "2px solid #fff" : undefined }} />
    </span>
  );
}

function Picture({ src, className, style }: { src?: string; className?: string; style?: React.CSSProperties }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <div className={className} style={{ ...style, background: "#DADDE1" }} aria-hidden />;
  // The outlet's or YouTube's picture, at its own address.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className={className} style={style} onError={() => setBroken(true)} />;
}

/* ---------- Facebook ---------- */

const FbIcon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={FB.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

function FacebookPost({ post }: { post: PreviewPost }) {
  const carousel = post.cards.length > 1;
  const first = post.cards[0];
  const videos = post.content === "video" || post.content === "roundup";
  return (
    <article className="bg-white" style={{ color: FB.ink, fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
      <header className="flex items-center gap-2.5 px-4 pt-3 pb-2">
        <Avatar size={40} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-semibold">{PAGE_NAME}</p>
          <p className="text-[13px]" style={{ color: FB.muted }}>
            Just now · <span aria-label="Public">🌐</span>
          </p>
        </div>
        <span className="px-1 text-xl leading-none" style={{ color: FB.muted }} aria-hidden>
          ···
        </span>
      </header>

      {post.message && (
        <div className="px-4 pb-3">
          <Folded text={post.message} lines={carousel ? 5 : 4} more="… See more" color={FB.ink} />
        </div>
      )}

      {carousel ? (
        <ol className="flex snap-x gap-2 overflow-x-auto px-4 pb-1">
          {post.cards.map((c, i) => (
            <li key={`${c.link}-${i}`} className="w-[62%] shrink-0 snap-start overflow-hidden rounded-lg border" style={{ borderColor: FB.line }}>
              {/* The deploy draws each card square (src/lib/card-pictures.ts CARD_SIZE), from the outlet's picture. */}
              <Picture src={c.picture} className="aspect-square w-full object-cover" />
              <div className="px-3 py-2.5" style={{ background: "#fff" }}>
                <p lang="bn" className="line-clamp-2 text-[15px] font-semibold leading-snug">
                  {c.title}
                </p>
                <p lang="bn" className="mt-0.5 truncate text-[13px]" style={{ color: FB.muted }}>
                  {c.source}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        (first || post.link) && (
          <div style={{ borderTop: `1px solid ${FB.line}`, borderBottom: `1px solid ${FB.line}` }}>
            {/* Facebook reads the link's own picture and title (the share page's Open Graph tags) when it posts. */}
            <Picture src={first?.picture} className="aspect-[1.91/1] w-full object-cover" />
            <div className="px-4 py-2.5" style={{ background: FB.card }}>
              <p className="text-[13px] uppercase" style={{ color: FB.muted }}>
                {DOMAIN}
              </p>
              <p lang="bn" className="line-clamp-2 text-[17px] font-semibold leading-snug">
                {first?.title ?? post.link}
              </p>
              {first?.source && (
                <p lang="bn" className="mt-0.5 truncate text-[14px]" style={{ color: FB.muted }}>
                  {first.source}
                  {videos ? " · বার্তাবোর্ডে দেশের টিভি চ্যানেলের সংবাদ ভিডিও" : "। বার্তাবোর্ডে দেশের সব খবর, এক জায়গায়।"}
                </p>
              )}
            </div>
          </div>
        )
      )}

      <div className="flex items-center justify-between px-4 py-2 text-[13px]" style={{ color: FB.muted }}>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] text-white" style={{ background: FB.blue }} aria-hidden>
            👍
          </span>
          <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px]" style={{ background: "#F33E58" }} aria-hidden>
            ❤️
          </span>
        </span>
        <span>&nbsp;</span>
      </div>
      <div className="mx-4 flex justify-around py-1 text-[13px] font-semibold" style={{ color: FB.muted, borderTop: `1px solid ${FB.line}` }}>
        <span className="inline-flex items-center gap-1.5 py-1.5">
          <FbIcon d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zm0 0 4-8a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1 6.4a2 2 0 0 1-2 1.3H7" /> Like
        </span>
        <span className="inline-flex items-center gap-1.5 py-1.5">
          <FbIcon d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12z" /> Comment
        </span>
        <span className="inline-flex items-center gap-1.5 py-1.5">
          <FbIcon d="M14 5l7 7-7 7v-4C8 15 5 17 3 20c1-6 4-10 11-11z" /> Share
        </span>
      </div>
    </article>
  );
}

/* ---------- Instagram ---------- */

const IgIcon = ({ d, filled }: { d: string; filled?: boolean }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill={filled ? IG.ink : "none"} stroke={IG.ink} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

function InstagramPost({ post }: { post: PreviewPost }) {
  const images = post.images ?? [];
  const slides: ("cover" | Card | string)[] = images.length ? images : post.cards.length > 1 ? ["cover", ...post.cards] : post.cards;
  const [at, setAt] = useState(0);
  const strip = useRef<HTMLOListElement>(null);
  const heading = post.message.split("\n")[0];
  return (
    <article className="bg-white" style={{ color: IG.ink, fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
      <header className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar size={32} ring />
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold">{IG_HANDLE}</p>
        <span className="px-1 text-xl leading-none" aria-hidden>
          ···
        </span>
      </header>

      <div className="relative">
        {slides.length > 1 && (
          <span className="absolute right-3 top-3 z-10 rounded-full px-2 py-0.5 text-[12px] font-medium text-white" style={{ background: "rgba(0,0,0,.6)" }}>
            {at + 1}/{slides.length}
          </span>
        )}
        <ol
          ref={strip}
          className="flex snap-x snap-mandatory overflow-x-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            setAt(Math.round(el.scrollLeft / el.clientWidth));
          }}
        >
          {slides.map((s, i) => (
            <li key={i} className="w-full shrink-0 snap-center">
              {typeof s === "string" && s !== "cover" ? (
                // Drawn by the deploy, served from bartaboard.com/ig/ (1080×1350).
                <Picture src={s} className="aspect-[4/5] w-full object-cover" />
              ) : (
                <StandInSlide heading={heading} card={s === "cover" ? null : (s as Card)} index={s === "cover" ? 0 : post.cards.indexOf(s as Card) + 1} total={post.cards.length} />
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex items-center gap-4 px-3 pt-2.5 pb-1">
        <IgIcon d="M12 20.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z" />
        <IgIcon d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12z" />
        <IgIcon d="M21 3 3 10.5l8 2.5 2.5 8z" />
        {slides.length > 1 && (
          <span className="flex flex-1 justify-center gap-1" aria-hidden>
            {slides.map((_, i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: i === at ? "#0095F6" : "#C7C7C7" }} />
            ))}
          </span>
        )}
        <span className={slides.length > 1 ? "" : "ml-auto"}>
          <IgIcon d="M6 3h12v18l-6-4.5L6 21z" />
        </span>
      </div>

      <div className="px-3 pb-3">
        <Folded text={post.message} lines={2} more="… more" color={IG.ink} size={14} lineHeight={1.3} prefix={<span className="font-semibold">{IG_HANDLE} </span>} />
        <p className="mt-1.5 text-[11px] uppercase tracking-wide" style={{ color: IG.muted }}>
          Just now
        </p>
      </div>
    </article>
  );
}

/**
 * A stand-in for a picture the deploy hasn't drawn yet: the same words on a Bartaboard-green card, 4:5. The real
 * ones (src/lib/instagram-cards.ts) look different in detail.
 */
function StandInSlide({ heading, card, index, total }: { heading: string; card: Card | null; index: number; total: number }) {
  return (
    <div className="flex aspect-[4/5] w-full flex-col justify-between p-5 text-white" style={{ background: "linear-gradient(160deg, #0b5f46 0%, #006a4e 60%, #0a8a66 100%)" }}>
      <div className="flex items-center justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/bartaboard-header-dark.svg" alt="Bartaboard" className="h-7 w-auto" />
        {card && total > 1 && (
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[12px] font-semibold">
            {index}/{total}
          </span>
        )}
      </div>
      {card ? (
        <div>
          <p lang="bn" className="text-[22px] font-bold leading-snug">
            {card.title}
          </p>
          <p lang="bn" className="mt-3 text-[14px] opacity-80">
            {card.source}
          </p>
        </div>
      ) : (
        <p lang="bn" className="text-[34px] font-bold leading-tight">
          {heading}
        </p>
      )}
      <p className="text-[11px] uppercase tracking-wide opacity-60">Stand-in · the next run draws the real picture</p>
    </div>
  );
}
