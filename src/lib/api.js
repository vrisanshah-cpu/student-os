// Thin wrapper so components never touch window.studyOS directly -
// makes it trivial to mock in tests or swap transport later.
const api = {
  // Dashboard / classes
  getDashboardData: () => window.studyOS.invoke('db:getDashboardData'),
  getClasses: () => window.studyOS.invoke('db:getClasses'),
  createClass: (payload) => window.studyOS.invoke('db:createClass', payload),

  // Notes hierarchy
  getNotesTree: () => window.studyOS.invoke('db:getNotesTree'),
  createUnit: (payload) => window.studyOS.invoke('db:createUnit', payload),
  createTopic: (payload) => window.studyOS.invoke('db:createTopic', payload),
  getNoteById: (id) => window.studyOS.invoke('db:getNoteById', id),
  saveNote: (note) => window.studyOS.invoke('db:saveNote', note),
  deleteNote: (id) => window.studyOS.invoke('db:deleteNote', id),
  getAttachmentsForNote: (noteId) => window.studyOS.invoke('db:getAttachmentsForNote', noteId),

  // Note templates
  getNoteTemplates: () => window.studyOS.invoke('db:getNoteTemplates'),
  createNoteTemplate: (payload) => window.studyOS.invoke('db:createNoteTemplate', payload),
  deleteNoteTemplate: (id) => window.studyOS.invoke('db:deleteNoteTemplate', id),

  // Search
  searchNotes: (query) => window.studyOS.invoke('db:searchNotes', query),

  // Morning reminders
  getReminders: () => window.studyOS.invoke('db:getReminders'),
  createReminder: (payload) => window.studyOS.invoke('db:createReminder', payload),
  toggleReminder: (payload) => window.studyOS.invoke('db:toggleReminder', payload),
  deleteReminder: (id) => window.studyOS.invoke('db:deleteReminder', id),

  // Bell schedule (A/B rotation)
  getBellPeriods: () => window.studyOS.invoke('db:getBellPeriods'),
  createBellPeriod: (period) => window.studyOS.invoke('db:createBellPeriod', period),
  updateBellPeriod: (period) => window.studyOS.invoke('db:updateBellPeriod', period),
  deleteBellPeriod: (id) => window.studyOS.invoke('db:deleteBellPeriod', id),
  getTodaySchedule: (dayCode) => window.studyOS.invoke('db:getTodaySchedule', dayCode),
  getKnownDayCodes: () => window.studyOS.invoke('db:getKnownDayCodes'),
  getTodayDayCode: () => window.studyOS.invoke('db:getTodayDayCode'),
  setTodayDayCode: (code) => window.studyOS.invoke('db:setTodayDayCode', code),
  getDueSoonHomework: () => window.studyOS.invoke('db:getDueSoonHomework'),

  // Daily routine (personal, local-only recurring schedule)
  getRoutineBlocks: () => window.studyOS.invoke('db:getRoutineBlocks'),
  createRoutineBlock: (block) => window.studyOS.invoke('db:createRoutineBlock', block),
  updateRoutineBlock: (block) => window.studyOS.invoke('db:updateRoutineBlock', block),
  deleteRoutineBlock: (id) => window.studyOS.invoke('db:deleteRoutineBlock', id),

  getFlexPrep: (date) => window.studyOS.invoke('db:getFlexPrep', date),
  saveFlexPrep: (payload) => window.studyOS.invoke('db:saveFlexPrep', payload),

  getCanvasItems: (noteId) => window.studyOS.invoke('db:getCanvasItems', noteId),
  createCanvasItem: (item) => window.studyOS.invoke('db:createCanvasItem', item),
  updateCanvasItem: (item) => window.studyOS.invoke('db:updateCanvasItem', item),
  deleteCanvasItem: (id) => window.studyOS.invoke('db:deleteCanvasItem', id),

  // Deadlines
  createDeadline: (deadline) => window.studyOS.invoke('db:createDeadline', deadline),
  getUpcomingDeadlines: () => window.studyOS.invoke('db:getUpcomingDeadlines'),
  completeDeadline: (id) => window.studyOS.invoke('db:completeDeadline', id),
  getStudyBlocksForDay: (isoDate) => window.studyOS.invoke('db:getStudyBlocksForDay', isoDate),

  // Tags
  getAllTags: () => window.studyOS.invoke('db:getAllTags'),
  tagEntity: (payload) => window.studyOS.invoke('db:tagEntity', payload),
  untagEntity: (payload) => window.studyOS.invoke('db:untagEntity', payload),
  getTagged: (tagName) => window.studyOS.invoke('db:getTagged', tagName),
  getTagsForEntity: (entityType, entityId) => window.studyOS.invoke('db:getTagsForEntity', { entityType, entityId }),

  // Settings
  getSetting: (key, sensitive = false) => window.studyOS.invoke('db:getSetting', { key, sensitive }),
  setSetting: (key, value, sensitive = false) => window.studyOS.invoke('db:setSetting', { key, value, sensitive }),

  // Daily Planner
  getPlannerDay: (isoDate) => window.studyOS.invoke('db:getPlannerDay', isoDate),
  getPlannerItemsRange: (startISO, endISO) => window.studyOS.invoke('db:getPlannerItemsRange', { startISO, endISO }),
  createPlannerItem: (item) => window.studyOS.invoke('db:createPlannerItem', item),
  updatePlannerItem: (item) => window.studyOS.invoke('db:updatePlannerItem', item),
  deletePlannerItem: (id) => window.studyOS.invoke('db:deletePlannerItem', id),

  // Files
  pickAttachment: (payload) => window.studyOS.invoke('file:pickAttachment', payload),
  openPath: (filePath) => window.studyOS.invoke('file:openPath', filePath),
  openExternal: (url) => window.studyOS.invoke('shell:openExternal', url),
  pickImage: () => window.studyOS.invoke('file:pickImage'),
  saveImageData: (payload) => window.studyOS.invoke('file:saveImageData', payload),

  // Sync
  generateStudyBlocks: (deadlineId, desiredBlocks) =>
    window.studyOS.invoke('sync:generateStudyBlocks', { deadlineId, desiredBlocks }),
  pushBlocksToGoogle: (deadlineId, title) =>
    window.studyOS.invoke('sync:pushBlocksToGoogle', { deadlineId, title }),

  // ICS calendar sources (per-class calendars, school events, day schedule, etc)
  icsListSources: () => window.studyOS.invoke('ics:listSources'),
  icsCreateSource: (source) => window.studyOS.invoke('ics:createSource', source),
  icsUpdateSource: (source) => window.studyOS.invoke('ics:updateSource', source),
  icsDeleteSource: (id) => window.studyOS.invoke('ics:deleteSource', id),
  icsSyncSource: (id) => window.studyOS.invoke('ics:syncSource', id),
  icsSyncAll: () => window.studyOS.invoke('ics:syncAll'),

  // Google accounts (Calendar + Classroom share one connected-account list).
  // A single call: opens the system browser, runs a local loopback server to
  // catch the redirect, exchanges the code, and resolves once the account is saved.
  googleConnect: (label, calendarOnly = false) => window.studyOS.invoke('google:connect', { label, calendarOnly }),
  // Fired once per connect attempt as soon as the consent URL is built (well
  // before the call above resolves) - lets the UI offer the link as text/a
  // copy button in case auto-launching the OS default browser picks the
  // wrong browser or profile.
  onGoogleAuthUrl: (callback) => window.studyOS.on('google:authUrl', callback),
  googleListAccounts: () => window.studyOS.invoke('google:listAccounts'),
  googleRemoveAccount: (id) => window.studyOS.invoke('google:removeAccount', id),

  // Google Calendar
  googleListCalendars: (accountId) => window.studyOS.invoke('google:listCalendars', accountId),
  googleSetCalendarEnabled: (id, enabled, color) => window.studyOS.invoke('google:setCalendarEnabled', { id, enabled, color }),
  googleSetDefaultPushCalendar: (id) => window.studyOS.invoke('google:setDefaultPushCalendar', id),
  googleGetCalendarSettings: () => window.studyOS.invoke('google:getCalendarSettings'),

  // Google Classroom
  googleListClassroomCourses: (accountId) => window.studyOS.invoke('google:listClassroomCourses', accountId),
  googleSetClassroomCourseEnabled: (id, enabled) => window.studyOS.invoke('google:setClassroomCourseEnabled', { id, enabled }),
  googleGetClassroomSettings: () => window.studyOS.invoke('google:getClassroomSettings'),
  googleSyncClassroomNow: () => window.studyOS.invoke('google:syncClassroomNow'),

  // Unified calendar
  getCalendarEvents: (timeMin, timeMax) => window.studyOS.invoke('calendar:getEvents', { timeMin, timeMax }),
  createCalendarEvent: (payload) => window.studyOS.invoke('calendar:createEvent', payload),
  onCalendarRefresh: (callback) => window.studyOS.on('calendar:refresh', callback),

  // Gemini
  generateStudyGuide: (noteIds) => window.studyOS.invoke('gemini:generateStudyGuide', { noteIds }),
  generatePracticeExam: (noteIds, questionCount = 10) =>
    window.studyOS.invoke('gemini:generatePracticeExam', { noteIds, questionCount }),
  testGeminiKey: () => window.studyOS.invoke('gemini:testKey'),
  geminiAutocomplete: (context) => window.studyOS.invoke('gemini:autocomplete', { context }),

  // Recording
  startRecording: () => window.studyOS.invoke('recording:start'),
  stopRecording: () => window.studyOS.invoke('recording:stop'),
  saveRecording: (payload) => window.studyOS.invoke('recording:save', payload),
  listRecordingsForNote: (noteId) => window.studyOS.invoke('recording:listForNote', noteId),

  // Window
  minimizeToTray: () => window.studyOS.invoke('window:minimizeToTray')
};

export default api;
