/**
 * Deterministic Study Block Scheduler
 * ------------------------------------
 * Pure, testable logic: given an exam date and a list of busy intervals
 * (from Google Calendar free/busy + existing local events), find open
 * gaps and pack them with 45-minute study blocks separated by 10-minute
 * breaks, working backward from the exam date. No AI/LLM call involved.
 */

const STUDY_BLOCK_MIN = 45;
const BREAK_MIN = 10;
const DAY_START_HOUR = 15; // don't schedule study blocks before 3pm (school hours)
const DAY_END_HOUR = 21;   // or after 9pm

function toMinutes(date) {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * @param {Date} rangeStart - earliest date/time to consider (e.g. today)
 * @param {Date} examDate - the exam's date/time; scheduling stops here
 * @param {{start: Date, end: Date}[]} busyIntervals - events already on the calendar
 * @param {number} desiredBlocks - how many 45-min study blocks to try to fit
 * @returns {{start: Date, end: Date}[]} proposed study blocks, earliest first
 */
function scheduleStudyBlocks(rangeStart, examDate, busyIntervals, desiredBlocks = 4) {
  const busy = [...busyIntervals].sort((a, b) => a.start - b.start);
  const blocks = [];

  // Walk day by day from rangeStart up to (but not including) the exam day,
  // collecting free slots within school-appropriate hours.
  const cursorDay = new Date(rangeStart);
  cursorDay.setHours(0, 0, 0, 0);

  while (cursorDay < examDate && blocks.length < desiredBlocks) {
    const dayStart = new Date(cursorDay);
    dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
    const dayEnd = new Date(cursorDay);
    dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);

    // Clip the window if this is "today" (don't schedule in the past)
    const windowStart = dayStart < rangeStart ? new Date(rangeStart) : dayStart;
    const windowEnd = dayEnd > examDate ? new Date(examDate) : dayEnd;

    if (windowStart < windowEnd) {
      const dayBusy = busy.filter((b) => b.end > windowStart && b.start < windowEnd);
      const freeSlots = subtractBusyFromWindow(windowStart, windowEnd, dayBusy);

      for (const slot of freeSlots) {
        packSlotWithBlocks(slot, blocks, desiredBlocks);
        if (blocks.length >= desiredBlocks) break;
      }
    }

    cursorDay.setDate(cursorDay.getDate() + 1);
  }

  return blocks;
}

/** Subtract busy intervals from a single window, returning free sub-windows. */
function subtractBusyFromWindow(windowStart, windowEnd, busyIntervals) {
  let free = [{ start: windowStart, end: windowEnd }];

  for (const busy of busyIntervals) {
    const next = [];
    for (const slot of free) {
      if (busy.end <= slot.start || busy.start >= slot.end) {
        next.push(slot); // no overlap
        continue;
      }
      if (busy.start > slot.start) next.push({ start: slot.start, end: busy.start });
      if (busy.end < slot.end) next.push({ start: busy.end, end: slot.end });
    }
    free = next;
  }

  return free;
}

/** Greedily pack (45min study + 10min break) units into a free slot. */
function packSlotWithBlocks(slot, blocks, desiredBlocks) {
  let cursor = new Date(slot.start);
  const unitMs = (STUDY_BLOCK_MIN + BREAK_MIN) * 60 * 1000;
  const studyMs = STUDY_BLOCK_MIN * 60 * 1000;

  while (blocks.length < desiredBlocks) {
    const blockEnd = new Date(cursor.getTime() + studyMs);
    if (blockEnd > slot.end) break;
    blocks.push({ start: new Date(cursor), end: blockEnd });
    cursor = new Date(cursor.getTime() + unitMs);
  }
}

module.exports = { scheduleStudyBlocks, STUDY_BLOCK_MIN, BREAK_MIN };
