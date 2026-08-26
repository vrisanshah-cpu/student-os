import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import { SymbolPalette } from './mathNode.jsx';

/**
 * The standalone, display-style sibling of the inline math chip - a full
 * width, larger equation meant to sit on its own line (derivations, final
 * formulas) rather than inline with a sentence.
 */
function MathBlockView({ node, updateAttributes, selected }) {
  const [editing, setEditing] = useState(!node.attrs.latex);
  const [value, setValue] = useState(node.attrs.latex || '');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    updateAttributes({ latex: value });
    setEditing(false);
  }

  function insertSnippet(snippet) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el?.focus();
      const braceIdx = snippet.indexOf('{}');
      const cursor = start + (braceIdx >= 0 ? braceIdx + 1 : snippet.length);
      el?.setSelectionRange(cursor, cursor);
    });
  }

  if (editing) {
    return (
      <NodeViewWrapper
        as="div"
        className={`math-block-chip relative my-3 ${selected ? 'is-selected' : ''}`}
        contentEditable={false}
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setValue(node.attrs.latex || '');
                setEditing(false);
              }
            }}
            placeholder="e.g. x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}"
            className="flex-1"
          />
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={commit} className="shrink-0 text-xs font-medium text-accent hover:underline">
            done
          </button>
        </div>
        <SymbolPalette onInsert={insertSnippet} />
      </NodeViewWrapper>
    );
  }

  let html;
  try {
    html = katex.renderToString(node.attrs.latex || '', { throwOnError: false, output: 'html', displayMode: true });
  } catch {
    html = node.attrs.latex;
  }

  return (
    <NodeViewWrapper
      as="div"
      className={`math-block-chip my-3 ${selected ? 'is-selected' : ''}`}
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
    >
      <div className="flex justify-center py-1" dangerouslySetInnerHTML={{ __html: html }} />
    </NodeViewWrapper>
  );
}

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      latex: { default: '' }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-math-block]',
        getAttrs: (el) => ({ latex: el.getAttribute('data-latex') || '' })
      }
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-math-block': '', 'data-latex': node.attrs.latex })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  }
});

export default MathBlock;
