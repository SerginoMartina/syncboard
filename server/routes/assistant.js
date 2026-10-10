import express from 'express';
import { pool } from '../db.js';

const router = express.Router();
const modelUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const modelName = process.env.OLLAMA_MODEL || 'qwen2.5:0.5b';

router.post('/:roomId/assistant', async (req, res) => {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (!question || question.length > 2000) {
    return res.status(400).json({ error: 'Ask a question between 1 and 2000 characters.' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM syncboard.rooms WHERE id = $1',
      [req.params.roomId],
    );
    if (!rows.length) return res.status(404).json({ error: 'Room not found.' });

    const response = await fetch(new URL('/api/chat', modelUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        model: modelName,
        stream: false,
        messages: [
          {
            role: 'system',
            content: 'You are SyncBoard’s private, lightweight board assistant. Be concise and helpful. Only use details the user provides; you cannot see their board or room chat.',
          },
          { role: 'user', content: question },
        ],
        options: { num_predict: 256, temperature: 0.4 },
      }),
    });
    if (!response.ok) {
      console.error(`Local AI model returned HTTP ${response.status}.`);
      return res.status(503).json({ error: 'The local AI model is unavailable. Try again shortly.' });
    }

    const result = await response.json();
    const answer = typeof result?.message?.content === 'string' ? result.message.content.trim() : '';
    if (!answer) {
      console.error('Local AI model returned an empty answer.');
      return res.status(502).json({ error: 'The local AI model did not return an answer. Please try again.' });
    }
    return res.json({ answer });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return res.status(504).json({ error: 'The local AI model took too long to respond. Please try again.' });
    }
    console.error('Local AI request failed:', error);
    return res.status(503).json({ error: 'The local AI model is unavailable. Start the local model service and try again.' });
  }
});

export default router;
