import { useEffect, useState } from 'react';
import { Sun, Plus, Trash2, RotateCcw, AlarmClock, Check } from 'lucide-react';
import api from '../../lib/api.js';

export default function RemindersPage() {
  const [reminders, setReminders] = useState([]);
  const [dueSoon, setDueSoon] = useState([]);
  const [text, setText] = useState('');
  const [recurring, setRecurring] = useState(true);

  async function load() {
    const [rem, homework] = await Promise.all([api.getReminders(), api.getDueSoonHomework()]);
    setReminders(rem);
    setDueSoon(homework);
  }

  useEffect(() => {
    load();
  }, []);

  async function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    await api.createReminder({ text: trimmed, recurring });
    setText('');
    await load();
  }

  async function toggle(r) {
    await api.toggleReminder({ id: r.id, done: !r.done });
    await load();
  }

  async function remove(id) {
    await api.deleteReminder(id);
    await load();
  }

  async function completeHomework(id) {
    await api.completeDeadline(id);
    setDueSoon((d) => d.filter((h) => h.id !== id));
  }

  const open = reminders.filter((r) => !r.done);
  const done = reminders.filter((r) => r.done);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6 max-w-xl">
        <p className="label-eyebrow mb-1">Every morning</p>
        <h1 className="font-display text-2xl font-semibold text-base-text flex items-center gap-2">
          <Sun size={20} className="text-accent-warn" /> Reminders
        </h1>
        <p className="text-sm text-base-muted mt-1">
          Recurring reminders automatically uncheck themselves at the start of a new day. Homework due within 12
          hours shows up below automatically — no separate step needed, it's the same list from the homework
          clipboard.
        </p>
      </div>

      <div className="max-w-xl space-y-5">
        {dueSoon.length > 0 && (
          <div className="card border-accent-danger/30">
            <p className="label-eyebrow mb-3 flex items-center gap-2 text-accent-danger">
              <AlarmClock size={13} /> Due within 12 hours ({dueSoon.length})
            </p>
            <ul className="space-y-2">
              {dueSoon.map((hw) => (
                <li
                  key={hw.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-base-panel border border-accent-danger/20"
                >
                  <button
                    onClick={() => completeHomework(hw.id)}
                    className="w-4 h-4 shrink-0 rounded border border-base-border hover:border-accent-good hover:bg-accent-good/20 flex items-center justify-center"
                    title="Mark complete"
                  >
                    <Check size={10} className="text-transparent hover:text-accent-good" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-base-text truncate">{hw.title}</p>
                    <p className="text-xs text-accent-danger">
                      Due {new Date(hw.due_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Check backpack for signed forms…"
              className="flex-1 bg-base-card border border-base-border rounded-lg px-3 py-2 text-sm text-base-text focus:outline-none focus:border-accent"
            />
            <button
              onClick={add}
              className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg bg-accent text-white hover:bg-accent-soft shrink-0"
            >
              <Plus size={13} /> Add
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-base-muted cursor-pointer">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="accent-accent"
            />
            Repeats every morning (uncheck for a one-off reminder)
          </label>
        </div>

        <div className="card">
          <p className="label-eyebrow mb-3">To review ({open.length})</p>
          {open.length === 0 ? (
            <p className="text-sm text-base-muted py-4 text-center">All clear — add something above.</p>
          ) : (
            <ul className="space-y-2">
              {open.map((r) => (
                <ReminderRow key={r.id} reminder={r} onToggle={() => toggle(r)} onDelete={() => remove(r.id)} />
              ))}
            </ul>
          )}
        </div>

        {done.length > 0 && (
          <div className="card">
            <p className="label-eyebrow mb-3">Done today ({done.length})</p>
            <ul className="space-y-2">
              {done.map((r) => (
                <ReminderRow key={r.id} reminder={r} onToggle={() => toggle(r)} onDelete={() => remove(r.id)} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function ReminderRow({ reminder, onToggle, onDelete }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2 rounded-lg bg-base-panel border border-base-border">
      <button
        onClick={onToggle}
        className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
          reminder.done ? 'bg-accent-good border-accent-good' : 'border-base-border hover:border-accent'
        }`}
      >
        {reminder.done && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
      </button>
      <span className={`text-sm flex-1 truncate ${reminder.done ? 'text-base-muted line-through' : 'text-base-text'}`}>
        {reminder.text}
      </span>
      {Boolean(reminder.recurring) && (
        <span title="Repeats every morning" className="shrink-0 text-base-muted">
          <RotateCcw size={11} />
        </span>
      )}
      <button onClick={onDelete} className="shrink-0 text-base-muted hover:text-accent-danger">
        <Trash2 size={12} />
      </button>
    </li>
  );
}
