import { API_URL } from '../config';

export type ProposedShape = {
  type: 'line' | 'rect' | 'ellipse' | 'arrow' | 'text';
  points: [[number, number], [number, number]];
  color: string;
  text: string;
};
export type ProposedDrawing = {
  summary: string;
  shapes: ProposedShape[];
};

export type AssistantReply = {
  answer: string;
  drawing: ProposedDrawing | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const isPoint = (value: unknown): value is [number, number] => (
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)
);

const isProposedShape = (value: unknown): value is ProposedShape => (
  isRecord(value) &&
  ['line', 'rect', 'ellipse', 'arrow', 'text'].includes(String(value.type)) &&
  /^#[0-9a-f]{6}$/i.test(String(value.color)) &&
  typeof value.text === 'string' &&
  value.text.length <= 200 &&
  (value.type !== 'text' || value.text.trim().length > 0) &&
  Array.isArray(value.points) &&
  value.points.length === 2 &&
  isPoint(value.points[0]) &&
  isPoint(value.points[1])
);

const isProposedDrawing = (value: unknown): value is ProposedDrawing => (
  isRecord(value) &&
  typeof value.summary === 'string' &&
  value.summary.trim().length > 0 &&
  Array.isArray(value.shapes) &&
  value.shapes.length > 0 &&
  value.shapes.length <= 8 &&
  value.shapes.every(isProposedShape)
);

export const askLocalAssistant = async (roomId: string, question: string): Promise<AssistantReply> => {
  const response = await fetch(`${API_URL}/api/rooms/${encodeURIComponent(roomId)}/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(isRecord(result) && typeof result.error === 'string'
      ? result.error
      : 'The local assistant could not answer right now.');
  }
  if (!isRecord(result) || typeof result.answer !== 'string' || !result.answer.trim() ||
      (result.drawing !== null && !isProposedDrawing(result.drawing))) {
    throw new Error('The local assistant returned an invalid response. Please try again.');
  }
  return {
    answer: result.answer.trim(),
    drawing: result.drawing,
  };
};
