// Sanity check for the tidy layout and the export/import round trip.
// Run with: npm run check
import { computeLayout, NODE_WIDTH } from '../src/layout';
import { toJSON, toMarkdown } from '../src/export';
import type { TreeNode } from '../src/types';

let failures = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  pass  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// A deliberately lopsided tree: one branch much wider and deeper than its sibling,
// which is exactly the shape the old layout collapsed on.
const nodes: TreeNode[] = [
  { id: 'n1', label: 'root', kind: 'root', parentId: null, createdBy: 'human' },
  { id: 'n2', label: 'a', kind: 'concept', parentId: 'n1', createdBy: 'human' },
  { id: 'n3', label: 'b', kind: 'concept', parentId: 'n1', createdBy: 'human' },
  { id: 'n4', label: 'a1', kind: 'concept', parentId: 'n2', createdBy: 'human' },
  { id: 'n5', label: 'a2', kind: 'concept', parentId: 'n2', createdBy: 'human' },
  { id: 'n6', label: 'a3', kind: 'concept', parentId: 'n2', createdBy: 'human' },
  { id: 'n7', label: 'a1x', kind: 'gap', parentId: 'n4', createdBy: 'agent' },
  { id: 'n8', label: 'b1', kind: 'concept', parentId: 'n3', createdBy: 'agent' },
];

console.log('layout');
const layout = computeLayout(nodes);
check('every node is positioned', nodes.every(node => Boolean(layout[node.id])));

const rows = new Map<number, Array<{ id: string; x: number }>>();
for (const node of nodes) {
  const { x, y } = layout[node.id];
  const row = rows.get(y);
  if (row) row.push({ id: node.id, x });
  else rows.set(y, [{ id: node.id, x }]);
}

const overlaps: string[] = [];
for (const [y, row] of rows) {
  const sorted = [...row].sort((a, b) => a.x - b.x);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].x - sorted[index - 1].x < NODE_WIDTH) {
      overlaps.push(`${sorted[index - 1].id}/${sorted[index].id} at y=${y}`);
    }
  }
}
check('no two nodes on a row overlap', overlaps.length === 0, overlaps.join(', '));
check('tree is four rows deep', rows.size === 4, `rows: ${[...rows.keys()].join(', ')}`);
check(
  'every parent sits above its children',
  nodes
    .filter(node => node.parentId)
    .every(node => layout[node.id].y > layout[node.parentId!].y)
);

const cyclic: TreeNode[] = [
  { id: 'c1', label: 'c1', kind: 'concept', parentId: 'c2', createdBy: 'human' },
  { id: 'c2', label: 'c2', kind: 'concept', parentId: 'c1', createdBy: 'human' },
];
check('a cyclic parent chain terminates', Object.keys(computeLayout(cyclic)).length === 2);

console.log('\nexport');
const question = 'How does this hold up?';
const exported = JSON.parse(toJSON({ question, nodes }));
check('every node is exported', exported.nodes.length === nodes.length);
check('parent links survive', exported.nodes.find((n: TreeNode) => n.id === 'n7').parentId === 'n4');
check('kinds survive', exported.nodes.find((n: TreeNode) => n.id === 'n7').kind === 'gap');
check('the question is carried', exported.question === question);

const markdown = toMarkdown({ question, nodes });
check('markdown renders gaps as checkboxes', markdown.includes('- [ ] a1x'));
check('markdown lists open questions', markdown.includes('## Open questions'));
check('markdown indents children under parents', /\n {2}- a1/.test(markdown));

console.log('\nread-only inspection tools');
const { useGameStore } = await import('../src/store');
const { applyMove } = await import('../src/moves');

useGameStore.setState({
  nodes,
  question,
  selectedNodeId: '',
  mode: 'workspace',
  gameStatus: 'playing',
});

const boardResult = applyMove('get_board', {});
check('get_board reports no selection as null', boardResult.board.selectedNodeId === null);

const noSelection = applyMove('get_node_state', {});
check('get_node_state fails clearly with nothing selected', noSelection.success === false);

useGameStore.setState({ selectedNodeId: 'n2' });
check(
  'get_board reports the live selection',
  applyMove('get_board', {}).board.selectedNodeId === 'n2'
);

const selected = applyMove('get_node_state', {});
check('omitting nodeId returns the selected node', selected.node?.id === 'n2');
check('the selected node is flagged as selected', selected.node?.selected === true);
check('children are listed', selected.node?.childIds.join(',') === 'n4,n5,n6');

const explicit = applyMove('get_node_state', { nodeId: 'n7' });
check('an explicit id wins over the selection', explicit.node?.id === 'n7');
check('a node that is not selected says so', explicit.node?.selected === false);
check('the parent is named, not just referenced', explicit.node?.parentLabel === 'a1');

check(
  'a label works in place of an id',
  applyMove('get_node_state', { nodeId: 'b1' }).node?.id === 'n8'
);
check('an unknown node fails', applyMove('get_node_state', { nodeId: 'nope' }).success === false);
check(
  'inspection never spends a move',
  applyMove('get_node_state', {}).board.movesRemaining ===
    applyMove('get_board', {}).board.movesRemaining
);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
