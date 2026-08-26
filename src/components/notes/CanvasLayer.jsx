import { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import * as math from 'mathjs';
import {
  X,
  GripVertical,
  StickyNote as StickyNoteIcon,
  Image as ImageIcon,
  Sigma,
  LineChart as LineChartIcon,
  Plus
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import api from '../../lib/api.js';

const STICKY_COLORS = ['#FDE68A', '#BBF0D4', '#BFDBFE', '#FBCFE8', '#FED7AA'];
const GRAPH_COLORS = ['#5B8CFF', '#4FD1A5', '#F2B84B', '#E56B6B', '#7C4DBE'];

export default function CanvasLayer({ noteId }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (noteId) api.getCanvasItems(noteId).then(setItems);
  }, [noteId]);

  async function addItem(type) {
    const base = {
      note_id: noteId,
      type,
      x: 40 + Math.random() * 40,
      y: 40 + Math.random() * 40,
      z_index: (items.reduce((m, i) => Math.max(m, i.z_index || 1), 1) || 1) + 1
    };
    const defaults = {
      sticky: { width: 200, height: 160, color: STICKY_COLORS[0], data: JSON.stringify({ text: '' }) },
      image: { width: 280, height: 220, data: JSON.stringify({ src: null, annotations: [] }) },
      equation: { width: 260, height: 180, data: JSON.stringify({ latex: '', variables: [] }) },
      graph: {
        width: 340,
        height: 300,
        data: JSON.stringify({ equations: [{ id: 1, expr: 'x^2', color: GRAPH_COLORS[0] }], xMin: -10, xMax: 10 })
      }
    };
    const created = await api.createCanvasItem({ ...base, ...defaults[type] });
    setItems((its) => [...its, created]);
  }

  function updateLocal(id, patch) {
    setItems((its) => its.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function commit(id, patch) {
    updateLocal(id, patch);
    const item = items.find((i) => i.id === id);
    if (!item) return;
    await api.updateCanvasItem({ ...item, ...patch });
  }

  async function remove(id) {
    setItems((its) => its.filter((i) => i.id !== id));
    await api.deleteCanvasItem(id);
  }

  function bringToFront(id) {
    const maxZ = Math.max(1, ...items.map((i) => i.z_index || 1));
    updateLocal(id, { z_index: maxZ + 1 });
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {items.map((item) => (
        <DraggableCard
          key={item.id}
          item={item}
          onCommit={(patch) => commit(item.id, patch)}
          onDelete={() => remove(item.id)}
          onFocus={() => bringToFront(item.id)}
        >
          {item.type === 'sticky' && <StickyContent item={item} onCommit={(patch) => commit(item.id, patch)} />}
          {item.type === 'image' && <ImageContent item={item} onCommit={(patch) => commit(item.id, patch)} />}
          {item.type === 'equation' && <EquationContent item={item} onCommit={(patch) => commit(item.id, patch)} />}
          {item.type === 'graph' && <GraphContent item={item} onCommit={(patch) => commit(item.id, patch)} />}
        </DraggableCard>
      ))}

      <div className="absolute bottom-3 right-3 pointer-events-auto flex items-center gap-1 p-2 rounded-full bg-white border border-paper-rule shadow-page">
        <ToolbarButton onClick={() => addItem('sticky')} title="Add sticky note">
          <StickyNoteIcon size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => addItem('image')} title="Add movable image">
          <ImageIcon size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => addItem('equation')} title="Add movable equation">
          <Sigma size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => addItem('graph')} title="Add graph">
          <LineChartIcon size={14} />
        </ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-8 h-8 flex items-center justify-center rounded-full text-paper-muted hover:text-accent hover:bg-accent/10"
    >
      {children}
    </button>
  );
}

// ---------- Drag / resize wrapper shared by every canvas item ----------

function DraggableCard({ item, onCommit, onDelete, onFocus, children }) {
  const [live, setLive] = useState(null); // { x, y, width, height } while actively dragging/resizing

  function startDrag(e) {
    e.preventDefault();
    onFocus();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = item.x;
    const origY = item.y;

    function onMove(ev) {
      setLive((l) => ({ ...(l || {}), x: origX + (ev.clientX - startX), y: origY + (ev.clientY - startY) }));
    }
    function onUp(ev) {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      onCommit({ x: origX + (ev.clientX - startX), y: origY + (ev.clientY - startY) });
      setLive(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function startResize(e) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = item.width;
    const origH = item.height;

    function onMove(ev) {
      setLive((l) => ({
        ...(l || {}),
        width: Math.max(140, origW + (ev.clientX - startX)),
        height: Math.max(100, origH + (ev.clientY - startY))
      }));
    }
    function onUp(ev) {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      onCommit({
        width: Math.max(140, origW + (ev.clientX - startX)),
        height: Math.max(100, origH + (ev.clientY - startY))
      });
      setLive(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const x = live?.x ?? item.x;
  const y = live?.y ?? item.y;
  const width = live?.width ?? item.width;
  const height = live?.height ?? item.height;

  return (
    <div
      className="absolute rounded-lg border border-paper-rule shadow-page flex flex-col pointer-events-auto bg-white"
      style={{ left: x, top: y, width, height, zIndex: item.z_index || 1, background: item.color || undefined }}
      onMouseDown={onFocus}
    >
      <div
        onMouseDown={startDrag}
        className="h-6 flex items-center justify-between px-2 shrink-0 cursor-move bg-black/5 rounded-t-lg"
      >
        <GripVertical size={11} className="text-paper-muted" />
        <button onClick={onDelete} className="text-paper-muted hover:text-accent-danger">
          <X size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2 min-h-0">{children}</div>
      <div
        onMouseDown={startResize}
        className="absolute bottom-0.5 right-0.5 w-3 h-3 cursor-nwse-resize opacity-40 hover:opacity-100"
        style={{ background: 'linear-gradient(135deg, transparent 50%, #8C8270 50%)' }}
      />
    </div>
  );
}

// ---------- Sticky note ----------

function StickyContent({ item, onCommit }) {
  const data = safeParse(item.data, { text: '' });
  const [text, setText] = useState(data.text);

  return (
    <div className="h-full flex flex-col">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit({ data: JSON.stringify({ text }) })}
        placeholder="Write a quick note…"
        className="flex-1 w-full bg-transparent text-sm text-paper-ink resize-none focus:outline-none font-manuscript"
      />
      <div className="flex items-center gap-1 pt-1 shrink-0">
        {STICKY_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onCommit({ color: c })}
            className="w-3.5 h-3.5 rounded-full border border-black/10"
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Movable image with caption + click-to-place annotations ----------

function ImageContent({ item, onCommit }) {
  const data = safeParse(item.data, { src: null, annotations: [] });
  const [caption, setCaption] = useState(item.caption || '');
  const imgWrapRef = useRef(null);

  async function pickImage() {
    const url = await api.pickImage();
    if (url) onCommit({ data: JSON.stringify({ ...data, src: url }) });
  }

  function addAnnotationAt(e) {
    if (!data.src) return;
    const rect = imgWrapRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const next = {
      ...data,
      annotations: [...data.annotations, { id: Date.now(), text: 'Note', xPct, yPct }]
    };
    onCommit({ data: JSON.stringify(next) });
  }

  function updateAnnotation(id, patch) {
    const next = { ...data, annotations: data.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)) };
    onCommit({ data: JSON.stringify(next) });
  }

  function removeAnnotation(id) {
    const next = { ...data, annotations: data.annotations.filter((a) => a.id !== id) };
    onCommit({ data: JSON.stringify(next) });
  }

  if (!data.src) {
    return (
      <button
        onClick={pickImage}
        className="w-full h-full flex flex-col items-center justify-center gap-2 text-paper-muted hover:text-accent border-2 border-dashed border-paper-rule rounded-lg"
      >
        <ImageIcon size={20} />
        <span className="text-xs">Click to choose a photo</span>
      </button>
    );
  }

  return (
    <div className="h-full flex flex-col gap-2">
      <div ref={imgWrapRef} onDoubleClick={addAnnotationAt} className="relative flex-1 min-h-0 rounded-md overflow-hidden">
        <img src={data.src} alt="" className="w-full h-full object-contain bg-black/5" draggable={false} />
        {data.annotations.map((a) => (
          <AnnotationDot key={a.id} annotation={a} onChange={(p) => updateAnnotation(a.id, p)} onRemove={() => removeAnnotation(a.id)} />
        ))}
      </div>
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => onCommit({ caption })}
        placeholder="Caption… (double-click photo to annotate)"
        className="text-xs text-paper-muted bg-transparent focus:outline-none shrink-0 italic"
      />
    </div>
  );
}

function AnnotationDot({ annotation, onChange, onRemove }) {
  const [editing, setEditing] = useState(false);

  function startDrag(e) {
    e.stopPropagation();
    const parent = e.currentTarget.parentElement;
    function onMove(ev) {
      const rect = parent.getBoundingClientRect();
      const xPct = Math.min(100, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100));
      const yPct = Math.min(100, Math.max(0, ((ev.clientY - rect.top) / rect.height) * 100));
      onChange({ xPct, yPct });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1"
      style={{ left: `${annotation.xPct}%`, top: `${annotation.yPct}%` }}
    >
      <span onMouseDown={startDrag} className="w-2.5 h-2.5 rounded-full bg-accent-danger border-2 border-white shadow cursor-move shrink-0" />
      {editing ? (
        <input
          autoFocus
          value={annotation.text}
          onChange={(e) => onChange({ text: e.target.value })}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
          className="text-xs px-1 py-1 rounded bg-white border border-accent shadow"
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Click to edit, double-click to remove"
          className="text-xs px-1 py-1 rounded bg-white/95 border border-paper-rule shadow whitespace-nowrap cursor-text"
        >
          {annotation.text}
        </span>
      )}
    </div>
  );
}

// ---------- Movable equation with a variable legend ----------

function EquationContent({ item, onCommit }) {
  const data = safeParse(item.data, { latex: '', variables: [] });
  const [latex, setLatex] = useState(data.latex);

  function commitLatex() {
    onCommit({ data: JSON.stringify({ ...data, latex }) });
  }

  function addVariable() {
    onCommit({ data: JSON.stringify({ ...data, variables: [...data.variables, { symbol: '', label: '' }] }) });
  }

  function updateVariable(i, patch) {
    const vars = data.variables.map((v, idx) => (idx === i ? { ...v, ...patch } : v));
    onCommit({ data: JSON.stringify({ ...data, variables: vars }) });
  }

  function removeVariable(i) {
    onCommit({ data: JSON.stringify({ ...data, variables: data.variables.filter((_, idx) => idx !== i) }) });
  }

  let html = '';
  try {
    html = katex.renderToString(latex || '\\text{...}', { throwOnError: false, output: 'html' });
  } catch {
    html = latex;
  }

  return (
    <div className="h-full flex flex-col gap-2 text-xs">
      <div className="min-h-[2.5rem] flex items-center justify-center bg-paper-DEFAULT rounded-md px-2 py-2" dangerouslySetInnerHTML={{ __html: html }} />
      <input
        value={latex}
        onChange={(e) => setLatex(e.target.value)}
        onBlur={commitLatex}
        onKeyDown={(e) => e.key === 'Enter' && commitLatex()}
        placeholder="LaTeX, e.g. x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}"
        className="bg-white border border-paper-rule rounded px-2 py-1 text-paper-ink font-mono text-xs focus:outline-none focus:border-accent"
      />
      <div className="flex-1 overflow-auto space-y-1">
        {data.variables.map((v, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              value={v.symbol}
              onChange={(e) => updateVariable(i, { symbol: e.target.value })}
              placeholder="x"
              className="w-10 bg-paper-DEFAULT border border-paper-rule rounded px-1 py-1 text-center focus:outline-none"
            />
            <span className="text-paper-muted">=</span>
            <input
              value={v.label}
              onChange={(e) => updateVariable(i, { label: e.target.value })}
              placeholder="projectile distance"
              className="flex-1 bg-paper-DEFAULT border border-paper-rule rounded px-2 py-1 focus:outline-none"
            />
            <button onClick={() => removeVariable(i)} className="text-paper-muted hover:text-accent-danger shrink-0">
              <X size={11} />
            </button>
          </div>
        ))}
        <button onClick={addVariable} className="flex items-center gap-1 text-accent hover:underline">
          <Plus size={10} /> Define a variable
        </button>
      </div>
    </div>
  );
}

// ---------- Built-in grapher ----------

function GraphContent({ item, onCommit }) {
  const data = safeParse(item.data, { equations: [{ id: 1, expr: 'x^2', color: GRAPH_COLORS[0] }], xMin: -10, xMax: 10 });

  function updateEq(i, patch) {
    const equations = data.equations.map((eq, idx) => (idx === i ? { ...eq, ...patch } : eq));
    onCommit({ data: JSON.stringify({ ...data, equations }) });
  }

  function addEq() {
    const color = GRAPH_COLORS[data.equations.length % GRAPH_COLORS.length];
    onCommit({ data: JSON.stringify({ ...data, equations: [...data.equations, { id: Date.now(), expr: 'x', color }] }) });
  }

  function removeEq(i) {
    onCommit({ data: JSON.stringify({ ...data, equations: data.equations.filter((_, idx) => idx !== i) }) });
  }

  const points = [];
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const x = data.xMin + ((data.xMax - data.xMin) * i) / steps;
    const point = { x: Number(x.toFixed(3)) };
    for (const eq of data.equations) {
      try {
        point[eq.id] = math.evaluate(eq.expr, { x });
      } catch {
        point[eq.id] = null;
      }
    }
    points.push(point);
  }

  return (
    <div className="h-full flex flex-col gap-2 text-xs">
      <div className="space-y-1 shrink-0">
        {data.equations.map((eq, i) => (
          <div key={eq.id} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: eq.color }} />
            <span className="text-paper-muted font-mono shrink-0">y =</span>
            <input
              value={eq.expr}
              onChange={(e) => updateEq(i, { expr: e.target.value })}
              placeholder="x^2 - 3*x + 2"
              className="flex-1 min-w-0 bg-white border border-paper-rule rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-accent"
            />
            <button onClick={() => removeEq(i)} className="text-paper-muted hover:text-accent-danger shrink-0">
              <X size={11} />
            </button>
          </div>
        ))}
        <button onClick={addEq} className="flex items-center gap-1 text-accent hover:underline">
          <Plus size={10} /> Add equation
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E4D9C3" />
            <XAxis dataKey="x" tick={{ fontSize: 9 }} stroke="#8C8270" type="number" domain={[data.xMin, data.xMax]} />
            <YAxis tick={{ fontSize: 9 }} stroke="#8C8270" />
            <Tooltip />
            {data.equations.map((eq) => (
              <Line key={eq.id} type="monotone" dataKey={eq.id} stroke={eq.color} dot={false} strokeWidth={2} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function safeParse(json, fallback) {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}
