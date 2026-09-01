// Verifies the forest layout against the real 36-node BuildRelay board.
// Run with: npm run check:forest
import { buildForest } from '../src/forest/forest-layout';
import type { TreeNode } from '../src/types';

let failures = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const raw: Array<[string, string, TreeNode['kind'], string | null]> = [
  ['n1', 'BuildRelay: Invisible GC Coordination', 'root', null],
  ['n2', 'Value Proposition', 'concept', 'n1'],
  ['n3', 'Operating Workflow', 'concept', 'n1'],
  ['n4', 'Existing Tool Stack', 'resource', 'n1'],
  ['n5', 'Remaining Market Gap', 'concept', 'n1'],
  ['n6', 'Ideal Pilot Customer', 'concept', 'n1'],
  ['n7', 'Go-to-Market Positioning', 'concept', 'n1'],
  ['n8', 'One Accountable GC', 'concept', 'n2'],
  ['n9', 'Invisible Back-Office Ops', 'concept', 'n2'],
  ['n10', 'More Project Capacity', 'concept', 'n2'],
  ['n11', 'Fewer Client Surprises', 'concept', 'n2'],
  ['n12', 'Collect Trade Updates', 'skill', 'n3'],
  ['n13', 'Maintain Schedule Records', 'skill', 'n3'],
  ['n14', 'Detect Missing Information', 'skill', 'n3'],
  ['n15', 'Track Dependencies', 'skill', 'n3'],
  ['n16', 'Draft Client Updates', 'skill', 'n3'],
  ['n17', 'Escalate Judgment Calls', 'skill', 'n3'],
  ['n18', 'Follow Through Closure', 'skill', 'n3'],
  ['n19', 'Use Existing Channels', 'skill', 'n3'],
  ['n20', 'Jobber and Houzz Pro', 'resource', 'n4'],
  ['n21', 'Buildertrend and JobTread', 'resource', 'n4'],
  ['n22', 'QuickBooks Financial Records', 'resource', 'n4'],
  ['n23', 'Texts Calls Spreadsheets', 'resource', 'n4'],
  ['n24', 'Dashboard Reality Drift', 'gap', 'n5'],
  ['n25', 'Trades Ignore Portals', 'gap', 'n5'],
  ['n26', 'Cross-Trade Delay Effects', 'gap', 'n5'],
  ['n27', 'Unclosed Follow-Up Loops', 'gap', 'n5'],
  ['n28', 'Busy Established Contractor', 'concept', 'n6'],
  ['n29', 'Charges Project Management', 'concept', 'n6'],
  ['n30', 'No Office Coordinator', 'concept', 'n6'],
  ['n31', 'Capacity-Constrained Growth', 'concept', 'n6'],
  ['n32', 'Sell Increased Capacity', 'concept', 'n7'],
  ['n33', 'Sell Consistent Execution', 'concept', 'n7'],
  ['n34', 'Sell Better Client Experience', 'concept', 'n7'],
  ['n35', 'Not Another Dashboard', 'concept', 'n7'],
  ['n36', 'Contractor Keeps Brand', 'concept', 'n7'],
];

const nodes: TreeNode[] = raw.map(([id, label, kind, parentId]) => ({
  id,
  label,
  kind,
  parentId,
  createdBy: 'human',
}));

console.log('one board is one tree');
const single = buildForest([
  { id: 'active', question: 'How does BuildRelay work?', nodes, isActive: true },
]);

check('produces exactly one tree', single.trees.length === 1, `got ${single.trees.length}`);

const tree = single.trees[0];
check('every node became a limb', tree.limbs.length === nodes.length, `got ${tree.limbs.length}`);
check('the trunk starts on the ground', tree.limbs[0].start.y === 0);
check('the tree has height', tree.height > 5, `height ${tree.height.toFixed(2)}`);
check('all four gaps are carried through', tree.gapCount === 4, `got ${tree.gapCount}`);

const finite = tree.limbs.every(limb =>
  [limb.start, limb.end, limb.control].every(
    point => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
  )
);
check('no NaN geometry', finite);

check('no limb dives underground', tree.limbs.every(limb => limb.end.y > -0.01));
check('limbs taper', tree.limbs.every(limb => limb.endRadius < limb.startRadius));
check(
  'orders are unique so growth is sequential',
  new Set(tree.limbs.map(limb => limb.order)).size === tree.limbs.length
);

// Every child must physically start on its parent's limb, or the tree is a
// scatter of disconnected sticks rather than one connected structure.
const byId = new Map(tree.limbs.map(limb => [limb.id, limb]));
const detached = tree.limbs.filter(limb => {
  if (!limb.parentId) return false;
  const parent = byId.get(limb.parentId);
  if (!parent) return true;
  const alongParent = Math.min(
    limb.start.distanceTo(parent.start),
    limb.start.distanceTo(parent.end),
    limb.start.distanceTo(parent.start.clone().lerp(parent.end, 0.5))
  );
  return alongParent > parent.start.distanceTo(parent.end);
});
check('every limb is attached to its parent', detached.length === 0, detached.map(l => l.id).join(', '));

const trunkChildren = tree.limbs.filter(limb => limb.parentId === 'n1');
const attachHeights = new Set(trunkChildren.map(limb => limb.start.y.toFixed(3)));
check(
  'branches leave the trunk at different heights',
  attachHeights.size === trunkChildren.length,
  `${attachHeights.size} distinct of ${trunkChildren.length}`
);

console.log('\nseveral boards make a forest');
const forest = buildForest([
  { id: 'active', question: 'Active', nodes, isActive: true },
  { id: 'g1', question: 'Planted one', nodes: nodes.slice(0, 12), isActive: false },
  { id: 'g2', question: 'Planted two', nodes: nodes.slice(0, 20), isActive: false },
]);
check('one tree per board', forest.trees.length === 3, `got ${forest.trees.length}`);

const grounds = forest.trees.map(item => item.ground);
let tooClose = '';
for (let i = 0; i < grounds.length; i += 1) {
  for (let j = i + 1; j < grounds.length; j += 1) {
    if (grounds[i].distanceTo(grounds[j]) < 6) tooClose = `${i}/${j}`;
  }
}
check('trees do not stand on top of each other', tooClose === '', tooClose);
check('an empty board grows nothing', buildForest([
  { id: 'empty', question: 'Nothing', nodes: [], isActive: true },
]).trees.length === 0);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
