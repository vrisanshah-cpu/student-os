import { useEffect, useMemo, useState } from 'react';
import { Compass, Clock, User, Navigation, ChevronRight } from 'lucide-react';
import api from '../../lib/api.js';
import { LEVELS, locateRoom } from '../../lib/campusMap.js';

function minutesNow(d) {
  return d.getHours() * 60 + d.getMinutes();
}
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Given today's periods (already time-sorted) and the current clock, find what's happening now and what's next. */
function resolveNowAndNext(periods, now) {
  const nowMin = minutesNow(now);
  const sorted = [...periods].sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
  let current = null;
  let next = null;
  for (const p of sorted) {
    const start = toMinutes(p.start_time);
    const end = toMinutes(p.end_time);
    if (nowMin >= start && nowMin < end) current = p;
    if (!next && start > nowMin) next = p;
  }
  return { current, next };
}

export default function CampusMap() {
  const [dayCode, setDayCode] = useState(null);
  const [knownCodes, setKnownCodes] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [now, setNow] = useState(() => new Date());
  const [manualCode, setManualCode] = useState('');
  const [selectedLevel, setSelectedLevel] = useState(null);

  async function load() {
    const [today, codes] = await Promise.all([api.getTodayDayCode(), api.getKnownDayCodes()]);
    setKnownCodes(codes);
    if (today?.isToday && today.code) {
      setDayCode(today.code);
      const schedule = await api.getTodaySchedule(today.code);
      setPeriods(schedule.periods || []);
    } else {
      setDayCode(null);
      const schedule = await api.getTodaySchedule(null); // 'both'-only periods (Advisory, Lunch)
      setPeriods(schedule.periods || []);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  async function saveDayCode() {
    if (!manualCode.trim()) return;
    await api.setTodayDayCode(manualCode.trim());
    setManualCode('');
    await load();
  }

  const { current, next } = useMemo(() => resolveNowAndNext(periods, now), [periods, now]);
  const target = current || next;
  const located = target ? locateRoom(target.room) : null;

  useEffect(() => {
    if (located?.level) setSelectedLevel(located.level);
  }, [located?.level]);

  const activeLevel = LEVELS.find((l) => l.level === (selectedLevel || located?.level || 1));

  return (
    <div className="flex-1 overflow-y-auto p-6 holo-scene">
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="label-eyebrow mb-1">Campus map</p>
          <h1 className="font-display text-2xl font-semibold text-base-text flex items-center gap-2">
            <Compass size={22} className="text-holo" /> Where to next
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-base-muted">
          <Clock size={13} />
          {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          {dayCode && <span className="ml-1 px-2 py-0.5 rounded-full bg-base-card border border-base-border">Day {dayCode}</span>}
        </div>
      </div>

      {!dayCode && (
        <div className="mb-5 p-3 rounded-xl bg-base-card border border-base-border flex items-center gap-2 flex-wrap">
          <p className="text-xs text-base-muted">
            No day-code set for today yet, so only Advisory/Lunch show below - set today's rotation letter to see your actual classes:
          </p>
          <input
            list="campus-day-codes"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="e.g. 3"
            className="w-16 bg-base-panel border border-base-border rounded-lg px-2 py-1 text-xs text-base-text text-center focus:outline-none focus:border-accent"
          />
          <datalist id="campus-day-codes">
            {knownCodes.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <button onClick={saveDayCode} className="text-xs font-medium px-2.5 py-1 rounded-lg bg-accent text-white hover:bg-accent-soft">
            Set
          </button>
        </div>
      )}

      {target ? (
        <div className="holo-card rounded-2xl p-5 mb-6">
          <p className="text-xs uppercase tracking-wide text-holo/80 mb-1">{current ? 'Happening now' : 'Up next'}</p>
          <h2 className="font-display text-xl font-semibold text-base-text mb-2">{target.name}</h2>
          <div className="flex items-center gap-4 flex-wrap text-sm text-base-muted mb-3">
            <span className="flex items-center gap-1.5">
              <Clock size={14} /> {target.start_time}–{target.end_time}
            </span>
            {target.teacher && (
              <span className="flex items-center gap-1.5">
                <User size={14} /> {target.teacher}
              </span>
            )}
            {target.room && (
              <span className="flex items-center gap-1.5">
                <Navigation size={14} /> Room {target.room}
              </span>
            )}
          </div>
          {located && (
            <p className="text-sm text-holo flex items-center gap-1.5">
              <ChevronRight size={15} /> {located.directions}
            </p>
          )}
        </div>
      ) : (
        <div className="holo-card rounded-2xl p-5 mb-6">
          <p className="text-sm text-base-muted">No more scheduled periods for today. 🎉</p>
        </div>
      )}

      <div className="flex items-center gap-1.5 mb-4">
        {LEVELS.map((l) => (
          <button
            key={l.level}
            onClick={() => setSelectedLevel(l.level)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              activeLevel?.level === l.level
                ? 'border-holo text-holo bg-holo/10'
                : 'border-base-border text-base-muted hover:text-base-text'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {activeLevel && (
        <div className="holo-panel rounded-2xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {activeLevel.wings.map((wing) => (
              <div key={wing.name}>
                <p className="text-xs font-medium text-base-muted mb-2">{wing.name}</p>
                <div className="flex flex-wrap gap-2">
                  {wing.rooms.map((room) => {
                    const isTarget = located && located.level === activeLevel.level && room.toUpperCase() === located.room.toUpperCase();
                    return (
                      <span
                        key={room}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border ${
                          isTarget ? 'holo-target' : 'border-base-border/60 text-base-muted bg-base-card/40'
                        }`}
                      >
                        {room}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
