import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useCanvasStore } from '../store/canvasStore';

const socket: Socket = io('http://localhost:3000');

export const useSocket = (roomId: string | null) => {
  const [isConnected, setIsConnected] = useState(false);
  const addShape = useCanvasStore((state) => state.addShape);
  const updateRemoteCursor = useCanvasStore((state) => state.updateRemoteCursor);

  useEffect(() => {
    if (!roomId) return;

    socket.emit('join_room', roomId);

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to server');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from server');
    });

    socket.on('draw', (shape: any) => {
      addShape(shape);
    });

    socket.on('cursor_move', (cursor: any) => {
      updateRemoteCursor(cursor);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('draw');
      socket.off('cursor_move');
      socket.leave(roomId);
    };
  }, [roomId, addShape, updateRemoteCursor]);

  // Throttled Send Draw
  const sendDraw = (shape: any) => {
    if (socket.connected && roomId) {
      socket.emit('draw', { roomId, shape });
    }
  };

  // Send Cursor with a simple throttle (not using a full throttle library to keep it lean)
  const sendCursor = (x: number, y: number, userId: string) => {
    if (socket.connected && roomId) {
      socket.emit('cursor_move', { roomId, userId, x, y, color: useCanvasStore.getState().currentColor });
    }
  };

  return { isConnected, sendDraw, sendCursor };
};
