# CanvasQuest

A collaborative learning game where humans and voice agents work together to build a knowledge tree. Built for the WebMCP Challenge 2026.

**Developer:** [wispyco](https://github.com/wispyco)

**Repo:** [Agency7ai/canvasquest](https://github.com/Agency7ai/canvasquest)

## What is CanvasQuest?

CanvasQuest is a turn-based game on a shared canvas where a human player and an
AI voice agent collaborate to build a learning tree. The human clicks and types;
the agent may only change the board by calling registered tools. Voice is the
agent's controller.

Two agent surfaces are supported, and both go through the same tools:

- **WebMCP** — an in-browser agent such as ChatGPT's built-in browser calls the
  tools registered on `document.modelContext`.
- **ElevenLabs voice** — an on-canvas voice panel connects to a public ElevenLabs
  agent that invokes the same moves as client tools.

## Game Rules

- **Goal**: Grow one learning tree together and finish with the highest score out of 100
- **Moves**: each player has 6 moves of their own; passing and annotating are free
- **Turns**: human and agent alternate; a player with no moves left is skipped
- **End**: the game ends when both budgets are spent, or when both players pass in a row
- **Gaps**: a node can be flagged as a gap; branching a resource or skill directly under it closes the gap. A concept with no resource or skill anywhere beneath it is an implicit gap
- **Score**: coverage (6 per concept with a resource or skill beneath it, max 30), depth (5 per level, max 15), kind balance (5 per kind present, max 15), shared authorship (20 if both players created 2+ nodes, 10 if both created 1+), content (1 per node with a note or url, max 10), minus 5 per open gap

### Node Types

- 🌱 **Root**: The main learning question (planted first)
- 💡 **Concept**: Ideas, topics, or theories
- 📚 **Resource**: Books, courses, or learning materials
- ⚡ **Skill**: Abilities or competencies to develop

A gap (❓) is a flag on top of any of these kinds, not a kind of its own.

### Available Actions

1. **Plant** - Create the root node (first move only)
2. **Branch** - Add a child node to any existing node; a resource or skill under a gap closes it
3. **Prune** - Remove a node and all its descendants
4. **Mark Gap** - Flag a node as a knowledge gap, with an optional reason
5. **Annotate** - Add a note or url to a node (free)
6. **Pass** - Yield the turn (free)
7. **Undo** - Human can undo the last agent action

## Agent tools

CanvasQuest exposes seven tools. Four cost a move; `get_board`, `annotate` and
`pass` are free.

| Tool | Arguments | Cost | Effect |
| --- | --- | --- | --- |
| `get_board` | – | free | Returns the question, every node, both budgets, whose turn, score and open gaps |
| `plant` | `label`, `note?` | 1 move | Creates the root node (first move only) |
| `branch` | `parentId`, `label`, `kind`, `note?`, `url?` | 1 move | Adds a child node; closes the parent's gap if it is a resource or skill |
| `prune` | `nodeId` | 1 move | Removes a node and its descendants |
| `mark_gap` | `nodeId`, `reason?` | 1 move | Flags a node as an open gap |
| `annotate` | `nodeId`, `note?`, `url?` | free | Sets or clears a node's note and url |
| `pass` | – | free | Ends the turn without moving |

`parentId` and `nodeId` accept either a node id (`n1`, `n2`) or a node's label,
so a voice agent can say "branch from First Principles" instead of spelling out
an id.

Both agent surfaces are driven by the same table of definitions in `src/moves.ts`
and execute through the same `applyMove` dispatcher:

- **WebMCP** — registered on `document.modelContext` when the browser supports it.
- **ElevenLabs voice** — the same moves registered as client tools on the canvas panel.

Neither surface can touch the DOM directly or skip a rule, because both call the
identical store actions the human's buttons call.

## Voice agent (ElevenLabs)

A voice panel sits on the bottom-left of the canvas. It shows connection status,
whether the agent is speaking or listening, and a log of the moves the agent has
made.

### Configure an agent

1. Create an agent in the [ElevenLabs dashboard](https://elevenlabs.io/app/agents).
2. Leave it **public** (no authentication). A public agent connects from the
   browser with its id alone, so this app needs no API key and no backend.
3. Add the seven tools above as **client tools** on the agent. Ready-to-paste
   definitions are in [`elevenlabs-tools.json`](elevenlabs-tools.json): in the
   dashboard choose **Tools → Add tool → Edit as JSON** and paste one object
   from the `tools` array for each. Names and parameter ids must match exactly,
   since the browser looks tools up by name and reads arguments by id.
4. Give the agent a system prompt along these lines:

   > You are playing CanvasQuest, a turn-based game where you and a human grow
   > one learning tree that answers the question on the board. Call `get_board`
   > before each move to see the real node ids, both move budgets, whose turn it
   > is and the open gaps. You and the human alternate turns; on your turn make
   > exactly one costly move (`plant`, `branch`, `prune` or `mark_gap`), then stop
   > and wait. Each player has 6 moves; `pass` and `annotate` are free. The score
   > (0 to 100) rewards concepts that have a resource or skill beneath them, depth
   > up to three levels, using all three kinds, both players contributing, and
   > notes or urls, and subtracts 5 per open gap (a node marked as a gap, or a
   > concept with no resource or skill under it). Branch a resource or skill
   > directly under a gap to close it. Keep labels to two to five words and say
   > briefly what you did after each move.

5. Copy the agent id into `.env`:

   ```bash
   cp .env.example .env
   # VITE_ELEVENLABS_AGENT_ID=agent_xxxxxxxxxxxxxxxxxxxxxxxxx
   ```

6. Restart `npm run dev`, then click **Start talking** and allow microphone access.

Without an agent id the panel stays visible and explains the setup; the game
remains fully playable by clicking.

## WebMCP integration

Tools are registered through `document.modelContext.registerTool` behind a
feature detect, so nothing breaks in browsers without WebMCP:

```ts
if (typeof document.modelContext?.registerTool === 'function') {
  // register the seven tools
}
```

Registration is guarded at module scope and treats an `AbortError` from React
Strict Mode's double mount as expected teardown rather than a failure. Each
`execute` returns a structured JSON result containing the outcome and the full
board, so the agent can see what changed without reading the DOM.

## Testing with ChatGPT (Primary Path)

1. Start the dev server: `npm run dev`
2. Open ChatGPT desktop app (ChatGPT Work or Codex)
3. Navigate to the app URL in ChatGPT's built-in browser
4. The app will detect WebMCP and register tools automatically
5. Ask ChatGPT to play, for example "Read the board, then plant a root for the
   question" or "Branch from First Principles with a concept called Model Context"
6. ChatGPT calls the registered tools; each move appears on the canvas immediately

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

4. Check the console for: `[WebMCP] Registered 7 tools`

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

- `store.ts` — game state and rules (Zustand store)
- `moves.ts` — tool definitions and the shared `applyMove` dispatcher
- `use-webmcp.ts` — WebMCP registration hook
- `voice-agent.tsx` — canvas voice panel and ElevenLabs client tools
- `voice-agent-island.tsx` — lazy-loaded provider wrapper
- `game-canvas.tsx` — React Flow canvas
- `game-controls.tsx` — human player controls
- `tree-node.tsx` — custom React Flow node

### Tools vs UI

There is exactly one implementation of each move, in the Zustand store. Three
entry points reach it:

```
human buttons  ──┐
WebMCP tools   ──┼──→ applyMove() ──→ store action ──→ React re-render
voice tools    ──┘
```

`game-controls.tsx` calls the store directly as the human player; `moves.ts`
calls the same actions as the agent player. Adding a move means adding it once
in `moves.ts`, and both agent surfaces pick it up.

### Bundle

The ElevenLabs WebRTC SDK is code-split into its own chunk via `React.lazy`, so
the board is interactive before the voice stack finishes downloading.

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 [wispyco](https://github.com/wispyco) / Agency7ai.

## Challenge Submission

Built for the 3-day WebMCP Challenge (deadline: Thu Sep 3, 2026 1:00pm PDT)

- Original game concept (not StudyTree, RentVoy, or Conundrum Quest)
- Collaborative canvas game with turn-based play
- Voice agent interacts ONLY through WebMCP tools
- Human can undo agent moves
- No API keys or backend required
- Static deployable build
