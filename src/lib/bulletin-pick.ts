/**
 * Which stories a bulletin takes (docs/bulletin.md): the most covered fresh ones, by the Page's own cautions
 * (page-posts.ts: three outlets or more, nothing sensitive, no opinion), at most two from a section and no story
 * twice. The headline credited is the story's lead: a bulletin needs an article to read, not a picture.
 */
import type { Category } from "./categories";
import { isSensitive, type PostChoice, sameStory, storySection, storySubjects } from "./page-posts";
import type { Story } from "./stories";

/** A story is fresh while its latest report is this recent. */
export const BULLETIN_FRESH_MS = 3 * 3600_000;
const MIN_OUTLETS = 3;
const PER_SECTION = 2;
/** Runner-up stories kept beside the picks, to swap in. */
const ALTERNATIVES = 6;

export interface BulletinPickOptions {
  now: number;
  /** How many stories. */
  count: number;
  /** Stories (their ids) to leave out: those of the bulletins before, or blocked ones. */
  exclude?: Set<string>;
  freshMs?: number;
}

/** `stories` most covered first (page-posts.ts pageStories). The picks, in that order, and the runners-up. */
export function pickBulletin(stories: Story[], { now, count, exclude, freshMs = BULLETIN_FRESH_MS }: BulletinPickOptions): { picks: PostChoice[]; alternatives: PostChoice[] } {
  const picks: PostChoice[] = [];
  const alternatives: PostChoice[] = [];
  const perSection = new Map<Category, number>();
  const subjects: string[][][] = [];
  for (const story of stories) {
    if (picks.length >= count && alternatives.length >= ALTERNATIVES) break;
    if (exclude?.has(story.id)) continue;
    const outlets = new Set(story.items.map((it) => it.sourceId)).size;
    if (outlets < MIN_OUTLETS) continue;
    const latest = Date.parse(story.latest ?? "");
    if (Number.isNaN(latest) || now - latest > freshMs) continue;
    const section = storySection(story);
    if (section === "opinion") continue;
    if (story.items.some((it) => isSensitive(it.title))) continue;
    const words = storySubjects(story);
    if (subjects.some((w) => sameStory(words, w))) continue;
    const choice: PostChoice = { story, item: story.lead, outlets };
    if (picks.length < count && (perSection.get(section) ?? 0) < PER_SECTION) {
      picks.push(choice);
      perSection.set(section, (perSection.get(section) ?? 0) + 1);
      subjects.push(words);
    } else {
      alternatives.push(choice);
    }
  }
  return { picks, alternatives: alternatives.slice(0, ALTERNATIVES) };
}
