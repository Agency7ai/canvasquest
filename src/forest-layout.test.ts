import { describe, expect, it } from 'vitest';
import { buildForest, MIN_TREE_SPACING, pointOnLimb } from './forest/forest-layout';
import type { Board, Limb } from './forest/forest-layout';
import type { NodeKind, TreeNode } from './types';

/**
 * Port of the cursor branch's scripts/check-forest.ts, as a test. Every board
 * must become a tree that stands on the ground, tapers, attaches each limb to
 * its parent and grows in creation order.
 */

const CYCLE: NodeKind[] = ['resource', 'skill', 'concept'];

function node(
  id: string,
  label: string,
  kind: NodeKind,
  parentId: string | null,
  extra: Partial<TreeNode> = {},
): TreeNode {
  return { id, label, kind, parentId, createdBy: 'human', isGap: false, ...extra };
}

/** A 36-node board shaped like a full game: five concepts under the root, six children each, four gaps. */
function bigBoard(): TreeNode[] {
  const nodes: TreeNode[] = [node('n1', 'How do I build a relay?', 'root', null)];
  let next = 2;
  for (let c = 0; c < 5; c++) {
    const conceptId = `n${next++}`;
    nodes.push(node(conceptId, `Concept ${c + 1}`, 'concept', 'n1'));
  }
  for (let c = 0; c < 5; c++) {
    const conceptId = `n${c + 2}`;
    for (let k = 0; k < 6; k++) {
      const id = `n${next++}`;
      const isGap = c === 3 && k < 4;
      nodes.push(node(id, `${conceptId} child ${k + 1}`, CYCLE[k % CYCLE.length], conceptId, {
        isGap,
        ...(isGap ? { gapReason: 'What is missing here?' } : {}),
      }));
    }
  }
  return nodes;
}

function board(id: string, nodes: TreeNode[], isActive = false): Board {
  return { id, question: `Question ${id}`, nodes, isActive };
}

function distanceToLimb(point: Limb['start'], limb: Limb): number {
  let best = Infinity;
  for (let i = 0; i <= 400; i++) {
    best = Math.min(best, pointOnLimb(limb, i / 400).distanceTo(point));
  }
  return best;
}

const finite = (v: { x: number; y: number; z: number }) =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

describe('buildForest', () => {
  const nodes = bigBoard();
  const forest = buildForest([board('active', nodes, true)]);
  const tree = forest.trees[0];
  const byId = new Map(tree.limbs.map(limb => [limb.id, limb]));

  it('grows one limb per node, with the root as a trunk standing on the ground', () => {
    expect(nodes).toHaveLength(36);
    expect(forest.trees).toHaveLength(1);
    expect(tree.limbs).toHaveLength(36);
    for (const n of nodes) expect(byId.has(n.id)).toBe(true);

    const trunk = byId.get('n1')!;
    expect(trunk.parentId).toBeNull();
    expect(trunk.depth).toBe(0);
    expect(trunk.start.y).toBe(0);
    expect(trunk.start.x).toBe(0);
    expect(trunk.start.z).toBe(0);
    expect(tree.height).toBeGreaterThan(5);
    expect(tree.nodeCount).toBe(36);
  });

  it('shows gaps as gap limbs, whatever kind the node has', () => {
    expect(tree.gapCount).toBe(4);
    expect(tree.limbs.filter(limb => limb.kind === 'gap')).toHaveLength(4);
    expect(byId.get('n2')!.kind).toBe('concept');
  });

  it('keeps every limb finite and above the ground', () => {
    for (const limb of tree.limbs) {
      expect(finite(limb.start)).toBe(true);
      expect(finite(limb.control)).toBe(true);
      expect(finite(limb.end)).toBe(true);
      expect(limb.start.y).toBeGreaterThan(-0.01);
      expect(limb.control.y).toBeGreaterThan(-0.01);
      expect(limb.end.y).toBeGreaterThan(-0.01);
      expect(limb.end.y).toBeGreaterThan(limb.start.y);
    }
  });

  it('tapers: limbs thin toward their end and children are never thicker than their parent', () => {
    for (const limb of tree.limbs) {
      expect(limb.endRadius).toBeLessThan(limb.startRadius);
      if (limb.parentId) {
        const parent = byId.get(limb.parentId)!;
        expect(limb.startRadius).toBeLessThanOrEqual(parent.startRadius);
      }
    }
  });

  it('attaches every limb to a point on its parent', () => {
    for (const limb of tree.limbs) {
      if (!limb.parentId) continue;
      const parent = byId.get(limb.parentId)!;
      expect(distanceToLimb(limb.start, parent)).toBeLessThan(0.05);
    }
  });

  it('spreads the trunk branches over distinct heights', () => {
    const heights = tree.limbs
      .filter(limb => limb.parentId === 'n1')
      .map(limb => Math.round(limb.start.y * 100) / 100);
    expect(new Set(heights).size).toBe(heights.length);
    expect(heights.length).toBe(5);
  });

  it('grows in creation order, each limb after its parent, with unique orders', () => {
    const orders = tree.limbs.map(limb => limb.order);
    expect(new Set(orders).size).toBe(orders.length);
    for (const limb of tree.limbs) {
      if (!limb.parentId) continue;
      expect(limb.order).toBeGreaterThan(byId.get(limb.parentId)!.order);
    }
    // A node appended later is always the last thing to grow.
    const later = [...nodes, node('n37', 'Late arrival', 'skill', 'n2')];
    const regrown = buildForest([board('active', later, true)]).trees[0];
    const late = regrown.limbs.find(limb => limb.id === 'n37')!;
    expect(late.order).toBe(36);
    for (const limb of regrown.limbs) {
      if (limb.id === 'n37') continue;
      expect(limb.order).toBe(byId.get(limb.id)!.order);
    }
  });

  it('makes bigger boards into taller trees', () => {
    const small = buildForest([board('small', nodes.slice(0, 3), true)]).trees[0];
    expect(tree.height).toBeGreaterThan(small.height);
  });
});

describe('the clearing', () => {
  const nodes = bigBoard();

  it('puts the active board in the middle and planted boards around it, well apart', () => {
    const forest = buildForest([
      board('active', nodes, true),
      board('grove-1', nodes.slice(0, 12)),
      board('grove-2', nodes.slice(0, 20)),
    ]);
    expect(forest.trees).toHaveLength(3);
    const active = forest.trees.find(tree => tree.isActive)!;
    expect(active.ground.length()).toBe(0);
    for (let i = 0; i < forest.trees.length; i++) {
      for (let j = i + 1; j < forest.trees.length; j++) {
        expect(forest.trees[i].ground.distanceTo(forest.trees[j].ground)).toBeGreaterThanOrEqual(
          MIN_TREE_SPACING,
        );
      }
    }
    expect(forest.radius).toBeGreaterThan(0);
    expect(Number.isFinite(forest.radius)).toBe(true);
  });

  it('keeps a full grove apart across both rings', () => {
    const boards = Array.from({ length: 12 }, (_, i) => board(`grove-${i}`, nodes.slice(0, 4 + i)));
    const forest = buildForest([board('active', nodes, true), ...boards]);
    expect(forest.trees).toHaveLength(13);
    for (let i = 0; i < forest.trees.length; i++) {
      for (let j = i + 1; j < forest.trees.length; j++) {
        expect(forest.trees[i].ground.distanceTo(forest.trees[j].ground)).toBeGreaterThanOrEqual(
          MIN_TREE_SPACING,
        );
      }
    }
  });

  it('grows no tree for an empty board, so bare ground shows a seed', () => {
    const forest = buildForest([board('active', [], true)]);
    expect(forest.trees).toHaveLength(0);
    expect(forest.radius).toBeGreaterThan(0);
    const withGrove = buildForest([board('active', [], true), board('grove-1', nodes.slice(0, 5))]);
    expect(withGrove.trees).toHaveLength(1);
    expect(withGrove.trees[0].isActive).toBe(false);
    expect(withGrove.trees[0].ground.length()).toBeGreaterThan(MIN_TREE_SPACING);
  });
});
