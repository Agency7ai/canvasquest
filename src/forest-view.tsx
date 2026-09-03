import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
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
  // A planted tree can only come back as the board between games.
  const canRevisit = focused !== null && !focused.isActive && (gamePhase === 'setup' || gamePhase === 'ended');

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
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0d1b1e', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {unsupported && (
        <div style={centerHintStyle}>
          This browser cannot draw the forest: WebGL is unavailable. The Board view shows the same tree.
        </div>
      )}

      {!unsupported && nodes.length === 0 && gamePhase !== 'setup' && (
        <div style={centerHintStyle}>Bare ground. The sprout becomes a tree once the root is planted.</div>
      )}

      <div style={overlayStyle}>
        {caption && <p style={captionStyle}>{caption}</p>}

        {focused && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setFocusedTreeId(null)} style={pillStyle}>
              ← Back to the forest
            </button>
            {canRevisit && (
              <button
                type="button"
                onClick={revisit}
                title="Brings this tree back as the board, with its score and share link"
                style={{ ...pillStyle, background: 'rgba(52, 121, 74, 0.85)' }}
              >
                Revisit this tree
              </button>
            )}
            {!focused.isActive && (
              <button type="button" onClick={fell} title="Removes this tree from the forest" style={pillStyle}>
                Fell it
              </button>
            )}
          </div>
        )}

        {notice && (
          <p role="status" style={{ ...captionStyle, color: '#bbf7d0', textTransform: 'none' }}>
            {notice}
          </p>
        )}
      </div>

      {hover && (
        <div
          style={{
            position: 'absolute',
            left: `${hover.x}px`,
            top: `${hover.y}px`,
            transform: 'translate(-50%, -170%)',
            pointerEvents: 'none',
            background: 'rgba(12, 26, 22, 0.9)',
            border: '1px solid rgba(148, 163, 184, 0.35)',
            borderRadius: '8px',
            padding: '6px 10px',
            color: '#ecfdf5',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(6px)',
          }}
        >
          {hover.treeId === ACTIVE_BOARD_ID && <span style={{ opacity: 0.55, marginRight: '6px' }}>{hover.nodeId}</span>}
          {hover.label}
          {hover.kind === 'gap' && <span style={{ marginLeft: '6px', color: '#fca5a5' }}>· gap</span>}
        </div>
      )}

      <p style={footerStyle}>drag to look · scroll to walk closer · click a limb to select · double-click to step back</p>
    </div>
  );
}

const centerHintStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  pointerEvents: 'none',
  color: '#94a3b8',
  fontSize: '14px',
  textAlign: 'center',
  padding: '24px',
};

const overlayStyle: CSSProperties = {
  position: 'absolute',
  left: '16px',
  top: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  alignItems: 'flex-start',
  maxWidth: 'calc(100% - 32px)',
};

const captionStyle: CSSProperties = {
  margin: 0,
  color: 'rgba(226, 232, 240, 0.82)',
  fontSize: '11px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  pointerEvents: 'none',
  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
};

const pillStyle: CSSProperties = {
  background: 'rgba(15, 30, 25, 0.78)',
  color: '#e2e8f0',
  border: '1px solid rgba(148, 163, 184, 0.4)',
  borderRadius: '999px',
  padding: '6px 14px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  backdropFilter: 'blur(6px)',
};

const footerStyle: CSSProperties = {
  position: 'absolute',
  right: '16px',
  bottom: '12px',
  margin: 0,
  color: 'rgba(148, 163, 184, 0.6)',
  fontSize: '11px',
  pointerEvents: 'none',
};
