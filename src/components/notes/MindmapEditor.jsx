import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Plus } from 'lucide-react';

let idCounter = 1;
function nextId() {
  idCounter += 1;
  return `n${Date.now()}_${idCounter}`;
}

function defaultGraph(title) {
  return {
    nodes: [
      {
        id: 'root',
        position: { x: 250, y: 150 },
        data: { label: title || 'Main idea' },
        style: nodeStyle('#5B8CFF')
      }
    ],
    edges: []
  };
}

function nodeStyle(color) {
  return {
    background: '#1C2030',
    border: `1px solid ${color}`,
    color: '#E7E9F0',
    borderRadius: 10,
    fontSize: 12,
    padding: '6px 10px'
  };
}

export default function MindmapEditor({ noteTitle, mindmapJson, onChange }) {
  const initial = useMemo(() => {
    if (mindmapJson) {
      try {
        return JSON.parse(mindmapJson);
      } catch {
        return defaultGraph(noteTitle);
      }
    }
    return defaultGraph(noteTitle);
  }, [mindmapJson, noteTitle]);

  const [nodes, setNodes] = useState(initial.nodes);
  const [edges, setEdges] = useState(initial.edges);
  const [selectedId, setSelectedId] = useState(null);

  // Push graph changes up (debounced by React batching) so the parent can save it.
  useEffect(() => {
    onChange(JSON.stringify({ nodes, edges }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((connection) => setEdges((eds) => addEdge(connection, eds)), []);

  function addNode() {
    const id = nextId();
    const node = {
      id,
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 250 },
      data: { label: 'New idea' },
      style: nodeStyle('#8890A6')
    };
    setNodes((nds) => [...nds, node]);
    setSelectedId(id);
  }

  function renameSelected(label) {
    setNodes((nds) => nds.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, label } } : n)));
  }

  const selectedNode = nodes.find((n) => n.id === selectedId);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-1 pb-2">
        <button
          onClick={addNode}
          className="flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-lg border border-base-border text-base-muted hover:text-accent hover:border-accent/50"
        >
          <Plus size={13} /> Add node
        </button>
        {selectedNode && (
          <input
            value={selectedNode.data.label}
            onChange={(e) => renameSelected(e.target.value)}
            className="text-xs bg-base-card border border-accent/40 rounded-md px-2 py-1 text-base-text w-48 focus:outline-none"
            placeholder="Node label"
          />
        )}
      </div>
      <div className="flex-1 rounded-xl2 overflow-hidden border border-base-border" style={{ minHeight: 360 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_e, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#282D3F" gap={18} />
          <Controls showInteractive={false} />
          <MiniMap style={{ background: '#161923' }} maskColor="rgba(15,17,21,0.6)" nodeColor={() => '#5B8CFF'} />
        </ReactFlow>
      </div>
    </div>
  );
}
