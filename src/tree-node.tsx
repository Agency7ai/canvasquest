import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { TreeNode, NodeKind } from './types';

interface TreeNodeProps {
  data: {
    node: TreeNode;
  };
}

const kindColors: Record<NodeKind, { bg: string; border: string; text: string }> = {
  root: { bg: '#6366f1', border: '#4f46e5', text: '#ffffff' },
  concept: { bg: '#10b981', border: '#059669', text: '#ffffff' },
  resource: { bg: '#f59e0b', border: '#d97706', text: '#ffffff' },
  skill: { bg: '#8b5cf6', border: '#7c3aed', text: '#ffffff' },
};

const kindLabels: Record<NodeKind, string> = {
  root: '🌱',
  concept: '💡',
  resource: '📚',
  skill: '⚡',
};

const GAP_COLOR = '#ef4444';

function TreeNodeComponent({ data }: TreeNodeProps) {
  const { node } = data;
  const colors = kindColors[node.kind];

  // A gap keeps the colour of its real kind; the red border and badge sit on top.
  const border = node.isGap ? `3px dashed ${GAP_COLOR}` : `2px solid ${colors.border}`;

  return (
    <div
      title={node.isGap ? `Gap${node.gapReason ? `: ${node.gapReason}` : ''}` : undefined}
      style={{
        position: 'relative',
        padding: '12px 16px',
        borderRadius: '8px',
        border,
        background: colors.bg,
        color: colors.text,
        minWidth: '160px',
        maxWidth: '200px',
        fontSize: '14px',
        fontWeight: 500,
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      }}
    >
      {node.parentId && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: colors.border }}
        />
      )}

      {node.isGap && (
        <span
          aria-label="Open gap"
          style={{
            position: 'absolute',
            top: '-12px',
            right: '-12px',
            width: '26px',
            height: '26px',
            borderRadius: '50%',
            background: GAP_COLOR,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '15px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.25)',
          }}
        >
          ❓
        </span>
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
