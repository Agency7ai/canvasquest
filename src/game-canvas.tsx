import { useCallback, useMemo } from 'react';
import ReactFlow, {
  type Node,
  type Edge,
  type NodeTypes,
  type NodeDragHandler,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useGameStore } from './store';
import { computeLayout } from './layout';
import TreeNodeComponent from './tree-node';

const nodeTypes: NodeTypes = {
  treeNode: TreeNodeComponent,
};

const MINIMAP_COLORS: Record<string, string> = {
  root: '#6366f1',
  concept: '#10b981',
  resource: '#f59e0b',
  skill: '#8b5cf6',
  gap: '#ef4444',
};

export default function GameCanvas() {
  const nodes = useGameStore(state => state.nodes);
  const positions = useGameStore(state => state.positions);
  const selectedNodeId = useGameStore(state => state.selectedNodeId);
  const setSelectedNodeId = useGameStore(state => state.setSelectedNodeId);
  const setNodePosition = useGameStore(state => state.setNodePosition);

  const layout = useMemo(() => computeLayout(nodes), [nodes]);

  const flowNodes: Node[] = nodes.map(node => ({
    id: node.id,
    type: 'treeNode',
    // A dragged node keeps where the human put it; everything else follows
    // the computed layout.
    position: positions[node.id] ?? layout[node.id] ?? { x: 0, y: 0 },
    data: { node, isSelected: node.id === selectedNodeId },
  }));

  const flowEdges: Edge[] = nodes
    .filter(node => node.parentId)
    .map(node => ({
      id: `edge-${node.id}`,
      source: node.parentId!,
      target: node.id,
      type: 'smoothstep',
      animated: node.kind === 'gap',
      style: {
        stroke: node.kind === 'gap' ? '#ef4444' : '#94a3b8',
        strokeWidth: 2,
      },
    }));

  const handleNodeDragStop: NodeDragHandler = useCallback(
    (_event, node) => setNodePosition(node.id, node.position),
    [setNodePosition]
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => setSelectedNodeId(node.id),
    [setSelectedNodeId]
  );

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.15}
        maxZoom={1.5}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={handleNodeClick}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={() => setSelectedNodeId('')}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={node => MINIMAP_COLORS[(node.data?.node?.kind as string) ?? 'concept'] ?? '#94a3b8'}
          style={{ background: '#f8fafc' }}
        />
      </ReactFlow>
    </div>
  );
}
