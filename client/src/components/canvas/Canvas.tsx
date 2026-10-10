import React, { useEffect, useRef, useState } from 'react';
import { useCanvasStore, type CanvasTool, type Cursor, type Shape } from '../../store/canvasStore';

type CanvasProps = {
  userId: string;
  sendDraw: (shape: Shape) => void;
  sendCursor: (x: number, y: number) => void;
  expanded: boolean;
};

type TextDraft = {
  point: [number, number];
  value: string;
};

const drawShape = (ctx: CanvasRenderingContext2D, shape: Shape) => {
  const first = shape.points[0];
  const last = shape.points[shape.points.length - 1];
  if (!first || !last) return;

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
    ctx.ellipse(centerX, centerY, Math.abs(last[0] - first[0]) / 2, Math.abs(last[1] - first[1]) / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.rect(first[0], first[1], last[0] - first[0], last[1] - first[1]);
  }
  ctx.stroke();
  ctx.restore();
};

const Canvas: React.FC<CanvasProps> = ({ userId, sendDraw, sendCursor, expanded }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef<Shape | null>(null);
  const spaceDownRef = useRef(false);
  const panRef = useRef<{ pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const { shapes, currentTool, currentColor, remoteCursors } = useCanvasStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const render = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      const targetWidth = Math.round(width * pixelRatio);
      const targetHeight = Math.round(height * pixelRatio);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      shapes.forEach((shape) => drawShape(ctx, shape));
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
  }, [shapes, currentShape, remoteCursors, userId]);

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

    if (currentTool === 'text') {
      setTextDraft({ point, value: '' });
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
    sendDraw({
      id: crypto.randomUUID(),
      type: 'text',
      points: [textDraft.point],
      text: textDraft.value.trim(),
      color: currentColor,
      width: 2,
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
      <div className={`canvas-surface ${currentTool === 'text' ? 'canvas-text-mode' : ''}`}>
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
            className="canvas-text-editor"
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
              placeholder="Type and press Enter"
              aria-label="Text to add to the board"
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
