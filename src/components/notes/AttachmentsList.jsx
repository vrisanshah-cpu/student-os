import { useEffect, useState } from 'react';
import { Paperclip, FileText, Image as ImageIcon, ExternalLink, Upload } from 'lucide-react';
import api from '../../lib/api.js';

export default function AttachmentsList({ noteId }) {
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);

  async function load() {
    if (!noteId) return;
    setAttachments(await api.getAttachmentsForNote(noteId));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  async function handleUpload(kind) {
    setUploading(true);
    try {
      const result = await api.pickAttachment({ noteId, kind });
      if (result) setAttachments((a) => [result, ...a]);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs font-medium text-paper-muted">
          <Paperclip size={12} /> Attachments
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => handleUpload('pdf')}
            disabled={uploading}
            className="text-xs px-2 py-1 rounded-full border border-paper-rule text-paper-muted hover:text-accent hover:border-accent/50"
          >
            + PDF
          </button>
          <button
            onClick={() => handleUpload('image')}
            disabled={uploading}
            className="text-xs px-2 py-1 rounded-full border border-paper-rule text-paper-muted hover:text-accent hover:border-accent/50"
          >
            + Image
          </button>
        </div>
      </div>
      {attachments.length === 0 ? (
        <p className="text-xs text-paper-muted flex items-center gap-2">
          <Upload size={12} /> No files yet — attach slides or diagrams.
        </p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => api.openPath(a.file_path)}
                className="flex items-center gap-2 w-full text-left px-2 py-2 rounded-md bg-white/70 border border-paper-rule hover:border-accent/40 text-xs text-paper-ink truncate"
              >
                {a.file_type === 'image' ? (
                  <ImageIcon size={12} className="shrink-0 text-paper-muted" />
                ) : (
                  <FileText size={12} className="shrink-0 text-paper-muted" />
                )}
                <span className="truncate">{a.label}</span>
                <ExternalLink size={11} className="ml-auto shrink-0 text-paper-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
