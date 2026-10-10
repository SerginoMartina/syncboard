import express from 'express';
import { pool } from '../db.js';

const router = express.Router();
const modelUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const modelName = process.env.OLLAMA_MODEL || 'qwen2.5:0.5b';
const drawingTypes = new Set(['line', 'rect', 'ellipse', 'arrow', 'text']);
const drawingFormat = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    drawing: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            shapes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: [...drawingTypes] },
                  points: {
                    type: 'array',
                    minItems: 2,
                    maxItems: 2,
                    items: {
                      type: 'array',
                      minItems: 2,
                      maxItems: 2,
                      items: { type: 'number' },
                    },
                  },
                  color: { type: 'string' },
                  text: { type: 'string' },
                },
                required: ['type', 'points', 'color', 'text'],
                additionalProperties: false,
              },
            },
          },
          required: ['summary', 'shapes'],
          additionalProperties: false,
        },
      ],
    },
  },
  required: ['answer', 'drawing'],
  additionalProperties: false,
};

const isValidDrawing = (drawing) => drawing === null || (
  typeof drawing === 'object' &&
  typeof drawing.summary === 'string' &&
  drawing.summary.trim().length > 0 &&
  drawing.summary.length <= 200 &&
  Array.isArray(drawing.shapes) &&
  drawing.shapes.length > 0 &&
  drawing.shapes.length <= 8 &&
  drawing.shapes.every((shape) => (
    shape !== null &&
    typeof shape === 'object' &&
    !Array.isArray(shape) &&
    drawingTypes.has(shape.type) &&
    /^#[0-9a-f]{6}$/i.test(shape.color) &&
    typeof shape.text === 'string' &&
    shape.text.length <= 200 &&
    (shape.type !== 'text' || shape.text.trim().length > 0) &&
    Array.isArray(shape.points) &&
    shape.points.length === 2 &&
    shape.points.every((point) => (
      Array.isArray(point) &&
      point.length === 2 &&
      point.every((coordinate) => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)
    ))
  ))
);

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
        format: drawingFormat,
        messages: [
          {
            role: 'system',
            content: 'You are SyncBoard’s private, lightweight board assistant. Be concise and helpful. You cannot see the board or room chat. Return a drawing only when the user explicitly asks to draw or create something on the board. A drawing is just a proposed plan: never claim it has already been added. Use 2 normalized coordinate points (each x and y between 0 and 1) per simple line, rectangle, ellipse, arrow, or text shape; use at most 8 shapes, colors as #RRGGBB, and include text only for text shapes (otherwise use an empty string). Make related shapes form the requested simple illustration. For all other requests set drawing to null.',
          },
          { role: 'user', content: question },
        ],
        options: { num_predict: 768, temperature: 0.2 },
      }),
    });
    if (!response.ok) {
      console.error(`Local AI model returned HTTP ${response.status}.`);
      return res.status(503).json({ error: 'The local AI model is unavailable. Try again shortly.' });
    }

    const result = await response.json();
    let assistantResult;
    try {
      assistantResult = JSON.parse(result?.message?.content || '');
    } catch {
      console.error('Local AI model returned invalid structured content.');
      return res.status(502).json({ error: 'The local AI could not format its response. Please try again.' });
    }
    if (typeof assistantResult.answer !== 'string' || !assistantResult.answer.trim() ||
        !isValidDrawing(assistantResult.drawing)) {
      console.error('Local AI model returned a response that failed validation.');
      return res.status(502).json({ error: 'The local AI returned an invalid response. Please try again.' });
    }
    return res.json({
      answer: assistantResult.answer.trim(),
      drawing: assistantResult.drawing && {
        summary: assistantResult.drawing.summary.trim(),
        shapes: assistantResult.drawing.shapes.map((shape) => ({
          ...shape,
          text: shape.text.trim(),
        })),
      },
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return res.status(504).json({ error: 'The local AI model took too long to respond. Please try again.' });
    }
    console.error('Local AI request failed:', error);
    return res.status(503).json({ error: 'The local AI model is unavailable. Start the local model service and try again.' });
  }
});

export default router;
