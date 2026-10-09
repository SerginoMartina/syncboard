import { create } from 'zustand';

export type Shape = {
  id: string;
  type: 'line' | 'rect' | 'freehand';
  points: [number, number][];
  color: string;
  width: number;
};

export type Cursor = {
  userId: string;
  x: number;
  y: number;
  color: string;
};

export interface CanvasState {
  shapes: Shape[];
  currentTool: 'line' | 'rect' | 'freehand';
  isDrawing: boolean;
  currentColor: string;
  remoteCursors: Record<string, Cursor>; // Map userId to Cursor
  
  setTool: (tool: 'line' | 'rect' | 'freehand') => void;
  set_color: (color: string) => void;
  addShape: (shape: Shape) => void;
  updateRemoteCursor: (cursor: Cursor) => void;
  clearCanvas: () => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  shapes: [],
  currentTool: 'freehand',
  isDrawing: false,
  currentColor: '#3b82f6',
  remoteCursors: {},

  setTool: (tool) => set({ currentTool: tool }),
  set_color: (color) => set({ currentColor: color }),
  
  addShape: (shape) => set((state) => ({ 
    shapes: [...state.shapes, shape] 
  })),

  updateRemoteCursor: (cursor) => set((state) => ({
    remoteCursors: { ...state.remoteCursors, [cursor.userId]: cursor }
  })),

  clearCanvas: () => set({ shapes: [] }),
}));
