import { useEffect, useState } from 'react';
import { Mic, Timer, RefreshCw, CalendarDays, Sun } from 'lucide-react';
import api from '../../lib/api.js';
import TodayTimeline from './TodayTimeline.jsx';
import DeadlinesCard from './DeadlinesCard.jsx';

export default function Dashboard({ onNavigate }) {
  const [data, setData] = useState({
    upcomingDeadlines: [],
    todaysStudyBlocks: [],
    todaysPlannerItems: [],
    classes: []
  });
  const [openReminders, setOpenReminders] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    const [result, reminders] = await Promise.all([api.getDashboardData(), api.getReminders()]);
    setData(result);
    setOpenReminders(reminders.filter((r) => !r.done).length);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCalendarSync() {
    const icsUrl = await api.getSetting('powerschool_ics_url');
    if (!icsUrl) {
      alert('Add your calendar ICS URL in Settings first.');
      return;
    }
    setSyncing(true);
    try {
      await api.syncPowerSchool(icsUrl);
      await load();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="label-eyebrow mb-1">{today()}</p>
          <h1 className="font-display text-2xl font-semibold text-base-text">Dashboard</h1>
        </div>

        <div className="flex items-center gap-2">
          <QuickAction icon={<RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />} onClick={handleCalendarSync}>
            {syncing ? 'Syncing…' : 'Sync Calendar'}
          </QuickAction>
          <QuickAction icon={<Sun size={14} />} onClick={() => onNavigate?.('reminders')}>
            Reminders{openReminders > 0 ? ` (${openReminders})` : ''}
          </QuickAction>
          <QuickAction icon={<CalendarDays size={14} />} onClick={() => onNavigate?.('planner')}>
            Daily Planner
          </QuickAction>
          <QuickAction icon={<Mic size={14} />} onClick={() => onNavigate?.('notes')}>
            Record Lecture
          </QuickAction>
          <QuickAction icon={<Timer size={14} />} onClick={() => onNavigate?.('planner')}>
            Start Focus Session
          </QuickAction>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {[0, 1].map((i) => (
            <div key={i} className="card h-72 animate-pulse bg-base-card/60 lg:col-span-1" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <TodayTimeline
              studyBlocks={data.todaysStudyBlocks}
              plannerItems={data.todaysPlannerItems}
              deadlines={data.upcomingDeadlines}
            />
          </div>
          <DeadlinesCard deadlines={data.upcomingDeadlines} />
        </div>
      )}
    </div>
  );
}

function QuickAction({ icon, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-base-border bg-base-card text-base-text hover:border-accent/50 hover:text-accent transition-colors"
    >
      {icon}
      {children}
    </button>
  );
}

function today() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
