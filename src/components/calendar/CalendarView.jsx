import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek
} from 'date-fns';
import api from '../../lib/api.js';
import PlannerItemModal from '../planner/PlannerItemModal.jsx';
import { routineCategoryColor, ROUTINE_LAYER_COLOR } from '../../lib/routineColors.js';

const RANGE_START_HOUR = 6;
const RANGE_END_HOUR = 23;
const PX_PER_HOUR = 56;
const RANGE_START_MIN = RANGE_START_HOUR * 60;
const RANGE_END_MIN = RANGE_END_HOUR * 60;
const TOTAL_HEIGHT = ((RANGE_END_MIN - RANGE_START_MIN) / 60) * PX_PER_HOUR;

const CLASSROOM_COLOR = '#F2B84B';
const MANUAL_COLOR = '#8890A6';
const CLASS_SCHEDULE_COLOR = '#5B8CFF';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Combine a date with an "HH:MM" time string into a real Date on that day. */
function atTime(day, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

/** The visible date range for a given view mode/anchor date - what gets fetched and rendered. */
function rangeFor(mode, anchor) {
  if (mode === 'day') return { start: startOfDay(anchor), end: endOfDay(anchor) };
  if (mode === 'week') return { start: startOfWeek(anchor), end: endOfWeek(anchor) };
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  return { start: startOfWeek(monthStart), end: endOfWeek(monthEnd) };
}

function startOfDay(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function endOfDay(d) {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

export default function CalendarView() {
  const [mode, setMode] = useState('month'); // 'month' | 'week' | 'day'
  const [anchor, setAnchor] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [chips, setChips] = useState([]);
  const [hidden, setHidden] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [modalDate, setModalDate] = useState(null);

  const { start: rangeStart, end: rangeEnd } = useMemo(() => rangeFor(mode, anchor), [mode, anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [googleEvents, deadlines, plannerItems, calendarRows, bellPeriods, routineBlocks] = await Promise.all([
        api.getCalendarEvents(rangeStart.toISOString(), rangeEnd.toISOString()).catch(() => []),
        api.getUpcomingDeadlines().catch(() => []),
        api.getPlannerItemsRange(rangeStart.toISOString(), rangeEnd.toISOString()).catch(() => []),
        api.googleGetCalendarSettings().catch(() => []),
        api.getBellPeriods().catch(() => []),
        api.getRoutineBlocks().catch(() => [])
      ]);

      const unified = [];

      for (const e of googleEvents) {
        unified.push({
          id: `google-${e.calendarRowId}-${e.id}`,
          title: e.title,
          start: new Date(e.start),
          end: new Date(e.end),
          allDay: e.allDay,
          color: e.color || '#5B8CFF',
          chipKey: `google:${e.accountLabel}`,
          chipLabel: e.accountLabel,
          detail: e.calendarSummary
        });
      }

      for (const d of deadlines) {
        const due = new Date(d.due_at);
        if (due < rangeStart || due > rangeEnd) continue;
        const isClassroom = d.source === 'classroom';
        unified.push({
          id: `deadline-${d.id}`,
          title: d.title,
          start: due,
          end: due,
          allDay: false,
          point: true,
          color: isClassroom ? CLASSROOM_COLOR : d.class_color || MANUAL_COLOR,
          chipKey: isClassroom ? 'classroom' : 'manual',
          chipLabel: isClassroom ? 'Classroom' : 'Manual',
          detail: d.type
        });
      }

      for (const item of plannerItems) {
        unified.push({
          id: `planner-${item.id}-${item.start_at}`,
          title: item.title,
          start: new Date(item.start_at),
          end: new Date(item.end_at),
          allDay: false,
          color: item.color || MANUAL_COLOR,
          chipKey: 'manual',
          chipLabel: 'Manual',
          detail: item.category
        });
      }

      // Class schedule (bell_periods, day_type='both') - projected onto every
      // weekday in the visible range, honoring the same `weekdays` restriction
      // db:getTodaySchedule uses (e.g. a period that only meets on Mondays).
      const everydayPeriods = bellPeriods.filter((p) => p.day_type === 'both');
      for (const day of eachDayOfInterval({ start: rangeStart, end: rangeEnd })) {
        const weekday = day.getDay();
        if (weekday === 0 || weekday === 6) continue; // school periods are weekdays only
        for (const p of everydayPeriods) {
          if (p.weekdays && !p.weekdays.split(',').includes(String(weekday))) continue;
          unified.push({
            id: `class-${p.id}-${day.toDateString()}`,
            title: p.name,
            start: atTime(day, p.start_time),
            end: atTime(day, p.end_time),
            allDay: false,
            color: CLASS_SCHEDULE_COLOR,
            chipKey: 'class-schedule',
            chipLabel: 'Classes',
            detail: p.room ? `Rm ${p.room}` : p.teacher
          });
        }
      }

      // Daily routine - projected onto every day in range by day-of-week.
      const routineByDay = {};
      for (const b of routineBlocks) (routineByDay[b.day_type] ||= []).push(b);
      for (const day of eachDayOfInterval({ start: rangeStart, end: rangeEnd })) {
        const dayType = DAY_NAMES[day.getDay()];
        for (const b of routineByDay[dayType] || []) {
          unified.push({
            id: `routine-${b.id}-${day.toDateString()}`,
            title: b.title,
            start: atTime(day, b.start_time),
            end: atTime(day, b.end_time),
            allDay: false,
            color: routineCategoryColor(b.category),
            chipKey: 'routine',
            chipLabel: 'Routine',
            detail: b.category
          });
        }
      }

      unified.sort((a, b) => a.start - b.start);
      setEvents(unified);

      // Chips reflect what's actually enabled/connected, not just what has
      // events in the current range, so "Personal"/"School" stay visible
      // (and toggleable) even on a light week.
      const enabledByAccount = {};
      calendarRows
        .filter((r) => r.enabled)
        .forEach((r) => {
          (enabledByAccount[r.account_label] ||= []).push(r.color);
        });
      const nextChips = [
        { key: 'class-schedule', label: 'Classes', color: CLASS_SCHEDULE_COLOR },
        ...Object.entries(enabledByAccount).map(([label, colors]) => ({
          key: `google:${label}`,
          label,
          color: colors[0] || '#5B8CFF'
        })),
        { key: 'classroom', label: 'Classroom', color: CLASSROOM_COLOR },
        { key: 'routine', label: 'Routine', color: ROUTINE_LAYER_COLOR },
        { key: 'manual', label: 'Manual', color: MANUAL_COLOR }
      ];
      setChips(nextChips);
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    load();
  }, [load]);

  // Main process pings this every ~7 minutes so the view stays fresh without polling itself.
  useEffect(() => {
    const off = api.onCalendarRefresh?.(() => load());
    return () => off?.();
  }, [load]);

  function toggleChip(key) {
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const visibleEvents = useMemo(() => events.filter((e) => !hidden.has(e.chipKey)), [events, hidden]);

  function step(dir) {
    setAnchor((a) => (mode === 'day' ? addDays(a, dir) : mode === 'week' ? addWeeks(a, dir) : addMonths(a, dir)));
  }

  async function handleSavePlannerItem(payload) {
    if (payload.id) await api.updatePlannerItem(payload);
    else await api.createPlannerItem(payload);
    setModalDate(null);
    load();
  }

  async function handleDeletePlannerItem(id) {
    await api.deletePlannerItem(id);
    setModalDate(null);
    load();
  }

  function selectDay(d) {
    setAnchor(d);
    setMode('day');
  }

  const rangeLabel =
    mode === 'day'
      ? format(anchor, 'EEEE, MMMM d, yyyy')
      : mode === 'week'
      ? `${format(rangeStart, 'MMM d')} – ${format(rangeEnd, 'MMM d, yyyy')}`
      : format(anchor, 'MMMM yyyy');

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="label-eyebrow mb-1">Calendar</p>
          <h1 className="font-display text-2xl font-semibold text-base-text">{rangeLabel}</h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-base-card rounded-lg border border-base-border">
            <IconButton onClick={() => step(-1)}>
              <ChevronLeft size={15} />
            </IconButton>
            <button onClick={() => setAnchor(new Date())} className="px-3 py-2 text-xs font-medium text-base-muted hover:text-base-text">
              Today
            </button>
            <IconButton onClick={() => step(1)}>
              <ChevronRight size={15} />
            </IconButton>
          </div>

          <div className="flex items-center bg-base-card rounded-full p-1 border border-base-border">
            {['month', 'week', 'day'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                  mode === m ? 'bg-accent text-white' : 'text-base-muted hover:text-base-text'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <IconButton onClick={load} title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </IconButton>

          <button
            onClick={() => setModalDate(mode === 'month' ? new Date() : anchor)}
            className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg bg-accent text-white hover:bg-accent-soft transition-colors"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {chips.map((c) => {
            const isHidden = hidden.has(c.key);
            return (
              <button
                key={c.key}
                onClick={() => toggleChip(c.key)}
                className={`flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full border transition-opacity ${
                  isHidden ? 'opacity-40 border-base-border text-base-muted' : 'border-base-border text-base-text'
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="panel overflow-hidden">
        {/* The one deliberately-polished motion moment in the app: switching
            month/week/day or paging the date range cross-fades and settles
            in rather than snapping - everywhere else motion stays quick and quiet. */}
        <div key={`${mode}-${rangeStart.toISOString()}`} className="calendar-view-transition">
          {mode === 'month' && <MonthGrid anchor={anchor} events={visibleEvents} onSelectDay={selectDay} />}
          {mode === 'week' && (
            <WeekGrid rangeStart={rangeStart} events={visibleEvents} onAddAt={(d) => setModalDate(d)} />
          )}
          {mode === 'day' && <DayGrid day={anchor} events={visibleEvents} onAddAt={(d) => setModalDate(d)} />}
        </div>
      </div>

      {modalDate && (
        <PlannerItemModal
          date={modalDate}
          item={null}
          onClose={() => setModalDate(null)}
          onSave={handleSavePlannerItem}
          onDelete={handleDeletePlannerItem}
        />
      )}
    </div>
  );
}

// ---------- Month grid ----------

function MonthGrid({ anchor, events, onSelectDay }) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(anchor);
    const monthEnd = endOfMonth(anchor);
    return eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(monthEnd) });
  }, [anchor]);

  const today = new Date();

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-base-border">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="px-2 py-2 text-xs font-medium text-base-muted text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayEvents = events
            .filter((e) => isSameDay(e.start, day) || (e.start <= day && e.end >= day && !e.point))
            .sort((a, b) => a.start - b.start);
          const isCurrentMonth = isSameMonth(day, anchor);
          const isToday = isSameDay(day, today);
          const shown = dayEvents.slice(0, 3);
          const overflow = dayEvents.length - shown.length;

          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDay(day)}
              className={`min-h-[92px] p-2 border-b border-r border-base-border/60 text-left align-top ${
                isCurrentMonth ? '' : 'opacity-40'
              } hover:bg-base-card/60`}
            >
              <span
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium ${
                  isToday ? 'bg-accent text-white' : 'text-base-muted'
                }`}
              >
                {format(day, 'd')}
              </span>
              <div className="mt-1 space-y-1">
                {shown.map((e) => (
                  <div
                    key={e.id}
                    className="text-xs px-2 py-1 rounded truncate"
                    style={{ background: `${e.color}22`, color: e.color }}
                    title={e.title}
                  >
                    {e.title}
                  </div>
                ))}
                {overflow > 0 && <div className="text-xs text-base-muted px-2">+{overflow} more</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Week / Day timeline grids ----------

function minutesOfDay(d) {
  return d.getHours() * 60 + d.getMinutes();
}

function toBlockStyle(start, end) {
  const startMin = Math.max(minutesOfDay(start), RANGE_START_MIN);
  const endMin = Math.min(Math.max(minutesOfDay(end), startMin + 15), RANGE_END_MIN);
  const top = ((startMin - RANGE_START_MIN) / 60) * PX_PER_HOUR;
  const height = Math.max(((endMin - startMin) / 60) * PX_PER_HOUR, 18);
  return { top, height };
}

/**
 * With the class schedule + daily routine both populating every school day,
 * plain full-width stacking would make same-time blocks illegible. Groups
 * events into clusters of mutually-overlapping times, greedily assigns each
 * a column within its cluster, and returns each event annotated with
 * _col/_cols so the caller can lay them out side by side.
 */
function layoutDayEvents(events) {
  const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end);
  const clusters = [];
  let current = [];
  let clusterEnd = null;
  for (const e of sorted) {
    if (current.length === 0 || e.start < clusterEnd) {
      current.push(e);
      clusterEnd = clusterEnd === null || e.end > clusterEnd ? e.end : clusterEnd;
    } else {
      clusters.push(current);
      current = [e];
      clusterEnd = e.end;
    }
  }
  if (current.length) clusters.push(current);

  const result = [];
  for (const cluster of clusters) {
    const columnEnds = []; // last event's end time in each column, in cluster order
    const withCol = cluster.map((e) => {
      let col = columnEnds.findIndex((endTime) => endTime <= e.start);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(e.end);
      } else {
        columnEnds[col] = e.end;
      }
      return { ...e, _col: col };
    });
    const cols = columnEnds.length;
    for (const e of withCol) result.push({ ...e, _cols: cols });
  }
  return result;
}

function HourLabels() {
  const hours = [];
  for (let h = RANGE_START_HOUR; h <= RANGE_END_HOUR; h++) hours.push(h);
  return (
    <div className="w-14 shrink-0 border-r border-base-border" style={{ height: TOTAL_HEIGHT }}>
      {hours.map((h) => (
        <div key={h} className="text-xs text-base-muted font-mono pl-2 -translate-y-1/2" style={{ height: PX_PER_HOUR }}>
          {h % 12 === 0 ? 12 : h % 12}
          {h >= 12 ? 'p' : 'a'}
        </div>
      ))}
    </div>
  );
}

function DayColumn({ day, events, onAddAt, narrow }) {
  const hours = [];
  for (let h = RANGE_START_HOUR; h <= RANGE_END_HOUR; h++) hours.push(h);
  const rawDayEvents = events.filter((e) => isSameDay(e.start, day) && !e.point);
  const dayEvents = useMemo(() => layoutDayEvents(rawDayEvents), [rawDayEvents]);
  const pointEvents = events.filter((e) => e.point && isSameDay(e.start, day));

  return (
    <div className="relative flex-1 min-w-0 border-r border-base-border/60 last:border-r-0" style={{ height: TOTAL_HEIGHT }}>
      {hours.map((h, i) => (
        <div key={h} className="absolute left-0 right-0 border-t border-base-border/40" style={{ top: i * PX_PER_HOUR }} />
      ))}
      <button
        className="absolute inset-0 z-0"
        onDoubleClick={() => {
          const d = new Date(day);
          d.setHours(15, 0, 0, 0);
          onAddAt(d);
        }}
        title="Double-click to add"
      />
      {pointEvents.map((e, i) => (
        <div
          key={e.id}
          className="absolute left-1 right-1 z-10 text-xs px-2 py-1 rounded truncate"
          style={{ top: i * 16, background: `${e.color}33`, color: e.color, border: `1px solid ${e.color}66` }}
          title={e.title}
        >
          {e.title}
        </div>
      ))}
      {dayEvents.map((e) => {
        const { top, height } = toBlockStyle(e.start, e.end);
        const cols = e._cols || 1;
        const widthPct = 100 / cols;
        return (
          <div
            key={e.id}
            className="absolute z-10 rounded-md px-2 py-1 overflow-hidden"
            style={{
              top,
              height,
              left: `calc(${e._col * widthPct}% + 2px)`,
              width: `calc(${widthPct}% - 4px)`,
              background: `${e.color}22`,
              border: `1px solid ${e.color}66`
            }}
            title={e.title}
          >
            <p className={`font-medium truncate ${narrow ? 'text-xs' : 'text-xs'}`} style={{ color: e.color }}>
              {e.title}
            </p>
            {!narrow && (
              <p className="text-xs text-base-muted truncate">
                {format(e.start, 'h:mm a')}–{format(e.end, 'h:mm a')}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WeekGrid({ rangeStart, events, onAddAt }) {
  const days = useMemo(() => eachDayOfInterval({ start: rangeStart, end: addDays(rangeStart, 6) }), [rangeStart]);
  const today = new Date();

  return (
    <div className="flex">
      <div className="flex flex-col">
        <div className="h-8" />
        <HourLabels />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex h-8 shrink-0 border-b border-base-border">
          {days.map((d) => (
            <div key={d.toISOString()} className="flex-1 min-w-0 text-center text-xs font-medium py-2">
              <span className={isSameDay(d, today) ? 'text-accent' : 'text-base-muted'}>{format(d, 'EEE d')}</span>
            </div>
          ))}
        </div>
        <div className="flex">
          {days.map((d) => (
            <DayColumn key={d.toISOString()} day={d} events={events} onAddAt={onAddAt} narrow />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayGrid({ day, events, onAddAt }) {
  return (
    <div className="flex">
      <HourLabels />
      <DayColumn day={day} events={events} onAddAt={onAddAt} />
    </div>
  );
}

function IconButton({ children, onClick, title }) {
  return (
    <button onClick={onClick} title={title} className="w-8 h-8 flex items-center justify-center text-base-muted hover:text-base-text">
      {children}
    </button>
  );
}
