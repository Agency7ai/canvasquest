import { ReactFlowProvider } from 'reactflow';
import GameCanvas from './game-canvas';
import GameControls from './game-controls';
import { useWebMCP } from './use-webmcp';
import './app.css';

function App() {
  const { hasWebMCP } = useWebMCP();

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
            CanvasQuest
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
            Collaborative Learning Game with Voice Agent
          </p>
        </div>
        <div style={{
          background: hasWebMCP ? '#10b981' : '#f59e0b',
          padding: '6px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <span>{hasWebMCP ? '✓' : '⚠'}</span>
          <span>{hasWebMCP ? 'WebMCP Active' : 'WebMCP Off - Human Only'}</span>
        </div>
      </header>
      
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ReactFlowProvider>
          <GameCanvas />
        </ReactFlowProvider>
        <GameControls />
      </div>
    </div>
  );
}

export default App;
