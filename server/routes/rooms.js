import { randomUUID } from 'node:crypto';
import express from 'express';
import { pool } from '../db.js';

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
    console.error('Failed to create room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

export default router;
