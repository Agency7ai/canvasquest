import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { TreeNode, NodeKind } from './types';
import { NODE_WIDTH } from './layout';

interface TreeNodeProps {
  data: {
    node: TreeNode;
    isSelected?: boolean;
  };
}

const kindColors: Record<NodeKind, { bg: string; border: string; text: string }> = {
  root: { bg: '#6366f1', border: '#4f46e5', text: '#ffffff' },
  concept: { bg: '#10b981', border: '#059669', text: '#ffffff' },
  resource: { bg: '#f59e0b', border: '#d97706', text: '#ffffff' },
  skill: { bg: '#8b5cf6', border: '#7c3aed', text: '#ffffff' },
  gap: { bg: '#ef4444', border: '#dc2626', text: '#ffffff' },
};

const kindLabels: Record<NodeKind, string> = {
  root: '🌱',
  concept: '💡',
  resource: '📚',
  skill: '⚡',
  gap: '❓',
};

function TreeNodeComponent({ data }: TreeNodeProps) {
  const { node, isSelected } = data;
  const colors = kindColors[node.kind];

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '8px',
        border: `2px solid ${isSelected ? '#0f172a' : colors.border}`,
        background: colors.bg,
        color: colors.text,
        // Fixed width keeps the tidy layout's spacing calculation honest.
        width: `${NODE_WIDTH}px`,
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'grab',
        boxShadow: isSelected
          ? '0 0 0 4px rgba(15, 23, 42, 0.28), 0 6px 12px rgba(0, 0, 0, 0.18)'
          : '0 4px 6px rgba(0, 0, 0, 0.1)',
      }}
    >
      {node.parentId && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: colors.border }}
        />
      )}
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '18px' }}>{kindLabels[node.kind]}</span>
        <div style={{ flex: 1, wordBreak: 'break-word' }}>
          {node.label}
        </div>
      </div>

      <div
        style={{
          marginTop: '6px',
          fontSize: '11px',
          opacity: 0.85,
          fontWeight: 400,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        {/* Agents refer to nodes by id, so the human needs to see it too. */}
        <code
          style={{
            background: 'rgba(255, 255, 255, 0.22)',
            borderRadius: '4px',
            padding: '1px 5px',
            fontWeight: 600,
          }}
        >
          {node.id}
        </code>
        <span>by {node.createdBy}</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: colors.border }}
      />
    </div>
  );
}

export default memo(TreeNodeComponent);
