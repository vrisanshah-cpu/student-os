import { useCallback, useEffect, useState } from 'react';
import { Sparkles, NotebookText } from 'lucide-react';
import api from '../../lib/api.js';
import NotesTree from './NotesTree.jsx';
import NoteEditor from './NoteEditor.jsx';

export default function NoteStudio({ openNoteId, onOpened, onOpenStudyModal }) {
  const [tree, setTree] = useState([]);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [selectedNote, setSelectedNote] = useState(null);
  const [loadingTree, setLoadingTree] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [treeCollapsed, setTreeCollapsed] = useState(false);

  const loadTree = useCallback(async () => {
    const result = await api.getNotesTree();
    setTree(result);
    setLoadingTree(false);
    return result;
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    if (!selectedNoteId) {
      setSelectedNote(null);
      return;
    }
    api.getNoteById(selectedNoteId).then(setSelectedNote);
  }, [selectedNoteId]);

  // Jumping here from a search result (or anywhere else) - consume it once.
  useEffect(() => {
    if (openNoteId) {
      setSelectedNoteId(openNoteId);
      onOpened?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNoteId]);

  async function handleCreateClass(payload) {
    await api.createClass(payload);
    await loadTree();
  }

  async function handleCreateUnit(payload) {
    await api.createUnit(payload);
    await loadTree();
  }

  async function handleCreateTopic(payload) {
    await api.createTopic(payload);
    await loadTree();
  }

  async function handleCreateNote({ topic_id, title, templateId }) {
    let body_html = '';
    if (templateId) {
      const templates = await api.getNoteTemplates();
      body_html = templates.find((t) => t.id === templateId)?.body_html || '';
    }
    const id = await api.saveNote({
      topic_id,
      title,
      body_html,
      mindmap_json: '',
      quizlet_url: '',
      drive_url: ''
    });
    await loadTree();
    setSelectedNoteId(id);
  }

  async function handleSaveNote(note) {
    const id = await api.saveNote(note);
    await loadTree();
    if (!note.id) setSelectedNoteId(id);
    return id || note.id;
  }

  async function handleDeleteNote(id) {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    await api.deleteNote(id);
    setSelectedNoteId(null);
    await loadTree();
  }

  // A Gemini result the user chose to keep gets saved as a brand-new note
  // in the same topic as the note it was generated from - never overwrites
  // the source note, and never happens without the explicit "Save as note" click.
  async function handleSaveGenerated(payload) {
    await api.saveNote({ ...payload, mindmap_json: '', quizlet_url: '', drive_url: '' });
    await loadTree();
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <NotesTree
        tree={tree}
        selectedNoteId={selectedNoteId}
        onSelectNote={setSelectedNoteId}
        onCreateClass={handleCreateClass}
        onCreateUnit={handleCreateUnit}
        onCreateTopic={handleCreateTopic}
        onCreateNote={handleCreateNote}
        collapsed={treeCollapsed}
        onToggleCollapsed={() => setTreeCollapsed((c) => !c)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-end px-4 py-2 border-b border-paper-rule bg-paper-raised">
          <button
            onClick={onOpenStudyModal}
            className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-accent/40 text-accent hover:bg-accent/10"
          >
            <Sparkles size={13} /> Study for this test
          </button>
        </div>
        {selectedNote ? (
          <NoteEditor
            key={selectedNote.id}
            note={selectedNote}
            onSave={handleSaveNote}
            onDelete={handleDeleteNote}
            onSaveGenerated={handleSaveGenerated}
            fullscreen={fullscreen}
            onToggleFullscreen={() => setFullscreen((f) => !f)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <NotebookText size={22} className="text-paper-muted mx-auto mb-2" />
              <p className="text-sm text-paper-muted">
                {loadingTree ? 'Loading your notes…' : 'Select a note, or add a class to get started.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
