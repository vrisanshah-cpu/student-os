import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useMemo, useState } from 'react';
import { Plus, Minus, Trash2, BarChart3, LineChart as LineChartIcon, Table as TableIcon } from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

const DEFAULT_DATA = {
  headers: ['Label', 'Value'],
  rows: [
    ['Item 1', '0'],
    ['Item 2', '0'],
    ['Item 3', '0']
  ]
};

const SERIES_COLORS = ['#5B8CFF', '#4FD1A5', '#F2B84B', '#E56B6B', '#7C4DBE'];

function parseData(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.headers && parsed?.rows) return parsed;
  } catch {
    /* fall through to default */
  }
  return DEFAULT_DATA;
}

function SpreadsheetView({ node, updateAttributes, deleteNode }) {
  const [data, setData] = useState(() => parseData(node.attrs.data));
  const chartType = node.attrs.chartType || 'none';

  function commit(next) {
    setData(next);
    updateAttributes({ data: JSON.stringify(next) });
  }

  function setCell(rowIdx, colIdx, value) {
    const rows = data.rows.map((r, i) => (i === rowIdx ? r.map((c, j) => (j === colIdx ? value : c)) : r));
    commit({ ...data, rows });
  }

  function setHeader(colIdx, value) {
    const headers = data.headers.map((h, i) => (i === colIdx ? value : h));
    commit({ ...data, headers });
  }

  function addRow() {
    commit({ ...data, rows: [...data.rows, data.headers.map(() => '')] });
  }

  function removeRow(idx) {
    commit({ ...data, rows: data.rows.filter((_, i) => i !== idx) });
  }

  function addColumn() {
    commit({
      headers: [...data.headers, `Column ${data.headers.length + 1}`],
      rows: data.rows.map((r) => [...r, ''])
    });
  }

  function removeColumn(idx) {
    if (data.headers.length <= 1) return;
    commit({
      headers: data.headers.filter((_, i) => i !== idx),
      rows: data.rows.map((r) => r.filter((_, i) => i !== idx))
    });
  }

  const chartData = useMemo(
    () =>
      data.rows.map((row) => {
        const point = { name: row[0] || '' };
        data.headers.slice(1).forEach((h, i) => {
          point[h] = Number(row[i + 1]) || 0;
        });
        return point;
      }),
    [data]
  );
  const seriesKeys = data.headers.slice(1);

  return (
    <NodeViewWrapper className="my-4 not-prose">
      <div className="border border-paper-rule rounded-lg overflow-hidden bg-paper-raised">
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-paper-rule/40 border-b border-paper-rule">
          <div className="flex items-center gap-1">
            <MiniButton onClick={addRow} title="Add row">
              <Plus size={11} /> Row
            </MiniButton>
            <MiniButton onClick={addColumn} title="Add column">
              <Plus size={11} /> Col
            </MiniButton>
          </div>
          <div className="flex items-center gap-1">
            <MiniIconButton active={chartType === 'none'} onClick={() => updateAttributes({ chartType: 'none' })} title="Table only">
              <TableIcon size={12} />
            </MiniIconButton>
            <MiniIconButton active={chartType === 'bar'} onClick={() => updateAttributes({ chartType: 'bar' })} title="Bar chart">
              <BarChart3 size={12} />
            </MiniIconButton>
            <MiniIconButton active={chartType === 'line'} onClick={() => updateAttributes({ chartType: 'line' })} title="Line chart">
              <LineChartIcon size={12} />
            </MiniIconButton>
            <MiniIconButton onClick={deleteNode} title="Remove block">
              <Trash2 size={12} />
            </MiniIconButton>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {data.headers.map((h, colIdx) => (
                  <th key={colIdx} className="border border-paper-rule p-0">
                    <div className="flex items-center">
                      <input
                        value={h}
                        onChange={(e) => setHeader(colIdx, e.target.value)}
                        className="w-full min-w-[70px] bg-transparent font-semibold text-paper-ink px-2 py-2 focus:outline-none focus:bg-white/50"
                      />
                      {data.headers.length > 1 && (
                        <button onClick={() => removeColumn(colIdx)} className="px-1 text-paper-muted hover:text-accent-danger" title="Remove column">
                          <Minus size={10} />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {row.map((cell, colIdx) => (
                    <td key={colIdx} className="border border-paper-rule p-0">
                      <input
                        value={cell}
                        onChange={(e) => setCell(rowIdx, colIdx, e.target.value)}
                        className="w-full min-w-[70px] bg-transparent text-paper-ink px-2 py-2 focus:outline-none focus:bg-white/50"
                      />
                    </td>
                  ))}
                  <td className="border-none w-6">
                    <button onClick={() => removeRow(rowIdx)} className="text-paper-muted hover:text-accent-danger px-1" title="Remove row">
                      <Minus size={10} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {chartType !== 'none' && (
          <div className="h-56 px-3 py-3 border-t border-paper-rule bg-white/40">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4D9C3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#8C8270" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#8C8270" />
                  <Tooltip />
                  {seriesKeys.map((key, i) => (
                    <Bar key={key} dataKey={key} fill={SERIES_COLORS[i % SERIES_COLORS.length]} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              ) : (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4D9C3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#8C8270" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#8C8270" />
                  <Tooltip />
                  {seriesKeys.map((key, i) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

function MiniButton({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-paper-muted hover:text-accent hover:bg-white/60"
    >
      {children}
    </button>
  );
}

function MiniIconButton({ children, onClick, title, active }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-6 h-6 flex items-center justify-center rounded-md ${
        active ? 'bg-accent/20 text-accent' : 'text-paper-muted hover:text-accent hover:bg-white/60'
      }`}
    >
      {children}
    </button>
  );
}

export const SpreadsheetBlock = Node.create({
  name: 'spreadsheetBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      data: { default: JSON.stringify(DEFAULT_DATA) },
      chartType: { default: 'none' }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-spreadsheet-block]',
        getAttrs: (el) => ({
          data: el.getAttribute('data-sheet') || JSON.stringify(DEFAULT_DATA),
          chartType: el.getAttribute('data-chart-type') || 'none'
        })
      }
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-spreadsheet-block': '',
        'data-sheet': node.attrs.data,
        'data-chart-type': node.attrs.chartType
      })
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SpreadsheetView);
  }
});

export default SpreadsheetBlock;
