import { useState } from 'react';
import { ChevronRight, ChevronDown, ChevronsLeft, ChevronsRight, FileText, Folder, BookOpen, LayoutTemplate, X } from 'lucide-react';
import AddRow from './AddRow.jsx';
import api from '../../lib/api.js';

const CLASS_COLORS = ['#5B8CFF', '#4FD1A5', '#F2B84B', '#E56B6B', '#8890A6'];

export default function NotesTree({
  tree,
  selectedNoteId,
  onSelectNote,
  onCreateClass,
  onCreateUnit,
  onCreateTopic,
  onCreateNote,
  collapsed,
  onToggleCollapsed
}) {
  if (collapsed) {
    return (
      <div className="w-8 shrink-0 border-r border-paper-rule bg-paper-raised flex flex-col items-center pt-3">
        <button
          onClick={onToggleCollapsed}
          title="Show classes"
          className="w-6 h-6 flex items-center justify-center rounded-md text-paper-muted hover:text-accent hover:bg-white/70"
        >
          <ChevronsRight size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-72 shrink-0 border-r border-paper-rule bg-paper-raised overflow-y-auto py-3 px-2">
      <div className="flex items-center justify-between px-2 mb-2">
        <p className="label-eyebrow">Classes</p>
        <button
          onClick={onToggleCollapsed}
          title="Hide classes"
          className="text-paper-muted hover:text-accent"
        >
          <ChevronsLeft size={14} />
        </button>
      </div>
      {tree.length === 0 && (
        <p className="text-xs text-paper-muted px-2 py-4">No classes yet — add one below to get started.</p>
      )}
      {tree.map((cls) => (
        <ClassNode
          key={cls.id}
          cls={cls}
          selectedNoteId={selectedNoteId}
          onSelectNote={onSelectNote}
          onCreateUnit={onCreateUnit}
          onCreateTopic={onCreateTopic}
          onCreateNote={onCreateNote}
        />
      ))}
      <div className="px-2 mt-1">
        <AddRow
          placeholder="Add class"
          onAdd={(name) =>
            onCreateClass({ name, color: CLASS_COLORS[tree.length % CLASS_COLORS.length], powerschool_period: null })
          }
        />
      </div>
    </div>
  );
}

function ClassNode({ cls, selectedNoteId, onSelectNote, onCreateUnit, onCreateTopic, onCreateNote }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-2 py-2 rounded-md hover:bg-white/70 text-left"
      >
        {open ? <ChevronDown size={13} className="text-paper-muted" /> : <ChevronRight size={13} className="text-paper-muted" />}
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cls.color }} />
        <span className="text-sm font-medium text-paper-ink truncate">{cls.name}</span>
      </button>

      {open && (
        <div className="ml-3 pl-2 border-l border-paper-rule">
          {cls.units.map((unit) => (
            <UnitNode
              key={unit.id}
              unit={unit}
              selectedNoteId={selectedNoteId}
              onSelectNote={onSelectNote}
              onCreateTopic={onCreateTopic}
              onCreateNote={onCreateNote}
            />
          ))}
          <AddRow placeholder="Add unit" indent={4} onAdd={(name) => onCreateUnit({ class_id: cls.id, name })} />
        </div>
      )}
    </div>
  );
}

function UnitNode({ unit, selectedNoteId, onSelectNote, onCreateTopic, onCreateNote }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-2 py-1 rounded-md hover:bg-white/70 text-left"
      >
        {open ? <ChevronDown size={12} className="text-paper-muted" /> : <ChevronRight size={12} className="text-paper-muted" />}
        <Folder size={12} className="text-paper-muted" />
        <span className="text-xs font-medium text-paper-ink truncate">{unit.name}</span>
      </button>

      {open && (
        <div className="ml-3 pl-2 border-l border-paper-rule">
          {unit.topics.map((topic) => (
            <TopicNode
              key={topic.id}
              topic={topic}
              selectedNoteId={selectedNoteId}
              onSelectNote={onSelectNote}
              onCreateNote={onCreateNote}
            />
          ))}
          <AddRow placeholder="Add topic" indent={4} onAdd={(name) => onCreateTopic({ unit_id: unit.id, name })} />
        </div>
      )}
    </div>
  );
}

function TopicNode({ topic, selectedNoteId, onSelectNote, onCreateNote }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-2 py-1 rounded-md hover:bg-white/70 text-left"
      >
        {open ? <ChevronDown size={11} className="text-paper-muted" /> : <ChevronRight size={11} className="text-paper-muted" />}
        <BookOpen size={11} className="text-paper-muted" />
        <span className="text-xs text-paper-muted truncate">{topic.name}</span>
      </button>

      {open && (
        <div className="ml-3 pl-2 border-l border-paper-rule">
          {topic.notes.map((note) => (
            <button
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              className={`flex items-center gap-2 w-full px-2 py-1 rounded-md text-left ${
                selectedNoteId === note.id ? 'bg-accent/15 text-accent' : 'text-paper-ink hover:bg-white/70'
              }`}
            >
              <FileText size={11} className="shrink-0" />
              <span className="text-xs truncate">{note.title}</span>
            </button>
          ))}
          <AddRow placeholder="New note" indent={4} onAdd={(title) => onCreateNote({ topic_id: topic.id, title })} />
          <NewFromTemplateRow onCreate={(title, templateId) => onCreateNote({ topic_id: topic.id, title, templateId })} />
        </div>
      )}
    </div>
  );
}

function NewFromTemplateRow({ onCreate }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [title, setTitle] = useState('');
  const [templateId, setTemplateId] = useState('');

  async function openPicker() {
    setOpen(true);
    setTemplates(await api.getNoteTemplates());
  }

  function submit() {
    if (!title.trim() || !templateId) return;
    onCreate(title.trim(), Number(templateId));
    setOpen(false);
    setTitle('');
    setTemplateId('');
  }

  if (!open) {
    return (
      <button
        onClick={openPicker}
        className="flex items-center gap-2 text-xs text-paper-muted hover:text-accent w-full py-1"
        style={{ paddingLeft: 4 }}
      >
        <LayoutTemplate size={11} /> New from template
      </button>
    );
  }

  return (
    <div style={{ paddingLeft: 4 }} className="py-1 space-y-2">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
          className="w-full bg-white/70 border border-accent/50 rounded-md px-2 py-1 text-xs text-paper-ink focus:outline-none"
        />
        <button onClick={() => setOpen(false)} className="shrink-0 text-paper-muted hover:text-paper-ink">
          <X size={12} />
        </button>
      </div>
      {templates.length === 0 ? (
        <p className="text-xs text-paper-muted">
          No templates yet — open a note, write it how you like, then "Save as template".
        </p>
      ) : (
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="w-full bg-white/70 border border-paper-rule rounded-md px-2 py-1 text-xs text-paper-ink focus:outline-none focus:border-accent"
        >
          <option value="">Choose a template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={submit}
        disabled={!title.trim() || !templateId}
        className="text-xs font-medium px-2 py-1 rounded-md bg-accent text-white hover:bg-accent-soft disabled:opacity-50"
      >
        Create
      </button>
    </div>
  );
}
