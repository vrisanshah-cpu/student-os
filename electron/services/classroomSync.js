const { google } = require('googleapis');

/**
 * ---- Google Classroom sync ----
 * Read-only: courses -> coursework -> due dates. Uses the same OAuth client
 * and connected-account tokens as calendarSync (the consent screen requests
 * both Calendar and Classroom scopes together).
 */

async function listCourses(oAuth2Client) {
  const classroom = google.classroom({ version: 'v1', auth: oAuth2Client });
  const res = await classroom.courses.list({ courseStates: ['ACTIVE'], pageSize: 100 });
  return (res.data.courses || []).map((c) => ({ courseId: c.id, name: c.name }));
}

function classifyCourseWorkType(workType = '') {
  if (workType === 'SHORT_ANSWER_QUESTION' || workType === 'MULTIPLE_CHOICE_QUESTION') return 'homework';
  return 'homework';
}

/** courseWork due date/time -> a single JS Date, or null if the assignment has no due date. */
function dueDateFrom(cw) {
  if (!cw.dueDate) return null;
  const { year, month, day } = cw.dueDate;
  const { hours = 23, minutes = 59 } = cw.dueTime || {};
  return new Date(Date.UTC(year, month - 1, day, hours, minutes));
}

/**
 * Returns coursework mapped into the same shape the caller upserts into the
 * `deadlines` table elsewhere in this app (title/type/due_at/source/external_uid),
 * skipping anything without a due date since there's nothing to schedule.
 */
async function listCourseWork(oAuth2Client, courseId, courseName) {
  const classroom = google.classroom({ version: 'v1', auth: oAuth2Client });
  const res = await classroom.courses.courseWork.list({ courseId, courseStates: ['PUBLISHED'], pageSize: 100 });
  return (res.data.courseWork || [])
    .map((cw) => {
      const due = dueDateFrom(cw);
      if (!due) return null;
      return {
        title: courseName ? `${courseName}: ${cw.title}` : cw.title,
        type: classifyCourseWorkType(cw.workType),
        due_at: due.toISOString(),
        source: 'classroom',
        external_uid: `classroom:${courseId}:${cw.id}`
      };
    })
    .filter(Boolean);
}

module.exports = { listCourses, listCourseWork };
