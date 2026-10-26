import type { AnnotationStroke } from '@/lib/teacher/annotations';

/** Draw one normalized stroke in CSS pixels. The caller sets the device-pixel transform. */
export function drawAnnotationStroke(
  context: CanvasRenderingContext2D,
  stroke: AnnotationStroke,
  width: number,
  height: number,
) {
  if (stroke.points.length === 0) return;
  const size = Math.max(1, stroke.width * Math.min(width, height));
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = size;
  if (stroke.points.length === 1) {
    context.beginPath();
    context.arc(stroke.points[0].x * width, stroke.points[0].y * height, size / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.beginPath();
  context.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);
  for (const point of stroke.points.slice(1)) context.lineTo(point.x * width, point.y * height);
  context.stroke();
}
