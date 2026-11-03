import { useEffect, useRef } from 'react';

const PARTICLE_COUNT = 54;

export default function FlowCanvas({ paused }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    let frame = 0;
    let width = 0;
    let height = 0;
    let particles = [];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      particles = Array.from({ length: PARTICLE_COUNT }, (_, index) => {
        const columns = 9;
        const targetColumn = index % columns;
        const targetRow = Math.floor(index / columns);
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          targetX: 18 + targetColumn * ((width - 36) / (columns - 1)),
          targetY: 18 + targetRow * ((height - 36) / 5),
          phase: Math.random() * Math.PI * 2,
          radius: 1 + Math.random() * 1.6,
          accent: index % 9 === 0,
        };
      });
      draw(0, paused || reduceMotion);
    };

    const draw = (time, settled = false) => {
      context.clearRect(0, 0, width, height);
      particles.forEach((particle, index) => {
        const drift = settled ? 0 : Math.sin(time * 0.0007 + particle.phase) * 4;
        const x = settled ? particle.targetX : particle.x + (particle.targetX - particle.x) * 0.075 + drift;
        const y = settled ? particle.targetY : particle.y + (particle.targetY - particle.y) * 0.075;
        particle.x = x;
        particle.y = y;
        context.beginPath();
        context.arc(x, y, particle.radius, 0, Math.PI * 2);
        context.fillStyle = particle.accent ? 'rgba(232,171,126,.9)' : 'rgba(242,240,233,.28)';
        context.fill();
        if (index % 9 !== 8) {
          const next = particles[index + 1];
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(next.x + (settled ? 0 : Math.sin(time * 0.0007 + next.phase) * 4), next.y);
          context.strokeStyle = 'rgba(244,236,222,.06)';
          context.lineWidth = 1;
          context.stroke();
        }
      });
    };

    const animate = (time) => {
      draw(time);
      frame = window.requestAnimationFrame(animate);
    };

    resize();
    if (!paused && !reduceMotion) frame = window.requestAnimationFrame(animate);
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [paused]);

  return <canvas ref={canvasRef} className="flow-canvas" aria-hidden="true" />;
}
