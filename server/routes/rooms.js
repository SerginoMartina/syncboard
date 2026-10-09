import { randomUUID } from 'node:crypto';
import express from 'express';
import { pool } from '../db.js';

const createRoomsRouter = ({ onRoomDeleted }) => {
  const router = express.Router();

  router.get('/', async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, name, owner_id AS "ownerId", created_at AS "createdAt"
         FROM syncboard.rooms
         ORDER BY created_at DESC, id`,
      );
      res.json(rows);
    } catch (error) {
      console.error('Failed to fetch rooms:', error);
      res.status(500).json({ error: 'Failed to fetch rooms' });
    }
  });

  router.post('/', async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const ownerId = typeof req.body?.ownerId === 'string' ? req.body.ownerId.trim() : '';
    if (!name || name.length > 80 || !ownerId) {
      return res.status(400).json({ error: 'A room name (up to 80 characters) and owner are required' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO syncboard.rooms (id, name, owner_id)
         VALUES ($1, $2, $3)
         RETURNING id, name, owner_id AS "ownerId", created_at AS "createdAt"`,
        [randomUUID(), name, ownerId],
      );
      res.status(201).json(rows[0]);
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'rooms_name_case_insensitive_unique_idx') {
        return res.status(409).json({ error: 'A room with this name already exists.' });
      }
      console.error('Failed to create room:', error);
      res.status(500).json({ error: 'Failed to create room' });
    }
  });

  router.delete('/:roomId', async (req, res) => {
    const ownerId = typeof req.body?.ownerId === 'string' ? req.body.ownerId.trim() : '';
    if (!ownerId) {
      return res.status(400).json({ error: 'Room owner is required' });
    }

    try {
      const { rows } = await pool.query(
        `DELETE FROM syncboard.rooms
         WHERE id = $1 AND owner_id = $2
         RETURNING id`,
        [req.params.roomId, ownerId],
      );
      if (!rows.length) {
        const existingRoom = await pool.query(
          'SELECT id FROM syncboard.rooms WHERE id = $1',
          [req.params.roomId],
        );
        if (!existingRoom.rows.length) return res.status(404).json({ error: 'Room not found.' });
        return res.status(403).json({ error: 'Only the room owner can delete this room.' });
      }

      onRoomDeleted(req.params.roomId);
      res.status(204).end();
    } catch (error) {
      console.error('Failed to delete room:', error);
      res.status(500).json({ error: 'Failed to delete room' });
    }
  });

  return router;
};

export default createRoomsRouter;
