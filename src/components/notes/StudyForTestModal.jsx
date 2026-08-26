import { useEffect, useState } from 'react';
import { X, Sparkles, FileText, AlertCircle, Link2, ExternalLink } from 'lucide-react';
import api from '../../lib/api.js';
import GeminiPanel from './GeminiPanel.jsx';

export default function StudyForTestModal({ onClose }) {
  const [tags, setTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState('');
  const [tagged, setTagged] = useState({ notes: [], deadlines: [] });
  const [selectedNoteIds, setSelectedNoteIds] = useState([]);

  useEffect(() => {
    api.getAllTags().then(setTags);
  }, []);

  useEffect(() => {
    if (!selectedTag) {
      setTagged({ notes: [], deadlines: [] });
      setSelectedNoteIds([]);
      return;
    }
    api.getTagged(selectedTag).then((res) => {
      setTagged(res);
      setSelectedNoteIds(res.notes.map((n) => n.id));
    });
  }, [selectedTag]);

  function toggleNote(id) {
    setSelectedNoteIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-panel max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-border">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            <h3 className="font-display text-base font-semibold text-base-text">Study for this test</h3>
          </div>
          <button onClick={onClose} className="text-base-muted hover:text-base-text">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-base-muted mb-2">Pick a tag</label>
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="w-full bg-base-card border border-base-border rounded-lg px-3 py-2 text-sm text-base-text focus:outline-none focus:border-accent"
            >
              <option value="">Select a tag…</option>
              {tags.map((t) => (
                <option key={t.id} value={t.name}>
                  #{t.name}
                </option>
              ))}
            </select>
            {tags.length === 0 && (
              <p className="text-xs text-base-muted mt-2">
                No tags yet — add one to a note (e.g. #AP_Econ) or a deadline first.
              </p>
            )}
          </div>

          {selectedTag && (
            <>
              {tagged.deadlines.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tagged.deadlines.map((d) => (
                    <span
                      key={d.id}
                      className="flex items-center gap-2 text-xs px-2 py-1 rounded-full border border-accent-danger/30 bg-accent-danger/10 text-accent-danger"
                    >
                      <AlertCircle size={11} /> {d.title}
                    </span>
                  ))}
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-base-muted mb-2">
                  Notes tagged #{selectedTag} ({tagged.notes.length})
                </p>
                {tagged.notes.length === 0 ? (
                  <p className="text-xs text-base-muted">No notes have this tag yet.</p>
                ) : (
                  <ul className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {tagged.notes.map((n) => (
                      <li key={n.id}>
                        <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-base-card border border-base-border cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedNoteIds.includes(n.id)}
                            onChange={() => toggleNote(n.id)}
                            className="accent-accent"
                          />
                          <FileText size={12} className="text-base-muted shrink-0" />
                          <span className="text-xs text-base-text truncate flex-1">{n.title}</span>
                          {(n.quizlet_url || n.drive_url) && (
                            <span className="flex items-center gap-1 shrink-0">
                              {n.quizlet_url && (
                                <a
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    api.openExternal(n.quizlet_url);
                                  }}
                                  title="Open Quizlet set"
                                  className="text-base-muted hover:text-accent"
                                >
                                  <Link2 size={11} />
                                </a>
                              )}
                              {n.drive_url && (
                                <a
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    api.openExternal(n.drive_url);
                                  }}
                                  title="Open Drive link"
                                  className="text-base-muted hover:text-accent"
                                >
                                  <ExternalLink size={11} />
                                </a>
                              )}
                            </span>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-1 border-t border-base-border">
                <GeminiPanel
                  noteIds={selectedNoteIds}
                  contextLabel={`#${selectedTag} · ${selectedNoteIds.length} selected`}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
