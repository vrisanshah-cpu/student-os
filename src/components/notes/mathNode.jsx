import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import katex from 'katex';

const SYMBOL_GROUPS = [
  {
    label: 'Greek',
    symbols: [
      ['α', '\\alpha'], ['β', '\\beta'], ['γ', '\\gamma'], ['Δ', '\\Delta'],
      ['θ', '\\theta'], ['λ', '\\lambda'], ['π', '\\pi'], ['Σ', '\\Sigma'],
      ['φ', '\\phi'], ['ω', '\\omega'], ['μ', '\\mu'], ['σ', '\\sigma']
    ]
  },
  {
    label: 'Operators',
    symbols: [
      ['×', '\\times'], ['÷', '\\div'], ['±', '\\pm'], ['·', '\\cdot'],
      ['√', '\\sqrt{}'], ['ⁿ√', '\\sqrt[n]{}'], ['xʸ', '^{}'], ['xᵧ', '_{}'],
      ['a/b', '\\frac{}{}'], ['°', '^\\circ']
    ]
  },
  {
    label: 'Compare',
    symbols: [
      ['≤', '\\le'], ['≥', '\\ge'], ['≠', '\\neq'], ['≈', '\\approx'],
      ['∈', '\\in'], ['∉', '\\notin'], ['⊂', '\\subset'], ['∞', '\\infty']
    ]
  },
  {
    label: 'Big ops',
    symbols: [
      ['∑', '\\sum_{}^{}'], ['∏', '\\prod_{}^{}'], ['∫', '\\int_{}^{}'],
      ['∬', '\\iint'], ['∪', '\\cup'], ['∩', '\\cap'], ['⋃', '\\bigcup'], ['⋂', '\\bigcap']
    ]
  },
  {
    label: 'Brackets',
    symbols: [
      ['( )', '()'], ['[ ]', '[]'], ['{ }', '\\{\\}'], ['| |', '\\left|\\right|'],
      ['⌈ ⌉', '\\lceil\\rceil'], ['⌊ ⌋', '\\lfloor\\rfloor']
    ]
  },
  {
    label: 'Calculus',
    symbols: [
      ['lim', '\\lim_{x \\to }'], ['d/dx', '\\frac{d}{dx}'], ['∂', '\\partial'],
      ['∇', '\\nabla'], ["f'", "f'(x)"], ['→', '\\to']
    ]
  }
];

export function SymbolPalette({ onInsert }) {
  const [group, setGroup] = useState(0);
  return (
    <div
      className="absolute top-full left-0 mt-1 z-20 w-72 p-2 rounded-lg bg-white/90 backdrop-blur-md border border-paper-rule shadow-elevated"
      onMouseDown={(e) => e.preventDefault()} // keep focus in the equation input
    >
      <div className="flex flex-wrap gap-1 mb-2 pb-2 border-b border-paper-rule">
        {SYMBOL_GROUPS.map((g, i) => (
          <button
            key={g.label}
            onClick={() => setGroup(i)}
            className={`text-xs font-medium px-2 py-1 rounded ${
              group === i ? 'bg-accent/15 text-accent' : 'text-paper-muted hover:text-paper-ink'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-1">
        {SYMBOL_GROUPS[group].symbols.map(([label, snippet]) => (
          <button
            key={label + snippet}
            onClick={() => onInsert(snippet)}
            title={snippet}
            className="h-7 flex items-center justify-center rounded-md text-sm text-paper-ink bg-paper-DEFAULT hover:bg-accent/10 hover:text-accent"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * An inline "chip" that holds a LaTeX string and renders it live with
 * KaTeX. Double-click to edit; Enter/blur commits and re-renders. While
 * editing, a Docs-style symbol palette is available for building the
 * expression without memorizing LaTeX syntax.
 */
function MathChipView({ node, updateAttributes, selected }) {
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
    // put the cursor inside the first empty {} if there is one, else after the snippet
    requestAnimationFrame(() => {
      el?.focus();
      const braceIdx = snippet.indexOf('{}');
      const cursor = start + (braceIdx >= 0 ? braceIdx + 1 : snippet.length);
      el?.setSelectionRange(cursor, cursor);
    });
  }

  if (editing) {
    return (
      <NodeViewWrapper as="span" className={`math-chip relative ${selected ? 'is-selected' : ''}`}>
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
          placeholder="e.g. E=mc^2"
          size={Math.max(4, value.length)}
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={commit}
          className="ml-1 text-xs font-medium text-accent hover:underline"
        >
          done
        </button>
        <SymbolPalette onInsert={insertSnippet} />
      </NodeViewWrapper>
    );
  }

  let html;
  try {
    html = katex.renderToString(node.attrs.latex || '', { throwOnError: false, output: 'html' });
  } catch {
    html = node.attrs.latex;
  }

  return (
    <NodeViewWrapper
      as="span"
      className={`math-chip ${selected ? 'is-selected' : ''}`}
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
    >
      <span dangerouslySetInnerHTML={{ __html: html }} />
    </NodeViewWrapper>
  );
}

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: { default: '' }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-math-inline]',
        getAttrs: (el) => ({ latex: el.getAttribute('data-latex') || '' })
      }
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-math-inline': '', 'data-latex': node.attrs.latex })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathChipView);
  },

  // Typing "/formula " drops in a math chip already in edit mode, so someone
  // who doesn't have LaTeX memorized can build the expression from the
  // symbol palette instead of typing it from scratch.
  addInputRules() {
    return [
      new InputRule({
        find: /\/formula[- ]$/,
        handler: ({ range, chain }) => {
          chain().deleteRange(range).insertContent({ type: this.name, attrs: { latex: '' } }).run();
        }
      })
    ];
  }
});

export default MathInline;
