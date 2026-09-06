const ICAL = require('ical.js');
const { google } = require('googleapis');
const https = require('https');

/**
 * ---- ICS calendar sync (PowerSchool, per-class school calendars, school-
 * wide events, a rotating day-schedule feed, etc) ----
 * Any of these expose a "subscribe"/"secret address" ICS feed URL. We fetch
 * it, parse VEVENTs, and map them into full calendar-event shape (title,
 * start, end, all-day) - the caller decides how to store/classify them.
 */
function fetchICS(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) {
            reject(new Error('Too many redirects fetching that calendar.'));
            return;
          }
          fetchICS(res.headers.location, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          res.resume(); // drain so the socket can be reused/closed cleanly
          reject(new Error(`That calendar returned an error (HTTP ${res.statusCode}) - check the URL is right and still shared.`));
          return;
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ body: data, contentType: res.headers['content-type'] || '' }));
      })
      .on('error', (err) => reject(new Error(`Could not reach that calendar (${err.message}).`)));
  });
}

/** A light heuristic, not an enforced enum - just picks a nicer default label than "event" when a title is obviously an assignment. */
function classifyEventType(summary = '') {
  const s = summary.toLowerCase();
  if (/(exam|test|midterm|final)/.test(s)) return 'exam';
  if (/(project|essay|paper)/.test(s)) return 'project';
  if (/(homework|hw|assignment|due)/.test(s)) return 'homework';
  return 'event';
}

/**
 * Fetches and parses one ICS feed into full calendar-event objects (not yet
 * tied to any particular source/table). A URL that isn't publicly shared
 * (or was pasted wrong) commonly returns an HTML sign-in/error page instead
 * of calendar data - ical.js throws a confusing internal error deep in its
 * parser when handed that, so we check the shape of the response first and
 * fail with a clear message before ever calling into ical.js.
 */
async function fetchIcsEvents(icsUrl) {
  let body, contentType;
  try {
    ({ body, contentType } = await fetchICS(icsUrl));
  } catch (e) {
    throw e instanceof Error ? e : new Error('Could not reach that calendar.');
  }

  const looksLikeIcs = body.trimStart().slice(0, 15).toUpperCase().startsWith('BEGIN:VCALENDAR');
  const looksLikeHtml = /^\s*<(!doctype|html)/i.test(body);
  if (!looksLikeIcs || looksLikeHtml || /text\/html/i.test(contentType)) {
    throw new Error("This calendar didn't return valid data - it may not be publicly shared, or the URL may be wrong.");
  }

  let comp, vevents;
  try {
    const jcalData = ICAL.parse(body);
    comp = new ICAL.Component(jcalData);
    vevents = comp.getAllSubcomponents('vevent');
  } catch {
    throw new Error("This calendar's data couldn't be read - it may be corrupted or in an unsupported format.");
  }

  const events = [];
  for (const ve of vevents) {
    try {
      const event = new ICAL.Event(ve);
      if (!event.startDate) continue; // a malformed single event shouldn't sink the whole feed
      const isAllDay = Boolean(event.startDate.isDate);
      const end = event.endDate || event.startDate;
      events.push({
        title: event.summary || '(untitled event)',
        start_at: event.startDate.toJSDate().toISOString(),
        end_at: end.toJSDate().toISOString(),
        allDay: isAllDay,
        type: classifyEventType(event.summary),
        external_uid: event.uid
      });
    } catch {
      // Skip just this one malformed VEVENT rather than failing the whole sync.
    }
  }
  return events;
}


/**
 * ---- Google Calendar 2-way sync ----
 * Uses OAuth2 (installed-app flow). The user provides a client_id/secret
 * from their own Google Cloud project (free tier is plenty for this use).
 * Tokens are persisted per-account in the google_accounts table, encrypted
 * with Electron's safeStorage in main.js before being written to disk.
 *
 * One OAuth client (one Google Cloud project) is shared across every
 * connected account - what's per-account is just the token set, so a
 * student can connect both their personal Gmail and their school Workspace
 * account through the same consent screen setup.
 */

// Calendar *and* Classroom scopes are requested together by default so a
// single consent flow covers both features for whichever account the
// student connects. Some school Workspace admins restrict which OAuth
// scopes an unverified/internal app can request per-domain (often
// Classroom specifically, since it touches student data) without
// restricting Calendar - so a narrower Calendar-only scope set is also
// available as a fallback when the bundled request gets blocked outright.
const OAUTH_SCOPES_FULL = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
];

const OAUTH_SCOPES_CALENDAR_ONLY = ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/userinfo.email'];

function buildOAuthClient(clientId, clientSecret, redirectUri) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getAuthUrl(oAuth2Client, scopes = OAUTH_SCOPES_FULL) {
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token on every connect, even for a Google account connected before
    scope: scopes
  });
}

async function getAccountEmail(oAuth2Client) {
  const oauth2 = google.oauth2({ version: 'v2', auth: oAuth2Client });
  const res = await oauth2.userinfo.get();
  return res.data.email || null;
}

async function getFreeBusy(oAuth2Client, timeMin, timeMax, calendarId = 'primary') {
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }]
    }
  });
  const busy = res.data.calendars[calendarId].busy || [];
  return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

async function pushStudyBlockToCalendar(oAuth2Client, block, title, calendarId = 'primary') {
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `Study Block: ${title}`,
      start: { dateTime: block.start.toISOString() },
      end: { dateTime: block.end.toISOString() },
      colorId: '9' // blueberry - visually distinct from class events
    }
  });
  return res.data.id;
}

/** Every calendar (not just "primary") the account can see - a school calendar is often a secondary one. */
async function listCalendars(oAuth2Client) {
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
  const res = await calendar.calendarList.list({ maxResults: 250 });
  return (res.data.items || []).map((c) => ({
    calendarId: c.id,
    summary: c.summaryOverride || c.summary,
    primary: Boolean(c.primary),
    backgroundColor: c.backgroundColor || null
  }));
}

async function getEventsForCalendar(oAuth2Client, calendarId, timeMin, timeMax) {
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
  const res = await calendar.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250
  });
  return (res.data.items || [])
    .filter((e) => e.status !== 'cancelled' && (e.start?.dateTime || e.start?.date))
    .map((e) => ({
      id: e.id,
      title: e.summary || '(untitled event)',
      start: e.start.dateTime || e.start.date,
      end: e.end?.dateTime || e.end?.date || e.start.dateTime || e.start.date,
      allDay: Boolean(e.start.date && !e.start.dateTime),
      location: e.location || null,
      htmlLink: e.htmlLink || null
    }));
}

async function createEvent(oAuth2Client, calendarId, { title, start, end, description, allDay }) {
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
  const requestBody = { summary: title, description: description || undefined };
  if (allDay) {
    requestBody.start = { date: start.toISOString().slice(0, 10) };
    requestBody.end = { date: end.toISOString().slice(0, 10) };
  } else {
    requestBody.start = { dateTime: start.toISOString() };
    requestBody.end = { dateTime: end.toISOString() };
  }
  const res = await calendar.events.insert({ calendarId, requestBody });
  return res.data.id;
}

module.exports = {
  fetchIcsEvents,
  buildOAuthClient,
  getAuthUrl,
  getAccountEmail,
  getFreeBusy,
  pushStudyBlockToCalendar,
  listCalendars,
  getEventsForCalendar,
  createEvent,
  OAUTH_SCOPES_FULL,
  OAUTH_SCOPES_CALENDAR_ONLY
};
