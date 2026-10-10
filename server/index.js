import { randomUUID } from 'node:crypto';
import express from 'express';
import { createServer } from 'node:http';
import cors from 'cors';
import { Server } from 'socket.io';
import assistantRouter from './routes/assistant.js';
import createRoomsRouter from './routes/rooms.js';
import createProfilesRouter from './routes/profiles.js';
import { initializeDatabase, pool } from './db.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api/rooms', assistantRouter);
app.use('/api/profiles', createProfilesRouter());

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

const colorIsValid = (color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);

const presenceForRoom = (roomId) => [...activeUsers.values()]
  .filter((user) => user.roomId === roomId)
  .map(({ userId, name, color, avatarUrl, socketId }) => ({ userId, name, color, avatarUrl, socketId }));

const publishPresence = (roomId) => {
  io.to(roomId).emit('presence_update', {
    roomId,
    users: presenceForRoom(roomId),
  });
};

const pollsForRoom = async (roomId, userId) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.question, p.user_id AS "creatorId",
            p.user_name AS "creatorName", p.created_at AS "createdAt",
            jsonb_agg(
              jsonb_build_object('id', o.id, 'text', o.label, 'votes', COALESCE(v.vote_count, 0))
              ORDER BY o.position
            ) AS options,
            MAX(own_vote.option_id) AS "selectedOptionId"
     FROM syncboard.chat_polls p
     JOIN syncboard.chat_poll_options o ON o.poll_id = p.id
     LEFT JOIN (
       SELECT option_id, count(*)::integer AS vote_count
       FROM syncboard.chat_poll_votes
       GROUP BY option_id
     ) v ON v.option_id = o.id
     LEFT JOIN syncboard.chat_poll_votes own_vote
       ON own_vote.poll_id = p.id AND own_vote.user_id = $2
     WHERE p.room_id = $1
     GROUP BY p.id
     ORDER BY p.created_at, p.id`,
    [roomId, userId],
  );
  return rows;
};

io.on('connection', (socket) => {
  socket.on('join_room', async (request) => {
    const joinAttempt = (socket.data.joinAttempt || 0) + 1;
    socket.data.joinAttempt = joinAttempt;
    socket.data.requestedRoomId = request?.roomId;
    const roomId = typeof request?.roomId === 'string' ? request.roomId : '';
    const user = request?.user;
    if (!roomId || typeof user?.id !== 'string' || !user.id) {
      socket.emit('action_error', 'Set up your profile before joining a room.');
      return;
    }

    try {
      const [{ rows: roomRows }, { rows: profileRows }] = await Promise.all([
        pool.query('SELECT id FROM syncboard.rooms WHERE id = $1', [roomId]),
        pool.query(
          `SELECT id, display_name AS name, color, avatar_mime AS "avatarMime",
                  updated_at AS "updatedAt"
           FROM syncboard.profiles WHERE id = $1`,
          [user.id],
        ),
      ]);
      if (socket.data.joinAttempt !== joinAttempt) return;
      if (!roomRows.length) {
        socket.emit('room_not_found', roomId);
        return;
      }
      if (!profileRows.length) {
        socket.emit('action_error', 'Save a unique display name before joining a room.');
        return;
      }
      const profile = profileRows[0];
      const avatarUrl = profile.avatarMime
        ? `/api/profiles/${encodeURIComponent(profile.id)}/avatar?v=${encodeURIComponent(new Date(profile.updatedAt).getTime())}`
        : null;

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
        userId: profile.id,
        name: profile.name,
        color: profile.color,
        avatarUrl,
      });

      const [shapeResult, messageResult, polls] = await Promise.all([
        pool.query(
          `SELECT id, type, points, color, width, text_content AS text,
                  created_at AS "createdAt"
           FROM syncboard.canvas_shapes
           WHERE room_id = $1
           ORDER BY created_at, id`,
          [roomId],
        ),
        pool.query(
          `SELECT m.id, m.user_id AS "userId", m.user_name AS name, m.user_color AS color,
                  m.body, m.created_at AS "createdAt", m.edited_at AS "editedAt",
                  CASE WHEN p.avatar_mime IS NOT NULL
                       THEN '/api/profiles/' || m.user_id || '/avatar?v=' ||
                            (extract(epoch from p.updated_at) * 1000)::bigint
                       ELSE NULL END AS "avatarUrl"
           FROM syncboard.chat_messages m
           LEFT JOIN syncboard.profiles p ON p.id = m.user_id
           WHERE m.room_id = $1
           ORDER BY m.created_at DESC, m.id DESC
           LIMIT 100`,
          [roomId],
        ),
        pollsForRoom(roomId, profile.id),
      ]);

      if (socket.data.joinAttempt !== joinAttempt) return;
      socket.emit('room_state', {
        roomId,
        shapes: shapeResult.rows,
        messages: messageResult.rows.reverse(),
        polls,
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
        `WITH inserted AS (
           INSERT INTO syncboard.chat_messages
             (id, room_id, user_id, user_name, user_color, body)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, user_id, user_name, user_color, body, created_at, edited_at
         )
         SELECT i.id, i.user_id AS "userId", i.user_name AS name, i.user_color AS color,
                i.body, i.created_at AS "createdAt", i.edited_at AS "editedAt",
                CASE WHEN p.avatar_mime IS NOT NULL
                     THEN '/api/profiles/' || i.user_id || '/avatar?v=' ||
                          (extract(epoch from p.updated_at) * 1000)::bigint
                     ELSE NULL END AS "avatarUrl"
         FROM inserted i
         LEFT JOIN syncboard.profiles p ON p.id = i.user_id`,
        [randomUUID(), roomId, user.userId, user.name, user.color, message],
      );
      io.to(roomId).emit('chat_message', { roomId, message: rows[0] });
    } catch (error) {
      console.error('Failed to save chat message:', error);
      socket.emit('action_error', 'Could not send your message.');
    }
  });

  socket.on('edit_chat_message', async (request, acknowledge = () => {}) => {
    const roomId = socket.data.roomId;
    const user = activeUsers.get(socket.id);
    const messageId = typeof request?.messageId === 'string' ? request.messageId : '';
    const body = typeof request?.body === 'string' ? request.body.trim() : '';
    if (!roomId || !user || !messageId || !body || body.length > 2000) {
      acknowledge({ ok: false, error: 'Messages must be between 1 and 2000 characters.' });
      return;
    }

    try {
      const { rows } = await pool.query(
        `UPDATE syncboard.chat_messages m
         SET body = $4, edited_at = now()
         FROM syncboard.profiles p
         WHERE m.id = $1 AND m.room_id = $2 AND m.user_id = $3 AND p.id = m.user_id
         RETURNING m.id, m.user_id AS "userId", m.user_name AS name, m.user_color AS color,
                   m.body, m.created_at AS "createdAt", m.edited_at AS "editedAt",
                   CASE WHEN p.avatar_mime IS NOT NULL
                        THEN '/api/profiles/' || m.user_id || '/avatar?v=' ||
                             (extract(epoch from p.updated_at) * 1000)::bigint
                        ELSE NULL END AS "avatarUrl"`,
        [messageId, roomId, user.userId, body],
      );
      if (!rows.length) {
        acknowledge({ ok: false, error: 'Message not found or you cannot edit it.' });
        return;
      }
      io.to(roomId).emit('chat_message_updated', { roomId, message: rows[0] });
      acknowledge({ ok: true });
    } catch (error) {
      console.error('Failed to edit chat message:', error);
      acknowledge({ ok: false, error: 'Could not edit your message. Please try again.' });
    }
  });

  socket.on('delete_chat_message', async (request, acknowledge = () => {}) => {
    const roomId = socket.data.roomId;
    const user = activeUsers.get(socket.id);
    const messageId = typeof request?.messageId === 'string' ? request.messageId : '';
    if (!roomId || !user || !messageId) {
      acknowledge({ ok: false, error: 'Could not remove that message.' });
      return;
    }

    try {
      const { rows } = await pool.query(
        `DELETE FROM syncboard.chat_messages
         WHERE id = $1 AND room_id = $2 AND user_id = $3
         RETURNING id`,
        [messageId, roomId, user.userId],
      );
      if (!rows.length) {
        acknowledge({ ok: false, error: 'Message not found or you cannot remove it.' });
        return;
      }
      io.to(roomId).emit('chat_message_deleted', { roomId, messageId });
      acknowledge({ ok: true });
    } catch (error) {
      console.error('Failed to delete chat message:', error);
      acknowledge({ ok: false, error: 'Could not remove your message. Please try again.' });
    }
  });

  socket.on('create_poll', async (request) => {
    const roomId = socket.data.roomId;
    const user = activeUsers.get(socket.id);
    const question = typeof request?.question === 'string' ? request.question.trim() : '';
    const options = Array.isArray(request?.options)
      ? request.options.map((option) => typeof option === 'string' ? option.trim() : '')
      : [];
    if (!roomId || !user || !question || question.length > 200 ||
        options.length < 2 || options.length > 6 ||
        options.some((option) => !option || option.length > 100) ||
        new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
      socket.emit('action_error', 'A poll needs a question and 2–6 unique options.');
      return;
    }

    let client;
    let transactionOpen = false;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      transactionOpen = true;
      const pollId = randomUUID();
      await client.query(
        `INSERT INTO syncboard.chat_polls (id, room_id, user_id, user_name, question)
         VALUES ($1, $2, $3, $4, $5)`,
        [pollId, roomId, user.userId, user.name, question],
      );
      for (const [position, label] of options.entries()) {
        await client.query(
          `INSERT INTO syncboard.chat_poll_options (id, poll_id, label, position)
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), pollId, label, position],
        );
      }
      await client.query('COMMIT');
      transactionOpen = false;
      const [poll] = await pollsForRoom(roomId, user.userId)
        .then((roomPolls) => roomPolls.filter((item) => item.id === pollId));
      io.to(roomId).emit('chat_poll_created', { roomId, poll });
    } catch (error) {
      if (client && transactionOpen) await client.query('ROLLBACK');
      console.error('Failed to create chat poll:', error);
      socket.emit('action_error', 'Could not create the poll. Please try again.');
    } finally {
      client?.release();
    }
  });

  socket.on('vote_poll', async (request) => {
    const roomId = socket.data.roomId;
    const user = activeUsers.get(socket.id);
    const pollId = typeof request?.pollId === 'string' ? request.pollId : '';
    const optionId = typeof request?.optionId === 'string' ? request.optionId : '';
    if (!roomId || !user || !pollId || !optionId) {
      socket.emit('action_error', 'Could not submit that poll vote.');
      return;
    }

    let client;
    let transactionOpen = false;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      transactionOpen = true;
      const option = await client.query(
        `SELECT 1
         FROM syncboard.chat_poll_options o
         JOIN syncboard.chat_polls p ON p.id = o.poll_id
         WHERE p.id = $1 AND p.room_id = $2 AND o.id = $3`,
        [pollId, roomId, optionId],
      );
      if (!option.rowCount) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        client.release();
        client = null;
        socket.emit('action_error', 'That poll option is no longer available.');
        return;
      }
      await client.query(
        `INSERT INTO syncboard.chat_poll_votes (poll_id, option_id, user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (poll_id, user_id)
         DO UPDATE SET option_id = EXCLUDED.option_id, created_at = now()`,
        [pollId, optionId, user.userId],
      );
      await client.query('COMMIT');
      transactionOpen = false;
      const [poll] = await pollsForRoom(roomId, user.userId)
        .then((roomPolls) => roomPolls.filter((item) => item.id === pollId));
      io.to(roomId).emit('chat_poll_updated', {
        roomId,
        poll,
        voterId: user.userId,
        selectedOptionId: optionId,
      });
    } catch (error) {
      if (client && transactionOpen) await client.query('ROLLBACK');
      console.error('Failed to submit poll vote:', error);
      socket.emit('action_error', 'Could not submit your vote. Please try again.');
    } finally {
      client?.release();
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
