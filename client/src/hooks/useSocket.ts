import { useCallback, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from '../config';
import {
  useCanvasStore,
  type Cursor,
  type Shape,
} from '../store/canvasStore';

export type RoomUser = {
  userId: string;
  name: string;
  color: string;
  socketId: string;
};

export type ChatMessage = {
  id: string;
  userId: string;
  name: string;
  color: string;
  body: string;
  createdAt: string;
};

export type ChatPoll = {
  id: string;
  question: string;
  creatorId: string;
  creatorName: string;
  createdAt: string;
  options: { id: string; text: string; votes: number }[];
  selectedOptionId: string | null;
};

export type GuestUser = {
  id: string;
  name: string;
  color: string;
};

const socket: Socket = io(API_URL, { autoConnect: false });

export const useSocket = (roomId: string, user: GuestUser) => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [presence, setPresence] = useState<RoomUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [polls, setPolls] = useState<ChatPoll[]>([]);
  const [error, setError] = useState('');
  const [roomDeleted, setRoomDeleted] = useState(false);
  const addShape = useCanvasStore((state) => state.addShape);
  const setShapes = useCanvasStore((state) => state.setShapes);
  const updateRemoteCursor = useCanvasStore((state) => state.updateRemoteCursor);
  const setRemoteCursors = useCanvasStore((state) => state.setRemoteCursors);

  useEffect(() => {
    setShapes([]);
    setPresence([]);
    setMessages([]);
    setPolls([]);
    setError('');
    setRoomDeleted(false);

    const joinRoom = () => {
      setIsConnected(true);
      socket.emit('join_room', { roomId, user });
    };
    const handleDisconnect = () => setIsConnected(false);
    const handleRoomState = (state: {
      roomId: string;
      shapes: Shape[];
      messages: ChatMessage[];
      polls: ChatPoll[];
      presence: RoomUser[];
    }) => {
      if (state.roomId !== roomId) return;
      const shapesById = new Map(state.shapes.map((shape) => [shape.id, shape]));
      useCanvasStore.getState().shapes.forEach((shape) => shapesById.set(shape.id, shape));
      setShapes([...shapesById.values()]);
      setMessages((current) => (
        [...new Map([...state.messages, ...current].map((message) => [message.id, message])).values()].slice(-100)
      ));
      setPolls(state.polls);
      setPresence(state.presence);
      const presentIds = new Set(state.presence.map((member) => member.userId));
      setRemoteCursors(
        Object.fromEntries(
          Object.entries(useCanvasStore.getState().remoteCursors)
            .filter(([userId]) => presentIds.has(userId)),
        ),
      );
    };
    const handlePresence = (update: { roomId: string; users: RoomUser[] }) => {
      if (update.roomId !== roomId) return;
      setPresence(update.users);
      const presentIds = new Set(update.users.map((member) => member.userId));
      setRemoteCursors(
        Object.fromEntries(
          Object.entries(useCanvasStore.getState().remoteCursors)
            .filter(([userId]) => presentIds.has(userId)),
        ),
      );
    };
    const handleDraw = (event: { roomId: string; shape: Shape }) => {
      if (event.roomId === roomId) addShape(event.shape);
    };
    const handleCursorMove = (event: { roomId: string; cursor: Cursor }) => {
      if (event.roomId === roomId) updateRemoteCursor(event.cursor);
    };
    const handleMessage = (event: { roomId: string; message: ChatMessage }) => {
      if (event.roomId !== roomId) return;
      const message = event.message;
      setMessages((current) => (
        current.some((item) => item.id === message.id)
          ? current
          : [...current, message].slice(-100)
      ));
    };
    const handlePollCreated = (event: { roomId: string; poll: ChatPoll }) => {
      if (event.roomId !== roomId) return;
      setPolls((current) => (
        current.some((poll) => poll.id === event.poll.id) ? current : [...current, event.poll]
      ));
    };
    const handlePollUpdated = (event: {
      roomId: string;
      poll: ChatPoll;
      voterId: string;
      selectedOptionId: string;
    }) => {
      if (event.roomId !== roomId) return;
      setPolls((current) => current.map((poll) => (
        poll.id === event.poll.id
          ? {
            ...event.poll,
            selectedOptionId: event.voterId === user.id
              ? event.selectedOptionId
              : poll.selectedOptionId,
          }
          : poll
      )));
    };
    const handleActionError = (message: string) => setError(message);
    const handleRoomNotFound = () => setError('This room no longer exists. Refresh the room list and choose another.');
    const handleRoomDeleted = (deletedRoomId: string) => {
      if (deletedRoomId === roomId) setRoomDeleted(true);
    };

    socket.on('connect', joinRoom);
    socket.on('disconnect', handleDisconnect);
    socket.on('room_state', handleRoomState);
    socket.on('presence_update', handlePresence);
    socket.on('draw', handleDraw);
    socket.on('cursor_move', handleCursorMove);
    socket.on('chat_message', handleMessage);
    socket.on('chat_poll_created', handlePollCreated);
    socket.on('chat_poll_updated', handlePollUpdated);
    socket.on('action_error', handleActionError);
    socket.on('room_not_found', handleRoomNotFound);
    socket.on('room_deleted', handleRoomDeleted);
    if (!socket.connected) socket.connect();
    else joinRoom();

    return () => {
      socket.emit('leave_room', roomId);
      socket.off('connect', joinRoom);
      socket.off('disconnect', handleDisconnect);
      socket.off('room_state', handleRoomState);
      socket.off('presence_update', handlePresence);
      socket.off('draw', handleDraw);
      socket.off('cursor_move', handleCursorMove);
      socket.off('chat_message', handleMessage);
      socket.off('chat_poll_created', handlePollCreated);
      socket.off('chat_poll_updated', handlePollUpdated);
      socket.off('action_error', handleActionError);
      socket.off('room_not_found', handleRoomNotFound);
      socket.off('room_deleted', handleRoomDeleted);
      setPresence([]);
      setRemoteCursors({});
    };
  }, [roomId, user.id, user.name, user.color, addShape, setShapes, updateRemoteCursor, setRemoteCursors]);

  const sendDraw = useCallback((shape: Shape) => {
    if (!socket.connected) {
      setError('Connection lost. Your drawing was not sent.');
      return;
    }
    setError('');
    socket.emit('draw', shape);
  }, []);

  const sendCursor = useCallback((x: number, y: number) => {
    if (socket.connected) socket.emit('cursor_move', { x, y });
  }, []);

  const sendMessage = useCallback((body: string) => {
    if (!socket.connected) {
      setError('Connection lost. Your message was not sent.');
      return;
    }
    setError('');
    socket.emit('chat_message', body);
  }, []);

  return {
    isConnected,
    presence,
    messages,
    polls,
    error,
    roomDeleted,
    clearError: () => setError(''),
    sendDraw,
    sendCursor,
    sendMessage,
    createPoll: (question: string, options: string[]) => {
      if (!socket.connected) {
        setError('Connection lost. Your poll was not created.');
        return;
      }
      setError('');
      socket.emit('create_poll', { question, options });
    },
    votePoll: (pollId: string, optionId: string) => {
      if (!socket.connected) {
        setError('Connection lost. Your vote was not sent.');
        return;
      }
      setError('');
      socket.emit('vote_poll', { pollId, optionId });
    },
  };
};
