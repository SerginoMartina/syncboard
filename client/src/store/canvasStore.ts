import { create } from 'zustand';

export type CanvasTool = 'line' | 'rect' | 'ellipse' | 'arrow' | 'freehand' | 'highlighter' | 'text';

export type Shape = {
  id: string;
  type: CanvasTool;
  points: [number, number][];
  color: string;
  width: number;
  text?: string;
};

export type Cursor = {
  userId: string;
  x: number;
  y: number;
  color: string;
};

export interface CanvasState {
  shapes: Shape[];
  currentTool: CanvasTool;
  isDrawing: boolean;
  currentColor: string;
  remoteCursors: Record<string, Cursor>; // Map userId to Cursor
  
  setTool: (tool: CanvasTool) => void;
  set_color: (color: string) => void;
  addShape: (shape: Shape) => void;
  setShapes: (shapes: Shape[]) => void;
  updateRemoteCursor: (cursor: Cursor) => void;
  setRemoteCursors: (cursors: Record<string, Cursor>) => void;
  clearCanvas: () => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  shapes: [],
  currentTool: 'freehand',
  isDrawing: false,
  currentColor: '#d94f55',
  remoteCursors: {},

  setTool: (tool) => set({ currentTool: tool }),
  set_color: (color) => set({ currentColor: color }),
  
  addShape: (shape) => set((state) => ({
    shapes: state.shapes.some((existing) => existing.id === shape.id)
      ? state.shapes
      : [...state.shapes, shape],
  })),
  setShapes: (shapes) => set({ shapes }),

  updateRemoteCursor: (cursor) => set((state) => ({
    remoteCursors: { ...state.remoteCursors, [cursor.userId]: cursor }
  })),
  setRemoteCursors: (remoteCursors) => set({ remoteCursors }),

  clearCanvas: () => set({ shapes: [], remoteCursors: {} }),
}));
