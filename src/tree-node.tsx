import { memo } from 'react';
import type { CSSProperties } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { NODE_WIDTH } from './layout';
import type { TreeNode, NodeKind } from './types';

export interface TreeNodeData {
  node: TreeNode;
  /** Derived by the canvas: a concept with no resource or skill beneath it. */
  implicitGap?: boolean;
}

// The board's palette, matching the CSS variables in app.css. Inline because
// React Flow renders the cards inside its own transformed layer.
const PAPER = '#f3ecd9';
const PAPER_DEEP = '#e1d6b8';
const INK = '#2b2a20';
const INK_SOFT = '#5d5b48';
const LINE = '#7a7458';
const GAP_COLOR = '#a5442c';
const IMPLICIT_GAP_COLOR = '#c48d1a';
const SELECTION_COLOR = '#fff1bd';
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";

/** The stripe down a card's left edge, one colour per kind. */
const kindAccent: Record<NodeKind, string> = {
  root: '#3b6236',
  concept: '#4d7b46',
  resource: '#c48d1a',
  skill: '#7fa06a',
};

const NOTE_PREVIEW_CHARS = 40;

const previewOf = (note: string) =>
  note.length > NOTE_PREVIEW_CHARS ? `${note.slice(0, NOTE_PREVIEW_CHARS).trimEnd()}…` : note;

const tagStyle = (color: string): CSSProperties => ({
  padding: '0 5px',
  fontSize: '9px',
  fontWeight: 700,
  lineHeight: '14px',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color,
  border: `1px solid ${color}`,
  borderRadius: '2px',
});

function TreeNodeComponent({ data, selected }: NodeProps<TreeNodeData>) {
  const { node, implicitGap = false } = data;
  const accent = kindAccent[node.kind];

  // A gap keeps the stripe of its real kind; the rust dashed border and the
  // tag sit on top. An implicit gap gets an amber dashed border and no tag.
  const border = node.isGap
    ? `2px dashed ${GAP_COLOR}`
    : implicitGap
      ? `2px dashed ${IMPLICIT_GAP_COLOR}`
      : `1px solid ${LINE}`;
  const tooltip = node.isGap
    ? `Gap${node.gapReason ? `: ${node.gapReason}` : ''}`
    : implicitGap
      ? 'Implicit gap: add a resource or skill beneath this concept'
      : undefined;
  const handleStyle: CSSProperties = { background: accent, border: `1px solid ${PAPER}` };

  return (
    <div
      title={tooltip}
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        width: `${NODE_WIDTH}px`,
        padding: '10px 12px 10px 16px',
        borderRadius: '4px',
        border,
        outline: selected ? `3px solid ${SELECTION_COLOR}` : 'none',
        outlineOffset: '3px',
        background: PAPER,
        color: INK,
        fontFamily: MONO,
        fontSize: '13px',
        boxShadow: `inset 4px 0 0 ${accent}, ${selected ? '0 8px 18px rgba(0, 0, 0, 0.45)' : '0 4px 10px rgba(0, 0, 0, 0.3)'}`,
        cursor: 'pointer',
      }}
    >
      {node.parentId && <Handle type="target" position={Position.Top} style={handleStyle} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
        <span style={tagStyle(accent)}>{node.kind}</span>
        {node.isGap && (
          <span aria-label="Open gap" style={tagStyle(GAP_COLOR)}>
            gap
          </span>
        )}
      </div>

      <div style={{ fontFamily: SERIF, fontSize: '14px', fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word' }}>
        {node.label}
      </div>

      {node.note && (
        <div
          style={{
            marginTop: '4px',
            fontSize: '11px',
            fontStyle: 'italic',
            color: INK_SOFT,
            wordBreak: 'break-word',
          }}
        >
          {previewOf(node.note)}
        </div>
      )}

      <div
        style={{
          marginTop: '7px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '10.5px',
          color: INK_SOFT,
        }}
      >
        {/* Agents refer to nodes by id, so the human needs to see it too. */}
        <code
          style={{
            padding: '1px 5px',
            fontFamily: MONO,
            fontWeight: 600,
            color: INK,
            background: PAPER_DEEP,
            borderRadius: '2px',
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
            style={{
              color: '#3b6236',
              textDecoration: 'none',
              fontSize: '9.5px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            Link ↗
          </a>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={handleStyle} />
    </div>
  );
}

export default memo(TreeNodeComponent);
