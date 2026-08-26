import { useState, useRef, useCallback, useEffect } from 'react';

export function usePomodoro({ workMin = 25, breakMin = 5 } = {}) {
  const [phase, setPhase] = useState('work'); // 'work' | 'break'
  const [secondsLeft, setSecondsLeft] = useState(workMin * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          const nextPhase = phase === 'work' ? 'break' : 'work';
          setPhase(nextPhase);
          return (nextPhase === 'work' ? workMin : breakMin) * 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running, phase, workMin, breakMin]);

  const start = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);
  const reset = useCallback(() => {
    setRunning(false);
    setPhase('work');
    setSecondsLeft(workMin * 60);
  }, [workMin]);

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return { phase, running, minutes, seconds, start, pause, reset };
}

export function useStopwatch() {
  const [ms, setMs] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    startTimeRef.current = Date.now() - ms;
    intervalRef.current = setInterval(() => setMs(Date.now() - startTimeRef.current), 100);
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const start = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);
  const reset = useCallback(() => {
    setRunning(false);
    setMs(0);
  }, []);

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  return { running, minutes, seconds, start, pause, reset };
}
