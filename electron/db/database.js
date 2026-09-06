const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { app } = require('electron');

let db;

function getDbPath() {
  const userDataPath = app.getPath('userData');
  if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
  return path.join(userDataPath, 'student-os.sqlite');
}

function initDatabase() {
  if (db) return db;
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  runMigrations(db);
  // No default schedule, routine, or school-year calendar ships with the
  // base app - every student's schedule is different. Set yours up in
  // Settings (Bell schedule, Daily routine) once you're in; both support
  // full add/edit/delete, so there's nothing to "unlearn" from a preset.

  return db;
}

// schema.sql only ever CREATEs; it can't add a column to a table that
// already exists on someone's machine from a previous version. Anything
// that needs ALTER TABLE goes here instead, guarded so it's safe to run
// on every launch.
function runMigrations(db) {
  const noteColumns = db.prepare("PRAGMA table_info(notes)").all().map((c) => c.name);
  if (!noteColumns.includes('body_html')) {
    db.exec("ALTER TABLE notes ADD COLUMN body_html TEXT DEFAULT ''");
  }

  const periodColumns = db.prepare("PRAGMA table_info(bell_periods)").all().map((c) => c.name);
  if (!periodColumns.includes('room')) {
    db.exec("ALTER TABLE bell_periods ADD COLUMN room TEXT DEFAULT ''");
  }
  if (!periodColumns.includes('teacher')) {
    db.exec("ALTER TABLE bell_periods ADD COLUMN teacher TEXT DEFAULT ''");
  }
  if (!periodColumns.includes('weekdays')) {
    // comma-separated weekday numbers (0=Sun..6=Sat) this period applies to;
    // empty string means "every school day" (still gated by day_type too).
    db.exec("ALTER TABLE bell_periods ADD COLUMN weekdays TEXT DEFAULT ''");
  }
  if (!periodColumns.includes('kind')) {
    // 'class' | 'break' | 'lunch' | 'flex' | 'advisory' - drives styling and
    // which rows get the FLEX/Advisory prep card.
    db.exec("ALTER TABLE bell_periods ADD COLUMN kind TEXT DEFAULT 'class'");
  }

  const flexTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='flex_prep'").get();
  if (!flexTable) {
    db.exec(`
      CREATE TABLE flex_prep (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        notes TEXT DEFAULT '',
        tags TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  const deadlineColumns = db.prepare("PRAGMA table_info(deadlines)").all().map((c) => c.name);
  if (!deadlineColumns.includes('notified_12h')) {
    db.exec('ALTER TABLE deadlines ADD COLUMN notified_12h INTEGER DEFAULT 0');
  }

  // Several sync paths (PowerSchool ICS, Classroom, and now multi-source ICS)
  // upsert on `ON CONFLICT(external_uid) DO UPDATE`, which SQLite only
  // accepts if external_uid is actually backed by a unique index - it never
  // was, so any real re-sync would have thrown at the SQL level instead of
  // updating in place. De-dupe defensively (keep the lowest id) in case
  // anything slipped through before this existed, then add the index.
  const dedupeIndex = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_deadlines_external_uid'")
    .get();
  if (!dedupeIndex) {
    db.exec(`
      DELETE FROM deadlines
      WHERE external_uid IS NOT NULL
        AND id NOT IN (SELECT MIN(id) FROM deadlines WHERE external_uid IS NOT NULL GROUP BY external_uid);
      CREATE UNIQUE INDEX idx_deadlines_external_uid ON deadlines(external_uid) WHERE external_uid IS NOT NULL;
    `);
  }

  const canvasTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='canvas_items'")
    .get();
  if (!canvasTable) {
    db.exec(`
      CREATE TABLE canvas_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        type TEXT NOT NULL, -- 'sticky' | 'image' | 'equation' | 'graph'
        x REAL DEFAULT 40,
        y REAL DEFAULT 40,
        width REAL DEFAULT 220,
        height REAL DEFAULT 160,
        z_index INTEGER DEFAULT 1,
        color TEXT DEFAULT '#FDE68A',
        caption TEXT DEFAULT '',
        data TEXT DEFAULT '{}', -- type-specific JSON payload
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_canvas_items_note ON canvas_items(note_id);
    `);
  }

  // ---- Multi-account Google (Calendar + Classroom share one OAuth client
  // and one consent flow per account - a student typically connects both
  // their personal Google account and their school Workspace account). ----

  const googleAccountsTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='google_accounts'")
    .get();
  if (!googleAccountsTable) {
    db.exec(`
      CREATE TABLE google_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL DEFAULT 'Google account', -- e.g. 'Personal', 'School'
        email TEXT,
        tokens TEXT NOT NULL, -- OAuth tokens, encrypted via safeStorage before being written here
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // One-time migration: earlier single-account versions of this app stored
    // OAuth tokens under the generic 'google_tokens' settings key. If that's
    // present and no accounts exist yet, carry it forward as "Personal"
    // rather than silently disconnecting the user's calendar.
    const legacy = db.prepare("SELECT value FROM settings WHERE key = 'google_tokens'").get();
    if (legacy?.value) {
      db.prepare(`INSERT INTO google_accounts (label, email, tokens) VALUES ('Personal', NULL, ?)`).run(legacy.value);
    }
  }

  const googleAccountColumns = db.prepare('PRAGMA table_info(google_accounts)').all().map((c) => c.name);
  if (!googleAccountColumns.includes('scope')) {
    // 'full' (Calendar + Classroom, the default) | 'calendar_only' - some
    // school Workspace admins block the Classroom scopes for unverified
    // apps without blocking Calendar, so a narrower connect option exists
    // as a fallback. Existing accounts predate this column and were all
    // connected with the full scope set.
    db.exec("ALTER TABLE google_accounts ADD COLUMN scope TEXT DEFAULT 'full'");
  }

  const googleCalendarsTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='google_calendars'")
    .get();
  if (!googleCalendarsTable) {
    db.exec(`
      CREATE TABLE google_calendars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL REFERENCES google_accounts(id) ON DELETE CASCADE,
        calendar_id TEXT NOT NULL, -- Google's own calendarId (often an email address, or 'primary')
        summary TEXT,
        enabled INTEGER DEFAULT 0,
        color TEXT DEFAULT '#5B8CFF',
        is_default_push INTEGER DEFAULT 0, -- the "push new StudentOS items here by default" calendar
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(account_id, calendar_id)
      );
      CREATE INDEX idx_google_calendars_account ON google_calendars(account_id);
    `);
  }

  const classroomCoursesTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='classroom_courses'")
    .get();
  if (!classroomCoursesTable) {
    db.exec(`
      CREATE TABLE classroom_courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL REFERENCES google_accounts(id) ON DELETE CASCADE,
        course_id TEXT NOT NULL,
        name TEXT,
        enabled INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(account_id, course_id)
      );
      CREATE INDEX idx_classroom_courses_account ON classroom_courses(account_id);
    `);
  }

  const deadlineRemindersTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='deadline_reminders'")
    .get();
  if (!deadlineRemindersTable) {
    db.exec(`
      CREATE TABLE deadline_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deadline_id INTEGER NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
        offset_hours INTEGER NOT NULL, -- how long before due_at this should fire
        notified INTEGER DEFAULT 0,
        UNIQUE(deadline_id, offset_hours)
      );
      CREATE INDEX idx_deadline_reminders_deadline ON deadline_reminders(deadline_id);
    `);
  }

  // Purely local recurring personal schedule (wake/gym/study/wind-down
  // blocks) - separate from bell_periods (school classes) and from Google
  // Calendar. One variant per day of week since weekday blocks differ
  // slightly day to day (different FLEX PREP / INTEREST BLOCK activity).
  const routineBlocksTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='routine_blocks'")
    .get();
  if (!routineBlocksTable) {
    db.exec(`
      CREATE TABLE routine_blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day_type TEXT NOT NULL, -- 'monday' | 'tuesday' | ... | 'sunday'
        title TEXT NOT NULL,
        category TEXT DEFAULT 'flex', -- morning | afternoon | study | flex | interest | winddown | sleep - drives color
        start_time TEXT NOT NULL, -- 'HH:MM' 24h
        end_time TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_routine_blocks_day ON routine_blocks(day_type);
    `);
  }

  // ---- Multiple named ICS subscriptions (per-class calendars, school-wide
  // events, a rotating day-schedule feed, etc) - generalizes what used to be
  // a single "powerschool_ics_url" setting into a list, each with its own
  // color so it can show up on the unified Calendar as its own layer,
  // matching how connected Google calendars already work. ----
  const icsSourcesTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ics_sources'")
    .get();
  if (!icsSourcesTable) {
    db.exec(`
      CREATE TABLE ics_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        url TEXT NOT NULL,
        color TEXT DEFAULT '#5B8CFF',
        enabled INTEGER DEFAULT 1,
        last_synced_at TEXT,
        last_sync_status TEXT, -- 'ok' | 'error' | null (never synced)
        last_sync_error TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Carry forward anyone's existing single ICS URL as their first source,
    // rather than silently dropping it - it'll keep syncing exactly as
    // before, just presented as a one-item list they can now rename or add to.
    const legacyUrl = db.prepare("SELECT value FROM settings WHERE key = 'powerschool_ics_url'").get()?.value;
    if (legacyUrl) {
      db.prepare(`INSERT INTO ics_sources (label, url, color) VALUES ('My calendar', ?, '#5B8CFF')`).run(legacyUrl);
    }
  }

  const icsSourceColumns = db.prepare('PRAGMA table_info(ics_sources)').all().map((c) => c.name);
  if (!icsSourceColumns.includes('last_sync_status')) {
    db.exec("ALTER TABLE ics_sources ADD COLUMN last_sync_status TEXT");
  }
  if (!icsSourceColumns.includes('last_sync_error')) {
    db.exec('ALTER TABLE ics_sources ADD COLUMN last_sync_error TEXT');
  }

  const deadlineIcsColumns = db.prepare('PRAGMA table_info(deadlines)').all().map((c) => c.name);
  if (!deadlineIcsColumns.includes('ics_source_id')) {
    db.exec('ALTER TABLE deadlines ADD COLUMN ics_source_id INTEGER REFERENCES ics_sources(id) ON DELETE CASCADE');
  }
  if (!deadlineIcsColumns.includes('end_at')) {
    // Nullable - most deadlines are a single due instant, but full ICS
    // calendar events (school-wide events, day-schedule entries) have a
    // real end time worth keeping for the Calendar view.
    db.exec('ALTER TABLE deadlines ADD COLUMN end_at TEXT');
  }
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

module.exports = { initDatabase, getDb };

