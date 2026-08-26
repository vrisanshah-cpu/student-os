import { format, differenceInCalendarDays } from 'date-fns';
import { AlertCircle } from 'lucide-react';

const TYPE_STYLES = {
  exam: 'text-accent-danger border-accent-danger/30 bg-accent-danger/10',
  project: 'text-accent-warn border-accent-warn/30 bg-accent-warn/10',
  homework: 'text-accent border-accent/30 bg-accent/10'
};

export default function DeadlinesCard({ deadlines = [] }) {
  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="label-eyebrow">Upcoming Deadlines</h2>
        <span className="text-xs text-base-muted">{deadlines.length} tracked</span>
      </div>

      {deadlines.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2 overflow-y-auto pr-1">
          {deadlines.map((d) => {
            const daysOut = differenceInCalendarDays(new Date(d.due_at), new Date());
            return (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-base-border bg-base-panel"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-base-text truncate">{d.title}</p>
                  <p className="text-xs text-base-muted">
                    {d.class_name || 'Unassigned'} &middot; {format(new Date(d.due_at), 'EEE, MMM d')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-1 rounded-full border font-medium ${TYPE_STYLES[d.type] || TYPE_STYLES.homework}`}>
                    {d.type}
                  </span>
                  <span className="text-xs font-mono text-base-muted w-14 text-right">
                    {daysOut <= 0 ? 'today' : `${daysOut}d`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-8">
      <AlertCircle size={20} className="text-base-muted" />
      <p className="text-sm text-base-muted">Nothing due yet. Sync your calendar to pull in homework and exams.</p>
    </div>
  );
}
