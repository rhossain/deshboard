-- Video bulletins (docs/bulletin.md): one row a bulletin, whether made for a time of the day's table (kind slot) or
-- by hand for any time (kind manual). Kept apart from posts: a bulletin is a video with a script per story and its
-- own steps (voice, render, preview), and SQLite cannot widen posts' CHECKs without rebuilding the table.
CREATE TABLE bulletins (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'facebook',
  kind TEXT NOT NULL CHECK (kind IN ('slot', 'manual')),
  -- draft: being reviewed, scripts editable. approved: the scripts are signed off. rendering: voice and video are
  -- being made (edits are closed). ready: the video exists and was sent for preview. posting → posted. Or rejected
  -- (another draft may follow), skipped (nobody approved in time, or skipped by hand), failed (voice, render or
  -- Facebook; see error), dry (a dry run's bulletin, rendered and previewed, never posted).
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'rendering', 'ready', 'posting', 'posted', 'rejected', 'skipped', 'failed', 'dry')),
  -- The time of the table it is for (ISO), for a slot bulletin.
  slot TEXT,
  -- When it goes out (ISO).
  scheduled_at TEXT NOT NULL,
  -- The stories, in order (src/lib/bulletin.ts BulletinStory[]): headline, outlet, script, graphic.
  stories TEXT NOT NULL DEFAULT '[]',
  -- Runner-up stories the picker didn't choose, to swap in.
  alternatives TEXT NOT NULL DEFAULT '[]',
  -- The Reel's caption.
  caption TEXT NOT NULL DEFAULT '',
  -- Locked: edited or decided by a person; the picker no longer replaces it.
  locked INTEGER NOT NULL DEFAULT 0,
  edited INTEGER NOT NULL DEFAULT 0,
  -- The rendered video's length in seconds, once there is one.
  duration REAL,
  note TEXT,
  error TEXT,
  fb_post_id TEXT,
  permalink TEXT,
  telegram_message_id INTEGER,
  -- Who decided: panel:<email>, telegram, auto.
  decided_by TEXT,
  decided_at TEXT,
  posted_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- Bumped by every change; a change made against an older version is refused.
  version INTEGER NOT NULL DEFAULT 1
);
-- One live bulletin per time of the table. Rejected and failed ones don't count, so a new draft can take it.
CREATE UNIQUE INDEX bulletins_one_per_slot ON bulletins (platform, slot)
  WHERE slot IS NOT NULL AND status IN ('draft', 'approved', 'rendering', 'ready', 'posting', 'posted', 'skipped', 'dry');
CREATE INDEX bulletins_by_time ON bulletins (platform, scheduled_at);
CREATE INDEX bulletins_by_status ON bulletins (status, scheduled_at);
