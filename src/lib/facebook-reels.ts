/**
 * A video on the Page (docs/bulletin.md): as a Reel when it is short enough for one, otherwise as a Page video.
 * Facebook's Reels Publishing API, with fetch only: start an upload session, send the file, then publish it now or
 * schedule it. The id that comes back is the video's, which is also what takes it down.
 *
 * A Reel is 3 to 90 seconds, 9:16; the token needs pages_show_list, pages_read_engagement and pages_manage_posts.
 */
import { graph, type GraphAccess, pageToken } from "./facebook-graph";

/** A Reel's longest, with a second to spare for how Facebook measures it. */
export const REEL_MAX_SECONDS = 89;
/** Facebook schedules nothing nearer than ten minutes: nearer than this, the video goes out at once. */
export const SCHEDULE_MIN_MS = 11 * 60_000;

export interface VideoPost {
  /** The post's text. */
  description: string;
  title?: string;
  /** When it goes out (ms); left out, or too near to schedule, it goes out now. */
  at?: number;
  /** The video's length, which decides between a Reel and a Page video. */
  seconds: number;
  /** Labelled as made with AI (the voice is). */
  aiMade?: boolean;
}

export interface Published {
  videoId: string;
  kind: "reel" | "video";
  /** Scheduled for `at`, not out yet. */
  scheduled: boolean;
}

const VERSION = "v23.0";

async function sendFile(url: string, token: string, video: Uint8Array): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, offset: "0", file_size: String(video.byteLength), "Content-Type": "application/octet-stream" },
    body: video.buffer.slice(video.byteOffset, video.byteOffset + video.byteLength) as ArrayBuffer,
    signal: AbortSignal.timeout(300_000),
  });
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string }; debug_info?: { message?: string } };
  if (!res.ok || !body.success) throw new Error(`Facebook didn't take the video file (${res.status}): ${body.error?.message ?? body.debug_info?.message ?? "no reason given"}`);
}

/** Puts the video on the Page, now or scheduled. */
export async function publishVideo(access: GraphAccess, video: Uint8Array, post: VideoPost, now = Date.now()): Promise<Published> {
  const token = await pageToken(access);
  const scheduled = post.at !== undefined && post.at - now >= SCHEDULE_MIN_MS;
  const when = scheduled ? String(Math.floor(post.at! / 1000)) : "";

  if (post.seconds <= REEL_MAX_SECONDS) {
    const start = await graph<{ video_id: string; upload_url: string }>(`/${access.pageId}/video_reels`, { upload_phase: "start" }, token);
    await sendFile(start.upload_url, token, video);
    await graph<{ success?: boolean }>(
      `/${access.pageId}/video_reels`,
      {
        upload_phase: "finish",
        video_id: start.video_id,
        video_state: scheduled ? "SCHEDULED" : "PUBLISHED",
        description: post.description,
        ...(post.title ? { title: post.title } : {}),
        ...(scheduled ? { scheduled_publish_time: when } : {}),
        ...(post.aiMade ? { is_ai_generated: "true" } : {}),
      },
      token,
    );
    return { videoId: start.video_id, kind: "reel", scheduled };
  }

  // Too long for a Reel: an ordinary Page video, which has no such limit.
  const form = new FormData();
  form.set("access_token", token);
  form.set("description", post.description);
  if (post.title) form.set("title", post.title);
  if (scheduled) {
    form.set("published", "false");
    form.set("scheduled_publish_time", when);
  }
  form.set("source", new Blob([video.buffer.slice(video.byteOffset, video.byteOffset + video.byteLength) as ArrayBuffer], { type: "video/mp4" }), "bulletin.mp4");
  const res = await fetch(`https://graph-video.facebook.com/${VERSION}/${access.pageId}/videos`, { method: "POST", body: form, signal: AbortSignal.timeout(300_000) });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string; code?: number } };
  if (!res.ok || !body.id) throw new Error(`Facebook ${res.status}${body.error?.code ? ` (code ${body.error.code})` : ""}: ${body.error?.message ?? "the video wasn't taken"}`);
  return { videoId: body.id, kind: "video", scheduled };
}

export interface VideoState {
  /** out: on the Page. waiting: scheduled or still being processed. failed: Facebook gave up on it. */
  state: "out" | "waiting" | "failed";
  detail?: string;
}

/** Where an uploaded video stands. */
export async function videoState(access: GraphAccess, videoId: string): Promise<VideoState> {
  const token = await pageToken(access);
  const { status, published } = await graph<{
    published?: boolean;
    status?: { video_status?: string; processing_phase?: { status?: string; error?: { message?: string } }; publishing_phase?: { status?: string; publish_status?: string; error?: { message?: string } } };
  }>(`/${videoId}`, { fields: "status,published" }, token, "GET");
  const publishing = status?.publishing_phase;
  const error = publishing?.error?.message ?? status?.processing_phase?.error?.message;
  if (status?.video_status === "error" || status?.video_status === "upload_failed" || status?.video_status === "expired" || publishing?.publish_status === "error" || publishing?.status === "error") {
    return { state: "failed", detail: error ?? status?.video_status ?? "Facebook reported an error" };
  }
  if (publishing?.publish_status === "published" || (published === true && status?.video_status === "ready")) return { state: "out" };
  return { state: "waiting", detail: publishing?.publish_status ?? status?.video_status };
}

/** The video's address on Facebook, when it will say. */
export async function videoLink(access: GraphAccess, videoId: string): Promise<string | null> {
  try {
    const { permalink_url } = await graph<{ permalink_url?: string }>(`/${videoId}`, { fields: "permalink_url" }, await pageToken(access), "GET");
    if (!permalink_url) return null;
    return permalink_url.startsWith("http") ? permalink_url : `https://www.facebook.com${permalink_url}`;
  } catch {
    return null;
  }
}

/** Takes the video off the Page, published or still scheduled. */
export async function deleteVideo(access: GraphAccess, videoId: string): Promise<void> {
  await graph<{ success?: boolean }>(`/${videoId}`, {}, await pageToken(access), "DELETE");
}
