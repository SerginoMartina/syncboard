export interface Room {
  id: string;
  name: string;
  ownerId: string;
}

const API_BASE_URL = 'http://localhost:3000/api';

export const fetchRooms = async (): Promise<Room[]> => {
  const response = await fetch(`${API_BASE_URL}/rooms`);
  if (!response.ok) throw new Error('Failed to fetch rooms');
  return response.json();
};

export const createRoom = async (name: string): Promise<Room> => {
  const response = await fetch(`${API_BASE_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ownerId: 'user-123' }), // Mock ownerId
  });
  if (!response.ok) throw new Error('Failed to create room');
  return response.json();
};
