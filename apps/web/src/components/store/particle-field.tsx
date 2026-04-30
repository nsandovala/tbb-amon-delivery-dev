"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
}

export function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];

    const PARTICLE_COUNT = 70;
    const MOUSE_RADIUS = 140;
    const REPULSION_FORCE = 0.6;
    const RETURN_FORCE = 0.04;
    const FRICTION = 0.92;
    const DRIFT_SPEED = 0.2;

    const accentColors = ["#00FF9C", "#00d1ff", "#ffffff"];

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      initParticles();
    }

    function initParticles() {
      particles = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const color =
          accentColors[Math.floor(Math.random() * accentColors.length)];
        particles.push({
          x,
          y,
          originX: x,
          originY: y,
          vx: (Math.random() - 0.5) * DRIFT_SPEED,
          vy: (Math.random() - 0.5) * DRIFT_SPEED,
          size: Math.random() * 1.5 + 0.5,
          alpha: Math.random() * 0.18 + 0.06,
          color,
        });
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (const p of particles) {
        // Drift
        p.x += p.vx;
        p.y += p.vy;

        // Soft boundary wrap
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;

        // Mouse repulsion
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MOUSE_RADIUS && dist > 0.1) {
          const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
          const angle = Math.atan2(dy, dx);
          const push = force * REPULSION_FORCE;
          p.vx += Math.cos(angle) * push;
          p.vy += Math.sin(angle) * push;
        }

        // Return to origin
        p.vx += (p.originX - p.x) * RETURN_FORCE;
        p.vy += (p.originY - p.y) * RETURN_FORCE;

        // Friction
        p.vx *= FRICTION;
        p.vy *= FRICTION;

        // Draw
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fillStyle = p.color;
        ctx!.globalAlpha = p.alpha;
        ctx!.fill();
        ctx!.globalAlpha = 1;
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    function onMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
    }

    function onMouseLeave() {
      mouseRef.current.x = -9999;
      mouseRef.current.y = -9999;
    }

    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-auto absolute inset-0 z-[2]"
      style={{ mixBlendMode: "screen" }}
    />
  );
}
