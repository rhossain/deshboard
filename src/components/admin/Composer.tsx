"use client";

import { useState } from "react";
import { IG_CAPTION_MAX, IG_MAX_HEADLINES, instagramCaption } from "@/lib/instagram-post";
import { carouselMessage, FB_MAX_CARDS, singleMessage } from "@/lib/post-text";
import { api, atDhakaTime, dhakaTime, type Platform, PLATFORM_LABEL, type SocialPost } from "./api";
import { ItemPicker, type Pick } from "./ItemPicker";
import { CardList } from "./CardList";
import { picturesSummary, usePictureChecks } from "./pictures";
import { PreviewDialog } from "./SocialPreview";

const btn = "h-9 rounded-full border border-line px-3.5 text-[13px] font-semibold transition hover:bg-surface-2 active:scale-95 disabled:opacity-50";
const btnPrimary = "h-10 rounded-full bg-accent px-5 text-[13px] font-semibold text-accent-ink transition active:scale-95 disabled:opacity-50";
const btnDanger = "h-10 rounded-full border border-danger/50 bg-danger-soft px-5 text-[13px] font-semibold text-danger transition active:scale-95 disabled:opacity-50";

interface Props {
  platform: Platform;
  onDone: (post: SocialPost) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

type Content = "news" | "video" | "headlines" | "roundup";

/**
 * A post of one's own: one or several headlines or videos from the board (a carousel, a card each: up to 10 on
 * Facebook, 9 headlines on Instagram), or text and a link written here (Facebook). Its text follows the cards until
 * typed in; it goes out at its time, approved.
 */
export function Composer({ platform, onDone, onError, onClose }: Props) {
  const instagram = platform === "instagram";
  const most = instagram ? IG_MAX_HEADLINES : FB_MAX_CARDS;
  const [mode, setMode] = useState<"pick" | "write">("pick");
  const [picks, setPicks] = useState<Pick[]>([]);
  // The text the person typed, if they did; else it follows the cards and the time.
  const [typedText, setTypedText] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [time, setTime] = useState(() => dhakaTime(Date.now() + 30 * 60_000));
  const [picking, setPicking] = useState<"headline" | "video" | "any" | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const kind = picks[0]?.item.kind;
  const videos = kind === "video";
  const cards = picks.map((p) => p.card);
  const content: Content = picks.length > 1 ? (videos ? "roundup" : "headlines") : videos ? "video" : "news";

  const [opened] = useState(() => Date.now());

  /** When the post goes out: the time given, today, or tomorrow when that is already past. */
  function when(now = opened): number {
    const at = Date.parse(atDhakaTime(now, time));
    return at < now - 5 * 60_000 ? at + 86_400_000 : at;
  }

  const givenText = !cards.length ? "" : instagram ? instagramCaption(cards, when()) : cards.length > 1 ? carouselMessage(content, cards, when()) : singleMessage(cards[0]);
  const typed = typedText !== null;
  const message = mode === "pick" && !typed ? givenText : (typedText ?? "");
  const setMessage = (m: string) => setTypedText(m);

  const move = (pos: number, by: number) => {
    const to = pos + by;
    if (to < 0 || to >= picks.length) return;
    const next = [...picks];
    [next[pos], next[to]] = [next[to], next[pos]];
    setPicks(next);
  };

  async function save() {
    setBusy(true);
    try {
      const scheduledAt = new Date(when(Date.now())).toISOString();
      onDone(
        mode === "pick"
          ? await api.createFromItems({ cards, content, message, scheduledAt, platform })
          : await api.create({ message, link: link || undefined, scheduledAt }),
      );
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tab = (m: "pick" | "write", label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`h-8 rounded-full border px-3 text-[12px] font-semibold ${mode === m ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`}
      aria-pressed={mode === m}
    >
      {label}
    </button>
  );

  // Instagram's cards are drawn by the deploy, from the headline, not the outlet's picture: nothing to check there.
  const checks = usePictureChecks(instagram || mode !== "pick" ? [] : cards, picks.length > 1);
  const pictures = picturesSummary(checks);
  const ready = mode === "pick" ? picks.length > 0 && !!message.trim() : !!message.trim();
  const what = picks.length > 1 ? `A carousel of ${picks.length} ${videos ? "videos" : "headlines"}` : picks.length === 1 ? (videos ? "One video" : "One headline") : "";

  return (
    <section className="space-y-4 rounded-2xl border border-accent/40 bg-surface p-4 shadow-card sm:p-5" aria-label="New post">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-semibold">New post</h2>
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{PLATFORM_LABEL[platform]}</span>
        <span className="flex-1" />
        {!instagram && (
          <div className="flex gap-2">
            {tab("pick", "From the board")}
            {tab("write", "Write your own")}
          </div>
        )}
      </div>

      {mode === "pick" && (
        <>
          <p className="text-sm text-muted">
            {instagram
              ? `Pick headlines from the board: one is a card of its own, several (up to ${most}) a carousel, drawn by the next run.`
              : `Pick headlines or videos from the board: one is a post of its own, several (up to ${most}) a carousel with a card each.`}
          </p>

          {picks.length > 0 && (
            <CardList
              cards={cards}
              numbered={picks.length > 1}
              onMove={move}
              onRemove={(pos) => setPicks(picks.filter((_, i) => i !== pos))}
              removeTitle="Take it out"
              checks={instagram ? undefined : checks}
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            {(!kind || kind === "headline") && (
              <button type="button" className={btn} disabled={picks.length >= most} onClick={() => setPicking("headline")}>
                {picks.length ? "Add more headlines" : "Add headlines"}
              </button>
            )}
            {!instagram && (!kind || kind === "video") && (
              <button type="button" className={btn} disabled={picks.length >= most} onClick={() => setPicking("video")}>
                {picks.length ? "Add more videos" : "Add videos"}
              </button>
            )}
            {picks.length > 0 && (
              <span className="text-xs text-muted">
                {what} · {picks.length} of {most}
              </span>
            )}
          </div>
        </>
      )}

      {previewing && (
        <PreviewDialog
          post={{
            platform,
            content: mode === "pick" ? content : "custom",
            message,
            link: mode === "pick" ? (picks.length > 1 ? `https://bartaboard.com/bn/${videos ? "videos/" : ""}` : (cards[0]?.link ?? "")) : link,
            cards: mode === "pick" ? cards : link ? [{ link, title: message.split("\n")[0].slice(0, 140), source: "Bartaboard" }] : [],
            scheduledAt: new Date(when()).toISOString(),
          }}
          onClose={() => setPreviewing(false)}
        />
      )}

      {picking && (
        <ItemPicker
          kind={picking}
          max={most - picks.length}
          inPost={picks.length}
          exclude={picks.map((p) => p.item.key)}
          needsPicture={instagram ? false : "carousel"}
          title={picks.length ? `Add more ${picking === "video" ? "videos" : "headlines"}` : undefined}
          onPick={(chosen) => {
            setPicks([...picks, ...chosen].slice(0, most));
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}

      {(mode === "write" || picks.length > 0) && (
        <>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Text</span>
            <textarea
              lang="bn"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={Math.min(12, Math.max(4, message.split("\n").length + 1))}
              placeholder="What to say"
              className="w-full rounded-xl border border-line bg-surface-2 p-3 text-[15px] leading-relaxed outline-none focus:border-accent"
            />
          </label>
          {mode === "pick" && typed && (
            <button
              type="button"
              className="-mt-2 text-xs font-semibold text-accent"
              onClick={() => setTypedText(null)}
            >
              Back to the text the cards give
            </button>
          )}
          {instagram && (
            <p className={`-mt-2 text-xs ${message.length > IG_CAPTION_MAX ? "font-semibold text-danger" : "text-muted"}`}>
              {message.length.toLocaleString()} / {IG_CAPTION_MAX.toLocaleString()} characters
            </p>
          )}
          {mode === "write" && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Link (optional)</span>
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                inputMode="url"
                placeholder="https://bartaboard.com/…"
                className="h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent"
              />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="font-semibold">At</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-10 rounded-lg border border-line bg-surface-2 px-2" />
              <span className="text-xs text-muted">Dhaka</span>
            </label>
            <span className="flex-1" />
            <button type="button" className={btn} disabled={busy || !ready} onClick={() => setPreviewing(true)} title={`As the ${PLATFORM_LABEL[platform]} app will show it`}>
              Preview
            </button>
            <button type="button" className={btn} disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={pictures.bad ? btnDanger : btnPrimary}
              disabled={busy || !ready || (instagram && message.length > IG_CAPTION_MAX)}
              onClick={save}
              title={pictures.text ?? undefined}
            >
              {busy ? "Adding…" : pictures.text ? "Add to the queue anyway" : "Add to the queue"}
            </button>
          </div>
          {pictures.text && (
            <p className={`rounded-xl px-3 py-2 text-xs ${pictures.bad ? "bg-danger-soft text-danger" : "bg-gold/10 text-gold"}`}>
              <strong>{pictures.text}.</strong>{" "}
              {pictures.bad
                ? picks.length > 1
                  ? "A card marked ⛔ can't be made: it is left out when the post goes out, and the rest go as they are. Take it out, or pick another story for it."
                  : "A post marked ⛔ goes out without a picture (Facebook shows the fallback card): pick another story, or add it anyway if the headline matters more."
                : "It will post, but the picture may look soft or cropped; open it (tap the thumbnail) to decide."}
            </p>
          )}
          <p className="text-xs text-muted">
            {instagram
              ? "It goes out at its time, as written; give it 20 minutes or more, for its pictures to be drawn first."
              : picks.length > 1
                ? "It goes out at its time, as written; each card's link and picture are checked just before."
                : "It goes out at its time, as written; its link is checked just before."}
          </p>
        </>
      )}
    </section>
  );
}
