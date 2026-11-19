CREATE TABLE training_release (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  scenarios_active INTEGER NOT NULL CHECK (scenarios_active IN (0, 1)),
  revision INTEGER NOT NULL
);
--> statement-breakpoint
ALTER TABLE followup_task RENAME TO followup_task_previous;
--> statement-breakpoint
CREATE TABLE followup_task (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_title TEXT NOT NULL,
  draft_body TEXT NOT NULL,
  draft_revision INTEGER NOT NULL,
  active_title TEXT,
  active_body TEXT,
  active_revision INTEGER
);
--> statement-breakpoint
INSERT INTO followup_task (
  id, draft_title, draft_body, draft_revision, active_title, active_body, active_revision
)
SELECT id, draft_title, draft_body, draft_revision, active_title, active_body, active_revision
FROM followup_task_previous;
--> statement-breakpoint
DROP TABLE followup_task_previous;
