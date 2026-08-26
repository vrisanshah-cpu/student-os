import { useEffect, useState } from 'react';
import { ClipboardList, Plus, Check } from 'lucide-react';
import api from '../../lib/api.js';

function defaultDueAt() {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  // datetime-local wants 'YYYY-MM-DDTHH:MM' in local time
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function QuickHomeworkPopover({ onClose }) {
  const [items, setItems] = useState([]);
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState(defaultDueAt());
  const [adding, setAdding] = useState(false);

  async function load() {
    const [all, cls] = await Promise.all([api.getUpcomingDeadlines(), api.getClasses()]);
    setItems(all.filter((d) => d.type === 'homework'));
    setClasses(cls);
  }

  useEffect(() => {
    load();
  }, []);

  async function addItem() {
    if (!title.trim() || !dueAt) return;
    setAdding(true);
    try {
      await api.createDeadline({
        class_id: classId || null,
        title: title.trim(),
        type: 'homework',
        due_at: new Date(dueAt).toISOString(),
        source: 'manual',
        external_uid: null
      });
      setTitle('');
      setDueAt(defaultDueAt());
      await load();
    } finally {
      setAdding(false);
    }
  }

  async function complete(id) {
    await api.completeDeadline(id);
    setItems((its) => its.filter((i) => i.id !== id));
  }

  return (
    <div
      className="absolute right-4 top-14 z-30 w-96 rounded-xl2 bg-base-panel border-2 border-base-border shadow-page overflow-hidden"
      onMouseLeave={onClose}
    >
      {/* clipboard "clip" */}
      <div className="flex justify-center -mt-1">
        <div className="w-16 h-3 rounded-b-md bg-base-border" />
      </div>

      <div className="p-4 pt-2">
        <div className="flex items-center gap-2 mb-3 text-xs font-medium text-base-muted">
          <ClipboardList size={13} /> Homework clipboard
        </div>

        <div className="space-y-2 mb-3">
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="w-full bg-base-card border border-base-border rounded-lg px-3 py-2 text-xs text-base-text focus:outline-none focus:border-accent"
          >
            <option value="">No class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            placeholder="Read ch. 4, finish worksheet…"
            className="w-full bg-base-card border border-base-border rounded-lg px-3 py-2 text-xs text-base-text focus:outline-none focus:border-accent"
          />
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="flex-1 bg-base-card border border-base-border rounded-lg px-3 py-2 text-xs text-base-text focus:outline-none focus:border-accent"
            />
            <button
              onClick={addItem}
              disabled={adding || !title.trim()}
              className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg bg-accent text-white hover:bg-accent-soft disabled:opacity-50"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-base-muted text-center py-4">Nothing on the clipboard — add homework above.</p>
        ) : (
          <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-base-card border border-base-border">
                <button
                  onClick={() => complete(it.id)}
                  className="w-4 h-4 shrink-0 rounded border border-base-border hover:border-accent-good hover:bg-accent-good/20 flex items-center justify-center"
                  title="Mark done"
                >
                  <Check size={10} className="text-transparent hover:text-accent-good" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-base-text truncate">{it.title}</p>
                  <p className="text-xs text-base-muted truncate">
                    {it.class_name ? `${it.class_name} · ` : ''}
                    Due {new Date(it.due_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-base-muted mt-2">
          Shows up automatically in Reminders, with a heads-up 12 hours before it's due.
        </p>
      </div>
    </div>
  );
}
