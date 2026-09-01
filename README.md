# CanvasQuest

A collaborative learning game where humans and voice agents work together to build a knowledge tree. Built for the WebMCP Challenge 2026.

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

## Two modes

Switch in the header.

**Workspace** (default) is the open-ended tool. No move budget, no turn order,
no win state: you and the agent both keep editing for as long as the session is
useful. Open questions are collected in a panel you can work through, the
session survives a reload, and you can export the result as Markdown or JSON.
Use it to think a problem through out loud and leave with a structured artifact
whose unresolved parts are explicit.

**Game** is the timed challenge described below: ten moves, strict alternation,
and a win condition. It is the original WebMCP Challenge entry, kept intact.

Both modes use the same tools and the same canvas. The only difference is
whether moves are rationed.

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

## Agent tools

CanvasQuest exposes six tools. Five are the legal moves; `get_board` is read-only
and does not consume a move.

| Tool | Arguments | Effect |
| --- | --- | --- |
| `get_board` | – | Returns the question, every node, moves left, whose turn |
| `plant` | `label` | Creates the root node (first move only) |
| `branch` | `parentId`, `label`, `kind` | Adds a child node |
| `prune` | `nodeId` | Removes a node and its descendants |
| `mark_gap` | `nodeId` | Flags a node as an open gap |
| `mark_clear` | `nodeId` | Clears a gap flag |

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
3. Add the six tools above as **client tools** on the agent. Ready-to-paste
   definitions are in [`elevenlabs-tools.json`](elevenlabs-tools.json): in the
   dashboard choose **Tools → Add tool → Edit as JSON** and paste one object
   from the `tools` array for each. Names and parameter ids must match exactly,
   since the browser looks tools up by name and reads arguments by id.
4. Give the agent a system prompt along these lines:

   > You are playing CanvasQuest, a turn-based game on a shared knowledge tree.
   > Call `get_board` before each move to see current node ids. You and the human
   > alternate; make exactly one move per turn. Aim to finish with at least five
   > nodes and no gap nodes remaining.

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
  // register the six tools
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

4. Check the console for: `[WebMCP] Registered 6 tools`

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
- `layout.ts` — tidy-tree layout for the 2D canvas
- `forest-view.tsx` — the 3D view and its overlay
- `forest/forest-layout.ts` — grows limb geometry from a board
- `forest/forest-scene.ts` — Three.js scene, growth shader, camera

### Tools vs UI

There is exactly one implementation of each move, in the Zustand store. Three
entry points reach it:

```
human buttons  ─┐
WebMCP tools   ─┼─→ applyMove() ─→ store action ─→ React re-render
voice tools    ─┘
```

`game-controls.tsx` calls the store directly as the human player; `moves.ts`
calls the same actions as the agent player. Adding a move means adding it once
in `moves.ts`, and both agent surfaces pick it up.

## Two views

**Canvas** is the working view: React Flow, draggable nodes, the picker, precise
editing.

**Forest** is the same graph grown in Three.js. One board is one tree: the root
node is the trunk, and its children leave that trunk at staggered heights rather
than all bursting from the top, which is most of what makes it read as a single
organism instead of a starburst. Each generation leaves its parent on a
golden-angle bearing, losing length and thickness, and branches lower on the
trunk run longer, as on a real tree.

Growth is animated in the vertex shader: every vertex telescopes out from its
limb's origin, so adding a node **extends a new branch** over about a second
instead of popping a shape into existence. Completed growth is remembered, so
only the new wood grows when the board changes. Wind sways the higher limbs more
than the trunk, and leaves open only once their limb has finished extending.

An unresolved gap is bare grey wood carrying a bud that swells and eases back
without ever opening. Resolving the gap lets the branch leaf out, so an
unanswered question is visibly a thing that has not bloomed yet.

### The forest grows over time

**Plant this session in the forest** keeps a copy of the current board standing
in the clearing as its own tree, and leaves the session you are working on
untouched. The ground fills up as you work through more questions. Walking into
a planted tree offers **Tend this tree**, which reopens that session on the
canvas. The grove persists to `localStorage` with everything else.

Hover a limb for its label, click to select it and walk the camera in, and
double-click to step back out. Selection is shared with the Canvas view, so a
node picked in the Forest is the one the sidebar will prune.

Three.js is lazy-loaded, so it costs nothing until you open the view.

### Canvas interaction

Nodes are laid out by a tidy-tree pass in `layout.ts`: each node is centred over
the width of its own subtree, so sibling branches get disjoint horizontal bands
and cannot collide however lopsided the tree grows. Drag a node and that
position is remembered and takes precedence over the computed layout; **Tidy
layout** discards the overrides. Clicking a node selects it for Branch, Prune,
Mark Gap and Clear Gap, and the picker in the sidebar stays in sync with it.

Run `npm run check` to verify the 2D layout produces no overlaps, that export
round-trips, and that the forest geometry stays connected and free of NaN
against a real 36-node board.

### Persistence and export

Workspace sessions are stored in `localStorage` under `canvasquest-session`, so
a reload resumes where you left off. Node ids are minted from a counter, so
rehydration advances that counter past the highest restored id rather than
reusing one.

`export.ts` renders the tree as nested Markdown bullets with gaps as unchecked
checkboxes, plus an "Open questions" section, so a session can be pasted
straight into notes as a to-do list. JSON export carries the raw node graph.

**Import JSON** rebuilds the canvas from previously exported JSON, which makes a
session portable between browsers and shareable as a paste. The payload is
validated before anything is applied: unknown node kinds, missing ids and
parents that reference absent nodes are all rejected with a specific message
rather than half-loading a broken board.

### Bundle

The ElevenLabs WebRTC SDK is code-split into its own chunk via `React.lazy`, so
the board is interactive before the voice stack finishes downloading.

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
