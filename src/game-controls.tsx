import { useState, useEffect } from 'react';
import { useGameStore } from './store';
import type { NodeKind } from './types';
import { useWebMCP } from './use-webmcp';

export default function GameControls() {
  const { nodes, currentPlayer, movesRemaining, gameStatus, question } = useGameStore();
  const { plant, branch, prune, markGap, markClear, undoLastMove, resetGame } = useGameStore();
  const { hasWebMCP } = useWebMCP();

  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [newLabel, setNewLabel] = useState('');
  const [newKind, setNewKind] = useState<NodeKind>('concept');
  const [feedback, setFeedback] = useState('');

  const showFeedback = (message: string) => {
    setFeedback(message);
    setTimeout(() => setFeedback(''), 3000);
  };

  const handlePlant = () => {
    if (!newLabel.trim()) {
      showFeedback('Please enter a label');
      return;
    }
    const result = plant(newLabel, 'human');
    showFeedback(result.message);
    if (result.success) {
      setNewLabel('');
    }
  };

  const handleBranch = () => {
    if (!selectedNodeId) {
      showFeedback('Please select a parent node');
      return;
    }
    if (!newLabel.trim()) {
      showFeedback('Please enter a label');
      return;
    }
    const result = branch(selectedNodeId, newLabel, newKind, 'human');
    showFeedback(result.message);
    if (result.success) {
      setNewLabel('');
    }
  };

  const handlePrune = () => {
    if (!selectedNodeId) {
      showFeedback('Please select a node to prune');
      return;
    }
    const result = prune(selectedNodeId, 'human');
    showFeedback(result.message);
    if (result.success) {
      setSelectedNodeId('');
    }
  };

  const handleMarkGap = () => {
    if (!selectedNodeId) {
      showFeedback('Please select a node to mark');
      return;
    }
    const result = markGap(selectedNodeId, 'human');
    showFeedback(result.message);
  };

  const handleMarkClear = () => {
    if (!selectedNodeId) {
      showFeedback('Please select a gap node to clear');
      return;
    }
    const result = markClear(selectedNodeId, 'human');
    showFeedback(result.message);
  };

  const handleUndo = () => {
    const result = undoLastMove();
    showFeedback(result.message);
  };

  const handleReset = () => {
    resetGame();
    setSelectedNodeId('');
    setNewLabel('');
    showFeedback('Game reset');
  };

  const gapCount = nodes.filter(n => n.kind === 'gap').length;
  const isWinnable = nodes.length >= 5 && gapCount === 0;

  const handleSkipAgent = () => {
    useGameStore.setState({ currentPlayer: 'human' });
    showFeedback('Skipped agent turn');
  };

  useEffect(() => {
    if (!hasWebMCP && currentPlayer === 'agent' && gameStatus === 'playing') {
      const timer = setTimeout(() => {
        handleSkipAgent();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [hasWebMCP, currentPlayer, gameStatus]);

  return (
    <div style={{
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      background: '#f8fafc',
      borderLeft: '1px solid #e2e8f0',
      minWidth: '320px',
      maxWidth: '380px',
      overflowY: 'auto',
    }}>
      <div style={{
        background: gameStatus === 'won' ? '#10b981' : gameStatus === 'lost' ? '#ef4444' : '#6366f1',
        color: 'white',
        padding: '16px',
        borderRadius: '8px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
          {gameStatus === 'playing' ? 'CanvasQuest' : gameStatus === 'won' ? '🎉 Victory!' : '😔 Game Over'}
        </div>
        <div style={{ fontSize: '14px', opacity: 0.9 }}>
          Moves: {movesRemaining} | Turn: {currentPlayer}
        </div>
        <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
          Nodes: {nodes.length} | Gaps: {gapCount}
        </div>
        {gameStatus === 'playing' && (
          <div style={{ fontSize: '12px', marginTop: '8px', opacity: 0.9 }}>
            {isWinnable ? '✨ Win condition met!' : `Need ${Math.max(0, 5 - nodes.length)} more nodes${gapCount > 0 ? ` & clear ${gapCount} gaps` : ''}`}
          </div>
        )}
      </div>

      <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.4' }}>
        <strong>Question:</strong> {question}
      </div>

      {feedback && (
        <div style={{
          background: '#fef3c7',
          color: '#92400e',
          padding: '12px',
          borderRadius: '6px',
          fontSize: '13px',
        }}>
          {feedback}
        </div>
      )}

      {gameStatus === 'playing' && currentPlayer === 'agent' && !hasWebMCP && (
        <div style={{
          background: '#fef3c7',
          color: '#92400e',
          padding: '12px',
          borderRadius: '6px',
          fontSize: '13px',
          textAlign: 'center',
        }}>
          Agent turn (skipping in 1s...)
        </div>
      )}

      {gameStatus === 'playing' && currentPlayer === 'human' && (
        <>
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
            <label style={{ fontSize: '13px', fontWeight: '600', color: '#334155', display: 'block', marginBottom: '8px' }}>
              Label
            </label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Enter node label..."
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>

          {nodes.length === 0 ? (
            <button
              onClick={handlePlant}
              style={{
                padding: '12px',
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              🌱 Plant Root
            </button>
          ) : (
            <>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#334155', display: 'block', marginBottom: '8px' }}>
                  Parent Node
                </label>
                <select
                  value={selectedNodeId}
                  onChange={(e) => setSelectedNodeId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                >
                  <option value="">Select node...</option>
                  {nodes.map(n => (
                    <option key={n.id} value={n.id}>
                      {n.label} ({n.kind})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#334155', display: 'block', marginBottom: '8px' }}>
                  Kind
                </label>
                <select
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value as NodeKind)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                >
                  <option value="concept">💡 Concept</option>
                  <option value="resource">📚 Resource</option>
                  <option value="skill">⚡ Skill</option>
                  <option value="gap">❓ Gap</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  onClick={handleBranch}
                  style={{
                    padding: '10px',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Branch
                </button>
                <button
                  onClick={handlePrune}
                  style={{
                    padding: '10px',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Prune
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  onClick={handleMarkGap}
                  style={{
                    padding: '10px',
                    background: '#f59e0b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Mark Gap
                </button>
                <button
                  onClick={handleMarkClear}
                  style={{
                    padding: '10px',
                    background: '#8b5cf6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Clear Gap
                </button>
              </div>
            </>
          )}

          <button
            onClick={handleUndo}
            style={{
              padding: '10px',
              background: '#64748b',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            ↶ Undo Agent
          </button>
        </>
      )}

      {gameStatus !== 'playing' && (
        <button
          onClick={handleReset}
          style={{
            padding: '12px',
            background: '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          🔄 New Game
        </button>
      )}

      <div style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.4', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
        <strong>Goal:</strong> Build a tree with 5+ nodes and no gaps in 10 moves
      </div>
    </div>
  );
}
