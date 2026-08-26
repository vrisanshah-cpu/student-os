import { useRef, useState, useEffect } from 'react';
import { Mic, Square, Pause, Play, FileAudio } from 'lucide-react';
import api from '../../lib/api.js';

export default function LectureRecorder({ noteId }) {
  const [status, setStatus] = useState('idle'); // idle | recording | paused
  const [elapsed, setElapsed] = useState(0);
  const [recordings, setRecordings] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const samplesRef = useRef([]);
  const sampleRateRef = useRef(44100);
  const timerRef = useRef(null);

  useEffect(() => {
    if (noteId) api.listRecordingsForNote(noteId).then(setRecordings);
  }, [noteId]);

  useEffect(() => () => cleanupAudio(), []);

  function cleanupAudio() {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close();
    clearInterval(timerRef.current);
  }

  async function start() {
    setError('');
    samplesRef.current = [];
    setElapsed(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      sampleRateRef.current = audioCtx.sampleRate;

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        samplesRef.current.push(int16);
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      setStatus('recording');
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (e) {
      setError('Microphone access was denied or unavailable.');
    }
  }

  function pause() {
    audioCtxRef.current?.suspend();
    clearInterval(timerRef.current);
    setStatus('paused');
  }

  function resume() {
    audioCtxRef.current?.resume();
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    setStatus('recording');
  }

  async function stop() {
    cleanupAudio();
    setStatus('idle');

    const totalLength = samplesRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
    if (totalLength === 0) return;

    const merged = new Int16Array(totalLength);
    let offset = 0;
    for (const chunk of samplesRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    setSaving(true);
    try {
      const saved = await api.saveRecording({
        noteId: noteId || null,
        pcmSamples: Array.from(merged),
        sampleRate: sampleRateRef.current,
        numChannels: 1,
        durationSeconds: elapsed
      });
      setRecordings((r) => [saved, ...r]);
    } finally {
      setSaving(false);
      samplesRef.current = [];
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs font-medium text-paper-muted">
          <Mic size={12} /> Lecture recording
        </div>
        {status !== 'idle' && (
          <span className="text-xs font-mono text-accent-danger flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-danger animate-pulse" /> {formatTime(elapsed)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {status === 'idle' && (
          <RecButton onClick={start} label="Record">
            <Mic size={13} />
          </RecButton>
        )}
        {status === 'recording' && (
          <>
            <RecButton onClick={pause} label="Pause">
              <Pause size={13} />
            </RecButton>
            <RecButton onClick={stop} label="Stop" danger>
              <Square size={13} />
            </RecButton>
          </>
        )}
        {status === 'paused' && (
          <>
            <RecButton onClick={resume} label="Resume">
              <Play size={13} />
            </RecButton>
            <RecButton onClick={stop} label="Stop" danger>
              <Square size={13} />
            </RecButton>
          </>
        )}
        {saving && <span className="text-xs text-paper-muted">Saving…</span>}
      </div>

      {error && <p className="text-xs text-accent-danger mt-2">{error}</p>}

      {recordings.length > 0 && (
        <ul className="mt-3 space-y-2">
          {recordings.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => api.openPath(r.file_path)}
                className="flex items-center gap-2 w-full text-left px-2 py-2 rounded-md bg-white/70 border border-paper-rule hover:border-accent/40 text-xs text-paper-ink"
              >
                <FileAudio size={12} className="shrink-0 text-paper-muted" />
                <span className="truncate">Lecture · {formatTime(r.duration_seconds || 0)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-paper-muted mt-2">
        Saved as .wav in your app data folder — open it, then drag into NotebookLM.
      </p>
    </div>
  );
}

function RecButton({ children, onClick, label, danger }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
        danger
          ? 'border-accent-danger/40 text-accent-danger hover:bg-accent-danger/10'
          : 'border-accent/40 text-accent hover:bg-accent/10'
      }`}
    >
      {children} {label}
    </button>
  );
}

function formatTime(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}
