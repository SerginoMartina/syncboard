import React, { useRef, useEffect, useState } from 'react';
import { useCanvasStore, type Cursor, type Shape } from '../../store/canvasStore';

type CanvasProps = {
  userId: string;
  sendDraw: (shape: Shape) => void;
  sendCursor: (x: number, y: number) => void;
};

const Canvas: React.FC<CanvasProps> = ({ userId, sendDraw, sendCursor }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const { shapes, currentTool, currentColor, remoteCursors } = useCanvasStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    let animationFrameId: number;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      shapes.forEach((shape) => drawShape(ctx, shape));
      if (currentShape) drawShape(ctx, currentShape);

      Object.values(remoteCursors).forEach((cursor: Cursor) => {
        if (cursor.userId !== userId) {
          ctx.beginPath();
          ctx.fillStyle = cursor.color;
          ctx.arc(cursor.x, cursor.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, [shapes, currentShape, remoteCursors, userId]);

  const drawShape = (ctx: CanvasRenderingContext2D, shape: Shape) => {
    ctx.beginPath();
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (shape.type === 'freehand' || shape.type === 'line') {
      if (shape.points.length < 2) return;
      ctx.moveTo(shape.points[0][0], shape.points[0][1]);
      for (let index = 1; index < shape.points.length; index++) {
        ctx.lineTo(shape.points[index][0], shape.points[index][1]);
      }
    } else if (shape.type === 'rect') {
      const first = shape.points[0];
      const last = shape.points[shape.points.length - 1];
      if (!first || !last) return;
      ctx.rect(first[0], first[1], last[0] - first[0], last[1] - first[1]);
    }
    ctx.stroke();
  };

  const pointFromEvent = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return [event.clientX - rect.left, event.clientY - rect.top] as [number, number];
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event);
    if (!point) return;
    setCurrentShape({
      id: crypto.randomUUID(),
      type: currentTool,
      points: [point],
      color: currentColor,
      width: 2,
    });
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event);
    if (!point) return;
    sendCursor(point[0], point[1]);
    if (!currentShape) return;

    setCurrentShape({
      ...currentShape,
      points: currentTool === 'freehand' || currentTool === 'line'
        ? [...currentShape.points, point]
        : [currentShape.points[0], point],
    });
  };

  const finishDrawing = () => {
    if (!currentShape) return;
    sendDraw(currentShape);
    setCurrentShape(null);
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={finishDrawing}
      onMouseLeave={finishDrawing}
      className="drawing-canvas"
      aria-label="Collaborative drawing board"
    />
  );
};

export default Canvas;
