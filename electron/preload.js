const { contextBridge, ipcRenderer } = require('electron');

// Whitelist of channels the renderer is allowed to invoke.
// Keeping this explicit (rather than exposing ipcRenderer directly)
// is what makes contextIsolation actually meaningful.
const invokeChannels = [
  'db:getDashboardData',
  'db:getClasses',
  'db:createClass',
  'db:getNotesTree',
  'db:createUnit',
  'db:createTopic',
  'db:saveNote',
  'db:getNoteById',
  'db:deleteNote',
  'db:createDeadline',
  'db:getUpcomingDeadlines',
  'db:completeDeadline',
  'db:getStudyBlocksForDay',
  'db:getTagged',
  'db:getAllTags',
  'db:tagEntity',
  'db:untagEntity',
  'db:getTagsForEntity',
  'db:setSetting',
  'db:getSetting',
  'db:getPlannerDay',
  'db:getPlannerItemsRange',
  'db:createPlannerItem',
  'db:updatePlannerItem',
  'db:deletePlannerItem',
  'db:getAttachmentsForNote',

  'db:getNoteTemplates',
  'db:createNoteTemplate',
  'db:deleteNoteTemplate',

  'db:searchNotes',

  'db:getReminders',
  'db:createReminder',
  'db:toggleReminder',
  'db:deleteReminder',

  'db:getBellPeriods',
  'db:createBellPeriod',
  'db:updateBellPeriod',
  'db:deleteBellPeriod',
  'db:getTodaySchedule',
  'db:getKnownDayCodes',
  'db:getTodayDayCode',
  'db:setTodayDayCode',
  'db:getDueSoonHomework',

  'db:getRoutineBlocks',
  'db:createRoutineBlock',
  'db:updateRoutineBlock',
  'db:deleteRoutineBlock',

  'db:getFlexPrep',
  'db:saveFlexPrep',

  'db:getCanvasItems',
  'db:createCanvasItem',
  'db:updateCanvasItem',
  'db:deleteCanvasItem',

  'file:pickAttachment',
  'file:openPath',
  'shell:openExternal',
  'file:pickImage',
  'file:saveImageData',

  'sync:powerschool',
  'sync:generateStudyBlocks',
  'sync:pushBlocksToGoogle',

  'google:connect',
  'google:listAccounts',
  'google:removeAccount',
  'google:listCalendars',
  'google:setCalendarEnabled',
  'google:setDefaultPushCalendar',
  'google:getCalendarSettings',
  'google:listClassroomCourses',
  'google:setClassroomCourseEnabled',
  'google:getClassroomSettings',
  'google:syncClassroomNow',

  'calendar:getEvents',
  'calendar:createEvent',

  'gemini:generateStudyGuide',
  'gemini:generatePracticeExam',
  'gemini:testKey',
  'gemini:autocomplete',

  'recording:start',
  'recording:stop',
  'recording:save',
  'recording:listForNote',

  'window:minimizeToTray'
];

// One-way pushes from main -> renderer (main process fires these on a
// timer; the renderer just listens). Kept to an explicit whitelist for the
// same reason invokeChannels is - contextIsolation only means something if
// the bridged surface is deliberately narrow.
const pushChannels = ['calendar:refresh'];

contextBridge.exposeInMainWorld('studyOS', {
  invoke: (channel, ...args) => {
    if (!invokeChannels.includes(channel)) {
      throw new Error(`Blocked attempt to invoke unlisted IPC channel: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, callback) => {
    if (!pushChannels.includes(channel)) {
      throw new Error(`Blocked attempt to listen on unlisted IPC channel: ${channel}`);
    }
    const listener = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
