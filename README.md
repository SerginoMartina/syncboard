# SyncBoard 🎨
**A real-time collaborative whiteboard for sharing ideas with your team.**

SyncBoard is a collaborative workspace where multiple users can draw freehand, use lines, arrows, rectangles, ellipses, and a highlighter, add text, create chat polls, and chat in real time. Room content is stored in PostgreSQL and restored when collaborators return. The room header shows which collaborators are online.

---

## 🚀 Features

### 1. High-Performance Rendering Engine
Instead of using standard DOM elements (like SVG) which degrade with high object counts, SyncBoard uses an **HTML5 Canvas** with a dedicated `requestAnimationFrame` rendering loop. This ensures 60fps performance even with hundreds of objects on the board.

### 2. Real-time Collaboration
- **WebSockets (Socket.io):** Handles the low-latency bidirectional communication.
- **PostgreSQL:** Persists rooms, board shapes, and chat history. Live cursor and room presence updates are sent over Socket.IO.

### 3. Intelligent State Management
- **Zustand:** Used for high-frequency "Client State" (drawing coordinates, active tools) because it offers minimal overhead and excellent performance for rapid updates.
- **TanStack Query:** Used for room data, loading states, and refreshing the workspace list after a room is created.

### 4. Concurrency & Presence
- **Remote Cursors:** Real-time presence of other users' mouse positions to improve collaboration UX.
- **Room Isolation:** Drawings and chat are sent only to collaborators connected to the selected Socket.IO room.
- **Profiles:** Display names are reserved globally and case-insensitively in PostgreSQL. If a name is taken, SyncBoard offers an available alternative. Optional PNG, JPEG, and WebP profile images are stored in the SyncBoard schema.
- **Chat controls:** Authors can edit or remove their own persisted messages; changes are shared live with everyone in the room.
- **Chat timeline:** Messages, polls, and private assistant replies appear in time order with dates. Poll creators can remove their polls.
- **Sticky notes:** Add persistent post-it notes to the shared drawing board.
- **Board controls:** Room owners can delete rooms; expand a board for a scrollable workspace, pan with Space+drag, and press Escape to minimize. Room chat floats over the canvas and can be opened or closed without leaving the board.
- **Private local assistant:** Use the AI button in chat to ask a question answered by a self-hosted Ollama model. Prompts go only from the browser to this app's server and the configured local model; they are not broadcast, persisted, or sent to a hosted AI provider. When asked to draw, the assistant proposes a board drawing in chat; it is added to the shared board only after a collaborator approves it.
- **Getting started:** New users choose a display name and get a short, multi-page introduction. The name can be changed later from the profile editor.

---

## 🛠 Tech Stack

**Frontend:**
- React (TypeScript)
- Zustand (State Management)
- TanStack Query (Data Fetching)
- Socket.io-client (Real-time)
- Tailwind CSS (Styling)
- HTML5 Canvas API

**Backend:**
- Node.js & Express
- Socket.io
- PostgreSQL (rooms, canvas shapes, and chat history)
- Docker (Containerization)

---

## PostgreSQL schema

SyncBoard's PostgreSQL objects live in the dedicated `syncboard` schema, so
they do not share the default `public` namespace with other applications using
the same database. The schema contains profiles, rooms, canvas shapes, chat messages, and polls with options
and votes; deleting a room also deletes its associated data. The server applies the
idempotent DDL on every startup, including when deployed against an existing
database. Set `DATABASE_URL` to the PostgreSQL connection URL in the API
service's environment. That role needs permission to create the schema and must
own the SyncBoard tables so it can apply updates. This can be the database
owner; all application tables remain isolated inside `syncboard`. Once
deployed, the rooms endpoint is available at `/api/rooms`.
Room names are unique case-insensitively, ignoring leading and trailing spaces.

You can also apply the same migration manually:
```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/schema.sql
```

For production, use a dedicated SyncBoard database owner/role with access
limited to this schema rather than other applications' objects. If your
provider separates migration and runtime roles, apply the SQL file with the
database owner before starting the API and ensure its configured startup role
can run the idempotent schema updates.

## 🏗 Architecture Diagram

`Collaborators` ↔ `Socket.io` ↔ `Node.js Server` ↔ `PostgreSQL`

---

## 🚀 Getting Started

### Prerequisites
- Docker installed on your machine.
- Node.js (v18+) installed.

### Setup
1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/syncboard.git
   cd syncboard
   ```

2. **Start the Database and Server:**
   ```bash
   docker-compose up -d
   ```

   The API and PostgreSQL are available at `http://localhost:3000` and
   `localhost:5432`. The schema is installed when the PostgreSQL volume is
   initialized for the first time.

### Optional local AI assistant
The assistant uses the small `qwen2.5:0.5b` model through Ollama. Enable the
local AI profile to run Ollama and download the model:
```bash
docker compose --profile local-ai up -d --build
```
The model's weights are about 398 MB; the first pull also needs an internet
connection and additional disk space for Ollama. Check progress with
`docker compose logs -f ollama-model`; confirm it is installed with
`docker compose exec ollama ollama list`. The API returns a specific error when
the service cannot be reached, the model is missing, or an endpoint rejects its
credentials.

Prompts and responses are processed by Ollama on the local Docker network. Local
Ollama does not require an API key. If your private, separately hosted
Ollama-compatible endpoint requires one, set `OLLAMA_BASE_URL`,
`OLLAMA_MODEL`, and `OLLAMA_API_KEY` in the **API server's environment**. The
key is never stored in a user profile or sent from the browser. `API_AI_XXXXXXXX`
is only a placeholder and will not authenticate with a protected service. Do
not point the assistant at a hosted inference service if prompts must remain
within your application.

3. **Install Frontend Dependencies:**
   ```bash
   cd client
   npm install
   ```

4. **Run the Frontend Development Server:**
   ```bash
   npm run dev
   ```

### Production frontend configuration
Set `VITE_API_URL` in the frontend service's build environment to the backend's
base URL (for example, `https://syncboard-i07g.onrender.com`) and redeploy the
frontend. The value is embedded in the frontend at build time and is used for
both REST API requests and Socket.IO connections. Local development falls back
to `http://localhost:3000`.

---

## 🧪 Performance Optimizations
- **Persistent collaboration:** Room boards and chat history are stored in PostgreSQL and restored when collaborators join.
- **Live presence:** Active collaborators and cursor movement are shared over Socket.IO.
- **Room isolation:** Board drawings and chat messages are scoped to their room.
