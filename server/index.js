import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import roomRoutes from './routes/rooms.js';
import redis from 'redis';

const app = express();
app.use(cors());
app.use(express.json());

// Redis Setup
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('Redis Error:', err));
redisClient.connect().then(() => {
  console.log('Connected to Redis');
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Routes
app.use('/api/rooms', roomRoutes);

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
    
    // Subscribe to this room's channel in Redis
    const channel = `draw:${roomId}`;
    const subscriber = redisClient.duplicate();
    subscriber.connect().then(() => {
      subscriber.subscribe(channel);
      console.log(`Subscribed to Redis channel: ${channel}`);
    });
  });

  socket.on('leave_room', (roomId) => {
    if (roomId) {
      socket.leave(roomId);
      console.log(`User ${socket.id} left room: ${roomId}`);
    }
  });

  socket.on('draw', (data) => {
    const { roomId, shape } = data;
    if (roomId) {
      // Publish the draw event to Redis
      redisClient.publish(`draw:${roomId}`, JSON.stringify(shape));
    }
  });

  // Listen for messages from Redis and broadcast to local sockets
  // We need to handle the fact that Redis is sending us data that should go to local sockets
  // This is a simplified version of the horizontal scaling logic
  // For a production app, you'd want to manage these subscribers more gracefully
  // but this demonstrates the core Pub/Sub pattern.
  
  // To handle the actual message from Redis, we'd typically have a global listener
  // that knows which rooms are active. For this project, we'll use a listener
  // that checks if the socket is in the room.
  
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Global Redis Listener for drawing
// We need a way to map roomId to the io instance. Since we're in one process, 
// we can just broadcast to the room.
redisClient.on('message', (channel, message) => {
  if (channel.startsWith('draw:')) {
    const roomId = channel.split(':')[1];
    const shape = JSON.parse(message);
    // Broadcast to everyone in the room except the sender
    // Note: We don't have the sender ID easily here without more complex logic,
    // but io.to(roomId).emit handles broadcasting to everyone in that room.
    io.to(roomId).emit('draw', shape);
  }
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
