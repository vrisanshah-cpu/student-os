import { useEffect, useRef, useState } from 'react';
import { Share2, FileEdit, Trash2, Link2, ExternalLink, Maximize2, Minimize2, Check, Loader2, LayoutTemplate, ChevronsLeft, ChevronsRight } from 'lucide-react';
import TagInput from './TagInput.jsx';
import AttachmentsList from './AttachmentsList.jsx';
import LectureRecorder from './LectureRecorder.jsx';
import MindmapEditor from './MindmapEditor.jsx';
import GeminiPanel from './GeminiPanel.jsx';
import RichTextEditor from './RichTextEditor.jsx';
import { markdownToHtml } from '../../lib/markdown.js';
import api from '../../lib/api.js';

const AUTOSAVE_DELAY_MS = 1200;

export default function NoteEditor({ note, onSave, onDelete, onSaveGenerated, fullscreen, onToggleFullscreen }) {
  const [title, setTitle] = useState(note.title);
  const [bodyHtml, setBodyHtml] = useState(note.body_html || '');
  const [mindmapJson, setMindmapJson] = useState(note.mindmap_json || '');
  const [quizletUrl, setQuizletUrl] = useState(note.quizlet_url || '');
  const [driveUrl, setDriveUrl] = useState(note.drive_url || '');
  const [tab, setTab] = useState('note'); // note | mindmap
  const [saveState, setSaveState] = useState('saved'); // 'saved' | 'pending' | 'saving'
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const autosaveTimer = useRef(null);
  const latestRef = useRef({});

  useEffect(() => {
    setTitle(note.title);
    setBodyHtml(note.body_html || '');
    setMindmapJson(note.mindmap_json || '');
    setQuizletUrl(note.quizlet_url || '');
    setDriveUrl(note.drive_url || '');
    setSaveState('saved');
    setTab('note');
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a ref of the latest field values so the debounced save always
  // reads what's currently on screen, not a stale closure.
  useEffect(() => {
    latestRef.current = { title, bodyHtml, mindmapJson, quizletUrl, driveUrl };
  }, [title, bodyHtml, mindmapJson, quizletUrl, driveUrl]);

  useEffect(() => () => clearTimeout(autosaveTimer.current), []);

  // Entering full screen also tucks away the resource sidebar so the writing
  // surface itself is the only thing on screen - the user can still bring it
  // back with the same collapse toggle.
  useEffect(() => {
    if (fullscreen) setSidebarCollapsed(true);
  }, [fullscreen]);

  // Cmd/Ctrl+. toggles distraction-free full screen from anywhere in the editor.
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        onToggleFullscreen?.();
      }
      if (e.key === 'Escape' && fullscreen) {
        onToggleFullscreen?.();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, onToggleFullscreen]);

  function scheduleAutosave() {
    setSaveState('pending');
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(doSave, AUTOSAVE_DELAY_MS);
  }

  function markDirty(setter) {
    return (val) => {
      setter(val);
      scheduleAutosave();
    };
  }

  async function doSave() {
    setSaveState('saving');
    const v = latestRef.current;
    try {
      await onSave({
        id: note.id,
        title: v.title,
        body_html: v.bodyHtml,
        mindmap_json: v.mindmapJson,
        quizlet_url: v.quizletUrl || null,
        drive_url: v.driveUrl || null
      });
      setSaveState('saved');
    } catch {
      setSaveState('pending');
    }
  }

  async function handleSaveGenerated(text, kind) {
    if (!onSaveGenerated) return;
    const generatedTitle = `${kind === 'exam' ? 'Practice Exam' : 'Study Guide'} — ${title}`;
    await onSaveGenerated({ topic_id: note.topic_id, title: generatedTitle, body_html: markdownToHtml(text) });
  }

  async function handleSaveAsTemplate() {
    const name = window.prompt('Name this template', title || 'Untitled template');
    if (!name) return;
    await api.createNoteTemplate({ name, body_html: bodyHtml });
  }

  return (
    <div className={fullscreen ? 'fixed inset-0 z-50 bg-paper-rule/30 flex' : 'flex-1 flex overflow-hidden'}>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-paper-rule">
          <input
            value={title}
            onChange={(e) => markDirty(setTitle)(e.target.value)}
            className="font-display text-lg font-semibold bg-transparent text-paper-ink focus:outline-none flex-1"
            placeholder="Untitled note"
          />
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center bg-white/70 rounded-full p-1 border border-paper-rule mr-1">
              <TabButton active={tab === 'note'} onClick={() => setTab('note')} icon={<FileEdit size={12} />}>
                Note
              </TabButton>
              <TabButton active={tab === 'mindmap'} onClick={() => setTab('mindmap')} icon={<Share2 size={12} />}>
                Mindmap
              </TabButton>
            </div>
            <SaveStatus state={saveState} />
            <button
              onClick={handleSaveAsTemplate}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-paper-muted hover:text-accent hover:bg-white/70"
              title="Save as template"
            >
              <LayoutTemplate size={14} />
            </button>
            <button
              onClick={onToggleFullscreen}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-paper-muted hover:text-paper-ink hover:bg-white/70"
              title={fullscreen ? 'Exit full screen (Ctrl+. / Esc)' : 'Full screen (Ctrl+.)'}
            >
              {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              onClick={() => onDelete(note.id)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-paper-muted hover:text-accent-danger hover:bg-white/70"
              title="Delete note"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        {tab === 'note' && (
          <RichTextEditor
            noteId={note.id}
            content={bodyHtml}
            onChange={markDirty(setBodyHtml)}
            placeholder="Start writing…"
            roomy={fullscreen}
          />
        )}

        {tab === 'mindmap' && (
          <div className="flex-1 overflow-y-auto p-5">
            <MindmapEditor
              noteTitle={title}
              mindmapJson={mindmapJson}
              onChange={(json) => markDirty(setMindmapJson)(json)}
            />
          </div>
        )}
      </div>

      {/* Resource sidebar */}
      {sidebarCollapsed ? (
        <div className="w-8 shrink-0 border-l border-paper-rule bg-paper-raised flex flex-col items-center pt-3">
          <button
            onClick={() => setSidebarCollapsed(false)}
            title="Show resources"
            className="w-6 h-6 flex items-center justify-center rounded-md text-paper-muted hover:text-accent hover:bg-white/70"
          >
            <ChevronsLeft size={14} />
          </button>
        </div>
      ) : (
        <div className="w-72 shrink-0 border-l border-paper-rule bg-paper-raised overflow-y-auto p-4 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="label-eyebrow">Resources</p>
              <button
                onClick={() => setSidebarCollapsed(true)}
                title="Hide resources"
                className="text-paper-muted hover:text-accent"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
            <div className="space-y-2">
              <UrlField
                icon={<Link2 size={12} />}
                placeholder="Quizlet URL"
                value={quizletUrl}
                onChange={markDirty(setQuizletUrl)}
                onOpen={quizletUrl ? () => api.openExternal(quizletUrl) : null}
              />
              <UrlField
                icon={<ExternalLink size={12} />}
                placeholder="Google Drive URL"
                value={driveUrl}
                onChange={markDirty(setDriveUrl)}
                onOpen={driveUrl ? () => api.openExternal(driveUrl) : null}
              />
            </div>
          </div>

          <div className="pt-3 border-t border-paper-rule">
            <AttachmentsList noteId={note.id} />
          </div>

          <div className="pt-3 border-t border-paper-rule">
            <LectureRecorder noteId={note.id} />
          </div>

          <div className="pt-3 border-t border-paper-rule">
            <TagInput entityType="note" entityId={note.id} />
          </div>

          <div className="pt-3 border-t border-paper-rule">
            <GeminiPanel noteIds={[note.id]} contextLabel="this note" onSaveAsNote={handleSaveGenerated} compact />
          </div>
        </div>
      )}
    </div>
  );
}

function SaveStatus({ state }) {
  if (state === 'saving') {
    return (
      <span className="flex items-center gap-1 text-xs text-paper-muted">
        <Loader2 size={11} className="animate-spin" /> Saving…
      </span>
    );
  }
  if (state === 'pending') {
    return <span className="text-xs text-paper-muted">Unsaved changes</span>;
  }
  return (
    <span className="flex items-center gap-1 text-xs text-accent-good">
      <Check size={11} /> Saved
    </span>
  );
}

function TabButton({ children, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
        active ? 'bg-accent text-white' : 'text-paper-muted hover:text-paper-ink'
      }`}
    >
      {icon} {children}
    </button>
  );
}

function UrlField({ icon, placeholder, value, onChange, onOpen }) {
  return (
    <div className="flex items-center gap-2 bg-white/70 border border-paper-rule rounded-lg px-3 py-2">
      <span className="text-paper-muted shrink-0">{icon}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-xs text-paper-ink focus:outline-none"
      />
      {onOpen && (
        <button onClick={onOpen} className="shrink-0 text-paper-muted hover:text-accent" title="Open link">
          <ExternalLink size={12} />
        </button>
      )}
    </div>
  );
}
