import { useEffect, useRef, useState } from 'react';
import { useGameStore } from './store';
import { createAetherScene } from './aether/scene';
import type { HoverInfo } from './aether/scene';

export default function AetherView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ReturnType<typeof createAetherScene> | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const nodes = useGameStore(state => state.nodes);
  const selectedNodeId = useGameStore(state => state.selectedNodeId);
  const setSelectedNodeId = useGameStore(state => state.setSelectedNodeId);

  useEffect(() => {
    if (!containerRef.current) return;

    const instance = createAetherScene(containerRef.current, {
      onHover: setHover,
      onSelect: setSelectedNodeId,
    });
    sceneRef.current = instance;

    return () => {
      instance.dispose();
      sceneRef.current = null;
    };
  }, [setSelectedNodeId]);

  // Rebuild the organism whenever the board changes. Identity of the node list
  // is enough: every store action replaces the array.
  useEffect(() => {
    sceneRef.current?.setData(nodes);
  }, [nodes]);

  useEffect(() => {
    sceneRef.current?.setSelected(selectedNodeId);
  }, [selectedNodeId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#05060f' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {nodes.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
            color: '#64748b',
            fontSize: '14px',
            textAlign: 'center',
            padding: '24px',
          }}
        >
          Nothing has grown yet. Plant a root and it will appear here.
        </div>
      )}

      {hover && (
        <div
          style={{
            position: 'absolute',
            left: `${hover.x}px`,
            top: `${hover.y}px`,
            transform: 'translate(-50%, -160%)',
            pointerEvents: 'none',
            background: 'rgba(8, 11, 26, 0.86)',
            border: '1px solid rgba(148, 163, 184, 0.35)',
            borderRadius: '8px',
            padding: '6px 10px',
            color: '#e2e8f0',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(6px)',
          }}
        >
          <span style={{ opacity: 0.55, marginRight: '6px' }}>{hover.id}</span>
          {hover.label}
          <span style={{ opacity: 0.55, marginLeft: '6px' }}>({hover.kind})</span>
        </div>
      )}

      <p
        style={{
          position: 'absolute',
          left: '16px',
          top: '16px',
          margin: 0,
          color: 'rgba(148, 163, 184, 0.75)',
          fontSize: '11px',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
        }}
      >
        Aether · drag to orbit · scroll to zoom · click a light to select
      </p>
    </div>
  );
}
