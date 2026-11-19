CREATE TABLE followup_task (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  draft_title TEXT NOT NULL,
  draft_body TEXT NOT NULL,
  draft_revision INTEGER NOT NULL,
  active_title TEXT,
  active_body TEXT,
  active_revision INTEGER
);
