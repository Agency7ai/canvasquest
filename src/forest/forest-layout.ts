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
  /** Order of appearance, so growth can run outward from the trunk. */
  order: number;
}

export interface ForestTree {
  id: string;
  label: string;
  /** Where the trunk meets the ground. */
  ground: THREE.Vector3;
  limbs: Limb[];
  height: number;
  swayPhase: number;
}

export interface Forest {
  trees: ForestTree[];
  /** The board's root: a sprout in the middle of the clearing. */
  seed: { id: string; label: string; position: THREE.Vector3 } | null;
  radius: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const TRUNK_HEIGHT = 5.4;
const TRUNK_RADIUS = 0.34;
const LENGTH_FALLOFF = 0.74;
const RADIUS_FALLOFF = 0.58;

/**
 * Grows a tree from a node and its descendants. Each generation leaves its
 * parent on a golden-angle bearing, tilting further from vertical and losing
 * length and thickness, which is what gives a branching silhouette rather than
 * a diagram with round corners.
 */
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

  // Bow the limb: lift the midpoint along the growth direction and push it
  // slightly sideways so no two limbs read as parallel.
  const sideways = new THREE.Vector3()
    .crossVectors(direction, new THREE.Vector3(0, 1, 0))
    .normalize()
    .multiplyScalar(length * 0.12 * Math.sin(bearing * 2.3));
  const control = start
    .clone()
    .lerp(end, 0.5)
    .add(sideways)
    .add(new THREE.Vector3(0, length * 0.09, 0));

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
    endRadius: Math.max(radius * RADIUS_FALLOFF, 0.02),
    isTip: children.length === 0,
    order: depth,
  });

  children.forEach((child, index) => {
    const childBearing = bearing + GOLDEN_ANGLE * (index + 1);
    // Spread wider when a node has many children, so crowded forks fan out.
    const tilt = 0.42 + Math.min(children.length, 5) * 0.07 + depth * 0.04;

    const axis = new THREE.Vector3(Math.cos(childBearing), 0, Math.sin(childBearing)).normalize();
    const childDirection = direction
      .clone()
      .applyAxisAngle(axis, tilt * (index % 2 === 0 ? 1 : -0.82))
      .normalize();

    // Keep growth generally upward; limbs should not dive into the ground.
    if (childDirection.y < 0.12) {
      childDirection.y = 0.12;
      childDirection.normalize();
    }

    growLimbs(
      child,
      childrenOf,
      treeId,
      end,
      childDirection,
      length * LENGTH_FALLOFF,
      radius * RADIUS_FALLOFF,
      depth + 1,
      childBearing,
      visited,
      out
    );
  });
}

export function buildForest(nodes: TreeNode[]): Forest {
  const childrenOf = new Map<string | null, TreeNode[]>();
  for (const node of nodes) {
    const siblings = childrenOf.get(node.parentId);
    if (siblings) siblings.push(node);
    else childrenOf.set(node.parentId, [node]);
  }

  const roots = childrenOf.get(null) ?? [];
  const board = roots[0];

  // The board's root is the seed in the clearing; each of its children becomes
  // a tree of its own. Without a root, every top-level node is its own tree.
  const trunkNodes = board ? childrenOf.get(board.id) ?? [] : roots;
  const seed = board
    ? { id: board.id, label: board.label, position: new THREE.Vector3(0, 0, 0) }
    : null;

  const count = Math.max(trunkNodes.length, 1);
  const clearingRadius = 7 + count * 2.1;

  const trees: ForestTree[] = trunkNodes.map((node, index) => {
    // Golden angle keeps trees from lining up in rings as the forest fills in.
    const bearing = GOLDEN_ANGLE * index + 0.6;
    const distance = clearingRadius * Math.sqrt((index + 0.6) / count);
    const ground = new THREE.Vector3(
      Math.cos(bearing) * distance,
      0,
      Math.sin(bearing) * distance
    );

    const limbs: Limb[] = [];
    growLimbs(
      node,
      childrenOf,
      node.id,
      ground.clone(),
      new THREE.Vector3(0, 1, 0),
      TRUNK_HEIGHT,
      TRUNK_RADIUS,
      0,
      bearing,
      new Set<string>(),
      limbs
    );

    limbs.forEach((limb, limbIndex) => {
      limb.order = limbIndex;
    });

    const height = limbs.reduce((tallest, limb) => Math.max(tallest, limb.end.y), 0);

    return {
      id: node.id,
      label: node.label,
      ground,
      limbs,
      height,
      swayPhase: index * 1.37,
    };
  });

  return { trees, seed, radius: clearingRadius };
}
