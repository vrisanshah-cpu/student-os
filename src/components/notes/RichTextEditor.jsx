import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  Palette,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Link2,
  Sigma,
  Superscript,
  Minus,
  ImagePlus,
  Table as TableIcon,
  Printer
} from 'lucide-react';
import MathInline from './mathNode.jsx';
import MathBlock from './mathBlockNode.jsx';
import ResizableImage from './resizableImageNode.jsx';
import SpreadsheetBlock from './spreadsheetNode.jsx';
import FontSize from './fontSizeMark.jsx';
import CanvasLayer from './CanvasLayer.jsx';
import GhostCompletion, { setGhostSuggestion } from './ghostCompletion.jsx';
import api from '../../lib/api.js';

const AUTOCOMPLETE_DEBOUNCE_MS = 600;
const AUTOCOMPLETE_MIN_CONTEXT = 6;

const TEXT_COLORS = [
  { label: 'Ink', value: null },
  { label: 'Blue', value: '#2F5FD1' },
  { label: 'Green', value: '#1F8A5F' },
  { label: 'Amber', value: '#B4740E' },
  { label: 'Red', value: '#C6423D' },
  { label: 'Purple', value: '#7C4DBE' }
];

const HIGHLIGHT_COLORS = [
  { label: 'None', value: null },
  { label: 'Yellow', value: '#FDE68A' },
  { label: 'Green', value: '#BBF0D4' },
  { label: 'Blue', value: '#BFDBFE' },
  { label: 'Pink', value: '#FBCFE8' },
  { label: 'Orange', value: '#FED7AA' }
];

export default function RichTextEditor({
  noteId,
  content,
  onChange,
  editable = true,
  placeholder = 'Start writing…',
  roomy = false
}) {
  const [wordCount, setWordCount] = useState(0);
  const geminiEnabledRef = useRef(false);
  const autocompleteTimerRef = useRef(null);
  const requestTokenRef = useRef(0);

  // Checked once per mount; if there's no key, autocomplete simply never
  // schedules a request - no errors, no retry storms, nothing to see.
  useEffect(() => {
    api
      .getSetting('gemini_api_key', true)
      .then((v) => {
        geminiEnabledRef.current = Boolean(v);
      })
      .catch(() => {
        geminiEnabledRef.current = false;
      });
  }, []);

  useEffect(() => () => clearTimeout(autocompleteTimerRef.current), []);

  function scheduleAutocomplete(ed) {
    clearTimeout(autocompleteTimerRef.current);
    if (!geminiEnabledRef.current) return;
    autocompleteTimerRef.current = setTimeout(() => runAutocomplete(ed), AUTOCOMPLETE_DEBOUNCE_MS);
  }

  async function runAutocomplete(ed) {
    if (!geminiEnabledRef.current || !ed || ed.isDestroyed || !ed.isEditable) return;
    const { selection } = ed.state;
    if (!selection.empty) return; // only autocomplete from a plain cursor, not a range selection
    const { $from } = selection;
    const blockStart = $from.start($from.depth);
    const pos = $from.pos;
    const text = ed.state.doc.textBetween(Math.max(blockStart, pos - 800), pos, '\n', '\n');
    if (!text || text.trim().length < AUTOCOMPLETE_MIN_CONTEXT) return;

    const token = ++requestTokenRef.current;
    try {
      const suggestion = await api.geminiAutocomplete(text);
      if (token !== requestTokenRef.current) return; // a newer keystroke already superseded this request
      if (!suggestion || !suggestion.trim()) return;
      setGhostSuggestion(ed, suggestion, pos);
    } catch {
      // Offline, no key, or the API errored - degrade silently, never surface this to the writer.
    }
  }

  async function insertImageFile() {
    const url = await api.pickImage();
    if (url) editor.chain().focus().insertContent({ type: 'resizableImage', attrs: { src: url } }).run();
  }

  async function insertImageFromDataUrl(dataUrl, extension) {
    const url = await api.saveImageData({ dataUrl, extension });
    editor.chain().focus().insertContent({ type: 'resizableImage', attrs: { src: url } }).run();
  }

  function insertSpreadsheet() {
    editor.chain().focus().insertContent({ type: 'spreadsheetBlock' }).run();
  }

  function handlePrint() {
    window.print();
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      Placeholder.configure({ placeholder }),
      Typography,
      TaskList,
      TaskItem.configure({ nested: true }),
      MathInline,
      MathBlock,
      ResizableImage,
      SpreadsheetBlock,
      FontSize,
      GhostCompletion
    ],
    content: content || '',
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      setWordCount(countWords(editor.getText()));
      scheduleAutocomplete(editor);
    },
    onCreate: ({ editor }) => setWordCount(countWords(editor.getText())),
    editorProps: {
      attributes: { class: 'tiptap-content focus:outline-none' },
      handlePaste: (_view, event) => {
        const item = Array.from(event.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
        if (!item) return false;
        event.preventDefault();
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = () => insertImageFromDataUrl(reader.result, file.type.split('/')[1]);
        reader.readAsDataURL(file);
        return true;
      },
      handleDrop: (_view, event) => {
        const file = Array.from(event.dataTransfer?.files || []).find((f) => f.type.startsWith('image/'));
        if (!file) return false;
        event.preventDefault();
        const reader = new FileReader();
        reader.onload = () => insertImageFromDataUrl(reader.result, file.type.split('/')[1]);
        reader.readAsDataURL(file);
        return true;
      }
    }
  });

  if (!editor) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <EditorToolbar editor={editor} onInsertImage={insertImageFile} onInsertSpreadsheet={insertSpreadsheet} onPrint={handlePrint} />
      <div className={`flex-1 overflow-y-auto bg-paper-rule/30 ${roomy ? 'px-10 py-14' : 'px-6 py-8'}`}>
        <div
          className={`editor-page print-page mx-auto ${roomy ? 'max-w-4xl px-16 py-16' : 'max-w-3xl px-10 py-10'}`}
        >
          <EditorContent editor={editor} />
          {noteId && <CanvasLayer noteId={noteId} />}
        </div>
      </div>
      <div className="px-4 py-2 border-t border-paper-rule bg-paper-raised text-xs text-paper-muted text-right">
        {wordCount} {wordCount === 1 ? 'word' : 'words'}
      </div>
    </div>
  );
}

function countWords(text) {
  const trimmed = (text || '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function EditorToolbar({ editor, onInsertImage, onInsertSpreadsheet, onPrint }) {
  const [openPopover, setOpenPopover] = useState(null); // 'color' | 'highlight' | null

  const headingValue = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
    ? 'h2'
    : editor.isActive('heading', { level: 3 })
    ? 'h3'
    : 'p';

  const fontSizeValue = editor.getAttributes('fontSize').size || '';

  function applyStyle(value) {
    const chain = editor.chain().focus();
    if (value === 'p') chain.setParagraph().run();
    else chain.setHeading({ level: Number(value.replace('h', '')) }).run();
  }

  function applyFontSize(value) {
    if (!value) editor.chain().focus().unsetFontSize().run();
    else editor.chain().focus().setFontSize(value).run();
  }

  function setLink() {
    const previous = editor.getAttributes('link').href;
    const url = window.prompt('Link URL', previous || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  }

  function insertMath() {
    editor.chain().focus().insertContent({ type: 'mathInline', attrs: { latex: '' } }).run();
  }

  function insertMathBlock() {
    editor.chain().focus().insertContent({ type: 'mathBlock', attrs: { latex: '' } }).run();
  }

  function pickTextColor(value) {
    if (value) editor.chain().focus().setColor(value).run();
    else editor.chain().focus().unsetColor().run();
    setOpenPopover(null);
  }

  function pickHighlight(value) {
    if (value) editor.chain().focus().setHighlight({ color: value }).run();
    else editor.chain().focus().unsetHighlight().run();
    setOpenPopover(null);
  }

  return (
    <div className="flex items-center gap-1 flex-wrap px-4 py-2 border-b border-paper-rule bg-paper-raised relative">
      <IconButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
        <Undo2 size={14} />
      </IconButton>
      <IconButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
        <Redo2 size={14} />
      </IconButton>

      <Divider />

      <select
        value={headingValue}
        onChange={(e) => applyStyle(e.target.value)}
        className="bg-white/70 border border-paper-rule rounded-md text-xs text-paper-ink px-2 py-2 focus:outline-none focus:border-accent"
        title="Text style"
      >
        <option value="p">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>

      <select
        value={fontSizeValue}
        onChange={(e) => applyFontSize(e.target.value)}
        className="bg-white/70 border border-paper-rule rounded-md text-xs text-paper-ink px-2 py-2 focus:outline-none focus:border-accent"
        title="Text size"
      >
        <option value="">Normal</option>
        <option value="13px">Small</option>
        <option value="20px">Large</option>
        <option value="26px">Huge</option>
      </select>

      <Divider />

      <IconButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
        <Bold size={14} />
      </IconButton>
      <IconButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
        <Italic size={14} />
      </IconButton>
      <IconButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        title="Underline"
      >
        <UnderlineIcon size={14} />
      </IconButton>
      <IconButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title="Strikethrough"
      >
        <Strikethrough size={14} />
      </IconButton>

      <div className="relative">
        <IconButton onClick={() => setOpenPopover(openPopover === 'color' ? null : 'color')} title="Text color">
          <Palette size={14} />
        </IconButton>
        {openPopover === 'color' && (
          <ColorPopover colors={TEXT_COLORS} onPick={pickTextColor} onClose={() => setOpenPopover(null)} />
        )}
      </div>
      <div className="relative">
        <IconButton
          onClick={() => setOpenPopover(openPopover === 'highlight' ? null : 'highlight')}
          active={editor.isActive('highlight')}
          title="Highlight"
        >
          <Highlighter size={14} />
        </IconButton>
        {openPopover === 'highlight' && (
          <ColorPopover colors={HIGHLIGHT_COLORS} onPick={pickHighlight} onClose={() => setOpenPopover(null)} />
        )}
      </div>

      <Divider />

      <IconButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Bulleted list"
      >
        <List size={14} />
      </IconButton>
      <IconButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Numbered list"
      >
        <ListOrdered size={14} />
      </IconButton>
      <IconButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive('taskList')}
        title="Checklist"
      >
        <ListChecks size={14} />
      </IconButton>
      <IconButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title="Quote"
      >
        <Quote size={14} />
      </IconButton>

      <Divider />

      <IconButton onClick={setLink} active={editor.isActive('link')} title="Link">
        <Link2 size={14} />
      </IconButton>
      <IconButton onClick={insertMath} title="Insert inline math (KaTeX). Or type /formula">
        <Sigma size={14} />
      </IconButton>
      <IconButton onClick={insertMathBlock} title="Insert block equation">
        <Superscript size={14} />
      </IconButton>
      <IconButton onClick={onInsertImage} title="Insert image">
        <ImagePlus size={14} />
      </IconButton>
      <IconButton onClick={onInsertSpreadsheet} title="Insert spreadsheet + chart">
        <TableIcon size={14} />
      </IconButton>
      <IconButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
        <Minus size={14} />
      </IconButton>

      <Divider />

      <IconButton onClick={onPrint} title="Print / Save as PDF">
        <Printer size={14} />
      </IconButton>
    </div>
  );
}

function ColorPopover({ colors, onPick }) {
  return (
    <div className="absolute top-9 left-0 z-10 flex items-center gap-2 p-2 rounded-lg bg-white/70 border border-paper-rule shadow-page">
      {colors.map((c) => (
        <button
          key={c.label}
          onClick={() => onPick(c.value)}
          title={c.label}
          className="w-5 h-5 rounded-full border border-paper-rule shrink-0"
          style={{ background: c.value || 'transparent' }}
        >
          {!c.value && <Minus size={12} className="text-paper-muted mx-auto" />}
        </button>
      ))}
    </div>
  );
}

function IconButton({ children, onClick, title, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
        active ? 'bg-accent/15 text-accent' : 'text-paper-muted hover:text-paper-ink hover:bg-white/70'
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="w-px h-5 bg-paper-rule mx-1 shrink-0" />;
}
