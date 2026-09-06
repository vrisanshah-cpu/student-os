import { LayoutGrid, CalendarDays, CalendarRange, NotebookText, Settings, Sun, Search, Sparkles, Compass } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { id: 'calendar', label: 'Calendar', icon: CalendarRange },
  { id: 'campus', label: 'Campus Map', icon: Compass },
  { id: 'planner', label: 'Daily Planner', icon: CalendarDays },
  { id: 'notes', label: 'Notes', icon: NotebookText },
  { id: 'reminders', label: 'Reminders', icon: Sun },
  { id: 'settings', label: 'Settings', icon: Settings }
];

export default function Sidebar({ activeView, onNavigate, onSearch, onStudyMode }) {
  return (
    <aside className="w-56 shrink-0 border-r border-base-border bg-base-panel flex flex-col py-4">
      <div className="px-3 mb-3">
        <button
          onClick={onSearch}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-base-muted bg-base-card border border-base-border hover:border-accent/50 hover:text-base-text"
        >
          <Search size={13} />
          Search notes…
          <span className="ml-auto text-xs font-mono opacity-60">Ctrl K</span>
        </button>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeView === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                active ? 'bg-accent/15 text-accent' : 'text-base-muted hover:text-base-text hover:bg-base-card'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-3 pt-3 border-t border-base-border">
        <button
          onClick={onStudyMode}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-accent hover:bg-accent/10 transition-colors text-left"
        >
          <Sparkles size={16} />
          Study for a test
        </button>
      </div>
    </aside>
  );
}
