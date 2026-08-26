-- Student OS core schema
-- Hierarchy: classes -> units -> topics -> notes
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#5B8CFF',
  powerschool_period TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body_markdown TEXT DEFAULT '',
  mindmap_json TEXT,               -- ReactFlow nodes/edges serialized
  quizlet_url TEXT,
  drive_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_type TEXT,                  -- pdf | image | audio
  label TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  duration_seconds INTEGER,
  format TEXT DEFAULT 'wav',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL     -- e.g. AP_Econ, Unit2, Midterm
);

-- Generic tag linking so notes, attachments, and deadlines can all share tags
CREATE TABLE IF NOT EXISTS taggables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,    -- 'note' | 'attachment' | 'deadline'
  entity_id INTEGER NOT NULL,
  UNIQUE(tag_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'homework',  -- homework | exam | project
  due_at TEXT NOT NULL,
  source TEXT DEFAULT 'manual',  -- manual | powerschool
  external_uid TEXT,              -- ICS UID for de-duping on re-sync
  completed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS study_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deadline_id INTEGER NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT DEFAULT 'planned',   -- planned | done | skipped
  google_event_id TEXT,             -- set once pushed to Google Calendar
  created_at TEXT DEFAULT (datetime('now'))
);

-- Manual daily-planner entries (personal blocks, fixed class periods the
-- user wants visible on the timeline, errands, etc). Separate from
-- study_blocks (which are algorithmically generated) and deadlines
-- (which come from PowerSchool or are entered directly).
CREATE TABLE IF NOT EXISTS planner_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  notes TEXT,
  category TEXT DEFAULT 'personal', -- personal | class | errand | routine
  color TEXT DEFAULT '#8890A6',
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  recurrence TEXT DEFAULT 'none',   -- none | daily | weekdays
  created_at TEXT DEFAULT (datetime('now'))
);

-- Bell schedule: named periods, each tagged for A-day, B-day, or both, so
-- rotating-schedule schools are supported without extra config beyond a
-- single "which day is an A day" anchor date (stored in settings).
CREATE TABLE IF NOT EXISTS bell_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_type TEXT NOT NULL DEFAULT 'both', -- 'A' | 'B' | 'both'
  name TEXT NOT NULL,
  start_time TEXT NOT NULL, -- 'HH:MM' 24h
  end_time TEXT NOT NULL,
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0
);

-- User-created note templates ("OOH" starting points) - just a saved
-- body_html a person can pick from instead of starting blank.
CREATE TABLE IF NOT EXISTS note_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  body_html TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Reminders reviewed each morning. Recurring ones auto-uncheck at the
-- start of a new day (done_date no longer matches today) so a daily
-- checklist doesn't need to be manually reset.
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  recurring INTEGER DEFAULT 0,
  done INTEGER DEFAULT 0,
  done_date TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- settings keys used by the app:
--   powerschool_ics_url, gemini_api_key (encrypted at rest via safeStorage),
--   google_tokens (encrypted), pomodoro_work_min, pomodoro_break_min

CREATE INDEX IF NOT EXISTS idx_deadlines_due ON deadlines(due_at);
CREATE INDEX IF NOT EXISTS idx_study_blocks_start ON study_blocks(start_at);
CREATE INDEX IF NOT EXISTS idx_taggables_lookup ON taggables(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_planner_items_start ON planner_items(start_at);
CREATE INDEX IF NOT EXISTS idx_bell_periods_sort ON bell_periods(sort_order);
CREATE INDEX IF NOT EXISTS idx_reminders_sort ON reminders(sort_order);
CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
