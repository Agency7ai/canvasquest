import ReactFlow, {
  type Node,
  type Edge,
  Controls,
  Background,
  BackgroundVariant,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useGameStore } from './store';
import type { TreeNode as GameTreeNode } from './types';
import TreeNodeComponent from './tree-node';

const nodeTypes: NodeTypes = {
  treeNode: TreeNodeComponent,
};

export default function GameCanvas() {
  const nodes = useGameStore(state => state.nodes);

  const flowNodes: Node[] = nodes.map((node) => {
    const position = calculateNodePosition(node, nodes);
    return {
      id: node.id,
      type: 'treeNode',
      position,
      data: { node },
    };
  });

  const flowEdges: Edge[] = nodes
    .filter(n => n.parentId)
    .map(n => ({
      id: `edge-${n.id}`,
      source: n.parentId!,
      target: n.id,
      type: 'smoothstep',
      animated: n.isGap,
      style: {
        stroke: n.isGap ? '#ef4444' : '#64748b',
        strokeWidth: 2,
      },
    }));

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.5}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function calculateNodePosition(node: GameTreeNode, allNodes: GameTreeNode[]): { x: number; y: number } {
  if (!node.parentId) {
    return { x: 400, y: 50 };
  }

  const parent = allNodes.find(n => n.id === node.parentId);
  if (!parent) {
    return { x: 400, y: 50 };
  }

  const siblings = allNodes.filter(n => n.parentId === node.parentId);
  const index = siblings.findIndex(n => n.id === node.id);
  const totalSiblings = siblings.length;

  const parentPos = calculateNodePosition(parent, allNodes);
  
  const horizontalSpacing = 200;
  const verticalSpacing = 120;
  const offset = (index - (totalSiblings - 1) / 2) * horizontalSpacing;

  return {
    x: parentPos.x + offset,
    y: parentPos.y + verticalSpacing,
  };
}
