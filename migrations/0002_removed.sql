-- When a posted post was taken down from the Page from the admin (it stays in the history, so the picking rules still
-- know the story went out).
ALTER TABLE posts ADD COLUMN removed_at TEXT;
