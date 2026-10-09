import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { API_URL } from "../config";
import {
  useCanvasStore,
  type Cursor,
  type Shape,
} from "../store/canvasStore";

const socket: Socket = io(API_URL);

export const useSocket = (roomId: string | null) => {
  const [isConnected, setIsConnected] = useState(false);
  const addShape = useCanvasStore((state) => state.addShape);
  const updateRemoteCursor = useCanvasStore(
    (state) => state.updateRemoteCursor,
  );

  useEffect(() => {
    if (!roomId) {
      setIsConnected(false);
      return;
    }

    const handleConnect = () => {
      setIsConnected(true);
      socket.emit("join_room", roomId);
    };
    const handleDisconnect = () => setIsConnected(false);
    const handleDraw = (shape: Shape) => addShape(shape);
    const handleCursorMove = (cursor: Cursor) => updateRemoteCursor(cursor);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("draw", handleDraw);
    socket.on("cursor_move", handleCursorMove);
    if (socket.connected) handleConnect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("draw", handleDraw);
      socket.off("cursor_move", handleCursorMove);
      if (socket.connected) socket.emit("leave_room", roomId);
    };
  }, [roomId, addShape, updateRemoteCursor]);

  const sendDraw = (shape: Shape) => {
    if (socket.connected && roomId) {
      socket.emit("draw", { roomId, shape });
    }
  };

  const sendCursor = (x: number, y: number, userId: string) => {
    if (socket.connected && roomId) {
      socket.emit("cursor_move", {
        roomId,
        userId,
        x,
        y,
        color: useCanvasStore.getState().currentColor,
      });
    }
  };

  return { isConnected, sendDraw, sendCursor };
};
