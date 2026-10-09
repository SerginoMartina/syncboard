import { API_URL } from "../config";

export interface Room {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

const API_BASE_URL = `${API_URL}/api`;

export const fetchRooms = async (): Promise<Room[]> => {
  const response = await fetch(`${API_BASE_URL}/rooms`);
  if (!response.ok) throw new Error('Could not load rooms. Please try again.');
  return response.json();
};

export const createRoom = async ({ name, ownerId }: { name: string; ownerId: string }): Promise<Room> => {
  const response = await fetch(`${API_BASE_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ownerId }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || 'Could not create room. Please try again.');
  }
  return response.json();
};

export const deleteRoom = async ({ roomId, ownerId }: { roomId: string; ownerId: string }): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/rooms/${encodeURIComponent(roomId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || 'Could not delete room. Please try again.');
  }
};
