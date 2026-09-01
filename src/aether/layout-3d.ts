import * as THREE from 'three';
import type { TreeNode } from '../types';

export interface Placement {
  id: string;
  position: THREE.Vector3;
  depth: number;
  /** 0 at the root, 1 at the deepest leaf. Drives colour and scale. */
  maturity: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const RISE = 5.2;
const SPREAD = 4.4;

/**
 * Growth, not a diagram. Children are thrown out from their parent on a golden
 * angle so no two branches share a bearing, and each generation tilts further
 * from vertical, so the form opens outward like something grown rather than
 * drawn. Deliberately not a symmetric tree.
 */
export function layout3D(nodes: TreeNode[]): Map<string, Placement> {
  const childrenOf = new Map<string | null, TreeNode[]>();
  for (const node of nodes) {
    const siblings = childrenOf.get(node.parentId);
    if (siblings) siblings.push(node);
    else childrenOf.set(node.parentId, [node]);
  }

  const placements = new Map<string, Placement>();
  const visited = new Set<string>();
  let maxDepth = 0;

  const walk = (node: TreeNode, origin: THREE.Vector3, depth: number, inheritedBearing: number) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    maxDepth = Math.max(maxDepth, depth);

    placements.set(node.id, { id: node.id, position: origin.clone(), depth, maturity: 0 });

    const children = childrenOf.get(node.id) ?? [];
    if (children.length === 0) return;

    // Deeper generations lean further out, so the silhouette flares rather than
    // stacking into neat rows.
    const tilt = 0.34 + depth * 0.16;
    const radius = SPREAD * (0.62 + Math.min(children.length, 6) * 0.13) / (1 + depth * 0.24);

    children.forEach((child, index) => {
      const bearing = inheritedBearing + GOLDEN_ANGLE * (index + 1) + depth * 0.7;
      const lift = RISE / (1 + depth * 0.35);

      const offset = new THREE.Vector3(
        Math.cos(bearing) * radius * Math.sin(tilt + index * 0.05),
        lift * Math.cos(tilt * 0.5),
        Math.sin(bearing) * radius * Math.sin(tilt + index * 0.05)
      );

      walk(child, origin.clone().add(offset), depth + 1, bearing);
    });
  };

  const roots = childrenOf.get(null) ?? [];
  roots.forEach((root, index) => {
    walk(root, new THREE.Vector3(index * 9, 0, 0), 0, index * 1.7);
  });

  // Anything detached still deserves a place in the volume.
  let stray = 0;
  for (const node of nodes) {
    if (!placements.has(node.id)) {
      const bearing = GOLDEN_ANGLE * stray;
      placements.set(node.id, {
        id: node.id,
        position: new THREE.Vector3(Math.cos(bearing) * 12, -3, Math.sin(bearing) * 12),
        depth: 0,
        maturity: 0,
      });
      stray += 1;
    }
  }

  for (const placement of placements.values()) {
    placement.maturity = maxDepth === 0 ? 0 : placement.depth / maxDepth;
  }

  return placements;
}
