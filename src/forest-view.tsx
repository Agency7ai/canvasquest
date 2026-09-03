import { useEffect, useMemo, useRef, useState } from 'react';
import { ACTIVE_BOARD_ID } from './app-meta';
import type { Board } from './forest/forest-layout';
import { createForestScene } from './forest/forest-scene';
import type { ForestScene, HoverInfo } from './forest/forest-scene';
import { computeScore } from './scoring';
import { useGameStore } from './store';
import type { TreeNode } from './types';

const NOTICE_MS = 2600;

// The same count the panels and get_board report: marked gaps plus concepts
// with nothing beneath them.
const countOpenGaps = (nodes: TreeNode[]) => computeScore(nodes).openGaps.length;

/** Probed before the scene is built, so a browser without WebGL gets a message instead of an error. */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * The forest as a React component. It mounts the three.js scene once, feeds
 * it the board being played plus every planted tree, and draws the caption,
 * the hover tooltip and the walk-in buttons over it. Selection and focus live
 * in the store, so the board view, the controls and the agent's get_board all
 * see what the human is looking at.
 *
 * Ported from the cursor/gap-first-workspace-3cdc branch.
 */
export default function ForestView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ForestScene | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [unsupported] = useState(() => !hasWebGL());
  const [notice, setNotice] = useState('');

  const nodes = useGameStore(state => state.nodes);
  const question = useGameStore(state => state.question);
  const gamePhase = useGameStore(state => state.gamePhase);
  const grove = useGameStore(state => state.grove);
  const selectedNodeId = useGameStore(state => state.selectedNodeId);
  const focusedTreeId = useGameStore(state => state.focusedTreeId);
  const selectNode = useGameStore(state => state.selectNode);
  const setFocusedTreeId = useGameStore(state => state.setFocusedTreeId);
  const openFromForest = useGameStore(state => state.openFromForest);
  const removeFromForest = useGameStore(state => state.removeFromForest);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || unsupported) return;
    let scene: ForestScene;
    try {
      scene = createForestScene(container, {
        onHover: setHover,
        // Only the board being played can be worked on, so a click on a planted
        // tree walks into it without changing the selection.
        onSelect: (nodeId, treeId) => {
          if (treeId === ACTIVE_BOARD_ID) selectNode(nodeId);
        },
        onEnterTree: tree => setFocusedTreeId(tree ? tree.id : null),
      });
    } catch (error) {
      // The flat board still works, so a renderer failure is logged, not thrown.
      console.error('[forest] Could not start the forest:', error);
      return;
    }
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
      setHover(null);
      setFocusedTreeId(null);
    };
  }, [unsupported, selectNode, setFocusedTreeId]);

  // The board being played grows in the middle; every planted tree stands around
  // it. A planted tree grown from the same question is the board's own past, so
  // it is left out rather than shown twice.
  const boards = useMemo<Board[]>(
    () => [
      { id: ACTIVE_BOARD_ID, question, nodes, isActive: true },
      ...grove
        .filter(tree => tree.question !== question)
        .map(tree => ({ id: tree.id, question: tree.question, nodes: tree.nodes, isActive: false })),
    ],
    [nodes, question, grove],
  );

  useEffect(() => {
    sceneRef.current?.setData(boards);
  }, [boards]);

  useEffect(() => {
    sceneRef.current?.setSelected(selectedNodeId);
  }, [selectedNodeId]);

  useEffect(() => {
    sceneRef.current?.focusTree(focusedTreeId);
  }, [focusedTreeId]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const focused = focusedTreeId ? (boards.find(board => board.id === focusedTreeId) ?? null) : null;
  const standing = boards.filter(board => board.nodes.length > 0).length;
  // Any planted tree can come back onto the board; whatever is being played is
  // parked in the question index first.
  const canRevisit = focused !== null && !focused.isActive;

  const revisit = () => {
    if (!focused) return;
    const result = openFromForest(focused.id);
    setNotice(result.message);
  };

  const fell = () => {
    if (!focused || focused.isActive) return;
    if (!window.confirm(`Fell "${focused.question}"? It leaves the forest for good.`)) return;
    removeFromForest(focused.id);
    setNotice(`Felled "${focused.question}"`);
  };

  const caption = focused
    ? `${focused.question} · ${focused.nodes.length} ${focused.nodes.length === 1 ? 'node' : 'nodes'} · ${countOpenGaps(focused.nodes)} open gaps`
    : standing > 0
      ? `${standing} ${standing === 1 ? 'tree' : 'trees'} in the clearing · click a tree to walk in`
      : '';

  return (
    <div className="forest">
      <div ref={containerRef} className="forest-scene" />

      {unsupported && (
        <div className="center-hint">
          This browser cannot draw the forest: WebGL is unavailable. The Board view shows the same tree.
        </div>
      )}

      {!unsupported && nodes.length === 0 && gamePhase !== 'setup' && (
        <div className="center-hint">Bare ground. The sprout becomes a tree once the root is planted.</div>
      )}

      <div className="forest-overlay">
        {caption && <p className="forest-caption">{caption}</p>}

        {focused && (
          <div className="pills">
            <button type="button" className="pill" onClick={() => setFocusedTreeId(null)}>
              ← Back to the forest
            </button>
            {canRevisit && (
              <button
                type="button"
                className="pill pill-primary"
                onClick={revisit}
                title="Brings this tree onto the board; the tree being played is parked in the question index"
              >
                Revisit this tree
              </button>
            )}
            {!focused.isActive && (
              <button type="button" className="pill" onClick={fell} title="Removes this tree from the forest">
                Fell it
              </button>
            )}
          </div>
        )}

        {notice && (
          <p role="status" className="forest-caption forest-notice">
            {notice}
          </p>
        )}
      </div>

      {hover && (
        <div className="forest-tooltip" style={{ left: `${hover.x}px`, top: `${hover.y}px` }}>
          {hover.treeId === ACTIVE_BOARD_ID && <span className="tooltip-id">{hover.nodeId}</span>}
          {hover.label}
          {hover.kind === 'gap' && <span className="tooltip-gap">· gap</span>}
        </div>
      )}
    </div>
  );
}
