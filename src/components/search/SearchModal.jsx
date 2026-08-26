import { useEffect, useRef, useState } from 'react';
import { Search, FileText, X } from 'lucide-react';
import api from '../../lib/api.js';

function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function snippet(html, query) {
  const text = stripHtml(html);
  if (!text) return '';
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 100);
  const start = Math.max(0, idx - 40);
  return `${start > 0 ? '…' : ''}${text.slice(start, start + 120)}…`;
}

export default function SearchModal({ onClose, onOpenNote }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const r = await api.searchNotes(query.trim());
      setResults(r);
      setLoading(false);
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  function openResult(note) {
    onOpenNote(note.id);
    onClose();
  }

  return (
    <div className="modal-backdrop items-start pt-24" onClick={onClose}>
      <div
        className="modal-panel max-w-xl max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-base-border">
          <Search size={16} className="text-base-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all your notes…"
            className="flex-1 bg-transparent text-sm text-base-text focus:outline-none"
          />
          <button onClick={onClose} className="text-base-muted hover:text-base-text shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {!query.trim() && <p className="text-xs text-base-muted text-center py-8">Start typing to search titles and content.</p>}
          {query.trim() && !loading && results.length === 0 && (
            <p className="text-xs text-base-muted text-center py-8">No notes match "{query}".</p>
          )}
          <ul className="space-y-1">
            {results.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => openResult(n)}
                  className="w-full text-left px-3 py-3 rounded-lg hover:bg-base-card transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FileText size={12} className="text-base-muted shrink-0" />
                    <span className="text-sm font-medium text-base-text truncate">{n.title}</span>
                  </div>
                  <p className="text-xs text-base-muted truncate pl-[18px]">
                    {n.class_name} › {n.unit_name} › {n.topic_name}
                  </p>
                  {snippet(n.body_html, query) && (
                    <p className="text-xs text-base-muted mt-1 pl-[18px] truncate">{snippet(n.body_html, query)}</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
