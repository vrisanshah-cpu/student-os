import { useEffect, useState } from 'react';
import { Play, Pause, RotateCcw, Timer, Watch, ClipboardList } from 'lucide-react';
import { usePomodoro, useStopwatch } from '../../hooks/timer/usePomodoro.js';
import QuickHomeworkPopover from './QuickHomeworkPopover.jsx';
import api from '../../lib/api.js';

export default function TopBar() {
  const [mode, setMode] = useState('pomodoro'); // 'pomodoro' | 'stopwatch'
  const [prefs, setPrefs] = useState(null);
  const [showHomework, setShowHomework] = useState(false);
  const [myTime, setMyTime] = useState('');

  useEffect(() => {
    function tick() {
      setMyTime(
        new Intl.DateTimeFormat('en-MY', {
          timeZone: 'Asia/Kuala_Lumpur',
          hour: 'numeric',
          minute: '2-digit'
        }).format(new Date())
      );
    }
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      const workMin = Number(await api.getSetting('pomodoro_work_min')) || 25;
      const breakMin = Number(await api.getSetting('pomodoro_break_min')) || 5;
      setPrefs({ workMin, breakMin });
    })();
  }, []);

  const pomodoro = usePomodoro({ workMin: prefs?.workMin ?? 25, breakMin: prefs?.breakMin ?? 5 });
  const stopwatch = useStopwatch();

  // Settings load asynchronously; once they arrive, snap the (not-yet-started)
  // timer to the real values instead of leaving it stuck on the 25/5 default.
  useEffect(() => {
    if (prefs && !pomodoro.running) pomodoro.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs]);

  const active = mode === 'pomodoro' ? pomodoro : stopwatch;
  const phaseLabel = mode === 'pomodoro' ? (pomodoro.phase === 'work' ? 'Focus' : 'Break') : 'Elapsed';

  return (
    <div className="h-14 shrink-0 relative flex items-center justify-between px-4 border-b border-base-border bg-base-panel">
      <div className="flex items-center gap-2">
        <span className="font-display font-semibold text-base-text tracking-tight">Student OS</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden sm:flex flex-col items-end leading-tight mr-1" title="Malaysia time">
          <span className="text-xs text-base-muted font-mono">MYT</span>
          <span className="text-xs font-mono text-base-text tabular-nums">{myTime}</span>
        </span>
        <div className="flex items-center bg-base-card rounded-full p-1 border border-base-border">
          <button
            onClick={() => setMode('pomodoro')}
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              mode === 'pomodoro' ? 'bg-accent text-white' : 'text-base-muted hover:text-base-text'
            }`}
          >
            <Timer size={13} /> Pomodoro
          </button>
          <button
            onClick={() => setMode('stopwatch')}
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              mode === 'stopwatch' ? 'bg-accent text-white' : 'text-base-muted hover:text-base-text'
            }`}
          >
            <Watch size={13} /> Stopwatch
          </button>
        </div>

        <div className="flex items-center gap-2 font-mono text-lg tabular-nums">
          <span className={`text-xs font-body font-medium ${phaseLabel === 'Break' ? 'text-accent-good' : 'text-base-muted'}`}>
            {phaseLabel}
          </span>
          <span className="text-base-text">
            {active.minutes}:{active.seconds}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <IconButton onClick={active.running ? active.pause : active.start}>
            {active.running ? <Pause size={15} /> : <Play size={15} />}
          </IconButton>
          <IconButton onClick={active.reset}>
            <RotateCcw size={15} />
          </IconButton>
          <IconButton onClick={() => setShowHomework((s) => !s)} title="Today's homework">
            <ClipboardList size={15} />
          </IconButton>
        </div>
      </div>
      {showHomework && <QuickHomeworkPopover onClose={() => setShowHomework(false)} />}
    </div>
  );
}

function IconButton({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-base-muted hover:text-base-text hover:bg-base-card transition-colors"
    >
      {children}
    </button>
  );
}
