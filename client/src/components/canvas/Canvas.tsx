import React, { useEffect, useRef, useState } from 'react';
import { useCanvasStore, type CanvasTool, type Cursor, type Shape } from '../../store/canvasStore';

type CanvasProps = {
  userId: string;
  sendDraw: (shape: Shape) => void;
  moveShape: (shapeId: string, points: [number, number][]) => Promise<boolean>;
  deleteShape: (shapeId: string) => Promise<boolean>;
  selectedShapeId: string | null;
  onSelectedShapeChange: (shapeId: string | null) => void;
  sendCursor: (x: number, y: number) => void;
  expanded: boolean;
  onCanvasSizeChange: (size: { width: number; height: number }) => void;
};

type TextDraft = {
  point: [number, number];
  value: string;
  type: 'text' | 'sticky';
};

const translatedShape = (shape: Shape, dx: number, dy: number): Shape => ({
  ...shape,
  points: shape.points.map(([x, y]) => [x + dx, y + dy]),
});

const shapeBounds = (shape: Shape, ctx: CanvasRenderingContext2D) => {
  const points = shape.points;
  if (!points.length) return null;
  if (shape.type === 'sticky') {
    return { left: points[0][0], top: points[0][1], right: points[0][0] + 190, bottom: points[0][1] + 150 };
  }
  if (shape.type === 'text') {
    ctx.save();
    ctx.font = `600 ${Math.max(14, shape.width * 8)}px Inter, ui-sans-serif, system-ui, sans-serif`;
    const lines = (shape.text || '').split('\n');
    const width = Math.max(1, ...lines.map((line) => ctx.measureText(line).width));
    const height = Math.max(14, shape.width * 8) * Math.max(1, lines.length);
    ctx.restore();
    return { left: points[0][0], top: points[0][1], right: points[0][0] + width, bottom: points[0][1] + height };
  }
  return {
    left: Math.min(...points.map(([x]) => x)),
    top: Math.min(...points.map(([, y]) => y)),
    right: Math.max(...points.map(([x]) => x)),
    bottom: Math.max(...points.map(([, y]) => y)),
  };
};

const distanceToSegment = (point: [number, number], start: [number, number], end: [number, number]) => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared
    ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point[0] - (start[0] + projection * dx), point[1] - (start[1] + projection * dy));
};

const hitTestShape = (shape: Shape, point: [number, number], ctx: CanvasRenderingContext2D) => {
  const bounds = shapeBounds(shape, ctx);
  if (!bounds) return false;
  if (shape.type === 'text' || shape.type === 'sticky' || shape.type === 'rect') {
    return point[0] >= bounds.left - 7 && point[0] <= bounds.right + 7 &&
      point[1] >= bounds.top - 7 && point[1] <= bounds.bottom + 7;
  }
  if (shape.type === 'ellipse') {
    const radiusX = Math.max((bounds.right - bounds.left) / 2, 7);
    const radiusY = Math.max((bounds.bottom - bounds.top) / 2, 7);
    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;
    return ((point[0] - centerX) / radiusX) ** 2 + ((point[1] - centerY) / radiusY) ** 2 <= 1.2;
  }
  const segments = shape.points.length === 1
    ? [[shape.points[0], shape.points[0]] as [[number, number], [number, number]]]
    : shape.points.slice(1).map((next, index) => [shape.points[index], next] as [[number, number], [number, number]]);
  return segments.some(([start, end]) => distanceToSegment(point, start, end) <= Math.max(8, shape.width / 2 + 5));
};

const drawShape = (ctx: CanvasRenderingContext2D, shape: Shape) => {
  const first = shape.points[0];
  const last = shape.points[shape.points.length - 1];
  if (!first || !last) return;

  if (shape.type === 'sticky') {
    const noteWidth = 190;
    const noteHeight = 150;
    const padding = 14;
    const lineHeight = 19;
    ctx.save();
    ctx.shadowColor = '#53482822';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#fff2ad';
    ctx.fillRect(first[0], first[1], noteWidth, noteHeight);
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#eadb93';
    ctx.lineWidth = 1;
    ctx.strokeRect(first[0] + 0.5, first[1] + 0.5, noteWidth - 1, noteHeight - 1);
    ctx.beginPath();
    ctx.moveTo(first[0] + noteWidth - 22, first[1]);
    ctx.lineTo(first[0] + noteWidth, first[1] + 22);
    ctx.lineTo(first[0] + noteWidth - 22, first[1] + 22);
    ctx.closePath();
    ctx.fillStyle = '#f4e69f';
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(first[0] + padding, first[1] + padding, noteWidth - padding * 2, noteHeight - padding * 2);
    ctx.clip();
    ctx.fillStyle = shape.color;
    ctx.font = '500 14px Inter, ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    const maxWidth = noteWidth - padding * 2;
    const maxLines = Math.floor((noteHeight - padding * 2) / lineHeight);
    const lines: string[] = [];
    let line = '';
    for (const word of (shape.text || '').split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    lines.slice(0, maxLines).forEach((text, index) => {
      const isLastVisibleLine = index === maxLines - 1 && lines.length > maxLines;
      ctx.fillText(isLastVisibleLine ? `${text.slice(0, 18)}…` : text, first[0] + padding, first[1] + padding + index * lineHeight);
    });
    ctx.restore();
    ctx.restore();
    return;
  }

  if (shape.type === 'text') {
    ctx.fillStyle = shape.color;
    ctx.font = `600 ${Math.max(14, shape.width * 8)}px Inter, ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(shape.text || '', first[0], first[1]);
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = shape.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (shape.type === 'highlighter') ctx.globalAlpha = 0.3;

  if (shape.type === 'line' || shape.type === 'arrow') {
    ctx.moveTo(first[0], first[1]);
    ctx.lineTo(last[0], last[1]);
    if (shape.type === 'arrow') {
      const angle = Math.atan2(last[1] - first[1], last[0] - first[0]);
      const headLength = Math.max(10, shape.width * 4);
      ctx.moveTo(last[0], last[1]);
      ctx.lineTo(
        last[0] - headLength * Math.cos(angle - Math.PI / 6),
        last[1] - headLength * Math.sin(angle - Math.PI / 6),
      );
      ctx.moveTo(last[0], last[1]);
      ctx.lineTo(
        last[0] - headLength * Math.cos(angle + Math.PI / 6),
        last[1] - headLength * Math.sin(angle + Math.PI / 6),
      );
    }
  } else if (shape.type === 'freehand' || shape.type === 'highlighter') {
    ctx.moveTo(first[0], first[1]);
    for (let index = 1; index < shape.points.length; index++) {
      ctx.lineTo(shape.points[index][0], shape.points[index][1]);
    }
  } else if (shape.type === 'ellipse') {
    const centerX = (first[0] + last[0]) / 2;
    const centerY = (first[1] + last[1]) / 2;
    ctx.ellipse(centerX, centerY, last[0] - first[0], last[1] - first[1], 0, 0, Math.PI * 2);
  } else {
    ctx.rect(first[0], first[1], last[0] - first[0], last[1] - first[1]);
  }
  ctx.stroke();
  ctx.restore();
};

const Canvas: React.FC<CanvasProps> = ({
  userId,
  sendDraw,
  moveShape,
  deleteShape,
  selectedShapeId,
  onSelectedShapeChange,
  sendCursor,
  expanded,
  onCanvasSizeChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef<Shape | null>(null);
  const movingRef = useRef<{ shape: Shape; start: [number, number]; current: [number, number] } | null>(null);
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const spaceDownRef = useRef(false);
  const panRef = useRef<{ pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const [movingShape, setMovingShape] = useState<Shape | null>(null);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const { shapes, currentTool, currentColor, remoteCursors } = useCanvasStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const render = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (canvasSizeRef.current.width !== width || canvasSizeRef.current.height !== height) {
        canvasSizeRef.current = { width, height };
        onCanvasSizeChange({ width, height });
      }
      const pixelRatio = window.devicePixelRatio || 1;
      const targetWidth = Math.round(width * pixelRatio);
      const targetHeight = Math.round(height * pixelRatio);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      shapes.forEach((shape) => {
        const renderedShape = movingShape?.id === shape.id ? movingShape : shape;
        drawShape(ctx, renderedShape);
        if (selectedShapeId === shape.id) {
          const bounds = shapeBounds(renderedShape, ctx);
          if (bounds) {
            ctx.save();
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = '#d95159';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(
              bounds.left - 5,
              bounds.top - 5,
              Math.max(10, bounds.right - bounds.left + 10),
              Math.max(10, bounds.bottom - bounds.top + 10),
            );
            ctx.restore();
          }
        }
      });
      if (currentShape) drawShape(ctx, currentShape);

      Object.values(remoteCursors).forEach((cursor: Cursor) => {
        if (cursor.userId === userId) return;
        ctx.beginPath();
        ctx.fillStyle = cursor.color;
        ctx.arc(cursor.x, cursor.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });

    };

    render();
    const resizeObserver = new ResizeObserver(() => {
      render();
    });
    resizeObserver.observe(canvas);

    return () => {
      resizeObserver.disconnect();
    };
  }, [shapes, currentShape, movingShape, selectedShapeId, remoteCursors, userId, onCanvasSizeChange]);

  useEffect(() => {
    if (textDraft) textInputRef.current?.focus();
  }, [textDraft]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => (
      target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))
    );
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isEditableTarget(event.target)) return;
      event.preventDefault();
      spaceDownRef.current = true;
      setSpaceHeld(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceDownRef.current = false;
        setSpaceHeld(false);
      }
    };
    const handleBlur = () => {
      spaceDownRef.current = false;
      setSpaceHeld(false);
      panRef.current = null;
      setIsPanning(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    const handleDeleteKey = (event: KeyboardEvent) => {
      if (currentTool !== '' || !selectedShapeId ||
          event.target instanceof HTMLElement &&
          (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))) return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      event.preventDefault();
      void deleteShape(selectedShapeId).then((deleted) => {
        if (deleted) onSelectedShapeChange(null);
      });
    };
    window.addEventListener('keydown', handleDeleteKey);
    return () => window.removeEventListener('keydown', handleDeleteKey);
  }, [currentTool, selectedShapeId, deleteShape, onSelectedShapeChange]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return [event.clientX - rect.left, event.clientY - rect.top] as [number, number];
  };

  const makeShape = (tool: CanvasTool, point: [number, number]): Shape => ({
    id: crypto.randomUUID(),
    type: tool === 'text' ? 'freehand' : tool,
    points: [point],
    color: currentColor,
    width: tool === 'highlighter' ? 14 : 2,
  });

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || spaceDownRef.current) return;
    const point = pointFromEvent(event);
    if (!point) return;

    if (currentTool === 'select') {
      const ctx = canvasRef.current?.getContext('2d');
      const selected = ctx
        ? [...shapes].reverse().find((shape) => hitTestShape(shape, point, ctx))
        : undefined;
      onSelectedShapeChange(selected?.id || null);
      if (!selected) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      movingRef.current = { shape: selected, start: point, current: point };
      setMovingShape(selected);
      return;
    }

    if (currentTool === 'text' || currentTool === 'sticky') {
      setTextDraft({ point, value: '', type: currentTool });
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const shape = makeShape(currentTool, point);
    drawingRef.current = shape;
    setCurrentShape(shape);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (panRef.current) return;
    const point = pointFromEvent(event);
    if (!point) return;
    sendCursor(point[0], point[1]);
    const moving = movingRef.current;
    if (moving) {
      moving.current = point;
      setMovingShape(translatedShape(
        moving.shape,
        point[0] - moving.start[0],
        point[1] - moving.start[1],
      ));
      return;
    }
    const shape = drawingRef.current;
    if (!shape) return;

    const nextPoints: [number, number][] = shape.type === 'freehand' || shape.type === 'highlighter'
      ? [...shape.points, point]
      : [shape.points[0], point];
    const nextShape = { ...shape, points: nextPoints };
    drawingRef.current = nextShape;
    setCurrentShape(nextShape);
  };

  const finishDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const moving = movingRef.current;
    if (moving) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      movingRef.current = null;
      setMovingShape(null);
      const dx = moving.current[0] - moving.start[0];
      const dy = moving.current[1] - moving.start[1];
      if (dx || dy) void moveShape(moving.shape.id, translatedShape(moving.shape, dx, dy).points);
      return;
    }
    const shape = drawingRef.current;
    if (!shape) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (shape.type !== 'freehand' && shape.type !== 'highlighter' && shape.points.length === 1) {
      const point = pointFromEvent(event);
      if (point) shape.points = [shape.points[0], point];
    }
    drawingRef.current = null;
    setCurrentShape(null);
    sendDraw(shape);
  };

  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!spaceDownRef.current || event.button !== 0) return;
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;
    panRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    setIsPanning(true);
    viewport.setPointerCapture(event.pointerId);
  };

  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const viewport = viewportRef.current;
    if (!pan || !viewport || pan.pointerId !== event.pointerId) return;
    viewport.scrollLeft = pan.scrollLeft - (event.clientX - pan.x);
    viewport.scrollTop = pan.scrollTop - (event.clientY - pan.y);
  };

  const stopPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    panRef.current = null;
    setIsPanning(false);
  };

  const saveText = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!textDraft?.value.trim()) {
      setTextDraft(null);
      return;
    }
    const point = textDraft.type === 'sticky' && canvasRef.current
      ? [
        Math.min(textDraft.point[0], Math.max(0, canvasRef.current.clientWidth - 190)),
        Math.min(textDraft.point[1], Math.max(0, canvasRef.current.clientHeight - 150)),
      ] as [number, number]
      : textDraft.point;
    sendDraw({
      id: crypto.randomUUID(),
      type: textDraft.type,
      points: [point],
      text: textDraft.value.trim(),
      color: textDraft.type === 'sticky' ? '#514a38' : currentColor,
      width: textDraft.type === 'sticky' ? 14 : 2,
    });
    setTextDraft(null);
  };

  const textEditorPosition = textDraft && canvasRef.current
    ? {
      left: Math.min(textDraft.point[0], Math.max(8, canvasRef.current.clientWidth - 280)),
      top: Math.min(Math.max(24, textDraft.point[1]), Math.max(24, canvasRef.current.clientHeight - 20)),
    }
    : undefined;

  return (
    <div
      ref={viewportRef}
      className={`canvas-scroll-viewport ${expanded ? 'canvas-scroll-expanded' : ''} ${spaceHeld ? 'canvas-space-held' : ''} ${isPanning ? 'canvas-is-panning' : ''}`}
      onPointerDown={startPan}
      onPointerMove={movePan}
      onPointerUp={stopPan}
      onPointerCancel={stopPan}
    >
      <div className={`canvas-surface ${currentTool === 'text' || currentTool === 'sticky' ? 'canvas-text-mode' : ''} ${currentTool === 'select' ? 'canvas-select-mode' : ''}`}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrawing}
          onPointerCancel={finishDrawing}
          className="drawing-canvas"
          aria-label="Collaborative drawing board"
        />
        {textDraft && (
          <form
            className={`canvas-text-editor ${textDraft.type === 'sticky' ? 'canvas-sticky-editor' : ''}`}
            style={textEditorPosition}
            onSubmit={saveText}
          >
            <input
              ref={textInputRef}
              value={textDraft.value}
              onChange={(event) => setTextDraft({ ...textDraft, value: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setTextDraft(null);
              }}
              placeholder={textDraft.type === 'sticky' ? 'Write a note and press Enter' : 'Type and press Enter'}
              aria-label={textDraft.type === 'sticky' ? 'Text for the post-it note' : 'Text to add to the board'}
              maxLength={500}
            />
            <button type="submit" aria-label="Add text to board">Add</button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Canvas;
