import { useEffect, useMemo, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, BookOpen, AlertCircle } from 'lucide-react';
import { format, addDays, isSameDay } from 'date-fns';
import api from '../../lib/api.js';
import PlannerItemModal from './PlannerItemModal.jsx';

const RANGE_START_HOUR = 6; // 6am
const RANGE_END_HOUR = 23; // 11pm
const PX_PER_HOUR = 64;
const RANGE_START_MIN = RANGE_START_HOUR * 60;
const RANGE_END_MIN = RANGE_END_HOUR * 60;
const TOTAL_MIN = RANGE_END_MIN - RANGE_START_MIN;
const TOTAL_HEIGHT = (TOTAL_MIN / 60) * PX_PER_HOUR;

const CATEGORY_COLORS = {
  personal: '#8890A6',
  class: '#5B8CFF',
  errand: '#F2B84B',
  routine: '#4FD1A5'
};

function minutesOfDay(iso) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** Convert a start/end ISO pair into top/height pixels within the visible range, clipped. */
function toBlockStyle(startISO, endISO) {
  const startMin = Math.max(minutesOfDay(startISO), RANGE_START_MIN);
  const endMin = Math.min(minutesOfDay(endISO), RANGE_END_MIN);
  const top = ((startMin - RANGE_START_MIN) / 60) * PX_PER_HOUR;
  const height = Math.max(((endMin - startMin) / 60) * PX_PER_HOUR, 22);
  return { top, height };
}

export default function DailyPlanner() {
  const [date, setDate] = useState(() => new Date());
  const [dayData, setDayData] = useState({ plannerItems: [], studyBlocks: [], deadlinesDueToday: [] });
  const [loading, setLoading] = useState(true);
  const [modalState, setModalState] = useState(null); // null | { item: null | {...} }

  const load = useCallback(async (d) => {
    setLoading(true);
    const result = await api.getPlannerDay(d.toISOString());
    setDayData(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const hours = useMemo(() => {
    const list = [];
    for (let h = RANGE_START_HOUR; h <= RANGE_END_HOUR; h++) list.push(h);
    return list;
  }, []);

  async function handleSave(payload) {
    if (payload.id) {
      await api.updatePlannerItem(payload);
    } else {
      await api.createPlannerItem(payload);
    }
    setModalState(null);
    load(date);
  }

  async function handleDelete(id) {
    await api.deletePlannerItem(id);
    setModalState(null);
    load(date);
  }

  const isToday = isSameDay(date, new Date());

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="label-eyebrow mb-1">{isToday ? 'Today' : format(date, 'EEEE')}</p>
          <h1 className="font-display text-2xl font-semibold text-base-text">{format(date, 'MMMM d, yyyy')}</h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-base-card rounded-lg border border-base-border">
            <IconButton onClick={() => setDate((d) => addDays(d, -1))}>
              <ChevronLeft size={15} />
            </IconButton>
            <button
              onClick={() => setDate(new Date())}
              className="px-3 py-2 text-xs font-medium text-base-muted hover:text-base-text"
            >
              Today
            </button>
            <IconButton onClick={() => setDate((d) => addDays(d, 1))}>
              <ChevronRight size={15} />
            </IconButton>
          </div>
          <button
            onClick={() => setModalState({ item: null })}
            className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg bg-accent text-white hover:bg-accent-soft transition-colors"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {dayData.deadlinesDueToday?.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {dayData.deadlinesDueToday.map((d) => (
            <span
              key={d.id}
              className="flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full border border-accent-danger/30 bg-accent-danger/10 text-accent-danger"
            >
              <AlertCircle size={12} /> Due today: {d.title}
            </span>
          ))}
        </div>
      )}

      <div className="panel overflow-hidden">
        {loading ? (
          <div className="p-6">
            <div className="h-96 animate-pulse bg-base-card/60 rounded-lg" />
          </div>
        ) : (
          <div className="flex">
            {/* Hour labels */}
            <div className="w-16 shrink-0 border-r border-base-border" style={{ height: TOTAL_HEIGHT }}>
              {hours.map((h) => (
                <div
                  key={h}
                  className="text-xs text-base-muted font-mono pl-2 -translate-y-1/2"
                  style={{ height: PX_PER_HOUR }}
                >
                  {formatHour(h)}
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div className="relative flex-1" style={{ height: TOTAL_HEIGHT }}>
              {hours.map((h, i) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-t border-base-border/60"
                  style={{ top: i * PX_PER_HOUR }}
                />
              ))}

              {isToday && <NowIndicator />}

              {dayData.studyBlocks.map((b) => {
                const { top, height } = toBlockStyle(b.start_at, b.end_at);
                return (
                  <div
                    key={`sb-${b.id}`}
                    className="absolute left-2 right-2 rounded-lg border border-accent/40 bg-accent/15 px-3 py-2 overflow-hidden cursor-default"
                    style={{ top, height }}
                  >
                    <div className="flex items-center gap-2 text-xs font-medium text-accent">
                      <BookOpen size={11} /> Study: {b.deadline_title}
                    </div>
                    <p className="text-xs text-base-muted">
                      {format(new Date(b.start_at), 'h:mm a')}–{format(new Date(b.end_at), 'h:mm a')}
                    </p>
                  </div>
                );
              })}

              {dayData.plannerItems.map((item) => {
                const { top, height } = toBlockStyle(item.start_at, item.end_at);
                const color = item.color || CATEGORY_COLORS[item.category] || CATEGORY_COLORS.personal;
                return (
                  <button
                    key={`pi-${item.id}`}
                    onClick={() => setModalState({ item })}
                    className="absolute left-2 right-2 rounded-lg px-3 py-2 overflow-hidden text-left transition-opacity hover:opacity-90"
                    style={{ top, height, backgroundColor: `${color}22`, border: `1px solid ${color}66` }}
                  >
                    <p className="text-xs font-medium truncate" style={{ color }}>
                      {item.title}
                    </p>
                    <p className="text-xs text-base-muted">
                      {format(new Date(item.start_at), 'h:mm a')}–{format(new Date(item.end_at), 'h:mm a')}
                      {item._projected ? ' · repeats' : ''}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {modalState && (
        <PlannerItemModal
          date={date}
          item={modalState.item}
          onClose={() => setModalState(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

function NowIndicator() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < RANGE_START_MIN || minutes > RANGE_END_MIN) return null;
  const top = ((minutes - RANGE_START_MIN) / 60) * PX_PER_HOUR;
  return (
    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top }}>
      <div className="flex items-center">
        <span className="w-2 h-2 rounded-full bg-accent-danger -ml-1" />
        <div className="flex-1 h-px bg-accent-danger/60" />
      </div>
    </div>
  );
}

function formatHour(h) {
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12} ${period}`;
}

function IconButton({ children, onClick }) {
  return (
    <button onClick={onClick} className="w-8 h-8 flex items-center justify-center text-base-muted hover:text-base-text">
      {children}
    </button>
  );
}
