CREATE TABLE module_task_release (
  task_id TEXT PRIMARY KEY NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  revision INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO module_task_release (task_id, active, revision)
SELECT 'scenarios', scenarios_active, revision FROM training_release WHERE id = 1;
--> statement-breakpoint
DELETE FROM followup_task
WHERE id = 1 AND lower(trim(draft_title)) = 'test'
  AND (active_title IS NULL OR lower(trim(active_title)) = 'test');
