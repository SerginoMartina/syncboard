import { API_URL } from '../config';

export const askLocalAssistant = async (roomId: string, question: string): Promise<string> => {
  const response = await fetch(`${API_URL}/api/rooms/${encodeURIComponent(roomId)}/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || 'The local assistant could not answer right now.');
  }
  if (typeof result?.answer !== 'string' || !result.answer.trim()) {
    throw new Error('The local assistant returned an empty answer. Please try again.');
  }
  return result.answer.trim();
};
