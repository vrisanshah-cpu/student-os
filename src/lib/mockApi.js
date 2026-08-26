/**
 * Dev-only stand-in for the Electron preload bridge (window.studyOS), so the
 * app can render in a plain browser for visual/design review. Only ever
 * activates when window.studyOS is missing - the real Electron app always
 * defines it via preload.js, so this is inert there. Not used by the built
 * app in any real sense; purely a design-review aid.
 */
const now = new Date();
const iso = (d) => d.toISOString();
const at = (h, m = 0, dayOffset = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return iso(d);
};

const SAMPLE_CLASSES = [
  { id: 1, name: 'Algebra II', color: '#5B8CFF', powerschool_period: 'Period 1' },
  { id: 2, name: 'English Literature', color: '#4FD1A5', powerschool_period: 'Period 2' },
  { id: 3, name: 'Chemistry', color: '#F2B84B', powerschool_period: 'Period 3' },
  { id: 4, name: 'World History', color: '#E56B6B', powerschool_period: 'Period 4' }
];

const SAMPLE_NOTES_TREE = SAMPLE_CLASSES.map((c, i) => ({
  ...c,
  units: [
    {
      id: i + 1,
      class_id: c.id,
      name: 'Unit 1',
      topics: [
        {
          id: i + 1,
          unit_id: i + 1,
          name: 'Introduction',
          notes: [
            { id: i * 2 + 1, topic_id: i + 1, title: 'Lecture notes', updated_at: iso(now) },
            { id: i * 2 + 2, topic_id: i + 1, title: 'Homework review', updated_at: iso(now) }
          ]
        }
      ]
    }
  ]
}));

const SAMPLE_DEADLINES = [
  { id: 1, class_id: 1, class_name: 'Algebra II', class_color: '#5B8CFF', title: 'Chapter 4 problem set', type: 'homework', due_at: at(23, 59, 1), completed: 0, source: 'manual' },
  { id: 2, class_id: 3, class_name: 'Chemistry', class_color: '#F2B84B', title: 'Lab report', type: 'homework', due_at: at(23, 59, 2), completed: 0, source: 'manual' },
  { id: 3, class_id: 2, class_name: 'English Literature', class_color: '#4FD1A5', title: 'Essay draft', type: 'project', due_at: at(23, 59, 4), completed: 0, source: 'manual' }
];

const SAMPLE_CALENDAR_ROWS = [
  { id: 1, account_id: 1, account_label: 'Personal', account_email: 'you@gmail.com', calendar_id: 'primary', summary: 'Personal', enabled: 1, color: '#5B8CFF', is_default_push: 1 },
  { id: 2, account_id: 2, account_label: 'School', account_email: 'you@school.edu', calendar_id: 'school', summary: 'School Events', enabled: 1, color: '#F2B84B', is_default_push: 0 }
];

const SAMPLE_ACCOUNTS = [
  { id: 1, label: 'Personal', email: 'you@gmail.com', created_at: iso(now) },
  { id: 2, label: 'School', email: 'you@school.edu', created_at: iso(now) }
];

const SAMPLE_CLASSROOM_COURSES = [
  { id: 1, account_id: 2, account_label: 'School', account_email: 'you@school.edu', course_id: 'c1', name: 'Algebra II', enabled: 1 },
  { id: 2, account_id: 2, account_label: 'School', account_email: 'you@school.edu', course_id: 'c2', name: 'World History', enabled: 0 }
];

const SAMPLE_GOOGLE_EVENTS = [
  { id: 'e1', title: 'Soccer practice', start: at(16, 0), end: at(17, 30), allDay: false, source: 'google', accountLabel: 'Personal', calendarRowId: 1, calendarSummary: 'Personal', color: '#5B8CFF' },
  { id: 'e2', title: 'Club meeting', start: at(12, 0, 1), end: at(12, 45, 1), allDay: false, source: 'google', accountLabel: 'School', calendarRowId: 2, calendarSummary: 'School Events', color: '#F2B84B' }
];

const SAMPLE_BELL_PERIODS = [
  { id: 1, day_type: 'both', name: 'Algebra II', start_time: '08:00', end_time: '08:50', class_id: 1, room: '204', teacher: 'Ms. Rivera', weekdays: '', kind: 'class', sort_order: 0 },
  { id: 2, day_type: 'both', name: 'English Literature', start_time: '08:55', end_time: '09:45', class_id: 2, room: '118', teacher: 'Mr. Chen', weekdays: '', kind: 'class', sort_order: 1 },
  { id: 3, day_type: 'both', name: 'Chemistry', start_time: '09:50', end_time: '10:40', class_id: 3, room: 'SCI-3', teacher: 'Dr. Patel', weekdays: '', kind: 'class', sort_order: 2 }
];

const SAMPLE_ROUTINE = [
  { id: 1, day_type: 'monday', title: 'Study block — homework', category: 'study', start_time: '15:45', end_time: '17:15', sort_order: 0 },
  { id: 2, day_type: 'monday', title: 'Dinner', category: 'afternoon', start_time: '18:30', end_time: '19:00', sort_order: 1 },
  { id: 3, day_type: 'monday', title: 'Wind down', category: 'winddown', start_time: '20:00', end_time: '21:00', sort_order: 2 }
];

function respond(channel) {
  switch (channel) {
    case 'db:getDashboardData':
      return { upcomingDeadlines: SAMPLE_DEADLINES, todaysStudyBlocks: [], todaysPlannerItems: [], classes: SAMPLE_CLASSES };
    case 'db:getClasses':
      return SAMPLE_CLASSES;
    case 'db:getNotesTree':
      return SAMPLE_NOTES_TREE;
    case 'db:getNoteById':
      return { id: 1, topic_id: 1, title: 'Lecture notes', body_html: '<h2>Quadratic formula</h2><p>For ax² + bx + c = 0, the roots are given by the quadratic formula.</p><p>Practice problems 1-12 due Thursday.</p>', mindmap_json: '', quizlet_url: '', drive_url: '' };
    case 'db:getUpcomingDeadlines':
      return SAMPLE_DEADLINES;
    case 'db:getDueSoonHomework':
      return SAMPLE_DEADLINES.slice(0, 1);
    case 'db:getPlannerDay':
      return { plannerItems: [{ id: 1, title: 'Soccer practice', notes: '', category: 'personal', color: '#8890A6', start_at: at(16, 0), end_at: at(17, 30), recurrence: 'none' }], studyBlocks: [], deadlinesDueToday: [] };
    case 'db:getPlannerItemsRange':
      return [];
    case 'db:getBellPeriods':
      return SAMPLE_BELL_PERIODS;
    case 'db:getRoutineBlocks':
      return SAMPLE_ROUTINE;
    case 'db:getReminders':
      return [
        { id: 1, text: 'Pack gym clothes', recurring: 1, done: 0 },
        { id: 2, text: 'Bring permission slip', recurring: 0, done: 0 }
      ];
    case 'db:getAllTags':
      return [{ id: 1, name: 'midterm' }];
    case 'db:getNoteTemplates':
      return [];
    case 'db:getKnownDayCodes':
      return [];
    case 'db:getTodayDayCode':
      return { code: null, isToday: false, suggested: null };
    case 'db:getTodaySchedule':
      return { dayType: null, periods: SAMPLE_BELL_PERIODS };
    case 'db:getFlexPrep':
      return null;
    case 'db:getCanvasItems':
      return [];
    case 'db:getAttachmentsForNote':
      return [];
    case 'db:getTagsForEntity':
      return [];
    case 'db:searchNotes':
      return [];
    case 'db:getSetting':
      return null;
    case 'google:listAccounts':
      return SAMPLE_ACCOUNTS;
    case 'google:getCalendarSettings':
      return SAMPLE_CALENDAR_ROWS;
    case 'google:getClassroomSettings':
      return SAMPLE_CLASSROOM_COURSES;
    case 'calendar:getEvents':
      return SAMPLE_GOOGLE_EVENTS;
    case 'recording:listForNote':
      return [];
    default:
      return channel.startsWith('db:get') || channel.startsWith('google:list') ? [] : null;
  }
}

export function installMockBridge() {
  if (typeof window === 'undefined' || window.studyOS) return;
  window.studyOS = {
    invoke: (channel) => Promise.resolve(respond(channel)),
    on: () => () => {}
  };
}
