import { hierarchy, tree } from 'd3-hierarchy';
import type { TreeNode } from './types';

/** Every card is this wide, so columns can be reserved without measuring. */
export const NODE_WIDTH = 200;

/** Tallest card: a two-line label, a note preview and the footer row. */
export const NODE_HEIGHT = 110;

const COLUMN_GAP = 40;
const ROW_GAP = 60;

export interface Point {
  x: number;
  y: number;
}

/**
 * Tidy tree layout (Reingold–Tilford, via d3-hierarchy). Positions are the
 * top-left corner of each card, which is what React Flow expects. Because
 * nodeSize reserves a full column per node, siblings and cousins never overlap
 * no matter how wide the tree grows.
 */
export function layoutTree(nodes: TreeNode[]): Map<string, Point> {
  const positions = new Map<string, Point>();
  if (nodes.length === 0) return positions;

  const ids = new Set(nodes.map(n => n.id));
  const children = new Map<string, TreeNode[]>();
  const roots: TreeNode[] = [];
  for (const node of nodes) {
    if (node.parentId !== null && ids.has(node.parentId)) {
      const siblings = children.get(node.parentId);
      if (siblings) siblings.push(node);
      else children.set(node.parentId, [node]);
    } else {
      roots.push(node);
    }
  }

  const layout = tree<TreeNode>()
    .nodeSize([NODE_WIDTH + COLUMN_GAP, NODE_HEIGHT + ROW_GAP])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.25));

  // There is normally exactly one root. Orphans from a corrupt save are laid
  // out as extra trees to the right rather than dropped.
  let offsetX = 0;
  for (const root of roots) {
    const laid = layout(hierarchy(root, n => children.get(n.id)));
    let minX = Infinity;
    let maxX = -Infinity;
    laid.each(d => {
      minX = Math.min(minX, d.x);
      maxX = Math.max(maxX, d.x);
    });
    laid.each(d => positions.set(d.data.id, { x: d.x - minX + offsetX, y: d.y }));
    offsetX += maxX - minX + NODE_WIDTH + COLUMN_GAP;
  }

  return positions;
}
