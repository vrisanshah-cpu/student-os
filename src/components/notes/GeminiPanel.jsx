import { useState } from 'react';
import { Sparkles, Loader2, Copy, Download, FilePlus2, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../../lib/api.js';

/**
 * The "Custom Gemini Prompt Builder" from the spec: two buttons that turn a
 * fixed set of note IDs into either a Study Guide or a Practice Exam. It
 * never sees calendar data or grades, and it never fires on its own -
 * only on an explicit button press, using only the notes handed to it.
 *
 * Reused in two places: the "Study for this test" tag modal (noteIds come
 * from a tag) and the single-note sidebar in the Note Editor (noteIds is
 * just the current note).
 */
export default function GeminiPanel({ noteIds = [], contextLabel, onSaveAsNote, compact = false }) {
  const [questionCount, setQuestionCount] = useState(10);
  const [generating, setGenerating] = useState(null); // null | 'guide' | 'exam'
  const [result, setResult] = useState('');
  const [resultKind, setResultKind] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasNotes = noteIds.length > 0;

  async function generate(kind) {
    if (!hasNotes) {
      setError('Select at least one note to build from.');
      return;
    }
    setGenerating(kind);
    setError('');
    setResult('');
    setCopied(false);
    setSaved(false);
    try {
      const text =
        kind === 'guide' ? await api.generateStudyGuide(noteIds) : await api.generatePracticeExam(noteIds, questionCount);
      setResult(text);
      setResultKind(kind);
    } catch (e) {
      setError(e?.message || 'Something went wrong generating that. Check your Gemini API key in Settings.');
    } finally {
      setGenerating(null);
    }
  }

  function copyResult() {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadResult() {
    const blob = new Blob([result], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resultKind === 'exam' ? 'practice-exam' : 'study-guide'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveAsNote() {
    if (!onSaveAsNote) return;
    await onSaveAsNote(result, resultKind);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs font-medium text-paper-muted">
          <Sparkles size={12} /> Gemini study engine
        </div>
        {contextLabel && <span className="text-xs text-paper-muted truncate">{contextLabel}</span>}
      </div>

      <div className={`flex items-center gap-2 flex-wrap ${compact ? '' : 'pt-1'}`}>
        <button
          onClick={() => generate('guide')}
          disabled={generating !== null || !hasNotes}
          className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg bg-accent text-white hover:bg-accent-soft disabled:opacity-50"
        >
          {generating === 'guide' && <Loader2 size={12} className="animate-spin" />} Study Guide
        </button>
        <button
          onClick={() => generate('exam')}
          disabled={generating !== null || !hasNotes}
          className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-accent/50 text-accent hover:bg-accent/10 disabled:opacity-50"
        >
          {generating === 'exam' && <Loader2 size={12} className="animate-spin" />} Practice Exam
        </button>
        <input
          type="number"
          min={5}
          max={30}
          value={questionCount}
          onChange={(e) => setQuestionCount(Number(e.target.value))}
          className="w-14 bg-white/70 border border-paper-rule rounded-lg px-2 py-2 text-xs text-paper-ink text-center focus:outline-none"
          title="Number of questions (practice exam)"
        />
      </div>

      {!hasNotes && <p className="text-xs text-paper-muted mt-2">Nothing selected yet — pick a tag or note above.</p>}
      {error && <p className="text-xs text-accent-danger mt-2">{error}</p>}

      {result && (
        <div className="mt-4 border-t border-paper-rule pt-4">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={copyResult}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-paper-rule text-paper-muted hover:text-accent hover:border-accent/50"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={downloadResult}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-paper-rule text-paper-muted hover:text-accent hover:border-accent/50"
            >
              <Download size={11} /> Download .md
            </button>
            {onSaveAsNote && (
              <button
                onClick={saveAsNote}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-paper-rule text-paper-muted hover:text-accent hover:border-accent/50"
              >
                {saved ? <Check size={11} /> : <FilePlus2 size={11} />} {saved ? 'Saved' : 'Save as note'}
              </button>
            )}
          </div>
          <div className="prose-note text-sm text-paper-ink leading-relaxed max-h-72 overflow-y-auto pr-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
