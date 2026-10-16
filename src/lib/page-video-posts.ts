import { channelName } from "./bn-names";
import { CHANNELS } from "./channels";
import { localDigits } from "./i18n";
import {
  isSensitive,
  lastCredited,
  partOfDay,
  type PostingMode,
  postedSubject,
  type PostRecord,
  recentPosts,
  sameSubject,
  tooClose,
} from "./page-posts";
import { videoSharePath } from "./share";
import { keywords } from "./stories";
import type { Video } from "./types";
import { unmaskTitle } from "./video-stories";

/**
 * The Facebook Page's video posts (see page-posts.ts for the headlines, and when each goes out): TV channels' news
 * videos from the Videos view, linked to Bartaboard's page for each, which plays it. Never uploaded: the footage is
 * the channels'.
 *
 * A video post is a story two or more channels have covered lately; it credits the channel credited least lately. A
 * roundup is a carousel of the top five video stories since the last roundup, each from a different channel.
 */

/** Channels needed for a video post. A roundup can also carry a much-watched video one channel has alone. */
const MIN_CHANNELS = 2;
/** A video story is posted while its newest video is at most this old (TV puts reports up later than websites). */
const FRESH_MS = 3 * 3600_000;
/** Videos older than this aren't counted at all. */
const MAX_AGE_MS = 12 * 3600_000;
/** The video linked to is one of the story's from this long before (an old one would show yesterday's report). */
const LINKED_WITHIN_MS = 6 * 3600_000;
/** A channel's take counts half as much after this long. */
const HALF_LIFE_MS = 6 * 3600_000;
/** A roundup's cards, at most... */
export const ROUNDUP_CARDS = 5;
/** ...and at least: fewer, and a video post goes out instead. */
const ROUNDUP_MIN_CARDS = 3;
/** A roundup looks back to the one before, or this far at most. */
const ROUNDUP_WINDOW_MS = 8 * 3600_000;
/** A video only one channel has goes in a roundup only with this many views an hour. */
const SINGLE_CHANNEL_VIEWS_PER_HOUR = 2000;

/** Videos about one story, from the Videos view's grouping (Video.story); a video in none is a story alone. */
export interface VideoStory {
  /** The story's id (its newest video's). */
  id: string;
  videos: Video[];
  /** Distinct channels. */
  channels: number;
  /** Its newest video's time (ms). */
  latest: number;
  /** How much it is covered lately, and watched: what stories are ranked by. */
  heat: number;
}

const hours = (ms: number) => ms / 3600_000;
const views = (v: Video, now: number) => (v.views ?? 0) / Math.max(hours(now - Date.parse(v.publishedAt)), 0.5);

/** The video stories of the last MAX_AGE_MS, most covered and watched first. */
export function videoStories(videos: Video[], now: number): VideoStory[] {
  const groups = new Map<string, Video[]>();
  for (const v of videos) {
    const t = Date.parse(v.publishedAt);
    if (Number.isNaN(t) || now - t > MAX_AGE_MS) continue;
    const id = v.story ?? v.id;
    const list = groups.get(id);
    if (list) list.push(v);
    else groups.set(id, [v]);
  }
  const stories: VideoStory[] = [];
  for (const [id, list] of groups) {
    // Each channel counts once, by its newest take; a story much watched now rises a little.
    const newest = new Map<string, number>();
    for (const v of list) newest.set(v.channel, Math.max(newest.get(v.channel) ?? 0, Date.parse(v.publishedAt)));
    const coverage = [...newest.values()].reduce((sum, t) => sum + 0.5 ** (Math.max(now - t, 0) / HALF_LIFE_MS), 0);
    const watched = Math.max(...list.map((v) => views(v, now)));
    stories.push({
      id,
      videos: [...list].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
      channels: newest.size,
      latest: Math.max(...newest.values()),
      heat: coverage * (1 + 0.15 * Math.log10(1 + watched)),
    });
  }
  return stories.sort((a, b) => b.heat - a.heat);
}

/** What a video post (or a roundup card) links to: the story, and its video credited. */
export interface VideoChoice {
  story: VideoStory;
  video: Video;
}

export interface VideoPickOptions {
  now: number;
  /** When the post goes out. */
  at: number;
  history: PostRecord[];
  /** Videos not to link to (they failed the checks before posting: gone, not playable, no thumbnail). */
  skip?: (video: Video) => boolean;
}

/** A story's words, as headlines' are taken (keywords()), so a video and a headline on one subject meet. */
const subject = (story: VideoStory) => keywords(unmaskTitle(story.videos[0].title));

/** Whether a story can be posted at all: nothing sensitive in any of its titles, and not posted lately. */
function postable(story: VideoStory, recent: PostRecord[], postedIds: Set<string>): boolean {
  if (story.videos.some((v) => isSensitive(unmaskTitle(v.title)))) return false;
  if (story.videos.some((v) => postedIds.has(v.id))) return false;
  return !postedSubject(recent, subject(story));
}

/**
 * The video of the story to link to: a recent one, from the channel credited least lately (`used` channels never),
 * the most watched among equals.
 */
function creditedVideo(
  story: VideoStory,
  last: Map<string, number>,
  now: number,
  used = new Set<string>(),
  skip?: (video: Video) => boolean,
): Video | null {
  let best: Video | null = null;
  for (const v of story.videos) {
    if (used.has(v.channel) || now - Date.parse(v.publishedAt) > LINKED_WITHIN_MS || skip?.(v)) continue;
    const a = last.get(v.channel) ?? 0;
    const b = best ? (last.get(best.channel) ?? 0) : Infinity;
    if (!best || a < b || (a === b && (v.views ?? 0) > (best.views ?? 0))) best = v;
  }
  return best;
}

/** The next video post: the hottest fresh story two or more channels have, not posted lately; null if none. */
export function pickVideo(stories: VideoStory[], { now, at, history, skip }: VideoPickOptions): VideoChoice | null {
  if (tooClose(history, at)) return null;
  const recent = recentPosts(history, at);
  const postedIds = new Set(recent.flatMap((p) => p.keys));
  const last = lastCredited(history, ["video", "roundup"]);
  for (const story of stories) {
    if (story.channels < MIN_CHANNELS || now - story.latest > FRESH_MS) continue;
    if (!postable(story, recent, postedIds)) continue;
    const video = creditedVideo(story, last, now, undefined, skip);
    if (video) return { story, video };
  }
  return null;
}

/**
 * A roundup's cards: the hottest stories since the last roundup (ROUNDUP_WINDOW_MS at most), each from a different
 * channel and about a different thing; much-watched single-channel videos fill in when there are too few. Empty when
 * fewer than ROUNDUP_MIN_CARDS: a video post goes out instead.
 */
export function pickRoundup(stories: VideoStory[], { now, at, history, skip }: VideoPickOptions): VideoChoice[] {
  if (tooClose(history, at)) return [];
  const recent = recentPosts(history, at);
  const postedIds = new Set(recent.flatMap((p) => p.keys));
  const last = lastCredited(history, ["video", "roundup"]);
  const previous = history.filter((p) => p.content === "roundup").map((p) => Date.parse(p.at));
  const since = Math.max(at - ROUNDUP_WINDOW_MS, ...previous.filter((t) => t < at));

  const cards: VideoChoice[] = [];
  const used = new Set<string>();
  const subjects: string[][] = [];
  const fits = (story: VideoStory, single: boolean) =>
    story.latest > since &&
    (single
      ? story.channels === 1 && Math.max(...story.videos.map((v) => views(v, now))) >= SINGLE_CHANNEL_VIEWS_PER_HOUR
      : story.channels >= MIN_CHANNELS);
  for (const single of [false, true]) {
    for (const story of stories) {
      if (cards.length >= ROUNDUP_CARDS) break;
      if (!fits(story, single) || cards.some((c) => c.story === story) || !postable(story, recent, postedIds)) continue;
      const words = subject(story);
      if (subjects.some((w) => sameSubject(words, w))) continue;
      const video = creditedVideo(story, last, now, used, skip);
      if (!video) continue;
      cards.push({ story, video });
      used.add(video.channel);
      subjects.push(words);
    }
  }
  return cards.length >= ROUNDUP_MIN_CARDS ? cards : [];
}

const CHANNEL = new Map(CHANNELS.map((c) => [c.id, c]));

/** A channel's name in Bangla. */
export const channelBn = (id: string) => channelName(id, CHANNEL.get(id)?.name ?? id, "bn");

/** The video's Bartaboard link (/s/youtu.be/…): YouTube's thumbnail in the preview, the video played on Bartaboard. */
export const videoLink = (site: string, video: Video) => `${site}${videoSharePath(video.id)}`;

/** YouTube's thumbnail every video has (480×360). */
export const videoThumbnail = (video: Video) => `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;

/** A video post's text: the title, and which channels report it. */
export function videoMessage({ story, video }: VideoChoice): string {
  const others = story.channels - 1;
  const more = others > 0 ? ` · আরও ${localDigits(String(others), "bn")}টি চ্যানেলেও এই খবর` : "";
  return `${unmaskTitle(video.title)}\n\n${channelBn(video.channel)}${more}`;
}

/** A roundup's heading, by the Dhaka time it goes out: "রাতের শীর্ষ ৫ ভিডিও খবর". */
export function roundupHeading(at: number, cards: number): string {
  return `${partOfDay(at)} শীর্ষ ${localDigits(String(cards), "bn")} ভিডিও খবর`;
}

/** A roundup's text: its heading, then each card's title and channel, numbered as the carousel has them. */
export function roundupMessage(cards: VideoChoice[], at: number): string {
  const lines = cards.map(
    ({ video }, i) => `${localDigits(String(i + 1), "bn")}. ${unmaskTitle(video.title)} — ${channelBn(video.channel)}`,
  );
  return `${roundupHeading(at, cards.length)}\n\n${lines.join("\n")}`;
}

type RecordFields = Pick<PostRecord, "kind" | "at" | "link" | "mode"> & Partial<Pick<PostRecord, "slot" | "id">>;

/** The record of a video post. */
export function videoRecord({ story, video }: VideoChoice, fields: RecordFields): PostRecord {
  return {
    ...fields,
    content: "video",
    title: unmaskTitle(video.title),
    sourceId: video.channel,
    category: "other",
    keys: story.videos.map((v) => v.id),
    words: subject(story),
  };
}

/** The record of a roundup. */
export function roundupRecord(cards: VideoChoice[], fields: RecordFields & { mode: PostingMode }): PostRecord {
  return {
    ...fields,
    content: "roundup",
    title: roundupHeading(Date.parse(fields.at), cards.length),
    sourceId: cards[0].video.channel,
    alsoCredited: cards.slice(1).map((c) => c.video.channel),
    category: "other",
    keys: cards.flatMap((c) => c.story.videos.map((v) => v.id)),
    words: [],
    subjects: cards.map((c) => subject(c.story)),
  };
}
