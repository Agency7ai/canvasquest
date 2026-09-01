# CanvasQuest

A collaborative learning game where humans and voice agents work together to build a knowledge tree. Built for the WebMCP Challenge 2026.

## What is CanvasQuest?

CanvasQuest is a turn-based game on a shared canvas where a human player and an AI voice agent collaborate to build a learning tree. The agent can only modify the tree through WebMCP tools registered on the page, while the human uses UI controls. Voice is the agent's controller.

## Game Rules

- **Goal**: Build a tree with at least 5 nodes and no gaps remaining
- **Moves**: 10 total moves (human and agent alternate turns)
- **Win Condition**: Tree has 5+ nodes and zero gap markers when moves are exhausted
- **Lose Condition**: Moves exhausted with gaps still remaining

### Node Types

- 🌱 **Root**: The main learning question (planted first)
- 💡 **Concept**: Ideas, topics, or theories
- 📚 **Resource**: Books, courses, or learning materials
- ⚡ **Skill**: Abilities or competencies to develop
- ❓ **Gap**: Knowledge gaps that need to be filled

### Available Actions

1. **Plant** - Create the root node (first move only)
2. **Branch** - Add a child node to any existing node
3. **Prune** - Remove a node and all its descendants
4. **Mark Gap** - Flag a node as a knowledge gap
5. **Mark Clear** - Remove gap marker from a node
6. **Undo** - Human can undo the last agent move

## WebMCP Integration

CanvasQuest registers five WebMCP tools that voice agents can call:

- `plant(label)` - Plant the root node
- `branch(parentId, label, kind)` - Add a branch
- `prune(nodeId)` - Remove a node and descendants
- `mark_gap(nodeId)` - Mark a knowledge gap
- `mark_clear(nodeId)` - Clear a gap marker

These tools are automatically registered when WebMCP is available via `document.modelContext.registerTool`.

## Testing with ChatGPT (Primary Path)

1. Start the dev server: `npm run dev`
2. Open ChatGPT desktop app (ChatGPT Work or Codex)
3. Navigate to the app URL in ChatGPT's built-in browser
4. The app will detect WebMCP and register tools automatically
5. Ask ChatGPT to play the game by making moves (e.g., "Plant a root node about learning React" or "Branch from node-123 with a concept called 'Components'")
6. ChatGPT will call the registered tools to interact with the game

## Testing with Chrome

1. Enable WebMCP in Chrome:
   - Open `chrome://flags/#enable-webmcp-testing`
   - Enable the flag
   - Restart Chrome

2. Install a WebMCP inspector extension (if available) or use the browser console to verify tools are registered

3. Run the dev server and open the app:
   ```bash
   npm run dev
   ```

4. Check the console for: `[WebMCP] Tools registered successfully`

## Local Development

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or the port shown in terminal).

### Build for Production

```bash
npm run build
```

Built files will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Architecture

### Tech Stack

- **Vite** - Build tool and dev server
- **React 19** - UI framework
- **TypeScript** - Type safety
- **React Flow** - Canvas and node visualization
- **Zustand** - State management

### Key Components

- `store.ts` - Game state management (Zustand store)
- `use-webmcp.ts` - WebMCP tool registration hook
- `game-canvas.tsx` - React Flow canvas rendering
- `game-controls.tsx` - Human player UI controls
- `tree-node.tsx` - Custom node component for React Flow

### State Flow

1. Human makes move via UI → calls store action
2. Agent makes move via WebMCP tool → calls same store action
3. Store updates game state → React components re-render
4. Win/lose conditions checked after each move

### WebMCP Design

- Tools are registered on mount if `document.modelContext.registerTool` exists
- Each tool calls the corresponding Zustand store action with `player: 'agent'`
- Tools return structured JSON with success status, message, and current state
- Agent moves automatically switch turn to human
- Game works in human-only mode when WebMCP is unavailable

## License

MIT License - see [LICENSE](LICENSE) file

## Challenge Submission

Built for the 3-day WebMCP Challenge (deadline: Thu Sep 3, 2026 1:00pm PDT)

- Original game concept (not StudyTree, RentVoy, or Conundrum Quest)
- Collaborative canvas game with turn-based play
- Voice agent interacts ONLY through WebMCP tools
- Human can undo agent moves
- No API keys or backend required
- Static deployable build
