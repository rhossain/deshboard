-- Instagram (docs/instagram.md): its posts are rows of `posts` with platform 'instagram', in the same queue.

-- An Instagram post's address (its id goes in fb_post_id, the platform's id for the post, whichever platform).
ALTER TABLE posts ADD COLUMN permalink TEXT;

-- The pictures of Instagram posts, drawn by the deploy (src/lib/instagram-cards.ts) and served at
-- bartaboard.com/ig/<key>.jpg (functions/ig), where Instagram fetches them when the post is made. A picture is kept
-- base64-encoded in parts under D1's size limits; it is read back whole. Pictures older than a few days are deleted.
CREATE TABLE media (
  key TEXT NOT NULL,
  part INTEGER NOT NULL,
  parts INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'image/jpeg',
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (key, part)
);
CREATE INDEX media_by_time ON media (created_at);
