import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from './store';
import { createForestScene } from './forest/forest-scene';
import type { EnteredTree, HoverInfo } from './forest/forest-scene';

const ACTIVE_BOARD_ID = 'active';

export default function ForestView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ReturnType<typeof createForestScene> | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [inside, setInside] = useState<EnteredTree | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const nodes = useGameStore(state => state.nodes);
  const question = useGameStore(state => state.question);
  const grove = useGameStore(state => state.grove);
  const selectedNodeId = useGameStore(state => state.selectedNodeId);
  const setSelectedNodeId = useGameStore(state => state.setSelectedNodeId);
  const plantInForest = useGameStore(state => state.plantInForest);
  const openFromForest = useGameStore(state => state.openFromForest);

  useEffect(() => {
    if (!containerRef.current) return;

    const instance = createForestScene(containerRef.current, {
      onHover: setHover,
      onSelect: setSelectedNodeId,
      onEnterTree: setInside,
    });
    sceneRef.current = instance;

    return () => {
      instance.dispose();
      sceneRef.current = null;
    };
  }, [setSelectedNodeId]);

  // The board being worked on stands alongside every session already planted.
  const boards = useMemo(
    () => [
      { id: ACTIVE_BOARD_ID, question, nodes, isActive: true },
      ...grove
        .filter(session => session.question !== question)
        .map(session => ({
          id: session.id,
          question: session.question,
          nodes: session.nodes,
          isActive: false,
        })),
    ],
    [nodes, question, grove]
  );

  useEffect(() => {
    sceneRef.current?.setData(boards);
  }, [boards]);

  useEffect(() => {
    sceneRef.current?.setSelected(selectedNodeId);
  }, [selectedNodeId]);

  const showNotice = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 2600);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0d1b1e' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {nodes.length === 0 && grove.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
            color: '#94a3b8',
            fontSize: '14px',
            textAlign: 'center',
            padding: '24px',
          }}
        >
          Bare ground. Plant a root and this sprout becomes your first tree.
        </div>
      )}

      <div style={overlayStyle}>
        <p style={captionStyle}>
          {inside
            ? `Inside “${inside.label}” · ${inside.nodeCount} nodes · ${inside.gapCount} unbloomed`
            : `${boards.filter(board => board.nodes.length > 0).length} in the clearing · click a tree to walk in`}
        </p>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {inside && (
            <button onClick={() => sceneRef.current?.focusTree(null)} style={pillStyle}>
              ← Back to the forest
            </button>
          )}

          {inside && !inside.isActive && (
            <button
              onClick={() => {
                const result = openFromForest(inside.id);
                showNotice(result.message);
                if (result.success) sceneRef.current?.focusTree(null);
              }}
              style={{ ...pillStyle, background: 'rgba(52, 121, 74, 0.85)' }}
            >
              Tend this tree
            </button>
          )}

          {!inside && nodes.length > 0 && (
            <button
              onClick={() => showNotice(plantInForest().message)}
              style={{ ...pillStyle, background: 'rgba(52, 121, 74, 0.85)' }}
            >
              Plant this session in the forest
            </button>
          )}
        </div>

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
          <span style={{ opacity: 0.55, marginRight: '6px' }}>{hover.id}</span>
          {hover.label}
          {hover.kind === 'gap' && (
            <span style={{ marginLeft: '6px', color: '#fca5a5' }}>· unbloomed</span>
          )}
        </div>
      )}

      <p
        style={{
          position: 'absolute',
          right: '16px',
          bottom: '12px',
          margin: 0,
          color: 'rgba(148, 163, 184, 0.6)',
          fontSize: '11px',
          pointerEvents: 'none',
        }}
      >
        drag to look · scroll to walk closer · double-click to step back
      </p>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  left: '16px',
  top: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  alignItems: 'flex-start',
  maxWidth: 'calc(100% - 32px)',
};

const captionStyle: React.CSSProperties = {
  margin: 0,
  color: 'rgba(226, 232, 240, 0.82)',
  fontSize: '11px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  pointerEvents: 'none',
  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
};

const pillStyle: React.CSSProperties = {
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
