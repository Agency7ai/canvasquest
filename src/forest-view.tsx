import { useEffect, useRef, useState } from 'react';
import { useGameStore } from './store';
import { createForestScene } from './forest/forest-scene';
import type { HoverInfo } from './forest/forest-scene';

export default function ForestView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ReturnType<typeof createForestScene> | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [inside, setInside] = useState<{ id: string; label: string } | null>(null);

  const nodes = useGameStore(state => state.nodes);
  const selectedNodeId = useGameStore(state => state.selectedNodeId);
  const setSelectedNodeId = useGameStore(state => state.setSelectedNodeId);

  useEffect(() => {
    if (!containerRef.current) return;

    const instance = createForestScene(containerRef.current, {
      onHover: setHover,
      onSelect: setSelectedNodeId,
      onEnterTree: (id, label) => setInside(id && label ? { id, label } : null),
    });
    sceneRef.current = instance;

    return () => {
      instance.dispose();
      sceneRef.current = null;
    };
  }, [setSelectedNodeId]);

  useEffect(() => {
    sceneRef.current?.setData(nodes);
  }, [nodes]);

  useEffect(() => {
    sceneRef.current?.setSelected(selectedNodeId);
  }, [selectedNodeId]);

  const treeCount = nodes.filter(node => {
    const root = nodes.find(candidate => candidate.parentId === null);
    return root ? node.parentId === root.id : node.parentId === null;
  }).length;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0d1b1e' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {nodes.length === 0 && (
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
          Bare ground. Plant a root and the first sprout appears here.
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          left: '16px',
          top: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          alignItems: 'flex-start',
        }}
      >
        <p
          style={{
            margin: 0,
            color: 'rgba(226, 232, 240, 0.8)',
            fontSize: '11px',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            pointerEvents: 'none',
            textShadow: '0 1px 3px rgba(0,0,0,0.6)',
          }}
        >
          {inside
            ? `Inside “${inside.label}”`
            : `${treeCount} ${treeCount === 1 ? 'tree' : 'trees'} · click one to walk in`}
        </p>

        {inside && (
          <button
            onClick={() => sceneRef.current?.focusTree(null)}
            style={{
              background: 'rgba(15, 30, 25, 0.78)',
              color: '#e2e8f0',
              border: '1px solid rgba(148, 163, 184, 0.4)',
              borderRadius: '999px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              backdropFilter: 'blur(6px)',
            }}
          >
            ← Back to the forest
          </button>
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
