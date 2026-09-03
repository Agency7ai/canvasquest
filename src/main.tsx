import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { restoreGame, startAutosave } from './persistence';

// Restore before the first render so the board never flashes empty, then keep
// saving as it changes.
restoreGame();
startAutosave();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
