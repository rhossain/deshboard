-- The admin's database (D1 bartaboard-social, bound as SOCIAL_DB; docs/admin.md). Applied with the ops workflow's
-- d1-migrate task (wrangler d1 migrations apply --remote). Times are ISO strings in UTC; JSON columns are text.

-- Every post for the Page: drafts waiting for review, what was approved, posted, rejected or skipped, and the history
-- the picking rules read (src/lib/page-posts.ts, PostRecord, kept whole in `record`).
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'facebook',
  -- slot: at a set time; breaking: between them; manual: added in the admin.
  kind TEXT NOT NULL CHECK (kind IN ('slot', 'breaking', 'manual')),
  -- custom: a manual post's own text, picture and link.
  content TEXT NOT NULL CHECK (content IN ('headlines', 'news', 'video', 'roundup', 'custom')),
  -- draft → approved → posting → posted; or rejected (another draft may follow), skipped (the slot stays empty),
  -- failed (Facebook refused; may be tried again), dry (a dry run's pick, never posted).
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'rejected', 'posting', 'posted', 'failed', 'skipped', 'dry')),
  -- What happens to a draft nobody touched by its time: manual (left out), auto_unless_rejected or auto (posted).
  policy TEXT NOT NULL DEFAULT 'auto_unless_rejected' CHECK (policy IN ('manual', 'auto_unless_rejected', 'auto')),
  -- The slot it is for (ISO), for a slot post.
  slot TEXT,
  -- When it goes out (ISO).
  scheduled_at TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  -- What is sent to Facebook's /feed (message, link, child_attachments…), as composed or as edited.
  params TEXT NOT NULL DEFAULT '{}',
  -- The cards as the admin shows them: [{ link, title, source, picture, section }].
  cards TEXT NOT NULL DEFAULT '[]',
  -- Runner-up cards the picker didn't choose, to swap in.
  alternatives TEXT NOT NULL DEFAULT '[]',
  -- The PostRecord for the picking rules (repeats, caps, outlet rotation).
  record TEXT,
  -- Locked: edited or decided by a person; the picker no longer replaces it.
  locked INTEGER NOT NULL DEFAULT 0,
  edited INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  error TEXT,
  fb_post_id TEXT,
  telegram_message_id INTEGER,
  -- Who decided: panel:<email>, telegram, auto, import.
  decided_by TEXT,
  decided_at TEXT,
  posted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- Bumped by every change; a change made against an older version is refused (two editors, or an editor and a run).
  version INTEGER NOT NULL DEFAULT 1
);
-- One live post per slot. Rejected and failed ones don't count, so a new draft can take the slot.
CREATE UNIQUE INDEX posts_one_per_slot ON posts (platform, slot)
  WHERE slot IS NOT NULL AND status IN ('draft', 'approved', 'posting', 'posted', 'skipped');
CREATE UNIQUE INDEX posts_fb_post_id ON posts (fb_post_id) WHERE fb_post_id IS NOT NULL;
CREATE INDEX posts_by_time ON posts (platform, scheduled_at);
CREATE INDEX posts_by_status ON posts (status, scheduled_at);

-- What the picker must leave out for a while: a rejected story, an outlet, a section, a channel, a word.
CREATE TABLE blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('story', 'outlet', 'section', 'channel', 'word')),
  -- story: JSON { keys, words } (PostRecord's); otherwise the id or the word.
  value TEXT NOT NULL,
  -- Until when (ISO); NULL for good.
  until TEXT,
  reason TEXT,
  post_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX blocks_by_type ON blocks (type, until);

-- The admin's settings (src/lib/social-settings.ts has the defaults): one JSON value a key.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);

-- Everything a person or a run changed, newest last.
CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  post_id TEXT,
  detail TEXT
);
CREATE INDEX audit_by_time ON audit (at);
CREATE INDEX audit_by_post ON audit (post_id);

-- How each post did on Facebook, the latest reading (Page Insights).
CREATE TABLE insights (
  post_id TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL,
  reach INTEGER,
  impressions INTEGER,
  reactions INTEGER,
  comments INTEGER,
  shares INTEGER,
  clicks INTEGER,
  raw TEXT
);

-- Each run of the propose/publish steps, for the admin's health page.
CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  step TEXT NOT NULL,
  ok INTEGER NOT NULL,
  summary TEXT
);
CREATE INDEX runs_by_time ON runs (at);
