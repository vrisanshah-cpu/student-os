const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  safeStorage,
  screen,
  dialog,
  shell,
  Notification
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { initDatabase, getDb } = require('./db/database');
const {
  syncPowerSchoolICS,
  buildOAuthClient,
  getAuthUrl,
  getAccountEmail,
  getFreeBusy,
  pushStudyBlockToCalendar,
  listCalendars,
  getEventsForCalendar,
  createEvent
} = require('./services/calendarSync');
const { listCourses, listCourseWork } = require('./services/classroomSync');
const { scheduleStudyBlocks } = require('./services/studyScheduler');
const { generateStudyGuide, generatePracticeExam, testApiKey, generateAutocomplete } = require('./services/geminiEngine');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
let tray;
let db;

// ---------- Window creation ----------

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0F1115',
    title: 'Student OS',
    icon: path.join(__dirname, '../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of quitting, so the Pomodoro persists.
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, '../resources/tray-icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Student OS', click: () => mainWindow.show() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setToolTip('Student OS');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow.show());
}

// ---------- Secure settings helpers (API keys, OAuth tokens) ----------

function setEncryptedSetting(key, plainValue) {
  const encrypted = safeStorage.encryptString(plainValue).toString('base64');
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, encrypted);
}

function getDecryptedSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return null;
  try {
    return safeStorage.decryptString(Buffer.from(row.value, 'base64'));
  } catch {
    return null; // wasn't encrypted (e.g. non-sensitive setting) - caller should use getSetting instead
  }
}

// ---------- Storage helpers for attachments / recordings ----------

function userDataSubdir(name) {
  const dir = path.join(app.getPath('userData'), name);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------- IPC: Database - dashboard / classes ----------

ipcMain.handle('db:getDashboardData', () => {
  const today = new Date();
  const startOfDay = new Date(new Date(today).setHours(0, 0, 0, 0)).toISOString();
  const endOfDay = new Date(new Date(today).setHours(23, 59, 59, 999)).toISOString();

  const upcomingDeadlines = db
    .prepare(
      `SELECT d.*, c.name as class_name, c.color as class_color
       FROM deadlines d LEFT JOIN classes c ON c.id = d.class_id
       WHERE d.completed = 0 AND d.due_at >= datetime('now')
       ORDER BY d.due_at ASC LIMIT 10`
    )
    .all();

  const todaysStudyBlocks = db
    .prepare(
      `SELECT sb.*, d.title as deadline_title
       FROM study_blocks sb JOIN deadlines d ON d.id = sb.deadline_id
       WHERE sb.start_at BETWEEN ? AND ?
       ORDER BY sb.start_at ASC`
    )
    .all(startOfDay, endOfDay);

  const todaysPlannerItems = db
    .prepare(
      `SELECT * FROM planner_items
       WHERE start_at BETWEEN ? AND ?
       ORDER BY start_at ASC`
    )
    .all(startOfDay, endOfDay);

  const classes = db.prepare('SELECT * FROM classes ORDER BY name').all();

  return { upcomingDeadlines, todaysStudyBlocks, todaysPlannerItems, classes };
});

ipcMain.handle('db:getClasses', () => db.prepare('SELECT * FROM classes ORDER BY name').all());

ipcMain.handle('db:createClass', (_e, { name, color, powerschool_period }) =>
  db
    .prepare('INSERT INTO classes (name, color, powerschool_period) VALUES (?, ?, ?)')
    .run(name, color, powerschool_period)
);

// ---------- IPC: Database - notes hierarchy ----------

ipcMain.handle('db:getNotesTree', () => {
  const classes = db.prepare('SELECT * FROM classes ORDER BY name').all();
  const units = db.prepare('SELECT * FROM units ORDER BY sort_order').all();
  const topics = db.prepare('SELECT * FROM topics ORDER BY sort_order').all();
  const notes = db.prepare('SELECT id, topic_id, title, updated_at FROM notes ORDER BY updated_at DESC').all();

  return classes.map((c) => ({
    ...c,
    units: units
      .filter((u) => u.class_id === c.id)
      .map((u) => ({
        ...u,
        topics: topics
          .filter((t) => t.unit_id === u.id)
          .map((t) => ({ ...t, notes: notes.filter((n) => n.topic_id === t.id) }))
      }))
  }));
});

ipcMain.handle('db:createUnit', (_e, { class_id, name }) =>
  db.prepare('INSERT INTO units (class_id, name) VALUES (?, ?)').run(class_id, name)
);

ipcMain.handle('db:createTopic', (_e, { unit_id, name }) =>
  db.prepare('INSERT INTO topics (unit_id, name) VALUES (?, ?)').run(unit_id, name)
);

ipcMain.handle('db:getNoteById', (_e, id) => db.prepare('SELECT * FROM notes WHERE id = ?').get(id));

ipcMain.handle('db:saveNote', (_e, note) => {
  if (note.id) {
    db.prepare(
      `UPDATE notes SET title = ?, body_html = ?, mindmap_json = ?, quizlet_url = ?, drive_url = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(note.title, note.body_html || '', note.mindmap_json, note.quizlet_url, note.drive_url, note.id);
    return note.id;
  }
  const info = db
    .prepare(
      `INSERT INTO notes (topic_id, title, body_html, mindmap_json, quizlet_url, drive_url)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(note.topic_id, note.title, note.body_html || '', note.mindmap_json, note.quizlet_url, note.drive_url);
  return info.lastInsertRowid;
});

ipcMain.handle('db:deleteNote', (_e, id) => {
  db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  return true;
});

ipcMain.handle('db:getAttachmentsForNote', (_e, noteId) =>
  db.prepare('SELECT * FROM attachments WHERE note_id = ? ORDER BY created_at DESC').all(noteId)
);

// ---------- IPC: Database - note templates ----------

ipcMain.handle('db:getNoteTemplates', () => db.prepare('SELECT * FROM note_templates ORDER BY name').all());

ipcMain.handle('db:createNoteTemplate', (_e, { name, body_html }) => {
  const info = db.prepare('INSERT INTO note_templates (name, body_html) VALUES (?, ?)').run(name, body_html || '');
  return db.prepare('SELECT * FROM note_templates WHERE id = ?').get(info.lastInsertRowid);
});

ipcMain.handle('db:deleteNoteTemplate', (_e, id) => {
  db.prepare('DELETE FROM note_templates WHERE id = ?').run(id);
  return true;
});

// ---------- IPC: Database - search ----------

ipcMain.handle('db:searchNotes', (_e, query) => {
  const q = (query || '').trim();
  if (!q) return [];
  const like = `%${q}%`;
  return db
    .prepare(
      `SELECT n.id, n.title, n.body_html, n.updated_at, t.name as topic_name, u.name as unit_name, c.name as class_name
       FROM notes n
       JOIN topics t ON t.id = n.topic_id
       JOIN units u ON u.id = t.unit_id
       JOIN classes c ON c.id = u.class_id
       WHERE n.title LIKE ? OR n.body_html LIKE ?
       ORDER BY n.updated_at DESC
       LIMIT 25`
    )
    .all(like, like);
});

// ---------- IPC: Database - deadlines ----------

ipcMain.handle('db:createDeadline', (_e, deadline) =>
  db
    .prepare(
      `INSERT INTO deadlines (class_id, title, type, due_at, source, external_uid)
       VALUES (@class_id, @title, @type, @due_at, @source, @external_uid)`
    )
    .run(deadline)
);

ipcMain.handle('db:getUpcomingDeadlines', () =>
  db
    .prepare(
      `SELECT d.*, c.name as class_name, c.color as class_color
       FROM deadlines d LEFT JOIN classes c ON c.id = d.class_id
       WHERE d.completed = 0 ORDER BY d.due_at ASC`
    )
    .all()
);

ipcMain.handle('db:completeDeadline', (_e, id) => {
  db.prepare('UPDATE deadlines SET completed = 1 WHERE id = ?').run(id);
  return true;
});

ipcMain.handle('db:getStudyBlocksForDay', (_e, isoDate) => {
  const dayStart = new Date(isoDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(isoDate);
  dayEnd.setHours(23, 59, 59, 999);
  return db
    .prepare(
      `SELECT sb.*, d.title as deadline_title
       FROM study_blocks sb JOIN deadlines d ON d.id = sb.deadline_id
       WHERE sb.start_at BETWEEN ? AND ?
       ORDER BY sb.start_at ASC`
    )
    .all(dayStart.toISOString(), dayEnd.toISOString());
});

// ---------- IPC: Database - tags ----------

function upsertTag(name) {
  db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(name);
  return db.prepare('SELECT * FROM tags WHERE name = ?').get(name);
}

ipcMain.handle('db:getAllTags', () => db.prepare('SELECT * FROM tags ORDER BY name').all());

ipcMain.handle('db:tagEntity', (_e, { tagName, entityType, entityId }) => {
  const tag = upsertTag(tagName);
  db.prepare(
    `INSERT OR IGNORE INTO taggables (tag_id, entity_type, entity_id) VALUES (?, ?, ?)`
  ).run(tag.id, entityType, entityId);
  return tag;
});

ipcMain.handle('db:untagEntity', (_e, { tagName, entityType, entityId }) => {
  const tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName);
  if (!tag) return false;
  db.prepare(
    `DELETE FROM taggables WHERE tag_id = ? AND entity_type = ? AND entity_id = ?`
  ).run(tag.id, entityType, entityId);
  return true;
});

ipcMain.handle('db:getTagsForEntity', (_e, { entityType, entityId }) =>
  db
    .prepare(
      `SELECT t.* FROM tags t
       JOIN taggables tg ON tg.tag_id = t.id
       WHERE tg.entity_type = ? AND tg.entity_id = ?
       ORDER BY t.name`
    )
    .all(entityType, entityId)
);

ipcMain.handle('db:getTagged', (_e, tagName) => {
  const tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName);
  if (!tag) return { notes: [], deadlines: [] };

  const noteLinks = db
    .prepare(`SELECT entity_id FROM taggables WHERE tag_id = ? AND entity_type = 'note'`)
    .all(tag.id);
  const deadlineLinks = db
    .prepare(`SELECT entity_id FROM taggables WHERE tag_id = ? AND entity_type = 'deadline'`)
    .all(tag.id);

  const noteIds = noteLinks.map((l) => l.entity_id);
  const deadlineIds = deadlineLinks.map((l) => l.entity_id);

  const notes = noteIds.length
    ? db
        .prepare(`SELECT * FROM notes WHERE id IN (${noteIds.map(() => '?').join(',')})`)
        .all(...noteIds)
    : [];
  const deadlines = deadlineIds.length
    ? db
        .prepare(`SELECT * FROM deadlines WHERE id IN (${deadlineIds.map(() => '?').join(',')})`)
        .all(...deadlineIds)
    : [];

  return { notes, deadlines };
});

// ---------- IPC: Database - settings ----------

ipcMain.handle('db:setSetting', (_e, { key, value, sensitive }) => {
  if (sensitive) setEncryptedSetting(key, value);
  else
    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, value);
  return true;
});

ipcMain.handle('db:getSetting', (_e, { key, sensitive }) => {
  if (sensitive) return getDecryptedSetting(key);
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
});

// ---------- IPC: Database - morning reminders ----------

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

ipcMain.handle('db:getReminders', () => {
  const rows = db.prepare('SELECT * FROM reminders ORDER BY sort_order, created_at').all();
  const today = todayStr();
  // Recurring reminders auto-uncheck once done_date rolls past today -
  // computed on read so nothing needs a background timer/cron.
  return rows.map((r) => ({
    ...r,
    done: r.recurring ? (r.done_date === today ? 1 : 0) : r.done
  }));
});

ipcMain.handle('db:createReminder', (_e, { text, recurring }) => {
  const info = db
    .prepare('INSERT INTO reminders (text, recurring, sort_order) VALUES (?, ?, ?)')
    .run(text, recurring ? 1 : 0, Date.now());
  return db.prepare('SELECT * FROM reminders WHERE id = ?').get(info.lastInsertRowid);
});

ipcMain.handle('db:toggleReminder', (_e, { id, done }) => {
  db.prepare('UPDATE reminders SET done = ?, done_date = ? WHERE id = ?').run(
    done ? 1 : 0,
    done ? todayStr() : null,
    id
  );
  return db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
});

ipcMain.handle('db:deleteReminder', (_e, id) => {
  db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
  return true;
});

// ---------- IPC: Database - daily planner ----------

ipcMain.handle('db:getPlannerDay', (_e, isoDate) => {
  const dayStart = new Date(isoDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(isoDate);
  dayEnd.setHours(23, 59, 59, 999);

  // Manual planner items for this exact day...
  const manual = db
    .prepare(`SELECT * FROM planner_items WHERE recurrence = 'none' AND start_at BETWEEN ? AND ?`)
    .all(dayStart.toISOString(), dayEnd.toISOString());

  // ...plus recurring items (daily, or weekdays-only) whose original start
  // date is on/before the requested day, projected onto this day's date.
  const recurring = db
    .prepare(`SELECT * FROM planner_items WHERE recurrence != 'none' AND start_at <= ?`)
    .all(dayEnd.toISOString());

  const weekday = dayStart.getDay(); // 0 = Sunday ... 6 = Saturday
  const isWeekday = weekday >= 1 && weekday <= 5;

  const projected = recurring
    .filter((item) => item.recurrence === 'daily' || (item.recurrence === 'weekdays' && isWeekday))
    .map((item) => {
      const origStart = new Date(item.start_at);
      const origEnd = new Date(item.end_at);
      const start = new Date(dayStart);
      start.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0);
      const end = new Date(dayStart);
      end.setHours(origEnd.getHours(), origEnd.getMinutes(), 0, 0);
      return { ...item, start_at: start.toISOString(), end_at: end.toISOString(), _projected: true };
    });

  const studyBlocks = db
    .prepare(
      `SELECT sb.*, d.title as deadline_title, 'study_block' as _source
       FROM study_blocks sb JOIN deadlines d ON d.id = sb.deadline_id
       WHERE sb.start_at BETWEEN ? AND ?`
    )
    .all(dayStart.toISOString(), dayEnd.toISOString());

  const deadlinesDueToday = db
    .prepare(
      `SELECT * FROM deadlines WHERE completed = 0 AND due_at BETWEEN ? AND ?`
    )
    .all(dayStart.toISOString(), dayEnd.toISOString());

  const items = [...manual, ...projected]
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));

  return { plannerItems: items, studyBlocks, deadlinesDueToday };
});

// Same manual + recurring-projection logic as db:getPlannerDay, but swept
// across an arbitrary range (used by the unified Calendar view's month/week
// grid instead of calling per-day in a loop).
ipcMain.handle('db:getPlannerItemsRange', (_e, { startISO, endISO }) => {
  const rangeStart = new Date(startISO);
  const rangeEnd = new Date(endISO);

  const manual = db
    .prepare(`SELECT * FROM planner_items WHERE recurrence = 'none' AND start_at BETWEEN ? AND ?`)
    .all(rangeStart.toISOString(), rangeEnd.toISOString());

  const recurring = db.prepare(`SELECT * FROM planner_items WHERE recurrence != 'none' AND start_at <= ?`).all(rangeEnd.toISOString());

  const projected = [];
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= rangeEnd) {
    const weekday = cursor.getDay();
    const isWeekday = weekday >= 1 && weekday <= 5;
    for (const item of recurring) {
      if (item.recurrence !== 'daily' && !(item.recurrence === 'weekdays' && isWeekday)) continue;
      const origStart = new Date(item.start_at);
      if (origStart > cursor) continue; // recurrence only applies from its own start date onward
      const origEnd = new Date(item.end_at);
      const start = new Date(cursor);
      start.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0);
      const end = new Date(cursor);
      end.setHours(origEnd.getHours(), origEnd.getMinutes(), 0, 0);
      projected.push({ ...item, start_at: start.toISOString(), end_at: end.toISOString(), _projected: true });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return [...manual, ...projected].sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
});

ipcMain.handle('db:createPlannerItem', (_e, item) => {
  const info = db
    .prepare(
      `INSERT INTO planner_items (title, notes, category, color, start_at, end_at, recurrence)
       VALUES (@title, @notes, @category, @color, @start_at, @end_at, @recurrence)`
    )
    .run({
      title: item.title,
      notes: item.notes || null,
      category: item.category || 'personal',
      color: item.color || '#8890A6',
      start_at: item.start_at,
      end_at: item.end_at,
      recurrence: item.recurrence || 'none'
    });
  return db.prepare('SELECT * FROM planner_items WHERE id = ?').get(info.lastInsertRowid);
});

ipcMain.handle('db:updatePlannerItem', (_e, item) => {
  db.prepare(
    `UPDATE planner_items SET title = ?, notes = ?, category = ?, color = ?, start_at = ?, end_at = ?, recurrence = ?
     WHERE id = ?`
  ).run(item.title, item.notes || null, item.category, item.color, item.start_at, item.end_at, item.recurrence, item.id);
  return db.prepare('SELECT * FROM planner_items WHERE id = ?').get(item.id);
});

ipcMain.handle('db:deletePlannerItem', (_e, id) => {
  db.prepare('DELETE FROM planner_items WHERE id = ?').run(id);
  return true;
});

// ---------- IPC: Database - bell schedule (A/B rotation) ----------

/**
 * A single anchor date (a day known to be an "A" day) plus counting
 * weekdays elapsed since then, alternating parity - the model most
 * rotating-schedule schools actually use. Doesn't account for holidays
 * that break the rotation; re-anchoring after a break fixes that.
 */
function computeDayType(anchorDateStr) {
  if (!anchorDateStr) return null;
  const anchor = new Date(anchorDateStr + 'T00:00:00');
  if (isNaN(anchor.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  anchor.setHours(0, 0, 0, 0);

  const step = today >= anchor ? 1 : -1;
  let weekdaysBetween = 0;
  const cursor = new Date(anchor);
  while (cursor.getTime() !== today.getTime()) {
    cursor.setDate(cursor.getDate() + step);
    const dow = cursor.getDay();
    if (dow >= 1 && dow <= 5) weekdaysBetween += step;
  }
  const isA = ((weekdaysBetween % 2) + 2) % 2 === 0;
  return isA ? 'A' : 'B';
}

ipcMain.handle('db:getBellPeriods', () => db.prepare('SELECT * FROM bell_periods ORDER BY sort_order, start_time').all());

ipcMain.handle('db:createBellPeriod', (_e, p) => {
  const info = db
    .prepare(
      `INSERT INTO bell_periods (day_type, name, start_time, end_time, class_id, room, teacher, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(p.day_type || 'both', p.name, p.start_time, p.end_time, p.class_id || null, p.room || '', p.teacher || '', p.sort_order || 0);
  return db.prepare('SELECT * FROM bell_periods WHERE id = ?').get(info.lastInsertRowid);
});

ipcMain.handle('db:updateBellPeriod', (_e, p) => {
  db.prepare(
    `UPDATE bell_periods SET day_type = ?, name = ?, start_time = ?, end_time = ?, class_id = ?, room = ?, teacher = ?, sort_order = ? WHERE id = ?`
  ).run(p.day_type, p.name, p.start_time, p.end_time, p.class_id || null, p.room || '', p.teacher || '', p.sort_order || 0, p.id);
  return db.prepare('SELECT * FROM bell_periods WHERE id = ?').get(p.id);
});

ipcMain.handle('db:deleteBellPeriod', (_e, id) => {
  db.prepare('DELETE FROM bell_periods WHERE id = ?').run(id);
  return true;
});

ipcMain.handle('db:getKnownDayCodes', () =>
  db
    .prepare("SELECT DISTINCT day_type FROM bell_periods WHERE day_type != 'both' ORDER BY day_type")
    .all()
    .map((r) => r.day_type)
);

// The day code is entered once by the person each morning ("1A", "2B", ...)
// rather than computed automatically - schools' real rotations have too many
// exceptions (holidays, assemblies) for a pure parity formula to stay correct.
ipcMain.handle('db:getTodayDayCode', () => {
  const code = db.prepare("SELECT value FROM settings WHERE key = 'today_day_code'").get()?.value || null;
  const date = db.prepare("SELECT value FROM settings WHERE key = 'today_day_code_date'").get()?.value || null;
  const anchor = db.prepare("SELECT value FROM settings WHERE key = 'bell_rotation_anchor_date'").get()?.value || null;
  return { code, isToday: date === todayStr(), suggested: computeDayType(anchor) };
});

ipcMain.handle('db:setTodayDayCode', (_e, code) => {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('today_day_code', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(code);
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('today_day_code_date', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(todayStr());
  return true;
});

ipcMain.handle('db:getTodaySchedule', (_e, dayCode) => {
  const code = dayCode || null;
  const weekday = String(new Date().getDay());
  const rows = code
    ? db
        .prepare(
          `SELECT p.*, c.name as class_name, c.color as class_color FROM bell_periods p
           LEFT JOIN classes c ON c.id = p.class_id
           WHERE p.day_type = ? OR p.day_type = 'both' ORDER BY p.sort_order, p.start_time`
        )
        .all(code)
    : db
        .prepare(
          `SELECT p.*, c.name as class_name, c.color as class_color FROM bell_periods p
           LEFT JOIN classes c ON c.id = p.class_id
           WHERE p.day_type = 'both' ORDER BY p.sort_order, p.start_time`
        )
        .all();
  // weekdays column, when set, restricts a row (e.g. Advisory vs FLEX) to
  // specific calendar weekdays regardless of the rotation day code.
  const periods = rows.filter((r) => !r.weekdays || r.weekdays.split(',').includes(weekday));
  return { dayType: code, periods };
});

// ---------- IPC: Daily routine (personal, local-only recurring schedule) ----------

ipcMain.handle('db:getRoutineBlocks', () =>
  db.prepare('SELECT * FROM routine_blocks ORDER BY day_type, sort_order, start_time').all()
);

ipcMain.handle('db:createRoutineBlock', (_e, b) => {
  const info = db
    .prepare(
      `INSERT INTO routine_blocks (day_type, title, category, start_time, end_time, sort_order) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(b.day_type, b.title, b.category || 'flex', b.start_time, b.end_time, b.sort_order ?? 0);
  return db.prepare('SELECT * FROM routine_blocks WHERE id = ?').get(info.lastInsertRowid);
});

ipcMain.handle('db:updateRoutineBlock', (_e, b) => {
  db.prepare(
    `UPDATE routine_blocks SET day_type = ?, title = ?, category = ?, start_time = ?, end_time = ?, sort_order = ? WHERE id = ?`
  ).run(b.day_type, b.title, b.category || 'flex', b.start_time, b.end_time, b.sort_order ?? 0, b.id);
  return db.prepare('SELECT * FROM routine_blocks WHERE id = ?').get(b.id);
});

ipcMain.handle('db:deleteRoutineBlock', (_e, id) => {
  db.prepare('DELETE FROM routine_blocks WHERE id = ?').run(id);
  return true;
});

// ---------- IPC: FLEX / Advisory prep ----------

ipcMain.handle('db:getFlexPrep', (_e, date) => db.prepare('SELECT * FROM flex_prep WHERE date = ?').get(date) || null);

ipcMain.handle('db:saveFlexPrep', (_e, { date, notes, tags }) => {
  db.prepare(
    `INSERT INTO flex_prep (date, notes, tags) VALUES (?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET notes = excluded.notes, tags = excluded.tags`
  ).run(date, notes || '', tags || '');
  return db.prepare('SELECT * FROM flex_prep WHERE date = ?').get(date);
});

// ---------- IPC: Files (attachments) ----------

ipcMain.handle('file:pickAttachment', async (_e, { noteId, kind }) => {
  const filters =
    kind === 'image'
      ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
      : [{ name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg'] }];

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters
  });
  if (canceled || filePaths.length === 0) return null;

  const src = filePaths[0];
  const destDir = userDataSubdir('attachments');
  const destName = `${Date.now()}-${path.basename(src)}`;
  const destPath = path.join(destDir, destName);
  fs.copyFileSync(src, destPath);

  const ext = path.extname(src).toLowerCase();
  const fileType = ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext) ? 'image' : 'pdf';

  const info = db
    .prepare(`INSERT INTO attachments (note_id, file_path, file_type, label) VALUES (?, ?, ?, ?)`)
    .run(noteId, destPath, fileType, path.basename(src));

  return db.prepare('SELECT * FROM attachments WHERE id = ?').get(info.lastInsertRowid);
});

ipcMain.handle('file:openPath', (_e, filePath) => shell.openPath(filePath));
ipcMain.handle('shell:openExternal', (_e, url) => shell.openExternal(url));

// ---------- IPC: Inline note images ----------
// Images embedded in the rich text editor are copied into userData and
// referenced by a file:// URL (via pathToFileURL, which handles Windows
// drive-letter/backslash encoding correctly) - never stored as base64
// blobs inline in the HTML, so the database stays small even with lots
// of photos pasted into notes.

const { pathToFileURL } = require('url');

ipcMain.handle('file:pickImage', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
  });
  if (canceled || filePaths.length === 0) return null;

  const src = filePaths[0];
  const destDir = userDataSubdir('note-images');
  const destName = `${Date.now()}-${path.basename(src)}`;
  const destPath = path.join(destDir, destName);
  fs.copyFileSync(src, destPath);
  return pathToFileURL(destPath).href;
});

ipcMain.handle('file:saveImageData', (_e, { dataUrl, extension }) => {
  const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('Not a valid image data URL.');
  const ext = extension || match[1] || 'png';
  const buffer = Buffer.from(match[2], 'base64');

  const destDir = userDataSubdir('note-images');
  const destPath = path.join(destDir, `${Date.now()}-pasted.${ext}`);
  fs.writeFileSync(destPath, buffer);
  return pathToFileURL(destPath).href;
});

// ---------- IPC: Sync ----------

ipcMain.handle('sync:powerschool', async (_e, icsUrl) => {
  const events = await syncPowerSchoolICS(icsUrl);
  const insert = db.prepare(
    `INSERT INTO deadlines (title, type, due_at, source, external_uid)
     VALUES (@title, @type, @due_at, @source, @external_uid)
     ON CONFLICT(external_uid) DO UPDATE SET due_at = excluded.due_at, title = excluded.title`
  );
  const tx = db.transaction((rows) => rows.forEach((r) => insert.run(r)));
  tx(events);
  return { imported: events.length };
});

// ---------- Google OAuth (multi-account, loopback redirect) ----------
// One OAuth client config (one Google Cloud project, from settings) is
// shared; what's per-account is the token set, cached here by account row
// id once hydrated from the database so repeated calls don't hit disk.
//
// Google shut down the old "copy this code" OOB flow (urn:ietf:wg:oauth:2.0:oob)
// in 2022 - it's rejected outright for any OAuth client created since. The
// flow that actually works today for a desktop app is RFC 8252's loopback
// redirect: spin up a throwaway HTTP server on 127.0.0.1 with an OS-assigned
// port, send the user to Google with that as the redirect_uri, and Google's
// "Desktop app" client type accepts any 127.0.0.1 port without it being
// pre-registered - only the bare http://localhost entry needs to exist in
// Cloud Console (which is what Google puts there by default).
const googleClients = new Map(); // accountId -> OAuth2Client
let authInProgress = false;

function encryptTokens(tokensObj) {
  return safeStorage.encryptString(JSON.stringify(tokensObj)).toString('base64');
}
function decryptTokens(value) {
  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(value, 'base64')));
  } catch {
    return null;
  }
}

/**
 * @param redirectUri Only meaningful while generating a fresh consent URL /
 * exchanging a code. For an already-authorized client (tokens set via
 * setCredentials) it's never actually used again, so a harmless placeholder
 * is fine there.
 */
function buildClientFromSavedSettings(redirectUri = 'http://127.0.0.1') {
  const clientId = db.prepare("SELECT value FROM settings WHERE key = 'google_client_id'").get()?.value;
  const clientSecret = getDecryptedSetting('google_client_secret');
  if (!clientId || !clientSecret) throw new Error('Add your Google Client ID and Client Secret first.');
  return buildOAuthClient(clientId, clientSecret, redirectUri);
}

/** Lazily hydrates (and caches) an OAuth2Client for a connected account, wiring up token-refresh persistence. */
function getClientForAccount(accountId) {
  if (googleClients.has(accountId)) return googleClients.get(accountId);
  const row = db.prepare('SELECT * FROM google_accounts WHERE id = ?').get(accountId);
  if (!row) throw new Error('That Google account is no longer connected.');
  const tokens = decryptTokens(row.tokens);
  if (!tokens) throw new Error('Could not read stored credentials for that Google account - reconnect it.');

  const client = buildClientFromSavedSettings();
  client.setCredentials(tokens);
  // googleapis refreshes access tokens transparently; persist whatever comes
  // back (merged over what's stored) so the refreshed token survives a restart.
  client.on('tokens', (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    db.prepare('UPDATE google_accounts SET tokens = ? WHERE id = ?').run(encryptTokens(merged), accountId);
  });
  googleClients.set(accountId, client);
  return client;
}

/** The calendar StudentOS-created events push to by default: the flagged one, else the first enabled calendar. */
function getDefaultPushCalendar() {
  const flagged = db
    .prepare('SELECT * FROM google_calendars WHERE is_default_push = 1 AND enabled = 1 LIMIT 1')
    .get();
  if (flagged) return flagged;
  return db.prepare('SELECT * FROM google_calendars WHERE enabled = 1 ORDER BY id LIMIT 1').get();
}

/** Runs the whole connect flow: loopback server -> consent screen -> code exchange -> save account. */
async function startGoogleAuth(label) {
  if (authInProgress) throw new Error('Already connecting a Google account - finish or cancel that first.');
  authInProgress = true;
  try {
    const server = http.createServer();
    const codePromise = new Promise((resolveCode, rejectCode) => {
      server.on('request', (req, res) => {
        let url;
        try {
          url = new URL(req.url, 'http://127.0.0.1');
        } catch {
          res.writeHead(400).end();
          return;
        }
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          `<!doctype html><html><body style="font-family:system-ui,sans-serif;text-align:center;padding-top:15vh;color:#2B2620;background:#F6F1E7;">
             <h2>${error ? 'Connection failed' : 'Student OS connected'}</h2>
             <p>You can close this tab${error ? ' and try again in Student OS' : ' and switch back to Student OS'}.</p>
           </body></html>`
        );
        if (error) rejectCode(new Error(`Google sign-in was cancelled or failed (${error}).`));
        else if (code) resolveCode(code);
        else rejectCode(new Error('Google did not return an authorization code.'));
      });
      server.on('error', rejectCode);
    });

    const port = await new Promise((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(0, '127.0.0.1', () => resolveListen(server.address().port));
    });
    const redirectUri = `http://127.0.0.1:${port}`;

    const client = buildClientFromSavedSettings(redirectUri);
    const authUrl = getAuthUrl(client);
    await shell.openExternal(authUrl);

    let code;
    try {
      code = await Promise.race([
        codePromise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('Timed out waiting for Google sign-in.')), 5 * 60 * 1000))
      ]);
    } finally {
      server.close();
    }

    const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
    client.setCredentials(tokens);

    let email = null;
    try {
      email = await getAccountEmail(client);
    } catch {
      // Non-fatal - the account still connects, just without a display email.
    }

    const info = db
      .prepare('INSERT INTO google_accounts (label, email, tokens) VALUES (?, ?, ?)')
      .run(label?.trim() || 'Google account', email, encryptTokens(tokens));
    const accountId = info.lastInsertRowid;
    googleClients.set(accountId, client);
    client.on('tokens', (newTokens) => {
      const row = db.prepare('SELECT tokens FROM google_accounts WHERE id = ?').get(accountId);
      const merged = { ...(decryptTokens(row?.tokens) || {}), ...newTokens };
      db.prepare('UPDATE google_accounts SET tokens = ? WHERE id = ?').run(encryptTokens(merged), accountId);
    });

    return { id: accountId, label: label?.trim() || 'Google account', email };
  } finally {
    authInProgress = false;
  }
}

ipcMain.handle('google:connect', (_e, { label }) => startGoogleAuth(label));

ipcMain.handle('google:listAccounts', () =>
  db.prepare('SELECT id, label, email, created_at FROM google_accounts ORDER BY id').all()
);

ipcMain.handle('google:removeAccount', (_e, id) => {
  db.prepare('DELETE FROM google_accounts WHERE id = ?').run(id);
  googleClients.delete(id);
  return true;
});

ipcMain.handle('google:listCalendars', async (_e, accountId) => {
  const client = getClientForAccount(accountId);
  const remote = await listCalendars(client);
  const upsert = db.prepare(
    `INSERT INTO google_calendars (account_id, calendar_id, summary, color)
     VALUES (@account_id, @calendar_id, @summary, @color)
     ON CONFLICT(account_id, calendar_id) DO UPDATE SET summary = excluded.summary`
  );
  const tx = db.transaction((rows) => rows.forEach((r) => upsert.run(r)));
  tx(
    remote.map((c) => ({
      account_id: accountId,
      calendar_id: c.calendarId,
      summary: c.summary,
      color: c.backgroundColor || '#5B8CFF'
    }))
  );
  return db.prepare('SELECT * FROM google_calendars WHERE account_id = ? ORDER BY summary').all(accountId);
});

ipcMain.handle('google:setCalendarEnabled', (_e, { id, enabled, color }) => {
  if (color) db.prepare('UPDATE google_calendars SET enabled = ?, color = ? WHERE id = ?').run(enabled ? 1 : 0, color, id);
  else db.prepare('UPDATE google_calendars SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
  return db.prepare('SELECT * FROM google_calendars WHERE id = ?').get(id);
});

ipcMain.handle('google:setDefaultPushCalendar', (_e, id) => {
  const tx = db.transaction(() => {
    db.prepare('UPDATE google_calendars SET is_default_push = 0').run();
    db.prepare('UPDATE google_calendars SET is_default_push = 1 WHERE id = ?').run(id);
  });
  tx();
  return true;
});

ipcMain.handle('google:getCalendarSettings', () =>
  db
    .prepare(
      `SELECT gc.*, ga.label as account_label, ga.email as account_email
       FROM google_calendars gc JOIN google_accounts ga ON ga.id = gc.account_id
       ORDER BY ga.label, gc.summary`
    )
    .all()
);

ipcMain.handle('google:listClassroomCourses', async (_e, accountId) => {
  const client = getClientForAccount(accountId);
  const remote = await listCourses(client);
  const upsert = db.prepare(
    `INSERT INTO classroom_courses (account_id, course_id, name)
     VALUES (@account_id, @course_id, @name)
     ON CONFLICT(account_id, course_id) DO UPDATE SET name = excluded.name`
  );
  const tx = db.transaction((rows) => rows.forEach((r) => upsert.run(r)));
  tx(remote.map((c) => ({ account_id: accountId, course_id: c.courseId, name: c.name })));
  return db.prepare('SELECT * FROM classroom_courses WHERE account_id = ? ORDER BY name').all(accountId);
});

ipcMain.handle('google:setClassroomCourseEnabled', (_e, { id, enabled }) => {
  db.prepare('UPDATE classroom_courses SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
  return db.prepare('SELECT * FROM classroom_courses WHERE id = ?').get(id);
});

ipcMain.handle('google:getClassroomSettings', () =>
  db
    .prepare(
      `SELECT cc.*, ga.label as account_label, ga.email as account_email
       FROM classroom_courses cc JOIN google_accounts ga ON ga.id = cc.account_id
       ORDER BY ga.label, cc.name`
    )
    .all()
);

/** Reminder offsets (hours before due) configured in Settings, default "3 days, 1 day, day-of". */
function getReminderOffsets() {
  const raw = db.prepare("SELECT value FROM settings WHERE key = 'classroom_reminder_offsets_hours'").get()?.value;
  const offsets = (raw || '72,24,0').split(',').map((n) => Number(n.trim())).filter((n) => Number.isFinite(n));
  return offsets.length ? offsets : [72, 24, 0];
}

async function syncClassroomCourses() {
  const enabledCourses = db.prepare('SELECT * FROM classroom_courses WHERE enabled = 1').all();
  if (enabledCourses.length === 0) return { imported: 0 };

  const insertDeadline = db.prepare(
    `INSERT INTO deadlines (title, type, due_at, source, external_uid)
     VALUES (@title, @type, @due_at, @source, @external_uid)
     ON CONFLICT(external_uid) DO UPDATE SET due_at = excluded.due_at, title = excluded.title
     RETURNING id`
  );
  const insertReminder = db.prepare(
    `INSERT OR IGNORE INTO deadline_reminders (deadline_id, offset_hours) VALUES (?, ?)`
  );
  const offsets = getReminderOffsets();

  let imported = 0;
  for (const course of enabledCourses) {
    let client;
    try {
      client = getClientForAccount(course.account_id);
    } catch {
      continue; // account was disconnected since this course was enabled
    }
    let coursework;
    try {
      coursework = await listCourseWork(client, course.course_id, course.name);
    } catch {
      continue; // don't let one broken course block the rest
    }
    const tx = db.transaction((rows) => {
      for (const r of rows) {
        const row = insertDeadline.get(r);
        if (row) offsets.forEach((h) => insertReminder.run(row.id, h));
      }
    });
    tx(coursework);
    imported += coursework.length;
  }
  return { imported };
}

ipcMain.handle('google:syncClassroomNow', () => syncClassroomCourses());

// ---------- IPC: Unified calendar (Google Calendar events across every enabled calendar) ----------

ipcMain.handle('calendar:getEvents', async (_e, { timeMin, timeMax }) => {
  const calendars = db
    .prepare(
      `SELECT gc.*, ga.label as account_label
       FROM google_calendars gc JOIN google_accounts ga ON ga.id = gc.account_id
       WHERE gc.enabled = 1`
    )
    .all();

  const results = await Promise.all(
    calendars.map(async (cal) => {
      try {
        const client = getClientForAccount(cal.account_id);
        const events = await getEventsForCalendar(client, cal.calendar_id, new Date(timeMin), new Date(timeMax));
        return events.map((e) => ({
          ...e,
          source: 'google',
          accountLabel: cal.account_label,
          calendarRowId: cal.id,
          calendarSummary: cal.summary,
          color: cal.color
        }));
      } catch {
        return []; // one broken/expired calendar shouldn't blank out the whole view
      }
    })
  );
  return results.flat();
});

ipcMain.handle('calendar:createEvent', async (_e, { calendarRowId, title, start, end, description, allDay }) => {
  const row = calendarRowId
    ? db.prepare('SELECT * FROM google_calendars WHERE id = ?').get(calendarRowId)
    : getDefaultPushCalendar();
  if (!row) throw new Error('No Google Calendar is connected and enabled to push to yet.');
  const client = getClientForAccount(row.account_id);
  const eventId = await createEvent(client, row.calendar_id, {
    title,
    start: new Date(start),
    end: new Date(end),
    description,
    allDay
  });
  return { eventId, calendarRowId: row.id };
});

ipcMain.handle('sync:generateStudyBlocks', async (_e, { deadlineId, desiredBlocks }) => {
  const deadline = db.prepare('SELECT * FROM deadlines WHERE id = ?').get(deadlineId);
  const examDate = new Date(deadline.due_at);
  const now = new Date();

  let busy = [];
  const pushTarget = getDefaultPushCalendar();
  if (pushTarget) {
    try {
      const client = getClientForAccount(pushTarget.account_id);
      busy = await getFreeBusy(client, now, examDate, pushTarget.calendar_id);
    } catch {
      busy = []; // fall back to local-only scheduling if Google auth isn't set up
    }
  }
  // Also treat existing local study blocks and planner items as busy so we
  // don't double-book the student's afternoons/evenings.
  const existingBlocks = db
    .prepare(`SELECT start_at as start, end_at as end FROM study_blocks WHERE start_at BETWEEN ? AND ?`)
    .all(now.toISOString(), examDate.toISOString())
    .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));

  const plannerBusy = db
    .prepare(`SELECT start_at as start, end_at as end FROM planner_items WHERE start_at BETWEEN ? AND ?`)
    .all(now.toISOString(), examDate.toISOString())
    .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));

  const proposed = scheduleStudyBlocks(
    now,
    examDate,
    [...busy, ...existingBlocks, ...plannerBusy],
    desiredBlocks || 4
  );

  const insert = db.prepare(`INSERT INTO study_blocks (deadline_id, start_at, end_at) VALUES (?, ?, ?)`);
  const tx = db.transaction((blocks) =>
    blocks.map((b) => insert.run(deadlineId, b.start.toISOString(), b.end.toISOString()))
  );
  tx(proposed);

  return proposed;
});

ipcMain.handle('sync:pushBlocksToGoogle', async (_e, { deadlineId, title }) => {
  const pushTarget = getDefaultPushCalendar();
  if (!pushTarget) throw new Error('Connect and enable a Google Calendar in Settings first.');
  const client = getClientForAccount(pushTarget.account_id);
  const blocks = db.prepare('SELECT * FROM study_blocks WHERE deadline_id = ?').all(deadlineId);
  const results = [];
  for (const block of blocks) {
    if (block.google_event_id) continue;
    const eventId = await pushStudyBlockToCalendar(
      client,
      { start: new Date(block.start_at), end: new Date(block.end_at) },
      title,
      pushTarget.calendar_id
    );
    db.prepare('UPDATE study_blocks SET google_event_id = ? WHERE id = ?').run(eventId, block.id);
    results.push(eventId);
  }
  return results;
});

// ---------- IPC: Gemini ----------

/** Good-enough HTML -> plain text so Gemini prompts aren't full of markup. */
function stripHtml(html) {
  return (html || '')
    .replace(/<(p|div|li|h[1-6]|br|blockquote)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

ipcMain.handle('gemini:generateStudyGuide', async (_e, { noteIds }) => {
  const apiKey = getDecryptedSetting('gemini_api_key');
  if (!apiKey) throw new Error('No Gemini API key saved yet. Add one in Settings.');
  const placeholders = noteIds.map(() => '?').join(',');
  const notes = db
    .prepare(`SELECT title, body_html FROM notes WHERE id IN (${placeholders})`)
    .all(...noteIds)
    .map((n) => ({ title: n.title, body_markdown: stripHtml(n.body_html) }));
  return generateStudyGuide(apiKey, notes);
});

ipcMain.handle('gemini:generatePracticeExam', async (_e, { noteIds, questionCount }) => {
  const apiKey = getDecryptedSetting('gemini_api_key');
  if (!apiKey) throw new Error('No Gemini API key saved yet. Add one in Settings.');
  const placeholders = noteIds.map(() => '?').join(',');
  const notes = db
    .prepare(`SELECT title, body_html FROM notes WHERE id IN (${placeholders})`)
    .all(...noteIds)
    .map((n) => ({ title: n.title, body_markdown: stripHtml(n.body_html) }));
  return generatePracticeExam(apiKey, notes, { questionCount });
});

ipcMain.handle('gemini:testKey', async () => {
  const apiKey = getDecryptedSetting('gemini_api_key');
  if (!apiKey) throw new Error('No Gemini API key saved yet.');
  return testApiKey(apiKey);
});

ipcMain.handle('gemini:autocomplete', async (_e, { context }) => {
  const apiKey = getDecryptedSetting('gemini_api_key');
  if (!apiKey) return ''; // no key configured - the caller treats an empty string as "no suggestion"
  return generateAutocomplete(apiKey, context);
});

// ---------- IPC: Lecture audio recording ----------
// Capture happens in the renderer via the Web Audio API (no extra native
// deps needed). The renderer streams back a raw PCM buffer which we
// encode into a standard WAV file here and store under userData/recordings.

ipcMain.handle('recording:start', () => ({ startedAt: new Date().toISOString() }));
ipcMain.handle('recording:stop', () => ({ stoppedAt: new Date().toISOString() }));

function encodeWav({ pcmData, sampleRate, numChannels }) {
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = pcmData.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < pcmData.length; i++) {
    buffer.writeInt16LE(pcmData[i], 44 + i * 2);
  }
  return buffer;
}

ipcMain.handle('recording:save', (_e, { noteId, pcmSamples, sampleRate, numChannels, durationSeconds }) => {
  const pcmData = Int16Array.from(pcmSamples);
  const wavBuffer = encodeWav({ pcmData, sampleRate: sampleRate || 44100, numChannels: numChannels || 1 });

  const destDir = userDataSubdir('recordings');
  const fileName = `lecture-${Date.now()}.wav`;
  const destPath = path.join(destDir, fileName);
  fs.writeFileSync(destPath, wavBuffer);

  const info = db
    .prepare(
      `INSERT INTO recordings (note_id, file_path, duration_seconds, format) VALUES (?, ?, ?, 'wav')`
    )
    .run(noteId || null, destPath, Math.round(durationSeconds || 0));

  return db.prepare('SELECT * FROM recordings WHERE id = ?').get(info.lastInsertRowid);
});

ipcMain.handle('recording:listForNote', (_e, noteId) =>
  db.prepare('SELECT * FROM recordings WHERE note_id = ? ORDER BY created_at DESC').all(noteId)
);

// ---------- IPC: Window ----------

ipcMain.handle('window:minimizeToTray', () => mainWindow.hide());

// ---------- Homework due-soon notifications ----------
// Runs while the app is open (including minimized to tray, since the app
// stays alive on window-all-closed). Fires a native OS notification once,
// 12 hours out from a homework deadline, then marks it so it never repeats.

function checkDueSoonHomework() {
  if (!db) return;
  const twelveHoursFromNow = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const due = db
    .prepare(
      `SELECT * FROM deadlines
       WHERE completed = 0 AND notified_12h = 0 AND type = 'homework'
       AND due_at <= ? AND due_at >= datetime('now')`
    )
    .all(twelveHoursFromNow);

  for (const item of due) {
    if (Notification.isSupported()) {
      new Notification({
        title: 'Homework due soon',
        body: `${item.title} — due ${new Date(item.due_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
      }).show();
    }
    db.prepare('UPDATE deadlines SET notified_12h = 1 WHERE id = ?').run(item.id);
  }
}

ipcMain.handle('db:getDueSoonHomework', () => {
  const twelveHoursFromNow = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  return db
    .prepare(
      `SELECT * FROM deadlines WHERE completed = 0 AND type = 'homework' AND due_at <= ? AND due_at >= datetime('now') ORDER BY due_at ASC`
    )
    .all(twelveHoursFromNow);
});

// ---------- Classroom-derived reminders (configurable offsets: 3 days / 1 day / day-of, etc) ----------
// Distinct from checkDueSoonHomework above (which is a fixed 12h-out ping for
// any homework-type deadline regardless of source) - these are the
// per-assignment reminder rows created when a Classroom assignment syncs in,
// at whatever offsets are configured in Settings.

function checkDeadlineReminders() {
  if (!db) return;
  const due = db
    .prepare(
      `SELECT dr.id as reminder_id, dr.offset_hours, d.*
       FROM deadline_reminders dr JOIN deadlines d ON d.id = dr.deadline_id
       WHERE dr.notified = 0 AND d.completed = 0
       AND datetime(d.due_at, '-' || dr.offset_hours || ' hours') <= datetime('now')`
    )
    .all();

  for (const item of due) {
    if (Notification.isSupported()) {
      const label = item.offset_hours >= 24 ? `${Math.round(item.offset_hours / 24)}d out` : item.offset_hours === 0 ? 'due now' : `${item.offset_hours}h out`;
      new Notification({
        title: `Assignment reminder (${label})`,
        body: `${item.title} — due ${new Date(item.due_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
      }).show();
    }
    db.prepare('UPDATE deadline_reminders SET notified = 1 WHERE id = ?').run(item.reminder_id);
  }
}

// ---------- IPC: Canvas items (sticky notes, movable images, equations, graphs) ----------

ipcMain.handle('db:getCanvasItems', (_e, noteId) =>
  db.prepare('SELECT * FROM canvas_items WHERE note_id = ? ORDER BY z_index, id').all(noteId)
);

ipcMain.handle('db:createCanvasItem', (_e, item) => {
  const info = db
    .prepare(
      `INSERT INTO canvas_items (note_id, type, x, y, width, height, z_index, color, caption, data)
       VALUES (@note_id, @type, @x, @y, @width, @height, @z_index, @color, @caption, @data)`
    )
    .run({
      note_id: item.note_id,
      type: item.type,
      x: item.x ?? 40,
      y: item.y ?? 40,
      width: item.width ?? 220,
      height: item.height ?? 160,
      z_index: item.z_index ?? 1,
      color: item.color || '#FDE68A',
      caption: item.caption || '',
      data: item.data || '{}'
    });
  return db.prepare('SELECT * FROM canvas_items WHERE id = ?').get(info.lastInsertRowid);
});

ipcMain.handle('db:updateCanvasItem', (_e, item) => {
  db.prepare(
    `UPDATE canvas_items SET x=?, y=?, width=?, height=?, z_index=?, color=?, caption=?, data=? WHERE id = ?`
  ).run(item.x, item.y, item.width, item.height, item.z_index || 1, item.color, item.caption || '', item.data, item.id);
  return db.prepare('SELECT * FROM canvas_items WHERE id = ?').get(item.id);
});

ipcMain.handle('db:deleteCanvasItem', (_e, id) => {
  db.prepare('DELETE FROM canvas_items WHERE id = ?').run(id);
  return true;
});

// ---------- App lifecycle ----------

app.whenReady().then(() => {
  db = initDatabase();
  createMainWindow();
  createTray();

  checkDueSoonHomework();
  setInterval(checkDueSoonHomework, 5 * 60 * 1000);

  checkDeadlineReminders();
  setInterval(checkDeadlineReminders, 5 * 60 * 1000);

  // Background Classroom auto-sync (new assignments -> deadlines + reminders)
  // and a periodic nudge for the renderer to refresh the unified calendar -
  // both simple polling, which is plenty for a single-user desktop app.
  setInterval(() => {
    syncClassroomCourses().catch(() => {});
  }, 10 * 60 * 1000);

  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('calendar:refresh');
  }, 7 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  // Keep running in tray on all platforms for this app's use case.
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
