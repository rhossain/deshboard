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
import { type BulletinStory, type BulletinVisual, MAX_SCRIPT_CHARS } from "./bulletin";

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
  return best.join("\n").slice(0, ARTICLE_CHARS);
}

const SYSTEM = `You write short Bangla scripts for a news bulletin video, read aloud by a voice and shown as captions.

Rules:
- Use only facts stated in the article given. Add nothing from your own knowledge: no background, no guesses, no opinion.
- Write in standard Bangladeshi Bangla, in plain spoken news style.
- "script": two sentences, at most 40 words in all. The first sentence carries the main fact. Write figures exactly as the article gives them.
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
const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);

/** The graphic as the renderer takes it, or null when the reply's isn't one. */
export function visualOf(v: unknown): BulletinVisual | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.type === "number") {
    const value = typeof o.value === "number" && Number.isFinite(o.value) ? o.value : str(o.value, 14);
    const label = str(o.label, 40);
    return value !== "" && label ? { type: "number", label, value, unit: str(o.unit, 24), chips: list(o.chips, 2, 26) } : null;
  }
  if (o.type === "quote") {
    const text = str(o.text, 110);
    const by = str(o.by, 40);
    return text && by ? { type: "quote", text, by, chips: list(o.chips, 2, 26) } : null;
  }
  if (o.type === "versus") {
    const side = (s: unknown) => {
      const x = (s ?? {}) as Record<string, unknown>;
      const name = str(x.name, 22);
      const code = str(x.code, 3).toUpperCase();
      return name && /^[A-Z]{2,3}$/.test(code) ? { name, code } : null;
    };
    const a = side(o.a);
    const b = side(o.b);
    const facts = Array.isArray(o.facts)
      ? o.facts
          .map((f) => ({ k: str((f as Record<string, unknown>)?.k, 14), v: str((f as Record<string, unknown>)?.v, 16) }))
          .filter((f) => f.k && f.v)
          .slice(0, 3)
      : [];
    return a && b ? { type: "versus", title: str(o.title, 44), a, b, facts } : null;
  }
  if (o.type === "points") {
    const items = list(o.items, 3, 44);
    return items.length >= 2 ? { type: "points", title: str(o.title, 28) || undefined, items } : null;
  }
  return null;
}

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
 * script can make. A figure counts as the article's whether it is written out ("১ হাজার ১৪৬") or in digits ("১,১৪৬").
 */
export function unsupportedFigures(draft: { script: string; visual: BulletinVisual }, article: string, headline: string): string[] {
  const source = `${article} ${headline}`;
  const known = new Set([...figures(source), ...scaled(source).values]);
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
  const res = await fetchImpl(link, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Bartaboard/1.0; +https://bartaboard.com)", Accept: "text/html" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`the article answered ${res.status}`);
  return articleText(await res.text());
}

async function ask(story: BulletinStory, article: string, { apiKey, model = SCRIPT_MODEL, workspaceId, fetchImpl = fetch }: ScriptOptions): Promise<string> {
  const res = await fetchImpl(API, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      "content-type": "application/json",
      ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}),
    },
    body: JSON.stringify({ model, max_tokens: 700, system: SYSTEM, messages: [{ role: "user", content: userMessage(story, article) }] }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[]; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(`the Claude API answered ${res.status}${body?.error?.message ? `: ${body.error.message}` : ""}`);
  return (body?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
}

/**
 * The story with a script written from its article. Whatever goes wrong (the article can't be read, the API refuses,
 * the reply isn't usable, a figure isn't in the article), the story comes back as it was, with the reason.
 */
export async function writeScript(story: BulletinStory, options: ScriptOptions): Promise<ScriptResult> {
  const keep = (why: string): ScriptResult => ({ story, written: false, warnings: [why] });
  let article: string;
  try {
    article = await readArticle(story.link, options.fetchImpl ?? fetch);
  } catch (e) {
    return keep(`Couldn't read the article: ${(e as Error).message}.`);
  }
  if (article.length < MIN_ARTICLE_CHARS) return keep("The article's text couldn't be found on its page.");
  let reply: string;
  try {
    reply = await ask(story, article, options);
  } catch (e) {
    return keep(`No script: ${(e as Error).message}.`);
  }
  const draft = parseDraft(reply);
  if (!draft) return keep("The script writer's reply wasn't usable.");
  const made = unsupportedFigures(draft, article, story.headline);
  if (made.length) return keep(`The script had figures the article doesn't (${made.join(", ")}), so it was left out.`);
  return { story: { ...story, ...draft }, written: true, warnings: [] };
}
