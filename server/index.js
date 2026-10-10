import { randomUUID } from 'node:crypto';
import express from 'express';
import { createServer } from 'node:http';
import cors from 'cors';
import { Server } from 'socket.io';
import createRoomsRouter from './routes/rooms.js';
import { initializeDatabase, pool } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

const activeUsers = new Map();

app.use('/api/rooms', createRoomsRouter({
  onRoomDeleted: (roomId) => {
    io.to(roomId).emit('room_deleted', roomId);
    for (const [socketId, user] of activeUsers) {
      if (user.roomId === roomId) activeUsers.delete(socketId);
    }
    io.in(roomId).socketsLeave(roomId);
  },
}));

const nameIsValid = (name) => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 32;
const colorIsValid = (color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);

const presenceForRoom = (roomId) => [...activeUsers.values()]
  .filter((user) => user.roomId === roomId)
  .map(({ userId, name, color, socketId }) => ({ userId, name, color, socketId }));

const publishPresence = (roomId) => {
  io.to(roomId).emit('presence_update', {
    roomId,
    users: presenceForRoom(roomId),
  });
};

io.on('connection', (socket) => {
  socket.on('join_room', async (request) => {
    const joinAttempt = (socket.data.joinAttempt || 0) + 1;
    socket.data.joinAttempt = joinAttempt;
    socket.data.requestedRoomId = request?.roomId;
    const roomId = typeof request?.roomId === 'string' ? request.roomId : '';
    const user = request?.user;
    if (!roomId || !nameIsValid(user?.name) || !colorIsValid(user?.color) || typeof user?.id !== 'string' || !user.id) {
      socket.emit('action_error', 'Enter a valid name before joining a room.');
      return;
    }

    try {
      const { rows: roomRows } = await pool.query(
        'SELECT id FROM syncboard.rooms WHERE id = $1',
        [roomId],
      );
      if (socket.data.joinAttempt !== joinAttempt) return;
      if (!roomRows.length) {
        socket.emit('room_not_found', roomId);
        return;
      }

      const previousRoomId = socket.data.roomId;
      if (previousRoomId) {
        await socket.leave(previousRoomId);
        activeUsers.delete(socket.id);
        publishPresence(previousRoomId);
      }

      await socket.join(roomId);
      socket.data.roomId = roomId;
      activeUsers.set(socket.id, {
        socketId: socket.id,
        roomId,
        userId: user.id,
        name: user.name.trim(),
        color: user.color,
      });

      const [shapeResult, messageResult] = await Promise.all([
        pool.query(
          `SELECT id, type, points, color, width, text_content AS text,
                  created_at AS "createdAt"
           FROM syncboard.canvas_shapes
           WHERE room_id = $1
           ORDER BY created_at, id`,
          [roomId],
        ),
        pool.query(
          `SELECT id, user_id AS "userId", user_name AS name, user_color AS color,
                  body, created_at AS "createdAt"
           FROM syncboard.chat_messages
           WHERE room_id = $1
           ORDER BY created_at DESC, id DESC
           LIMIT 100`,
          [roomId],
        ),
      ]);

      if (socket.data.joinAttempt !== joinAttempt) return;
      socket.emit('room_state', {
        roomId,
        shapes: shapeResult.rows,
        messages: messageResult.rows.reverse(),
        presence: presenceForRoom(roomId),
      });
      publishPresence(roomId);
    } catch (error) {
      console.error('Failed to join room:', error);
      if (socket.data.joinAttempt === joinAttempt) {
        socket.emit('action_error', 'Could not join this room. Please try again.');
      }
    }
  });

  socket.on('leave_room', (roomId) => {
    if (typeof roomId !== 'string') return;
    if (socket.data.requestedRoomId === roomId) {
      socket.data.joinAttempt = (socket.data.joinAttempt || 0) + 1;
      socket.data.requestedRoomId = null;
    }
    if (socket.data.roomId === roomId) {
      socket.leave(roomId);
      socket.data.roomId = null;
      activeUsers.delete(socket.id);
      publishPresence(roomId);
    }
  });

  socket.on('draw', async (shape) => {
    const roomId = socket.data.roomId;
    const textShape = shape?.type === 'text';
    if (!roomId || typeof shape?.id !== 'string' ||
        !['line', 'rect', 'ellipse', 'arrow', 'freehand', 'highlighter', 'text'].includes(shape.type) ||
        !Array.isArray(shape.points) ||
        !shape.points.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)) ||
        !colorIsValid(shape.color) || !Number.isFinite(shape.width) || shape.width <= 0 ||
        (textShape && (typeof shape.text !== 'string' || !shape.text.trim() || shape.text.length > 500))) {
      socket.emit('action_error', 'Could not save that drawing.');
      return;
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO syncboard.canvas_shapes
           (room_id, id, type, points, color, width, text_content)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
         RETURNING id, type, points, color, width, text_content AS text,
                   created_at AS "createdAt"`,
        [roomId, shape.id, shape.type, JSON.stringify(shape.points), shape.color, shape.width,
          textShape ? shape.text.trim() : null],
      );
      io.to(roomId).emit('draw', { roomId, shape: rows[0] });
    } catch (error) {
      console.error('Failed to save drawing:', error);
      socket.emit('action_error', 'Could not save that drawing.');
    }
  });

  socket.on('chat_message', async (body) => {
    const roomId = socket.data.roomId;
    const user = activeUsers.get(socket.id);
    const message = typeof body === 'string' ? body.trim() : '';
    if (!roomId || !user || !message || message.length > 2000) {
      socket.emit('action_error', 'Messages must be between 1 and 2000 characters.');
      return;
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO syncboard.chat_messages
           (id, room_id, user_id, user_name, user_color, body)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, user_id AS "userId", user_name AS name,
                   user_color AS color, body, created_at AS "createdAt"`,
        [randomUUID(), roomId, user.userId, user.name, user.color, message],
      );
      io.to(roomId).emit('chat_message', { roomId, message: rows[0] });
    } catch (error) {
      console.error('Failed to save chat message:', error);
      socket.emit('action_error', 'Could not send your message.');
    }
  });

  socket.on('cursor_move', (cursor) => {
    const roomId = socket.data.roomId;
    const user = activeUsers.get(socket.id);
    if (!roomId || !user || !Number.isFinite(cursor?.x) || !Number.isFinite(cursor?.y)) return;
    socket.to(roomId).emit('cursor_move', {
      roomId,
      cursor: {
        userId: user.userId,
        x: cursor.x,
        y: cursor.y,
        color: user.color,
      },
    });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    socket.data.joinAttempt = (socket.data.joinAttempt || 0) + 1;
    socket.data.requestedRoomId = null;
    if (roomId) {
      activeUsers.delete(socket.id);
      publishPresence(roomId);
    }
  });
});

const port = Number(process.env.PORT || 3000);

try {
  await initializeDatabase();
  httpServer.listen(port, () => console.log(`Server running on port ${port}`));
} catch (error) {
  console.error('Failed to initialize SyncBoard database:', error);
  process.exitCode = 1;
  await pool.end();
}
