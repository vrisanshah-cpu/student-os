import { useEffect, useState } from 'react';
import { CalendarClock, BookOpen, PenLine, AlertCircle, Check, Coffee, Utensils, Users } from 'lucide-react';
import api from '../../lib/api.js';

const TYPE_META = {
  period: { icon: CalendarClock, className: 'text-base-muted bg-base-card' },
  study: { icon: BookOpen, className: 'text-accent bg-accent/10' },
  planner: { icon: PenLine, className: 'text-accent-good bg-accent-good/10' },
  deadline: { icon: AlertCircle, className: 'text-accent-danger bg-accent-danger/10' }
};

const KIND_META = {
  break: { icon: Coffee, className: 'text-base-muted bg-base-card' },
  lunch: { icon: Utensils, className: 'text-accent-warn bg-accent-warn/10' },
  flex: { icon: Users, className: 'text-accent-good bg-accent-good/10' },
  advisory: { icon: Users, className: 'text-accent-good bg-accent-good/10' },
  class: { icon: CalendarClock, className: 'text-base-muted bg-base-card' }
};

const FLEX_TAGS = ['Teacher Conference', 'Study Group', 'Homework', 'Peer Tutoring'];
const ROW_HEIGHT = 60;

function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function timeFromHHMM(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function TodayTimeline({ studyBlocks = [], plannerItems = [], deadlines = [] }) {
  const [dayCode, setDayCode] = useState({ code: null, isToday: false, suggested: null });
  const [periods, setPeriods] = useState([]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    api.getTodayDayCode().then(setDayCode);
  }, []);

  useEffect(() => {
    if (dayCode.isToday && dayCode.code) {
      api.getTodaySchedule(dayCode.code).then((r) => setPeriods(r.periods));
    }
  }, [dayCode.isToday, dayCode.code]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  async function confirmDayCode(code) {
    if (!code.trim()) return;
    await api.setTodayDayCode(code.trim());
    const fresh = await api.getTodayDayCode();
    setDayCode(fresh);
  }

  if (!dayCode.isToday) {
    return <DayCodePicker suggested={dayCode.suggested} onConfirm={confirmDayCode} />;
  }

  const items = [
    ...periods.map((p) => ({
      type: 'period',
      kind: p.kind || 'class',
      key: `period-${p.id}`,
      time: timeFromHHMM(p.start_time),
      endTime: timeFromHHMM(p.end_time),
      label: p.name,
      sub: [p.start_time && `${p.start_time}–${p.end_time}`, p.room && `Room ${p.room}`, p.teacher]
        .filter(Boolean)
        .join(' · ')
    })),
    ...studyBlocks.map((b) => ({
      type: 'study',
      key: `study-${b.id}`,
      time: new Date(b.start_at),
      label: `Study: ${b.deadline_title}`,
      sub: `${timeLabel(b.start_at)}–${timeLabel(b.end_at)}`
    })),
    ...plannerItems.map((p) => ({
      type: 'planner',
      key: `planner-${p.id}`,
      time: new Date(p.start_at),
      label: p.title,
      sub: `${timeLabel(p.start_at)}–${timeLabel(p.end_at)}`
    })),
    ...deadlines
      .filter((d) => new Date(d.due_at).toDateString() === new Date().toDateString())
      .map((d) => ({
        type: 'deadline',
        key: `deadline-${d.id}`,
        time: new Date(d.due_at),
        label: d.title,
        sub: `Due ${timeLabel(d.due_at)}`
      }))
  ].sort((a, b) => a.time - b.time);

  const progressTop = computeProgressTop(items, now);

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="label-eyebrow">Today</h2>
        <button
          onClick={() => setDayCode({ code: null, isToday: false, suggested: dayCode.suggested })}
          className="text-xs font-mono px-2 py-1 rounded bg-accent/15 text-accent hover:bg-accent/25"
          title="Change today's day code"
        >
          {dayCode.code} DAY
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-base-muted py-8 text-center">
          Nothing scheduled for {dayCode.code} yet. Add periods for this day code in Settings, sync your calendar, or
          jot something in the Daily Planner.
        </p>
      ) : (
        <div className="relative overflow-y-auto pr-1">
          {progressTop !== null && (
            <div
              className="absolute left-0 right-0 flex items-center gap-2 z-10 pointer-events-none"
              style={{ top: progressTop }}
            >
              <span className="w-2 h-2 rounded-full bg-accent-danger shrink-0 -ml-1" />
              <span className="flex-1 h-px bg-accent-danger/70" />
            </div>
          )}
          <ul className="space-y-2">
            {items.map((item) => {
              const meta = item.type === 'period' ? KIND_META[item.kind] || KIND_META.class : TYPE_META[item.type];
              const Icon = meta.icon;
              const isFlex = item.kind === 'flex' || item.kind === 'advisory';
              return (
                <li key={item.key}>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-base-panel border border-base-border">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.className}`}>
                      <Icon size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-base-text truncate">{item.label}</p>
                      <p className="text-xs text-base-muted truncate">{item.sub}</p>
                    </div>
                  </div>
                  {isFlex && <FlexPrepCard />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function FlexPrepCard() {
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState([]);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    api.getFlexPrep(todayStr()).then((r) => {
      if (r) {
        setNotes(r.notes || '');
        setTags(r.tags ? r.tags.split(',').filter(Boolean) : []);
      }
    });
  }, []);

  async function save(nextNotes, nextTags) {
    await api.saveFlexPrep({ date: todayStr(), notes: nextNotes, tags: nextTags.join(',') });
    setSaved(true);
  }

  function toggleTag(tag) {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    setTags(next);
    save(notes, next);
  }

  return (
    <div className="ml-11 mt-2 mb-1 p-3 rounded-lg bg-accent-good/5 border border-accent-good/20">
      <p className="text-xs font-medium text-accent-good mb-2">FLEX / Advisory prep</p>
      <div className="flex flex-wrap gap-1 mb-2">
        {FLEX_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => toggleTag(tag)}
            className={`text-xs px-2 py-1 rounded-full border ${
              tags.includes(tag)
                ? 'bg-accent-good/20 border-accent-good/40 text-accent-good'
                : 'border-base-border text-base-muted hover:border-accent-good/40'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
      <input
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
        onBlur={() => save(notes, tags)}
        placeholder="What are you doing during FLEX today?"
        className="w-full bg-white/60 border border-base-border rounded-md px-2 py-1 text-xs text-base-text focus:outline-none focus:border-accent"
      />
      {!saved && <p className="text-xs text-base-muted mt-1">Saving on blur…</p>}
    </div>
  );
}

function computeProgressTop(items, now) {
  if (items.length === 0) return null;
  if (now < items[0].time) return -6;
  if (now > items[items.length - 1].time) return (items.length - 1) * ROW_HEIGHT + ROW_HEIGHT / 2;

  for (let i = 0; i < items.length - 1; i++) {
    if (now >= items[i].time && now < items[i + 1].time) {
      const span = items[i + 1].time - items[i].time;
      const elapsed = now - items[i].time;
      const fraction = span > 0 ? elapsed / span : 0;
      return (i + fraction) * ROW_HEIGHT + ROW_HEIGHT / 2;
    }
  }
  return null;
}

function DayCodePicker({ suggested, onConfirm }) {
  const [codes, setCodes] = useState([]);
  const [value, setValue] = useState(suggested || '');

  useEffect(() => {
    api.getKnownDayCodes().then(setCodes);
  }, []);

  return (
    <div className="card h-full flex flex-col items-center justify-center text-center gap-3">
      <p className="label-eyebrow">Good morning</p>
      <h3 className="font-display text-lg font-semibold text-base-text">What day is it today?</h3>
      <p className="text-xs text-base-muted max-w-xs">
        {suggested
          ? `Your rotation setting suggests ${suggested}, but pick whatever's actually on today's calendar.`
          : "Enter today's day code to see your schedule (e.g. 1, 2… or 1A, 2B if you use letter variants)."}
      </p>

      {codes.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center max-w-sm">
          {codes.map((c) => (
            <button
              key={c}
              onClick={() => onConfirm(c)}
              className="px-3 py-2 rounded-lg text-sm font-medium border border-accent/40 text-accent hover:bg-accent/10"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onConfirm(value)}
          placeholder="e.g. 1"
          className="w-28 text-center bg-base-card border border-base-border rounded-lg px-3 py-2 text-sm text-base-text focus:outline-none focus:border-accent"
        />
        <button
          onClick={() => onConfirm(value)}
          className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg bg-accent text-white hover:bg-accent-soft"
        >
          <Check size={13} /> Set
        </button>
      </div>
    </div>
  );
}
