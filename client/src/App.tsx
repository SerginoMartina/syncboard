import React, { useState, useEffect } from 'react';
import { useRooms } from './hooks/useRooms';
import Canvas from './components/canvas/Canvas';
import { useCanvasStore } from './store/canvasStore';

function App() {
  const { data: rooms, isLoading, isError, createRoom } = useRooms();
  const { currentTool, setTool, currentColor, set_color } = useCanvasStore();
  
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('main-room');
  const [userId] = useState(`user-${Math.random().toString(36).substr(2, 9)}`);

  if (isLoading) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading rooms...</div>;
  if (isError) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Error loading rooms.</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">SyncBoard</h1>
            <p className="text-sm text-gray-400">ID: {userId}</p>
          </div>
          <div className="flex gap-4">
            <div className="flex flex-col">
              <label className="text-xs text-gray-400">Tool</label>
              <select 
                value={currentTool} 
                onChange={(e) => setTool(e.target.value as any)}
                className="bg-gray-800 p-1 rounded"
              >
                <option value="freehand">Freehand</option>
                <option value="line">Line</option>
                <option value="rect">Rectangle</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-gray-400">Color</label>
              <input 
                type="color" 
                value={currentColor} 
                onChange={(e) => set_color(e.target.value)}
                className="bg-gray-800 p-1 rounded"
              />
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <Canvas roomId={roomId} userId={userId} />
          </div>

          <div className="lg:col-span-1 bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h2 className="text-xl mb-4">Rooms</h2>
            <div className="mb-4">
              <label className="text-xs text-gray-400">Room ID</label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full px-3 py-2 rounded bg-gray-700 border border-gray-600 mb-2"
              />
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (roomName.trim()) {
                createRoom(roomName);
                setRoomName('');
              }
            }} className="mb-4">
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="New room name"
                className="w-full px-3 py-2 rounded bg-gray-700 border border-gray-600 mb-2"
              />
              <button type="submit" className="w-full bg-blue-600 py-2 rounded hover:bg-blue-700">
                Create
              </button>
            </form>
            <ul className="space-y-2">
              {rooms?.map((room) => (
                <li key={room.id} className="p-2 bg-gray-700 rounded">{room.name}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
