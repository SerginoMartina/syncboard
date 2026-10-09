# SyncBoard 🎨
**A production-grade, real-time collaborative whiteboard built for high concurrency.**

SyncBoard is a high-performance collaborative workspace where multiple users can draw, create shapes, and interact in real-time. It was built to solve the "hard" problems of frontend engineering: real-time synchronization, high-frequency state updates, and horizontal scalability.

---

## 🚀 Key "Senior" Features

### 1. High-Performance Rendering Engine
Instead of using standard DOM elements (like SVG) which degrade with high object counts, SyncBoard uses an **HTML5 Canvas** with a dedicated `requestAnimationFrame` rendering loop. This ensures 60fps performance even with hundreds of objects on the board.

### 2. Scalable Real-time Architecture
- **WebSockets (Socket.io):** Handles the low-latency bidirectional communication.
- **Redis Pub/Sub:** Implemented to ensure horizontal scalability. By using a Redis message bus, the application can be deployed across multiple server instances while maintaining consistent state across all users.

### 3. Intelligent State Management
- **Zustand:** Used for high-frequency "Client State" (drawing coordinates, active tools) because it offers minimal overhead and excellent performance for rapid updates.
- **TanStack Query:** Used for "Server State" (room metadata, user lists). It handles caching, loading states, and—most importantly—**Optimistic Updates**, making the UI feel instantaneous even with network latency.

### 4. Concurrency & Presence
- **Remote Cursors:** Real-time presence of other users' mouse positions to improve collaboration UX.
- **Room Isolation:** Users are segmented into private rooms using Socket.io rooms, ensuring data privacy and reducing unnecessary broadcast traffic.

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
- Redis (Pub/Sub & Scaling)
- Docker (Containerization)

---

## 🏗 Architecture Diagram

`User A` & `User B` ↔ `Socket.io` ↔ `Node.js Server` ↔ `Redis Pub/Sub` ↔ `Node.js Server` ↔ `User C`

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

2. **Start the Infrastructure (Redis & Server):**
   ```bash
   docker-compose up -d
   ```

3. **Install Frontend Dependencies:**
   ```bash
   cd client
   npm install
   ```

4. **Run the Development Server:**
   ```bash
   # From the project root
   npm run dev # (Assuming script is set in root or client)
   ```

### Production frontend configuration
Set `VITE_API_URL` in the frontend service's build environment to the backend's
base URL (for example, `https://syncboard-i07g.onrender.com`) and redeploy the
frontend. The value is embedded in the frontend at build time and is used for
both REST API requests and Socket.IO connections. Local development falls back
to `http://localhost:3000`.

---

## 🧪 Performance Optimizations
- **Throttled Socket Emissions:** Mouse movements are batched and sent at 60fps to prevent network saturation.
- **Optimistic UI:** Room creation and joins happen immediately on the frontend, rolling back only if the server returns an error.
- **Memory Management:** Proper cleanup of socket listeners and subscription handles to prevent memory leaks in the browser.
