import express from 'express';
const router = express.Router();

// Mock Database
let rooms = [
  { id: '1', name: 'General Workspace', ownerId: 'u1' },
  { id: '2', name: 'Design Ideas', ownerId: 'u2' },
];

// GET all rooms
router.get('/', (req, res) => {
  res.json(rooms);
});

// POST create room
router.post('/', (req, res) => {
  const { name, ownerId } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  
  const newRoom = {
    id: Math.random().toString(36).substr(2, 9),
    name,
    ownerId
  };
  rooms.push(newRoom);
  res.status(201).json(newRoom);
});

export default router;
