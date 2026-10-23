"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, type Category } from "@/lib/categories";
import { Highlight, SearchProvider } from "../Highlight";
import { CloseIcon, SearchIcon } from "../ui";
import { useSearch } from "../use-search";
import { type Card, dhakaTime, PLATFORM_LABEL, relative } from "./api";
import { cardOf, loadItems, loadOlderDay, olderDates, type PickItem, pictureFor, type Posted, recentlyPosted } from "./items";
import { checkLink, type LinkVerdict } from "./links";
import { checkPicture, type PictureVerdict } from "./pictures";

const chip = "h-8 shrink-0 rounded-full border px-3 text-[12px] font-semibold transition disabled:opacity-40";
const chipOn = `${chip} border-accent bg-accent-soft text-accent`;
const chipOff = `${chip} border-line text-muted hover:text-foreground`;

/** Rows drawn at first, and added each time the list is scrolled to its end. */
const PAGE = 80;
/** Older days loaded at a time ("Load 3 more days"): each day file is a few MB. */
const DAYS_AT_A_TIME = 3;
/** A search the board has fewer matches for than this carries on into the older days by itself, as the site's does. */
const AUTO_OLDER_BELOW = 20;

type Age = "2h" | "6h" | "24h" | "all";
const AGES: [Age, string, number][] = [
  ["2h", "Last 2 h", 2 * 3600_000],
  ["6h", "Last 6 h", 6 * 3600_000],
  ["24h", "Last 24 h", 24 * 3600_000],
  ["all", "All", Infinity],
];

const SECTION = new Map(CATEGORIES.map((c) => [c.id, c]));

export interface Pick {
  card: Card;
  item: PickItem;
}

interface Props {
  /** Which items to offer: headlines, videos, or both (the choice is then the person's). */
  kind: "headline" | "video" | "any";
  /** Items already in the post (their keys), shown as such. */
  exclude?: string[];
  /** How many are in the post already (a carousel's cards need pictures once there is more than one). */
  inPost?: number;
  /**
   * The cards must have a picture: true always (a Facebook carousel's cards), "carousel" once the post would have
   * more than one card.
   */
  needsPicture?: boolean | "carousel";
  /** Choose several at once, up to this many; unset: one, at once. */
  max?: number;
  title?: string;
  /** The button's text, for one item ("Add", "Use this"). */
  label?: string;
  onPick: (picks: Pick[]) => void;
  onClose: () => void;
}

type Suggestion =
  | { type: "source"; id: string; name: string; en: string; count: number }
  | { type: "section"; id: Category; name: string; en: string }
  | { type: "item"; item: PickItem };

const fold = (s: string) => s.normalize("NFC").toLowerCase();
const deferredKey = (q: string) => q.trim();

/**
 * A search over the board's headlines and videos right now, and the last 30 days' headlines on request: the site's
 * own matching (docs/search.md: Bangla and English, other forms and spellings), suggestions as one types (outlets,
 * sections, headlines), filters by section, outlet and age. Picking makes each item's card. Full screen on a phone,
 * a dialog on a desktop; Esc closes it.
 */
export function ItemPicker({ kind, exclude = [], inPost = 0, needsPicture, max, title, label = "Add", onPick, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const endRef = useRef<HTMLLIElement>(null);
  const [items, setItems] = useState<PickItem[] | null>(null);
  const [posted, setPosted] = useState<Map<string, Posted>>(new Map());
  const [older, setOlder] = useState<PickItem[]>([]);
  const [loadedDays, setLoadedDays] = useState(0);
  const [loadingDays, setLoadingDays] = useState(false);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<"headline" | "video">(kind === "video" ? "video" : "headline");
  const [section, setSection] = useState<Category | "">("");
  const [source, setSource] = useState<{ id: string; name: string } | null>(null);
  const [age, setAge] = useState<Age>("all");
  const [chosen, setChosen] = useState<Map<string, PickItem>>(new Map());
  const deferred = useDeferredValue(query);
  const search = useSearch(deferred);
  // How many rows are drawn, for the list as filtered now (a new filter or search starts over at PAGE).
  const scope = JSON.stringify([deferredKey(deferred), show, section, source?.id, age, older.length]);
  const [limitFor, setLimitFor] = useState({ scope, limit: PAGE });
  const limit = limitFor.scope === scope ? limitFor.limit : PAGE;
  const setLimit = (f: (l: number) => number) => setLimitFor({ scope, limit: f(limit) });
  const [suggesting, setSuggesting] = useState(false);
  // The suggestion under the keyboard, for the query as typed now (a new query starts with none).
  const [cursorFor, setCursorFor] = useState({ query: "", cursor: -1 });
  const cursor = cursorFor.query === query ? cursorFor.cursor : -1;
  const setCursor = (f: (c: number) => number) => setCursorFor({ query, cursor: f(cursor) });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Each chosen item's picture as a carousel card (by key), checked as it is chosen: shown on its row, so a picture
  // the deploy can't make a card of is known here, not when the post goes out. "checking" until known.
  const [verdicts, setVerdicts] = useState<Map<string, PictureVerdict | "checking">>(new Map());
  // Each chosen item's link (by key): a headline whose article is gone, or a video YouTube no longer has, isn't added.
  const [links, setLinks] = useState<Map<string, LinkVerdict | "checking">>(new Map());
  const [now] = useState(() => Date.now());
  const multi = (max ?? 1) > 1;
  const checking = [...chosen.keys()].some((k) => verdicts.get(k) === "checking");


  // A modal dialog: the page behind can't be scrolled or reached; Esc closes it (the dialog's own cancel).
  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let off = false;
    loadItems()
      .then((all) => !off && setItems(all))
      .catch(() => {
        if (off) return;
        setItems([]);
        setProblem("The board's headlines and videos didn't load: close this and open it again.");
      });
    recentlyPosted().then((map) => !off && setPosted(map));
    return () => {
      off = true;
    };
  }, []);

  /** "Posted 10:32 · Facebook", for an item that went out in the last 12 hours. */
  const postedNote = (it: PickItem) => {
    const p = posted.get(it.key);
    return p ? `Posted ${dhakaTime(p.at)} · ${PLATFORM_LABEL[p.platform]}` : null;
  };

  // Back to the top when what the list shows changes.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [scope]);

  const pool = useMemo(() => {
    if (!items) return [];
    if (!older.length) return items;
    const seen = new Set(items.map((it) => `${it.kind}-${it.key}`));
    return [...items, ...older.filter((it) => !seen.has(`${it.kind}-${it.key}`))];
  }, [items, older]);

  const span = AGES.find((a) => a[0] === age)![2];
  const shown = useMemo(
    () =>
      pool
        .filter((it) => it.kind === show)
        .filter((it) => !section || it.section === section)
        .filter((it) => !source || it.sourceId === source.id)
        .filter((it) => span === Infinity || (it.time && it.time >= now - span))
        .filter((it) => !search || search.matches(it.title) || (it.shownTitle && search.matches(it.shownTitle)) || search.matches(it.source) || search.matches(it.sourceEn) || fold(it.sourceId).includes(fold(deferred.trim()))),
    [pool, show, section, source, span, now, search, deferred],
  );

  // More rows as the list reaches its end.
  useEffect(() => {
    const end = endRef.current;
    if (!end || shown.length <= limit) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setLimitFor({ scope, limit: limit + PAGE }), { root: listRef.current });
    io.observe(end);
    return () => io.disconnect();
  }, [shown.length, limit, scope]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = fold(deferred.trim());
    if (!q) return [];
    const list: Suggestion[] = [];
    const counts = new Map<string, { name: string; en: string; count: number }>();
    for (const it of pool) {
      if (it.kind !== show) continue;
      const hit = fold(it.source).includes(q) || fold(it.sourceEn).includes(q) || fold(it.sourceId).includes(q) || (search ? search.matches(it.source) || search.matches(it.sourceEn) : false);
      if (!hit) continue;
      const c = counts.get(it.sourceId) ?? { name: it.source, en: it.sourceEn, count: 0 };
      c.count++;
      counts.set(it.sourceId, c);
    }
    for (const [id, c] of [...counts].sort((a, b) => b[1].count - a[1].count).slice(0, 4)) list.push({ type: "source", id, ...c });
    if (show === "headline") {
      for (const c of CATEGORIES) {
        if (c.id === "other") continue;
        if (fold(c.label).includes(q) || fold(c.bn).includes(q) || (search && (search.matches(c.label) || search.matches(c.bn)))) list.push({ type: "section", id: c.id, name: c.bn, en: c.label });
        if (list.filter((s) => s.type === "section").length >= 3) break;
      }
    }
    for (const it of shown.slice(0, 5)) list.push({ type: "item", item: it });
    return list;
  }, [deferred, pool, show, search, shown]);

  const pictureNeeded = (adding: number) => needsPicture === true || (needsPicture === "carousel" && inPost + adding > 1);

  /** The item's picture as a carousel card would be made of it (checkPicture, cached by address). */
  const cardVerdict = async (it: PickItem, picture?: string): Promise<PictureVerdict> => {
    const verdict = await checkPicture(picture ?? (await pictureFor(it)), true);
    setVerdicts((v) => new Map(v).set(it.key, verdict));
    return verdict;
  };

  /** Starts checking the chosen items not yet known, once the post would be a carousel (two cards or more). */
  const checkChosen = (next: Map<string, PickItem>) => {
    if (!pictureNeeded(next.size)) return;
    const unchecked = [...next.values()].filter((it) => !verdicts.has(it.key));
    if (!unchecked.length) return;
    setVerdicts((v) => {
      const marked = new Map(v);
      for (const it of unchecked) marked.set(it.key, "checking");
      return marked;
    });
    for (const it of unchecked) void cardVerdict(it);
  };
  const carouselNow = pictureNeeded(Math.max(chosen.size, 1));

  /** The item's link as the admin's check has it (checkLink, cached by link), shown on its row. */
  const linkVerdict = async (it: PickItem): Promise<LinkVerdict> => {
    setLinks((m) => (m.get(it.key) ? m : new Map(m).set(it.key, "checking")));
    const verdict = await checkLink(it.link);
    setLinks((m) => new Map(m).set(it.key, verdict));
    return verdict;
  };

  async function finish(list: PickItem[]) {
    setBusy(true);
    setProblem(null);
    try {
      // A link that no longer leads to its story is said now, and not added.
      const checkedLinks = await Promise.all(list.map(linkVerdict));
      const gone = list.filter((_, i) => checkedLinks[i].dead);
      if (gone.length) {
        setProblem(
          `${gone.map((g) => `“${g.title.slice(0, 40)}…”`).join(", ")}: the link is dead (see ${gone.length === 1 ? "its row" : "their rows"}), so ${gone.length === 1 ? "it was" : "they were"} taken out of the choice. Pick another.`,
        );
        setChosen((c) => {
          const next = new Map(c);
          for (const g of gone) next.delete(g.key);
          return next;
        });
        return;
      }
      const pictures = await Promise.all(list.map(pictureFor));
      if (pictureNeeded(list.length)) {
        const missing = list.filter((_, i) => !pictures[i]);
        if (missing.length) {
          setProblem(
            `${missing.map((m) => `“${m.title.slice(0, 40)}…”`).join(", ")} ${missing.length === 1 ? "has" : "have"} no picture, and a carousel card needs one: leave ${missing.length === 1 ? "it" : "them"} out, or post ${missing.length === 1 ? "it" : "one"} on its own.`,
          );
          setChosen((c) => {
            const next = new Map(c);
            for (const m of missing) next.delete(m.key);
            return next;
          });
          return;
        }
        // Each picture as the deploy will make its card: one it can't is said now, with why, and not added.
        const checked = await Promise.all(list.map((it, i) => cardVerdict(it, pictures[i])));
        const bad = list.filter((_, i) => checked[i].level === "bad");
        if (bad.length) {
          setProblem(
            `${bad.map((b) => `“${b.title.slice(0, 40)}…”`).join(", ")} can't be ${bad.length === 1 ? "a carousel card" : "carousel cards"} (see ${bad.length === 1 ? "its row" : "their rows"}): ${bad.length === 1 ? "it was" : "they were"} taken out of the choice. Pick another story, or post ${bad.length === 1 ? "it" : "one"} on its own.`,
          );
          setChosen((c) => {
            const next = new Map(c);
            for (const b of bad) next.delete(b.key);
            return next;
          });
          return;
        }
      }
      onPick(list.map((item, i) => ({ card: cardOf(item, pictures[i]), item })));
    } finally {
      setBusy(false);
    }
  }

  function toggle(it: PickItem) {
    if (!multi) return void finish([it]);
    setProblem(null);
    const next = new Map(chosen);
    const known = verdicts.get(it.key);
    const link = links.get(it.key);
    if (next.has(it.key)) next.delete(it.key);
    else if (link && link !== "checking" && link.dead) return setProblem(`“${it.title.slice(0, 40)}…”: the link is dead (${link.problem}).`);
    else if (known && known !== "checking" && known.level === "bad" && pictureNeeded(next.size + 1))
      return setProblem(`“${it.title.slice(0, 40)}…” can't be a carousel card: ${known.note}.`);
    else if (next.size < (max ?? 1)) next.set(it.key, it);
    else return setProblem(`Up to ${max} here: the post takes ${inPost + (max ?? 1)} cards in all.`);
    setChosen(next);
    checkChosen(next);
    if (next.has(it.key))
      void linkVerdict(it).then((v) => {
        if (!v.dead) return;
        setChosen((c) => {
          const left = new Map(c);
          left.delete(it.key);
          return left;
        });
        setProblem(`“${it.title.slice(0, 40)}…” was taken out of the choice: the link is dead (${v.problem}).`);
      });
  }

  function choose(s: Suggestion) {
    setSuggesting(false);
    if (s.type === "source") {
      setSource({ id: s.id, name: s.name });
      setQuery("");
    } else if (s.type === "section") {
      setSection(s.id);
      setQuery("");
    } else toggle(s.item);
    inputRef.current?.focus();
  }

  async function loadMoreDays() {
    setLoadingDays(true);
    try {
      const dates = olderDates().slice(loadedDays, loadedDays + DAYS_AT_A_TIME);
      const days = await Promise.all(dates.map(loadOlderDay));
      setOlder((o) => [...o, ...days.flat()]);
      setLoadedDays((n) => n + dates.length);
    } finally {
      setLoadingDays(false);
    }
  }

  // As the site's search does, a search the board has few matches for carries on into the last days' files by itself.
  const fewOnBoard = show === "headline" && !!items && !!deferred.trim() && !loadedDays && shown.length < AUTO_OLDER_BELOW;
  useEffect(() => {
    if (!fewOnBoard || loadingDays) return;
    const t = setTimeout(() => void loadMoreDays(), 500);
    return () => clearTimeout(t);
    // Asked again when the search changes; loadMoreDays reads the state it needs as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fewOnBoard, loadingDays]);

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setSuggesting(true);
      setCursor((c) => (c + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setSuggesting(true);
      setCursor((c) => (c <= 0 ? suggestions.length - 1 : c - 1));
    } else if (e.key === "Enter") {
      if (suggesting && cursor >= 0 && suggestions[cursor]) {
        e.preventDefault();
        choose(suggestions[cursor]);
      } else if (shown.length === 1 && !multi) {
        e.preventDefault();
        void finish([shown[0]]);
      } else setSuggesting(false);
    } else if (e.key === "Escape" && suggesting) {
      e.preventDefault();
      e.stopPropagation();
      setSuggesting(false);
    }
  }

  const kindName = show === "video" ? "videos" : "headlines";
  const heading = title ?? (multi ? `Add ${kindName}` : `Choose a ${show === "video" ? "video" : "headline"}`);
  const otherKindLocked = multi && chosen.size > 0;
  const oldestLoaded = loadedDays ? olderDates()[loadedDays - 1] : null;
  const moreDays = loadedDays < olderDates().length;

  return (
    <dialog
      ref={dialogRef}
      className="picker"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-label={heading}
    >
      <div className="flex h-full max-h-full flex-col bg-surface sm:rounded-3xl sm:border sm:border-line sm:shadow-2xl">
        <header className="shrink-0 border-b border-line px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-5">
          <div className="flex items-center gap-3">
            <h2 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">{heading}</h2>
            {kind === "any" && (
              <div className="inline-flex rounded-full border border-line bg-surface-2 p-0.5" role="tablist" aria-label="Headlines or videos">
                {(["headline", "video"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={show === k}
                    disabled={otherKindLocked && show !== k}
                    title={otherKindLocked && show !== k ? "A post has headlines or videos, not both" : undefined}
                    onClick={() => setShow(k)}
                    className={`h-7 rounded-full px-3 text-[12px] font-semibold transition disabled:opacity-40 ${show === k ? "bg-accent text-accent-ink" : "text-muted"}`}
                  >
                    {k === "headline" ? "Headlines" : "Videos"}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted hover:text-foreground"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="relative mt-3">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSuggesting(true);
              }}
              onFocus={() => setSuggesting(true)}
              onBlur={() => setTimeout(() => setSuggesting(false), 150)}
              onKeyDown={onKey}
              type="text"
              inputMode="search"
              autoComplete="off"
              enterKeyHint="search"
              role="combobox"
              aria-expanded={suggesting && suggestions.length > 0}
              aria-controls="picker-suggestions"
              aria-autocomplete="list"
              placeholder={`Search ${kindName}, outlets, sections… (Bangla or English)`}
              className="h-11 w-full rounded-xl border border-line bg-surface-2 pl-10 pr-10 text-[15px] outline-none focus:border-accent"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear the search"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            )}
            {suggesting && suggestions.length > 0 && (
              <ul
                id="picker-suggestions"
                role="listbox"
                className="absolute inset-x-0 top-full z-20 mt-1 max-h-[50vh] overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-card"
              >
                <SearchProvider search={search}>
                  {suggestions.map((s, i) => {
                    const on = i === cursor;
                    const row = `flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${on ? "bg-accent-soft" : "hover:bg-surface-2"}`;
                    if (s.type === "source")
                      return (
                        <li key={`src-${s.id}`} role="option" aria-selected={on}>
                          <button type="button" className={row} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(s)}>
                            <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{show === "video" ? "Channel" : "Outlet"}</span>
                            <span lang="bn" className="min-w-0 flex-1 truncate">
                              <span className="font-semibold">{s.name}</span>
                              <span className="text-muted"> · {s.en}</span>
                            </span>
                            <span className="text-xs tabular-nums text-muted">{s.count}</span>
                          </button>
                        </li>
                      );
                    if (s.type === "section")
                      return (
                        <li key={`sec-${s.id}`} role="option" aria-selected={on}>
                          <button type="button" className={row} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(s)}>
                            <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Section</span>
                            <span lang="bn" className="min-w-0 flex-1 truncate">
                              <span className="font-semibold">{s.name}</span>
                              <span className="text-muted"> · {s.en}</span>
                            </span>
                          </button>
                        </li>
                      );
                    const it = s.item;
                    return (
                      <li key={`it-${it.kind}-${it.key}`} role="option" aria-selected={on}>
                        <button type="button" className={`${row} ${postedNote(it) ? "border-l-2 border-gold" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(s)}>
                          <span className="min-w-0 flex-1">
                            <span lang="bn" className="line-clamp-1 font-semibold">
                              <Highlight text={it.title} />
                            </span>
                            <span lang="bn" className="block truncate text-[11px] text-muted">
                              {it.source}
                              {it.time ? ` · ${relative(new Date(it.time).toISOString(), now)}` : ""}
                            </span>
                          </span>
                          {postedNote(it) && <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold">{postedNote(it)}</span>}
                          {multi && chosen.has(it.key) && <span className="text-xs font-semibold text-accent">Chosen</span>}
                        </button>
                      </li>
                    );
                  })}
                </SearchProvider>
              </ul>
            )}
          </div>

          <div className="no-scrollbar -mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
            {AGES.map(([id, name]) => (
              <button key={id} type="button" className={age === id ? chipOn : chipOff} onClick={() => setAge(id)} aria-pressed={age === id}>
                {name}
              </button>
            ))}
            {source && (
              <button type="button" className={chipOn} onClick={() => setSource(null)} aria-label={`Any outlet (now ${source.name})`}>
                <span lang="bn">{source.name}</span> ×
              </button>
            )}
          </div>
          {show === "headline" && (
            <div className="no-scrollbar -mx-4 mt-1.5 flex gap-1.5 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <button type="button" className={section === "" ? chipOn : chipOff} onClick={() => setSection("")} aria-pressed={section === ""}>
                All sections
              </button>
              {CATEGORIES.filter((c) => c.id !== "other").map((c) => (
                <button key={c.id} type="button" lang="bn" className={section === c.id ? chipOn : chipOff} onClick={() => setSection(section === c.id ? "" : c.id)} aria-pressed={section === c.id}>
                  {c.bn}
                </button>
              ))}
            </div>
          )}
        </header>

        {problem && (
          <p role="alert" className="mx-4 mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger sm:mx-5">
            {problem}
          </p>
        )}

        <ol ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain divide-y divide-line">
          {!items && <li className="px-4 py-6 text-sm text-muted">Loading the board…</li>}
          {items && shown.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted">
              Nothing matches{age !== "all" ? " in this time" : ""}
              {section || source ? " with these filters" : ""}
              {loadingDays ? ": looking in the older days…" : `.${show === "headline" && moreDays ? " Try the older days below." : ""}`}
            </li>
          )}
          <SearchProvider search={search}>
            {shown.slice(0, limit).map((it) => {
              const there = exclude.includes(it.key);
              const on = chosen.has(it.key);
              const sec = it.section ? SECTION.get(it.section as Category) : undefined;
              const went = postedNote(it);
              // Shown while the post would be a carousel; a bad one stays shown after it is taken out of the choice.
              const known = verdicts.get(it.key);
              const verdict = known && (known !== "checking" || on) && (carouselNow || (known !== "checking" && known.level === "bad")) ? known : undefined;
              const link = links.get(it.key);
              return (
                <li key={`${it.kind}-${it.key}`}>
                  <button
                    type="button"
                    disabled={there || busy}
                    onClick={() => toggle(it)}
                    aria-pressed={multi ? on : undefined}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-surface-2 disabled:opacity-60 sm:px-5 ${on ? "bg-accent-soft/60" : went ? "border-l-4 border-gold bg-gold/10 hover:bg-gold/15" : "hover:bg-surface-2"}`}
                    title={went ? `${went}: it went out already` : undefined}
                  >
                    {multi && (
                      <span
                        aria-hidden
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[13px] font-bold ${on ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface"}`}
                      >
                        {on ? "✓" : ""}
                      </span>
                    )}
                    {it.kind === "video" && it.picture && (
                      // YouTube's thumbnail, at YouTube's address.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.picture} alt="" loading="lazy" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span lang="bn" className="line-clamp-2 text-sm font-semibold leading-snug">
                        <Highlight text={it.title} />
                      </span>
                      {went && <span className="mt-1 inline-block rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold">{went}</span>}
                      {link === "checking" && on ? (
                        <span className="mt-1 block text-[11px] text-muted">Checking its link…</span>
                      ) : (
                        link &&
                        link !== "checking" &&
                        link.dead && <span className="mt-1 block text-[11px] font-semibold text-danger">⛔ Link is dead: {link.problem}</span>
                      )}
                      {verdict === "checking" ? (
                        <span className="mt-1 block text-[11px] text-muted">Checking its picture…</span>
                      ) : (
                        verdict &&
                        verdict.level !== "ok" && (
                          <span className={`mt-1 block text-[11px] font-semibold ${verdict.level === "bad" ? "text-danger" : "text-gold"}`}>
                            {verdict.level === "bad" ? "⛔ " : "⚠ "}
                            {verdict.note}
                          </span>
                        )
                      )}
                      <span className="mt-0.5 block truncate text-[11px] text-muted">
                        <span lang="bn">{it.source}</span>
                        {sec && sec.id !== "other" && (
                          <span lang="bn"> · {sec.bn}</span>
                        )}
                        {it.time ? ` · ${relative(new Date(it.time).toISOString(), now)}` : ""}
                      </span>
                    </span>
                    {there ? (
                      <span className="shrink-0 text-[12px] font-semibold text-muted">In post</span>
                    ) : (
                      !multi && <span className="h-8 shrink-0 rounded-full bg-accent px-3 text-[12px] font-semibold leading-8 text-accent-ink">{busy ? "…" : label}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </SearchProvider>
          {shown.length > limit && (
            <li ref={endRef} className="px-4 py-3 text-center text-xs text-muted">
              <button type="button" className="font-semibold text-accent" onClick={() => setLimit((l) => l + PAGE)}>
                Show more ({shown.length - limit} left)
              </button>
            </li>
          )}
          {show === "headline" && items && (
            <li className="px-4 py-3 text-center text-xs text-muted">
              {oldestLoaded && <span>Older days loaded back to {oldestLoaded}. </span>}
              {moreDays ? (
                <button type="button" className="font-semibold text-accent disabled:opacity-50" disabled={loadingDays} onClick={loadMoreDays}>
                  {loadingDays ? "Loading…" : loadedDays ? `Load ${DAYS_AT_A_TIME} more days` : "Search older headlines (the last 30 days)"}
                </button>
              ) : (
                <span>That is all the site keeps.</span>
              )}
            </li>
          )}
        </ol>

        <footer className="shrink-0 border-t border-line bg-surface px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:px-5">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-xs text-muted">
              {items ? `${shown.length.toLocaleString()} ${kindName}${chosen.size ? ` · ${chosen.size} chosen${max ? ` of ${max}` : ""}` : ""}` : ""}
              {items && posted.size > 0 && (
                <span className="text-gold"> · <span className="inline-block h-2 w-2 rounded-sm bg-gold align-middle" aria-hidden /> posted in the last 12 h</span>
              )}
            </span>
            {multi && chosen.size > 0 && (
              <button
                type="button"
                className="h-9 rounded-full border border-line px-3.5 text-[13px] font-semibold text-muted hover:text-foreground"
                onClick={() => setChosen(new Map())}
              >
                Clear
              </button>
            )}
            {multi && (
              <button
                type="button"
                disabled={busy || checking || chosen.size === 0}
                onClick={() => finish([...chosen.values()])}
                className="h-10 rounded-full bg-accent px-5 text-[13px] font-semibold text-accent-ink transition active:scale-95 disabled:opacity-50"
              >
                {busy || checking ? "Checking…" : `Add ${chosen.size || ""}`.trim()}
              </button>
            )}
          </div>
        </footer>
      </div>
    </dialog>
  );
}
