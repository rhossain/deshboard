-- Headlines and videos the admin picked on the public board ("Save for a social post" in the share sheet, shown
-- there while signed in to the admin), kept for the composer: the admin's Saved tab lists them, and the item picker
-- offers them under its "Saved" chip, on or off the board. One row per item (a headline's share key, a video's id);
-- saving it again only refreshes it. A row remembers the post it went into (used_at, post_id) and stays until removed.
CREATE TABLE saved_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('headline', 'video')),
  -- The headline's share key or the video's id: what the picker and the picking rules know it by.
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  -- The outlet or channel, in Bangla, as a post names it.
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  -- Its bartaboard.com link (/s/…), as a card's.
  link TEXT NOT NULL,
  picture TEXT,
  section TEXT,
  -- When it was published (ISO), when known.
  published_at TEXT,
  -- The NewsItem or Video as the board had it (JSON), so a headline's picture can be looked up later.
  item TEXT,
  note TEXT,
  saved_by TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  used_at TEXT,
  post_id TEXT
);
CREATE UNIQUE INDEX saved_items_one ON saved_items (kind, key);
CREATE INDEX saved_items_by_time ON saved_items (saved_at);
