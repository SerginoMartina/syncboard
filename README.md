# SyncBoard 🎨
**A real-time collaborative whiteboard for sharing ideas with your team.**

SyncBoard is a collaborative workspace where multiple users can draw, create shapes, and chat in real time. Room content is stored in PostgreSQL and restored when collaborators return.

---

## 🚀 Key "Senior" Features

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
the same database. The schema contains rooms, canvas shapes, and chat messages;
deleting a room also deletes its shapes and messages. The server applies the
DDL as a database initialization step when using Docker Compose. When deploying
against an existing database, apply the migration with a role that can create
schemas and tables:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/schema.sql
```

For production, use a dedicated SyncBoard runtime role and grant it access only
to this schema and its tables, rather than every application's objects. Run
the schema migration separately with a deployment role; the runtime role only
needs these data permissions:

```sql
GRANT USAGE ON SCHEMA syncboard TO syncboard_app;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON ALL TABLES IN SCHEMA syncboard TO syncboard_app;
```

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
