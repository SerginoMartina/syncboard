import React, { useRef, useEffect, useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { useSocket } from '../hooks/useSocket';

const Canvas: React.FC<{ roomId: string; userId: string }> = ({ roomId, userId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentShape, setCurrentShape] = useState<{
    type: 'line' | 'rect' | 'freehand';
    points: [number, number][];
    color: string;
    width: number;
  } | null>(null);

  const { shapes, currentTool, currentColor, addShape, remoteCursors } = useCanvasStore();
  const { sendDraw, sendCursor } = useSocket(roomId);

  // Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    let animationFrameId: number;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw all shapes
      shapes.forEach((shape) => {
        drawShape(ctx, shape);
      });

      // Draw current shape being dragged
      if (currentShape) {
        drawShape(ctx, currentShape);
      }

      // Draw remote cursors
      Object.values(remoteCursors).forEach((cursor) => {
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

  const drawShape = (ctx: CanvasRenderingContext2D, shape: any) => {
    ctx.beginPath();
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (shape.type === 'freehand' || shape.type === 'line') {
      if (shape.points.length < 2) return;
      ctx.moveTo(shape.points[0][0], shape.points[0][1]);
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i][0], shape.points[i][1]);
      }
    } else if (shape.type === 'rect') {
      const first = shape.points[0];
      const last = shape.points[shape.points.length - 1];
      ctx.rect(first[0], first[1], last[0] - first[0], last[1] - first[1]);
    }
    ctx.stroke();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setCurrentShape({
      type: currentTool,
      points: [[x, y]],
      color: currentColor,
      width: 2,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!currentShape) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (currentTool === 'freehand' || currentTool === 'line') {
      setCurrentShape({
        ...currentShape,
        points: [...currentShape.points, [x, y]],
      });
    } else {
      setCurrentShape({
        ...currentShape,
        points: [[currentShape.points[0][0], currentShape.points[0][1]], [x, y]],
      });
    }

    // Send cursor position (throttled by the socket layer/browser event loop)
    sendCursor(x, y, userId);
  };

  const handleMouseUp = () => {
    if (currentShape) {
      addShape(currentShape);
      sendDraw(currentShape);
      setCurrentShape(null);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="w-full h-[600px] bg-white rounded-lg shadow-inner cursor-crosshair"
    />
  );
};

export default Canvas;
