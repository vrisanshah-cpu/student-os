import { useEffect, useState } from 'react';
import { X, Trash2, CalendarPlus } from 'lucide-react';
import { format } from 'date-fns';
import api from '../../lib/api.js';

const CATEGORY_OPTIONS = [
  { value: 'personal', label: 'Personal', color: '#8890A6' },
  { value: 'class', label: 'Class period', color: '#5B8CFF' },
  { value: 'errand', label: 'Errand', color: '#F2B84B' },
  { value: 'routine', label: 'Routine', color: '#4FD1A5' }
];

const RECURRENCE_OPTIONS = [
  { value: 'none', label: "Just this day" },
  { value: 'weekdays', label: 'Every weekday' },
  { value: 'daily', label: 'Every day' }
];

function toTimeInput(iso) {
  return format(new Date(iso), 'HH:mm');
}

export default function PlannerItemModal({ date, item, onClose, onSave, onDelete }) {
  const isEditing = Boolean(item?.id);
  const [title, setTitle] = useState(item?.title || '');
  const [category, setCategory] = useState(item?.category || 'personal');
  const [notes, setNotes] = useState(item?.notes || '');
  const [recurrence, setRecurrence] = useState(item?.recurrence || 'none');
  const [startTime, setStartTime] = useState(item ? toTimeInput(item.start_at) : '15:00');
  const [endTime, setEndTime] = useState(item ? toTimeInput(item.end_at) : '16:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Optional two-way sync: push this item to a connected Google Calendar too.
  // Not shown at all if nothing's connected/enabled - most of the time this
  // is just a local planner item.
  const [calendarOptions, setCalendarOptions] = useState([]);
  const [pushCalendarId, setPushCalendarId] = useState('');

  useEffect(() => {
    if (isEditing) return; // only offer push-to-calendar when creating something new
    api
      .googleGetCalendarSettings()
      .then((rows) => {
        const enabled = rows.filter((r) => r.enabled);
        setCalendarOptions(enabled);
        const def = enabled.find((r) => r.is_default_push);
        setPushCalendarId(def ? String(def.id) : '');
      })
      .catch(() => setCalendarOptions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function combine(dateObj, timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(dateObj);
    d.setHours(h, m, 0, 0);
    return d;
  }

  async function handleSave() {
    if (!title.trim()) {
      setError('Give this a title.');
      return;
    }
    const start = combine(date, startTime);
    const end = combine(date, endTime);
    if (end <= start) {
      setError('End time has to be after the start time.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const color = CATEGORY_OPTIONS.find((c) => c.value === category)?.color || '#8890A6';
      const payload = {
        ...(isEditing ? { id: item.id } : {}),
        title: title.trim(),
        notes: notes.trim() || null,
        category,
        color,
        recurrence,
        start_at: start.toISOString(),
        end_at: end.toISOString()
      };
      await onSave(payload);
      if (!isEditing && pushCalendarId) {
        try {
          await api.createCalendarEvent({
            calendarRowId: Number(pushCalendarId),
            title: payload.title,
            start: start.toISOString(),
            end: end.toISOString(),
            description: payload.notes || undefined
          });
        } catch {
          // The planner item itself already saved locally - don't block on the calendar push failing.
        }
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-panel max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-base font-semibold text-base-text">
            {isEditing ? 'Edit planner item' : 'Add to planner'}
          </h3>
          <button onClick={onClose} className="text-base-muted hover:text-base-text">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Title">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Soccer practice"
              className="input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input" />
            </Field>
            <Field label="Ends">
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input" />
            </Field>
          </div>

          <Field label="Category">
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    category === c.value ? 'border-accent text-accent bg-accent/10' : 'border-base-border text-base-muted'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Repeats">
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className="input">
              {RECURRENCE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="input resize-none"
              placeholder="Anything worth remembering"
            />
          </Field>

          {!isEditing && calendarOptions.length > 0 && (
            <Field label="Also add to">
              <div className="flex items-center gap-2">
                <CalendarPlus size={13} className="text-base-muted shrink-0" />
                <select value={pushCalendarId} onChange={(e) => setPushCalendarId(e.target.value)} className="input">
                  <option value="">Don't sync to Google Calendar</option>
                  {calendarOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.account_label} · {c.summary}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
          )}

          {error && <p className="text-xs text-accent-danger">{error}</p>}
        </div>

        <div className="flex items-center justify-between mt-5">
          {isEditing ? (
            <button
              onClick={() => onDelete(item.id)}
              className="flex items-center gap-2 text-xs font-medium text-accent-danger hover:opacity-80"
            >
              <Trash2 size={14} /> Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-lg text-xs font-medium text-base-muted hover:text-base-text"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent-soft disabled:opacity-50"
            >
              {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Add to planner'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .input {
          width: 100%;
          background: #1C2030;
          border: 1px solid #282D3F;
          border-radius: 0.5rem;
          padding: 0.45rem 0.6rem;
          font-size: 0.8125rem;
          color: #E7E9F0;
        }
        .input:focus {
          outline: none;
          border-color: #5B8CFF;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-base-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
