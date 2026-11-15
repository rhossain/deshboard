/**
 * The bulletin's voice (docs/bulletin.md): ElevenLabs' text to speech with the time of every character, so captions
 * follow the voice word by word. Used by the scripts only. The key needs Text to Speech (access) and Voices (read).
 */

const API = "https://api.elevenlabs.io";
export const VOICE_NAME = "Subhajit";
export const VOICE_MODEL = "eleven_v4";

export interface VoiceOptions {
  apiKey: string;
  voiceId: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export interface Spoken {
  /** The clip, MP3. */
  audio: Uint8Array;
  /** When each word of the text (split on spaces) starts and ends, in seconds from the clip's start. */
  words: [number, number][];
  /** The clip's length in seconds, as far as the timings say. */
  duration: number;
}

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

async function fail(res: Response, what: string): Promise<never> {
  const body = (await res.json().catch(() => null)) as { detail?: { message?: string } | string } | null;
  const why = typeof body?.detail === "string" ? body.detail : body?.detail?.message;
  throw new Error(`ElevenLabs ${what} answered ${res.status}${why ? `: ${why}` : ""}`);
}

/** The id of the account's voice whose name starts with `name` (the voice must be among the account's own voices). */
export async function findVoice(apiKey: string, name = VOICE_NAME, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const res = await fetchImpl(`${API}/v1/voices`, { headers: { "xi-api-key": apiKey }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) await fail(res, "voices");
  const { voices = [] } = (await res.json()) as { voices?: { voice_id: string; name: string }[] };
  const wanted = name.toLowerCase();
  return voices.find((v) => v.name.toLowerCase().startsWith(wanted))?.voice_id ?? null;
}

/** Each word's span from the characters' times: a word is a run of characters between spaces. */
export function wordTimes(alignment: Alignment): [number, number][] {
  const words: [number, number][] = [];
  let start: number | null = null;
  let end = 0;
  alignment.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (start !== null) words.push([start, end]);
      start = null;
    } else {
      if (start === null) start = alignment.character_start_times_seconds[i];
      end = alignment.character_end_times_seconds[i];
    }
  });
  if (start !== null) words.push([start, end]);
  return words.map(([a, b]) => [Math.round(a * 1000) / 1000, Math.round(b * 1000) / 1000]);
}

/** Says `text`: the clip and each word's time. */
export async function speak(text: string, { apiKey, voiceId, model = VOICE_MODEL, fetchImpl = fetch }: VoiceOptions): Promise<Spoken> {
  const res = await fetchImpl(`${API}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: model }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) await fail(res, "text to speech");
  const body = (await res.json()) as { audio_base64?: string; alignment?: Alignment | null };
  if (!body.audio_base64) throw new Error("ElevenLabs sent no audio");
  const audio = Uint8Array.from(atob(body.audio_base64), (c) => c.charCodeAt(0));
  const words = body.alignment ? wordTimes(body.alignment) : [];
  const expected = text.trim().split(/\s+/).length;
  return {
    audio,
    // Timings that don't match the text word for word are no use to the captions: the renderer then estimates.
    words: words.length === expected ? words : [],
    duration: body.alignment?.character_end_times_seconds.at(-1) ?? 0,
  };
}
