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
  seedSampleClassScheduleIfNeeded(db);
  seedSampleDailyRoutineIfNeeded(db);

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
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

module.exports = { initDatabase, getDb };

// ---------- First-run sample data ----------
// A fresh install starts with a small, clearly-fictional example class
// schedule and daily routine so the Calendar view has something to show
// before a real user fills in their own via Settings -> Class schedule /
// Daily routine. Guarded by settings flags so each only ever runs once,
// and only inserts - a user is always free to delete every row of it.

const CLASS_COLORS = ['#5B8CFF', '#4FD1A5', '#F2B84B', '#E56B6B', '#8890A6', '#7C4DBE', '#2F5FD1', '#1F8A5F'];

const SAMPLE_PERIODS = [
  { n: 1, name: 'Algebra II', teacher: 'Ms. Rivera', room: '204', start: '08:00', end: '08:50' },
  { n: 2, name: 'English Literature', teacher: 'Mr. Chen', room: '118', start: '08:55', end: '09:45' },
  { n: 3, name: 'Chemistry', teacher: 'Dr. Patel', room: 'SCI-3', start: '09:50', end: '10:40' },
  { n: 4, name: 'World History', teacher: 'Mrs. Alvarez', room: '210', start: '10:45', end: '11:35' },
  { n: 5, name: 'Study Hall', teacher: '', room: '', start: '11:40', end: '12:20' },
  { n: 6, name: 'Spanish II', teacher: 'Sr. Mendoza', room: '112', start: '13:00', end: '13:50' },
  { n: 7, name: 'Physical Education', teacher: 'Coach Diaz', room: 'GYM', start: '13:55', end: '14:45' },
  { n: 8, name: 'Advisory', teacher: 'Ms. Rivera', room: '204', start: '14:50', end: '15:10', kind: 'advisory' }
];

function seedSampleClassScheduleIfNeeded(db) {
  const already = db.prepare("SELECT value FROM settings WHERE key = 'sample_schedule_seeded_v1'").get();
  if (already) return;

  const tx = db.transaction(() => {
    const insertPeriod = db.prepare(
      `INSERT INTO bell_periods (day_type, name, start_time, end_time, class_id, room, teacher, weekdays, kind, sort_order)
       VALUES ('both', ?, ?, ?, ?, ?, ?, '', ?, ?)`
    );

    SAMPLE_PERIODS.forEach((p, i) => {
      let cls = db.prepare('SELECT id FROM classes WHERE name = ?').get(p.name);
      if (!cls) {
        const color = CLASS_COLORS[i % CLASS_COLORS.length];
        const info = db
          .prepare('INSERT INTO classes (name, color, powerschool_period) VALUES (?, ?, ?)')
          .run(p.name, color, `Period ${p.n}`);
        cls = { id: info.lastInsertRowid };
      }
      insertPeriod.run(p.name, p.start, p.end, cls.id, p.room || '', p.teacher || '', p.kind || 'class', i);
    });

    db.prepare(`INSERT INTO settings (key, value) VALUES ('sample_schedule_seeded_v1', '1')`).run();
  });

  tx();
}

// A simple example personal routine - one weekday template plus a weekend
// template, editable per day of week in Settings -> Daily routine.
const SAMPLE_WEEKDAY_ROUTINE = [
  { title: 'Wake up, get ready', category: 'morning', start: '06:45', end: '07:15' },
  { title: 'Breakfast', category: 'morning', start: '07:15', end: '07:40' },
  { title: 'Commute to school', category: 'morning', start: '07:40', end: '08:00' },
  { title: 'Commute home', category: 'afternoon', start: '15:10', end: '15:30' },
  { title: 'Snack / decompress', category: 'afternoon', start: '15:30', end: '15:45' },
  { title: 'Study block — homework / projects', category: 'study', start: '15:45', end: '17:15' },
  { title: 'Free time / extracurriculars', category: 'flex', start: '17:15', end: '18:30' },
  { title: 'Dinner', category: 'afternoon', start: '18:30', end: '19:00' },
  { title: 'Reading / personal project', category: 'interest', start: '19:00', end: '20:00' },
  { title: 'Wind down', category: 'winddown', start: '20:00', end: '21:00' },
  { title: 'Sleep', category: 'sleep', start: '21:30', end: '21:35' }
];

const SAMPLE_WEEKEND_ROUTINE = [
  { title: 'Wake up', category: 'morning', start: '08:30', end: '09:00' },
  { title: 'Breakfast', category: 'morning', start: '09:00', end: '09:30' },
  { title: 'Exercise / outdoors', category: 'afternoon', start: '09:30', end: '10:30' },
  { title: 'Study block — catch up / test prep', category: 'study', start: '11:00', end: '12:30' },
  { title: 'Lunch', category: 'afternoon', start: '12:30', end: '13:15' },
  { title: 'Personal project / hobby time', category: 'interest', start: '13:15', end: '15:00' },
  { title: 'Free time', category: 'flex', start: '15:00', end: '18:00' },
  { title: 'Dinner', category: 'afternoon', start: '18:00', end: '18:45' },
  { title: 'Weekly review + plan next week', category: 'winddown', start: '19:00', end: '19:30' },
  { title: 'Wind down', category: 'winddown', start: '21:00', end: '22:00' },
  { title: 'Sleep', category: 'sleep', start: '22:00', end: '22:05' }
];

const SAMPLE_DAILY_ROUTINE = {
  monday: SAMPLE_WEEKDAY_ROUTINE,
  tuesday: SAMPLE_WEEKDAY_ROUTINE,
  wednesday: SAMPLE_WEEKDAY_ROUTINE,
  thursday: SAMPLE_WEEKDAY_ROUTINE,
  friday: SAMPLE_WEEKDAY_ROUTINE,
  saturday: SAMPLE_WEEKEND_ROUTINE,
  sunday: SAMPLE_WEEKEND_ROUTINE
};

function seedSampleDailyRoutineIfNeeded(db) {
  const already = db.prepare("SELECT value FROM settings WHERE key = 'sample_routine_seeded_v1'").get();
  if (already) return;

  const insert = db.prepare(
    `INSERT INTO routine_blocks (day_type, title, category, start_time, end_time, sort_order) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    for (const [dayType, blocks] of Object.entries(SAMPLE_DAILY_ROUTINE)) {
      blocks.forEach((b, i) => insert.run(dayType, b.title, b.category, b.start, b.end, i));
    }
    db.prepare(`INSERT INTO settings (key, value) VALUES ('sample_routine_seeded_v1', '1')`).run();
  });
  tx();
}
