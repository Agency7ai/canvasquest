import type { TreeNode } from './types';

export interface Point {
  x: number;
  y: number;
}

export const NODE_WIDTH = 190;
const HORIZONTAL_GAP = 28;
const VERTICAL_SPACING = 140;
const SLOT = NODE_WIDTH + HORIZONTAL_GAP;

/**
 * Tidy tree layout. Each node is centred over the full width of its own
 * subtree, so sibling branches are allotted disjoint horizontal bands and
 * cannot overlap however deep or lopsided the tree becomes.
 */
export function computeLayout(nodes: TreeNode[]): Record<string, Point> {
  const childrenOf = new Map<string | null, TreeNode[]>();
  for (const node of nodes) {
    const siblings = childrenOf.get(node.parentId);
    if (siblings) siblings.push(node);
    else childrenOf.set(node.parentId, [node]);
  }

  const subtreeWidth = new Map<string, number>();
  const measured = new Set<string>();

  const measure = (node: TreeNode): number => {
    // Persisted state could in principle contain a cycle; refuse to recurse.
    if (measured.has(node.id)) return subtreeWidth.get(node.id) ?? SLOT;
    measured.add(node.id);

    const children = childrenOf.get(node.id) ?? [];
    const width = children.length
      ? children.reduce((total, child) => total + measure(child), 0)
      : SLOT;

    const finalWidth = Math.max(SLOT, width);
    subtreeWidth.set(node.id, finalWidth);
    return finalWidth;
  };

  const roots = childrenOf.get(null) ?? [];
  roots.forEach(measure);

  const positions: Record<string, Point> = {};
  const placed = new Set<string>();

  const place = (node: TreeNode, left: number, depth: number) => {
    if (placed.has(node.id)) return;
    placed.add(node.id);

    const width = subtreeWidth.get(node.id) ?? SLOT;
    positions[node.id] = {
      x: left + width / 2 - NODE_WIDTH / 2,
      y: depth * VERTICAL_SPACING,
    };

    let cursor = left;
    for (const child of childrenOf.get(node.id) ?? []) {
      place(child, cursor, depth + 1);
      cursor += subtreeWidth.get(child.id) ?? SLOT;
    }
  };

  let cursor = 0;
  for (const root of roots) {
    place(root, cursor, 0);
    cursor += subtreeWidth.get(root.id) ?? SLOT;
  }

  // Anything unreachable from a root (orphaned by bad state) still needs a spot.
  for (const node of nodes) {
    if (!positions[node.id]) {
      positions[node.id] = { x: cursor, y: 0 };
      cursor += SLOT;
    }
  }

  return positions;
}
