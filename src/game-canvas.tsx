import { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  type Node,
  type Edge,
  Controls,
  Background,
  BackgroundVariant,
  type NodeTypes,
  useNodesInitialized,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { layoutTree } from './layout';
import { computeImplicitGaps } from './scoring';
import { useGameStore } from './store';
import TreeNodeComponent, { type TreeNodeData } from './tree-node';

const nodeTypes: NodeTypes = {
  treeNode: TreeNodeComponent,
};

const FIT_OPTIONS = { padding: 0.2, duration: 300 };
/** Retry delay for the rare case where React Flow is not ready to fit yet. */
const REFIT_DELAY_MS = 50;

export default function GameCanvas() {
  const nodes = useGameStore(state => state.nodes);
  const selectedNodeId = useGameStore(state => state.selectedNodeId);
  const selectNode = useGameStore(state => state.selectNode);
  const openNoteEditor = useGameStore(state => state.openNoteEditor);
  const { fitView } = useReactFlow();
  // False while freshly added nodes still lack their measured size; fitView is
  // a no-op until every node is measured, so the effect below waits for it.
  const nodesInitialized = useNodesInitialized();

  const positions = useMemo(() => layoutTree(nodes), [nodes]);

  // Implicit gaps are derived, never stored: a concept with nothing concrete
  // beneath it is drawn as a gap until someone branches a resource or skill.
  const implicitGaps = useMemo(() => new Set(computeImplicitGaps(nodes)), [nodes]);

  const flowNodes: Node<TreeNodeData>[] = useMemo(
    () =>
      nodes.map(node => ({
        id: node.id,
        type: 'treeNode',
        position: positions.get(node.id) ?? { x: 0, y: 0 },
        selected: node.id === selectedNodeId,
        data: { node, implicitGap: implicitGaps.has(node.id) },
      })),
    [nodes, positions, implicitGaps, selectedNodeId],
  );

  const flowEdges: Edge[] = useMemo(
    () =>
      nodes
        .filter(n => n.parentId)
        .map(n => ({
          id: `edge-${n.id}`,
          source: n.parentId!,
          target: n.id,
          type: 'smoothstep',
          animated: n.isGap,
          style: {
            stroke: n.isGap ? '#c2563a' : implicitGaps.has(n.id) ? '#d9a441' : '#8fa38a',
            strokeWidth: 2,
          },
        })),
    [nodes, implicitGaps],
  );

  // Whenever the layout changes (a new node, a prune, an undo, a restore) the
  // whole tree is brought back into view.
  useEffect(() => {
    if (!nodesInitialized) return;
    if (fitView(FIT_OPTIONS)) return;
    const timer = setTimeout(() => fitView(FIT_OPTIONS), REFIT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [nodesInitialized, positions, fitView]);

  const onNodeClick = useCallback((_event: unknown, node: Node) => selectNode(node.id), [selectNode]);
  const onPaneClick = useCallback(() => selectNode(null), [selectNode]);
  // A double-click opens the node's Markdown note full screen.
  const onNodeDoubleClick = useCallback(
    (_event: unknown, node: Node) => openNoteEditor(node.id),
    [openNoteEditor],
  );

  return (
    <div style={{ width: '100%', height: '100%', background: '#0f1f17' }}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeDoubleClick={onNodeDoubleClick}
        zoomOnDoubleClick={false}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        // Selection is owned by the store (selectedNodeId) rather than by
        // React Flow, so the dropdown and the canvas always agree.
        elementsSelectable={false}
      >
        <Background variant={BackgroundVariant.Dots} color="#33503f" gap={18} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
