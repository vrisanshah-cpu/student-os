import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useRef, useState } from 'react';
import { Pencil, Highlighter, ArrowUpRight, Undo2, Trash2, Check } from 'lucide-react';

const MIN_WIDTH = 160;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 560; // "nice and big" by default, not a thumbnail

const TOOL_COLORS = ['#E56B6B', '#5B8CFF', '#F2B84B', '#1F8A5F', '#2B2620'];

function safeParseAnnotations(json) {
  try {
    const parsed = JSON.parse(json || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Builds the two "wing" points of an arrowhead in the same percentage space as the stroke. */
function arrowHeadPoints(start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const headLen = Math.min(6, len * 0.5);
  const headWidth = headLen * 0.6;
  const backX = end[0] - ux * headLen;
  const backY = end[1] - uy * headLen;
  const perpX = -uy;
  const perpY = ux;
  return [
    [backX + (perpX * headWidth) / 2, backY + (perpY * headWidth) / 2],
    [backX - (perpX * headWidth) / 2, backY - (perpY * headWidth) / 2]
  ];
}

function toPointsAttr(points) {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

/** Renders saved strokes as an SVG overlay - pen/highlight as polylines, arrow as a line + arrowhead. */
function AnnotationOverlay({ strokes, live }) {
  const all = live ? [...strokes, live] : strokes;
  if (all.length === 0) return null;
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {all.map((s, i) => {
        if (!s.points || s.points.length < 2) return null;
        if (s.tool === 'arrow') {
          const start = s.points[0];
          const end = s.points[s.points.length - 1];
          const [w1, w2] = arrowHeadPoints(start, end);
          return (
            <g key={s.id || i}>
              <polyline points={toPointsAttr([start, end])} fill="none" stroke={s.color} strokeWidth={0.7} strokeLinecap="round" />
              <polygon points={toPointsAttr([w1, end, w2])} fill={s.color} />
            </g>
          );
        }
        const isHighlight = s.tool === 'highlight';
        return (
          <polyline
            key={s.id || i}
            points={toPointsAttr(s.points)}
            fill="none"
            stroke={s.color}
            strokeWidth={isHighlight ? 3 : 0.6}
            strokeOpacity={isHighlight ? 0.4 : 1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}

function ResizableImageView({ node, updateAttributes, selected }) {
  const dragRef = useRef(null);
  const wrapRef = useRef(null);
  const [annotating, setAnnotating] = useState(false);
  const [tool, setTool] = useState('pen'); // 'pen' | 'highlight' | 'arrow'
  const [color, setColor] = useState(TOOL_COLORS[0]);
  const [live, setLive] = useState(null);
  const [caption, setCaption] = useState(node.attrs.caption || '');

  const strokes = safeParseAnnotations(node.attrs.annotations);

  function startResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = node.attrs.width || DEFAULT_WIDTH;

    function onMove(moveEvent) {
      const next = Math.round(startWidth + (moveEvent.clientX - startX));
      updateAttributes({ width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)) });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function pointFromEvent(e) {
    const rect = wrapRef.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    return [x, y];
  }

  function startStroke(e) {
    if (!annotating) return;
    e.preventDefault();
    const point = pointFromEvent(e);
    let current = { id: Date.now(), tool, color, points: [point] };
    setLive(current);

    function onMove(moveEvent) {
      const p = pointFromEvent(moveEvent);
      // Arrow only needs the endpoints; pen/highlight record the full path.
      current = tool === 'arrow' ? { ...current, points: [current.points[0], p] } : { ...current, points: [...current.points, p] };
      setLive(current);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (current.points.length >= 2) {
        updateAttributes({ annotations: JSON.stringify([...strokes, current]) });
      }
      setLive(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function undoStroke() {
    updateAttributes({ annotations: JSON.stringify(strokes.slice(0, -1)) });
  }

  function clearStrokes() {
    updateAttributes({ annotations: '[]' });
  }

  function commitCaption() {
    updateAttributes({ caption });
  }

  return (
    <NodeViewWrapper
      as="figure"
      className="inline-block relative align-top my-2 not-prose"
      style={{ width: node.attrs.width || DEFAULT_WIDTH, maxWidth: '100%' }}
    >
      {(selected || annotating) && (
        <div
          className="absolute -top-9 left-0 z-20 flex items-center gap-1 p-1 rounded-md bg-white/85 backdrop-blur-md border border-paper-rule shadow-elevated"
          contentEditable={false}
        >
          <ToolbarToggle
            active={annotating}
            onClick={() => setAnnotating((a) => !a)}
            title={annotating ? 'Done annotating' : 'Annotate this image'}
          >
            {annotating ? <Check size={12} /> : <Pencil size={12} />}
          </ToolbarToggle>
          {annotating && (
            <>
              <span className="w-px h-4 bg-paper-rule mx-1" />
              <ToolbarToggle active={tool === 'pen'} onClick={() => setTool('pen')} title="Draw">
                <Pencil size={12} />
              </ToolbarToggle>
              <ToolbarToggle active={tool === 'highlight'} onClick={() => setTool('highlight')} title="Highlight">
                <Highlighter size={12} />
              </ToolbarToggle>
              <ToolbarToggle active={tool === 'arrow'} onClick={() => setTool('arrow')} title="Arrow">
                <ArrowUpRight size={12} />
              </ToolbarToggle>
              <span className="w-px h-4 bg-paper-rule mx-1" />
              {TOOL_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  title={c}
                  className={`w-3.5 h-3.5 rounded-full shrink-0 ${color === c ? 'ring-2 ring-offset-1 ring-accent' : ''}`}
                  style={{ background: c }}
                />
              ))}
              <span className="w-px h-4 bg-paper-rule mx-1" />
              <ToolbarToggle onClick={undoStroke} title="Undo last stroke">
                <Undo2 size={12} />
              </ToolbarToggle>
              <ToolbarToggle onClick={clearStrokes} title="Clear all annotations">
                <Trash2 size={12} />
              </ToolbarToggle>
            </>
          )}
        </div>
      )}

      <div
        ref={wrapRef}
        onMouseDown={startStroke}
        className={`relative ${annotating ? 'cursor-crosshair' : ''}`}
      >
        <img
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          className={`w-full h-auto rounded-lg block ${selected ? 'ring-2 ring-accent' : ''}`}
          draggable={false}
        />
        <AnnotationOverlay strokes={strokes} live={live} />
        {!annotating && (
          <span
            ref={dragRef}
            onMouseDown={startResize}
            title="Drag to resize"
            className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-sm bg-accent cursor-nwse-resize opacity-0 hover:opacity-100"
            style={{ opacity: selected ? 0.9 : undefined }}
          />
        )}
      </div>

      <figcaption contentEditable={false}>
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={commitCaption}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder="Add a caption…"
          className="w-full mt-2 bg-transparent text-xs text-paper-muted italic text-center focus:outline-none focus:text-paper-ink"
        />
      </figcaption>
    </NodeViewWrapper>
  );
}

function ToolbarToggle({ children, onClick, title, active }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${
        active ? 'bg-accent/15 text-accent' : 'text-paper-muted hover:text-paper-ink hover:bg-paper-rule/40'
      }`}
    >
      {children}
    </button>
  );
}

export const ResizableImage = Node.create({
  name: 'resizableImage',
  group: 'block',
  inline: false,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      width: { default: DEFAULT_WIDTH },
      caption: { default: '' },
      annotations: { default: '[]' }
    };
  },

  parseHTML() {
    return [
      {
        // Current format: a <figure> wrapping the image, caption, and annotations.
        tag: 'figure[data-resizable-image]',
        getAttrs: (el) => ({
          src: el.querySelector('img')?.getAttribute('src') || null,
          alt: el.querySelector('img')?.getAttribute('alt') || '',
          width: Number(el.getAttribute('data-width')) || DEFAULT_WIDTH,
          caption: el.getAttribute('data-caption') || '',
          annotations: el.getAttribute('data-annotations') || '[]'
        })
      },
      {
        // Legacy format from before captions/annotations existed: a bare <img>.
        tag: 'img[data-resizable-image]',
        getAttrs: (el) => ({
          src: el.getAttribute('src'),
          alt: el.getAttribute('alt') || '',
          width: Number(el.getAttribute('data-width')) || DEFAULT_WIDTH,
          caption: '',
          annotations: '[]'
        })
      }
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'figure',
      mergeAttributes(HTMLAttributes, {
        'data-resizable-image': '',
        'data-width': node.attrs.width,
        'data-caption': node.attrs.caption || '',
        'data-annotations': node.attrs.annotations || '[]',
        style: `width:${node.attrs.width}px;max-width:100%;`
      }),
      ['img', { src: node.attrs.src, alt: node.attrs.alt, style: 'width:100%;height:auto;' }],
      ['figcaption', {}, node.attrs.caption || '']
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  }
});

export default ResizableImage;
