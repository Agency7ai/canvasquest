import * as THREE from 'three';
import type { NodeKind, TreeNode } from '../types';

export interface Limb {
  id: string;
  treeId: string;
  parentId: string | null;
  kind: NodeKind;
  label: string;
  depth: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  /** Bezier control point, so limbs curve instead of running straight. */
  control: THREE.Vector3;
  startRadius: number;
  endRadius: number;
  isTip: boolean;
  /** Order of appearance, so growth runs outward from the trunk. */
  order: number;
}

export interface ForestTree {
  id: string;
  label: string;
  question: string;
  isActive: boolean;
  ground: THREE.Vector3;
  limbs: Limb[];
  height: number;
  nodeCount: number;
  gapCount: number;
}

export interface Board {
  id: string;
  question: string;
  nodes: TreeNode[];
  isActive: boolean;
}

export interface Forest {
  trees: ForestTree[];
  radius: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const TRUNK_HEIGHT = 7.2;
const TRUNK_RADIUS = 0.42;
const LENGTH_FALLOFF = 0.72;
const RADIUS_FALLOFF = 0.56;

/** Where along a parent limb a child attaches. Real branches leave the trunk at
 *  different heights, so spreading the attachments up the parent is most of
 *  what makes the result read as one tree instead of a starburst. */
function attachmentPoint(
  start: THREE.Vector3,
  end: THREE.Vector3,
  index: number,
  total: number,
  depth: number
): THREE.Vector3 {
  if (total === 1) return end.clone();
  // The trunk carries branches from halfway up; thin limbs fork nearer the tip.
  const lowest = depth === 0 ? 0.42 : 0.62;
  const t = lowest + ((1 - lowest) * index) / Math.max(total - 1, 1);
  return start.clone().lerp(end, t);
}

function growLimbs(
  node: TreeNode,
  childrenOf: Map<string | null, TreeNode[]>,
  treeId: string,
  start: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  radius: number,
  depth: number,
  bearing: number,
  visited: Set<string>,
  out: Limb[]
) {
  if (visited.has(node.id)) return;
  visited.add(node.id);

  const end = start.clone().add(direction.clone().multiplyScalar(length));

  const sideways = new THREE.Vector3()
    .crossVectors(direction, new THREE.Vector3(0, 1, 0))
    .normalize()
    .multiplyScalar(length * 0.1 * Math.sin(bearing * 2.3));
  const control = start
    .clone()
    .lerp(end, 0.5)
    .add(sideways)
    .add(new THREE.Vector3(0, length * 0.08, 0));

  const children = childrenOf.get(node.id) ?? [];

  out.push({
    id: node.id,
    treeId,
    parentId: node.parentId,
    kind: node.kind,
    label: node.label,
    depth,
    start: start.clone(),
    end,
    control,
    startRadius: radius,
    endRadius: Math.max(radius * RADIUS_FALLOFF, 0.018),
    isTip: children.length === 0,
    order: depth,
  });

  children.forEach((child, index) => {
    const childBearing = bearing + GOLDEN_ANGLE * (index + 1);
    const tilt = (depth === 0 ? 0.72 : 0.5) + Math.min(children.length, 6) * 0.035 + depth * 0.03;

    const axis = new THREE.Vector3(Math.cos(childBearing), 0, Math.sin(childBearing)).normalize();
    const childDirection = direction
      .clone()
      .applyAxisAngle(axis, tilt * (index % 2 === 0 ? 1 : -0.85))
      .normalize();

    if (childDirection.y < 0.16) {
      childDirection.y = 0.16;
      childDirection.normalize();
    }

    // Branches leaving lower down the trunk are longer, as on a real tree.
    const attach = attachmentPoint(start, end, index, children.length, depth);
    const heightAlong = start.distanceTo(attach) / Math.max(length, 0.001);
    const childLength = length * LENGTH_FALLOFF * (1.15 - heightAlong * 0.3);

    growLimbs(
      child,
      childrenOf,
      treeId,
      attach,
      childDirection,
      childLength,
      radius * RADIUS_FALLOFF,
      depth + 1,
      childBearing,
      visited,
      out
    );
  });
}

/**
 * One board is one tree: the root is the trunk, and everything below it grows
 * off that trunk. Several boards stand together as a forest, which is how the
 * clearing fills up as more sessions are planted.
 */
export function buildForest(boards: Board[]): Forest {
  const populated = boards.filter(board => board.nodes.length > 0);
  const count = Math.max(populated.length, 1);
  const clearingRadius = populated.length <= 1 ? 0 : 13 + populated.length * 3.4;

  const trees: ForestTree[] = populated.map((board, index) => {
    const childrenOf = new Map<string | null, TreeNode[]>();
    for (const node of board.nodes) {
      const siblings = childrenOf.get(node.parentId);
      if (siblings) siblings.push(node);
      else childrenOf.set(node.parentId, [node]);
    }

    const root = (childrenOf.get(null) ?? [])[0];

    const bearing = GOLDEN_ANGLE * index + 0.6;
    const distance = populated.length <= 1 ? 0 : clearingRadius * Math.sqrt((index + 0.5) / count);
    const ground = new THREE.Vector3(
      Math.cos(bearing) * distance,
      0,
      Math.sin(bearing) * distance
    );

    const limbs: Limb[] = [];
    if (root) {
      // Bigger boards grow taller trunks, so a well-tended session stands out.
      const scale = 0.8 + Math.min(board.nodes.length, 40) / 40;
      growLimbs(
        root,
        childrenOf,
        board.id,
        ground.clone(),
        new THREE.Vector3(0, 1, 0),
        TRUNK_HEIGHT * scale,
        TRUNK_RADIUS * (0.75 + scale * 0.25),
        0,
        bearing,
        new Set<string>(),
        limbs
      );
    }

    limbs.forEach((limb, limbIndex) => {
      limb.order = limbIndex;
    });

    return {
      id: board.id,
      label: root?.label ?? board.question,
      question: board.question,
      isActive: board.isActive,
      ground,
      limbs,
      height: limbs.reduce((tallest, limb) => Math.max(tallest, limb.end.y), 0),
      nodeCount: board.nodes.length,
      gapCount: board.nodes.filter(node => node.kind === 'gap').length,
    };
  });

  return { trees, radius: Math.max(clearingRadius, 16) };
}
