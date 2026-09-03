import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { NODE_WIDTH } from './layout';
import type { TreeNode, NodeKind } from './types';

export interface TreeNodeData {
  node: TreeNode;
  /** Derived by the canvas: a concept with no resource or skill beneath it. */
  implicitGap?: boolean;
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
const IMPLICIT_GAP_COLOR = '#f59e0b';
const SELECTION_COLOR = '#0f172a';
const NOTE_PREVIEW_CHARS = 40;

const previewOf = (note: string) =>
  note.length > NOTE_PREVIEW_CHARS ? `${note.slice(0, NOTE_PREVIEW_CHARS).trimEnd()}…` : note;

function TreeNodeComponent({ data, selected }: NodeProps<TreeNodeData>) {
  const { node, implicitGap = false } = data;
  const colors = kindColors[node.kind];

  // A gap keeps the colour of its real kind; the red border and badge sit on top.
  // An implicit gap gets an amber dashed border and no badge.
  const border = node.isGap
    ? `3px dashed ${GAP_COLOR}`
    : implicitGap
      ? `3px dashed ${IMPLICIT_GAP_COLOR}`
      : `2px solid ${colors.border}`;
  const tooltip = node.isGap
    ? `Gap${node.gapReason ? `: ${node.gapReason}` : ''}`
    : implicitGap
      ? 'Implicit gap: add a resource or skill beneath this concept'
      : undefined;

  return (
    <div
      title={tooltip}
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        width: `${NODE_WIDTH}px`,
        padding: '12px 14px',
        borderRadius: '8px',
        border,
        outline: selected ? `3px solid ${SELECTION_COLOR}` : 'none',
        outlineOffset: '3px',
        background: colors.bg,
        color: colors.text,
        fontSize: '14px',
        fontWeight: 500,
        boxShadow: selected ? '0 8px 16px rgba(0, 0, 0, 0.2)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
        cursor: 'pointer',
      }}
    >
      {node.parentId && (
        <Handle type="target" position={Position.Top} style={{ background: colors.border }} />
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

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <span style={{ fontSize: '18px', lineHeight: 1.2 }}>{kindLabels[node.kind]}</span>
        <div style={{ flex: 1, wordBreak: 'break-word', lineHeight: 1.3 }}>{node.label}</div>
      </div>

      {node.note && (
        <div
          style={{
            marginTop: '4px',
            fontSize: '11px',
            fontWeight: 400,
            fontStyle: 'italic',
            opacity: 0.8,
            wordBreak: 'break-word',
          }}
        >
          {previewOf(node.note)}
        </div>
      )}

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
        <span style={{ flex: 1 }}>by {node.createdBy}</span>
        {node.url && (
          <a
            href={node.url}
            target="_blank"
            rel="noreferrer"
            title={node.url}
            aria-label={`Open link: ${node.url}`}
            onClick={event => event.stopPropagation()}
            style={{ color: 'inherit', textDecoration: 'none', fontSize: '13px' }}
          >
            🔗
          </a>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: colors.border }} />
    </div>
  );
}

export default memo(TreeNodeComponent);
