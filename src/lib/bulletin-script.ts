/**
 * A bulletin story's script (docs/bulletin.md): the article is read, and an AI model (Claude, through the Claude API)
 * writes what the voice says, the short line for the headline list and the graphic's text, from the article alone.
 * A person approves every script before it is voiced. Used by the scripts only (needs the network and cheerio).
 *
 * Nothing the model writes is trusted as it comes: the reply must be the JSON asked for, lengths are capped, and every
 * figure in the script and the graphic must be in the article or its headline, or the story keeps its headline draft
 * and says why (`warnings`).
 */
import { load } from "cheerio";
import { type BulletinStory, type BulletinVisual, MAX_SCRIPT_CHARS, visualOf } from "./bulletin";

export { visualOf };
import { USER_AGENT } from "./fetchers/http";

export const SCRIPT_MODEL = "claude-sonnet-5-5";
const API = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2026-10-21";
/** As much of an article as the model is given: the facts of a news report are in its first paragraphs. */
const ARTICLE_CHARS = 6000;
const MIN_ARTICLE_CHARS = 200;

export interface ScriptOptions {
  apiKey: string;
  model?: string;
  /** Needed with a key that isn't tied to one workspace. */
  workspaceId?: string;
  fetchImpl?: typeof fetch;
}

export interface ScriptResult {
  story: BulletinStory;
  /** Whether the model's script was taken; false: the story is as it was. */
  written: boolean;
  /** Why not, or what a person should look at. */
  warnings: string[];
}

/** The article's own text from its page: the paragraphs of its <article> (or of the page), without menus and scripts. */
export function articleText(html: string): string {
  const $ = load(html);
  // Pages drawn by a script often still carry the article for search engines (schema.org's articleBody).
  let structured = "";
  $('script[type="application/ld+json"]').each((_, el) => {
    const body = articleBodyOf($(el).text());
    if (body.length > structured.length) structured = body;
  });
  $("script, style, noscript, nav, header, footer, aside, form, figure, iframe").remove();
  const paragraphs = (root: ReturnType<typeof $>) =>
    root
      .find("p")
      .map((_, p) => $(p).text().replace(/\s+/g, " ").trim())
      .get()
      .filter((t) => t.length > 30);
  let best: string[] = [];
  $("article, [itemprop='articleBody'], main").each((_, el) => {
    const ps = paragraphs($(el));
    if (ps.join(" ").length > best.join(" ").length) best = ps;
  });
  if (best.join(" ").length < MIN_ARTICLE_CHARS) best = paragraphs($("body"));
  const text = best.join("\n");
  return (text.length >= MIN_ARTICLE_CHARS || text.length >= structured.length ? text : structured).slice(0, ARTICLE_CHARS);
}

/** The longest articleBody in a page's structured data (JSON-LD), as plain text; "" when it has none. */
function articleBodyOf(json: string): string {
  let best = "";
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (key === "articleBody" && typeof value === "string") {
          const text = load(`<div>${value}</div>`).text().replace(/\s+/g, " ").trim();
          if (text.length > best.length) best = text;
        } else walk(value);
      }
    }
  };
  try {
    walk(JSON.parse(json));
  } catch {
    // Not JSON: nothing to read.
  }
  return best;
}

const SYSTEM = `You write short Bangla scripts for a news bulletin video, read aloud by a voice and shown as captions.

Rules:
- Use only facts stated in the article given. Add nothing from your own knowledge: no background, no guesses, no opinion.
- Write in standard Bangladeshi Bangla, in plain spoken news style.
- "script": two short sentences, at most 30 words in all. The first sentence carries the main fact. Write figures exactly as the article gives them.
- "short": the story in at most 8 words, for a list of headlines.
- "visual": one graphic, the type that fits the article best:
  {"type":"number","label":"what the figure is, 2-4 words","value":1146,"unit":"e.g. কোটি ডলার","chips":["up to 2 short facts"]} when one figure is the story. "value" is a plain number in Latin digits.
  {"type":"quote","text":"a short quotation from the article, at most 12 words","by":"who said it"} when a statement is the story.
  {"type":"versus","title":"match and place","a":{"name":"...","code":"BAN"},"b":{"name":"...","code":"SA"},"facts":[{"k":"label","v":"value"}]} for a match between two sides; at most 3 facts; codes are 2-3 Latin letters.
  {"type":"points","title":"2-3 words","items":["2 or 3 facts, at most 5 words each"]} otherwise.
- Never name a person as guilty of anything the article only alleges; keep "অভিযোগ" where the article has it.

Reply with one JSON object and nothing else: {"script": "...", "short": "...", "visual": {...}}`;

const userMessage = (story: BulletinStory, article: string) =>
  `Headline: ${story.headline}\nOutlet: ${story.source}\n\nArticle:\n${article}`;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The reply as { script, short, visual }, or null when it isn't the JSON asked for. */
export function parseDraft(reply: string): { script: string; short: string; visual: BulletinVisual } | null {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  if (from < 0 || to <= from) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(reply.slice(from, to + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const script = str(raw.script, MAX_SCRIPT_CHARS);
  const short = str(raw.short, 80);
  const visual = visualOf(raw.visual);
  return script && short && visual ? { script, short, visual } : null;
}

const latin = (text: string) => text.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));
/** The figures in a text, as plain digit runs ("১,১৪৬" → "1146"). */
export function figures(text: string): string[] {
  return (latin(text).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "").replace(/\.0+$/, "")).filter((n) => n.length > 0);
}

/** Small numbers as Bangla writes them out. নয় is left out on its own: it is far more often "not" than nine. */
const NUMBER_WORDS: Record<string, number> = { এক: 1, দুই: 2, দু: 2, তিন: 3, চার: 4, পাঁচ: 5, ছয়: 6, সাত: 7, আট: 8, নয়: 9, দশ: 10 };
const COUNTED = /(?<![\u0980-\u09FF])(এক|দুই|দু|তিন|চার|পাঁচ|ছয়|সাত|আট|নয়|দশ)(টি|টা|জন|জনের|জনকে)?(?![\u0980-\u09FF])/g;

/** The numbers a text writes as words ("দুটি রিং" → "2"), so a script that says "২টি" is not taken for an invention. */
export function spelled(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(COUNTED)) if (m[1] !== "নয়" || m[2]) found.add(String(NUMBER_WORDS[m[1]]));
  return [...found];
}

const SCALES: Record<string, number> = { হাজার: 1e3, লাখ: 1e5, লক্ষ: 1e5 };
const SCALED = /(\d+(?:\.\d+)?)\s*(হাজার|লাখ|লক্ষ)(?:\s+(\d+)(?![\d.]|\s*(?:হাজার|লাখ|লক্ষ)))?/g;

/**
 * Figures written with a scale word, as the number they mean: "১ হাজার ১৪৬" → "1146", "৫০ হাজার" → "50000". `rest` is
 * the text without them. (কোটি is left as the unit it usually is: "১,১৪৬ কোটি ডলার".)
 */
export function scaled(text: string): { values: string[]; rest: string } {
  const plain = latin(text).replace(/(\d),(?=\d)/g, "$1");
  const values: string[] = [];
  const rest = plain.replace(SCALED, (_, n: string, word: string, more?: string) => {
    values.push(String(Math.round(Number(n) * SCALES[word] + Number(more ?? 0))));
    return " ";
  });
  return { values, rest };
}

/**
 * The figures in the draft that neither the article nor the headline has: a made-up number is the worst mistake a
 * script can make. A figure counts as the article's whether it is written out ("১ হাজার ১৪৬", "দুটি") or in digits
 * ("১,১৪৬", "২টি").
 */
export function unsupportedFigures(draft: { script: string; visual: BulletinVisual }, article: string, headline: string): string[] {
  const source = `${article} ${headline}`;
  const known = new Set([...figures(source), ...scaled(source).values, ...spelled(source)]);
  const v = draft.visual;
  const shown =
    v.type === "number"
      ? [String(v.value), v.label, v.unit, ...(v.chips ?? [])]
      : v.type === "quote"
        ? [v.text, ...(v.chips ?? [])]
        : v.type === "versus"
          ? [v.title, ...(v.facts ?? []).map((f) => f.v)]
          : v.items;
  // Joined with a separator that is no figure, so two neighbours never read as one.
  const said = scaled([draft.script, ...shown].join(" | "));
  return [...new Set([...said.values, ...figures(said.rest)])].filter((n) => !known.has(n));
}

async function readArticle(link: string, fetchImpl: typeof fetch): Promise<string> {
  // As the board's own fetch asks for pages (fetchers/http.ts): some outlets answer nothing else.
  const res = await fetchImpl(link, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "bn-BD,bn;q=0.9,en;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`the article answered ${res.status}`);
  return articleText(await res.text());
}

/** A script past this many words is sent back once to be shortened: it was asked for in 30. */
export const SCRIPT_WORDS = 34;
const wordsIn = (text: string) => text.trim().split(/\s+/).length;

type Turn = { role: "user" | "assistant"; content: string };

async function ask(story: BulletinStory, article: string, { apiKey, model = SCRIPT_MODEL, workspaceId, fetchImpl = fetch }: ScriptOptions, more: Turn[] = []): Promise<string> {
  const res = await fetchImpl(API, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      "content-type": "application/json",
      ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}),
    },
    body: JSON.stringify({ model, max_tokens: 700, system: SYSTEM, messages: [{ role: "user", content: userMessage(story, article) }, ...more] }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[]; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(`the Claude API answered ${res.status}${body?.error?.message ? `: ${body.error.message}` : ""}`);
  return (body?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
}

/**
 * The story with a script written from its article: the credited outlet's, or, when that can't be read, the first of
 * the other outlets' reports that can (that outlet is then credited, and the warnings say so). Whatever else goes
 * wrong (the API refuses, the reply isn't usable, a figure isn't in the article), the story comes back as it was, with
 * the reason.
 */
export async function writeScript(story: BulletinStory, options: ScriptOptions): Promise<ScriptResult> {
  const keep = (why: string): ScriptResult => ({ story, written: false, warnings: [why] });
  const candidates = [{ link: story.link, source: story.source, sourceId: story.sourceId }, ...(story.reports ?? [])];
  const unread: string[] = [];
  let article = "";
  let from = candidates[0];
  for (const candidate of candidates) {
    try {
      const text = await readArticle(candidate.link, options.fetchImpl ?? fetch);
      if (text.length >= MIN_ARTICLE_CHARS) {
        article = text;
        from = candidate;
        break;
      }
      unread.push(`${candidate.source}: no article text on its page`);
    } catch (e) {
      unread.push(`${candidate.source}: ${(e as Error).message}`);
    }
  }
  if (!article) return keep(`No article could be read (${unread.join("; ")}).`);
  let reply: string;
  try {
    reply = await ask(story, article, options);
  } catch (e) {
    return keep(`No script: ${(e as Error).message}.`);
  }
  let draft = parseDraft(reply);
  if (!draft) return keep("The script writer's reply wasn't usable.");
  const notes: string[] = [];
  if (wordsIn(draft.script) > SCRIPT_WORDS) {
    // Too long for a bulletin item: asked once to cut it. A shorter one that holds up replaces it; otherwise the long one stays.
    try {
      const again = parseDraft(
        await ask(story, article, options, [
          { role: "assistant", content: reply },
          { role: "user", content: `The script is ${wordsIn(draft.script)} words. Cut it to at most 28 words in two short sentences: keep the main fact and at most two figures. Reply with the same JSON object.` },
        ]),
      );
      if (again && wordsIn(again.script) < wordsIn(draft.script) && !unsupportedFigures(again, article, story.headline).length) draft = again;
    } catch {
      // The first draft stands.
    }
    if (wordsIn(draft.script) > SCRIPT_WORDS) notes.push(`The script is long (${wordsIn(draft.script)} words).`);
  }
  const made = unsupportedFigures(draft, article, story.headline);
  if (made.length) return keep(`The script had figures the article doesn't (${made.join(", ")}), so it was left out.`);
  const moved = from !== candidates[0];
  return {
    story: {
      ...story,
      ...draft,
      ...(moved
        ? {
            link: from.link,
            source: from.source,
            sourceId: from.sourceId,
            reports: candidates.filter((c) => c !== from),
          }
        : {}),
    },
    written: true,
    warnings: [...(moved ? [`Written from ${from.source}'s report and credited to it (${unread.join("; ")}).`] : []), ...notes],
  };
}
