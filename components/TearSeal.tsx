"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type UnlockMode = "tear" | "fallback";

export default function TearSeal({ accent, ink, reducedMotion, unlocked, onUnlock, children }: {
  accent: string;
  ink: string;
  reducedMotion: boolean;
  unlocked: boolean;
  onUnlock: (mode: UnlockMode) => void;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(0);
  const [bursting, setBursting] = useState<{ dx: number; dy: number } | null>(null);
  const gestureRef = useRef<{
    drawing: boolean;
    last: { x: number; y: number } | null;
    first: { x: number; y: number } | null;
    distance: number;
    grid: Uint8Array;
    cols: number;
    rows: number;
    cellW: number;
    cellH: number;
    cellSize: number;
    fired: boolean;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || unlocked) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const cellSize = 34;
    const cols = Math.max(1, Math.ceil(rect.width / cellSize));
    const rows = Math.max(1, Math.ceil(rect.height / cellSize));
    gestureRef.current = {
      drawing: false, last: null, first: null, distance: 0,
      grid: new Uint8Array(cols * rows), cols, rows,
      cellW: rect.width / cols, cellH: rect.height / rows, cellSize, fired: false,
    };

    ctx.globalCompositeOperation = "source-over";
    const gradient = ctx.createLinearGradient(0, 0, rect.width, rect.height);
    gradient.addColorStop(0, accent);
    gradient.addColorStop(1, ink);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.beginPath();
    ctx.ellipse(rect.width * 0.32, rect.height * 0.26, rect.width * 0.42, rect.height * 0.3, -0.3, 0, Math.PI * 2);
    ctx.fill();

    const cx = rect.width / 2;
    const cy = rect.height / 2;
    ctx.strokeStyle = "rgba(255,255,255,.75)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy - 4);
    ctx.lineTo(cx + 15, cy + 24);
    ctx.moveTo(cx + 16, cy - 4);
    ctx.lineTo(cx - 15, cy + 24);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - 16, cy - 4, 5, 0, Math.PI * 2);
    ctx.arc(cx + 16, cy - 4, 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fill();

    setProgress(0);
  }, [accent, ink, unlocked]);

  function pointToCanvas(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function markSegment(x0: number, y0: number, x1: number, y1: number) {
    const g = gestureRef.current;
    if (!g) return;
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (g.cellSize * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      const col = Math.min(g.cols - 1, Math.max(0, Math.floor(x / g.cellW)));
      const row = Math.min(g.rows - 1, Math.max(0, Math.floor(y / g.cellH)));
      g.grid[row * g.cols + col] = 1;
    }
  }

  function coverage() {
    const g = gestureRef.current;
    if (!g) return 0;
    let hit = 0;
    for (let i = 0; i < g.grid.length; i++) hit += g.grid[i];
    return hit / g.grid.length;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (unlocked || event.button > 0) return;
    const g = gestureRef.current;
    if (!g || g.fired) return;
    event.preventDefault();
    canvasRef.current?.setPointerCapture(event.pointerId);
    const point = pointToCanvas(event);
    g.drawing = true;
    g.last = point;
    if (!g.first) g.first = point;
    document.body.classList.add("tearing");
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const g = gestureRef.current;
    const canvas = canvasRef.current;
    if (!g || !canvas || !g.drawing || !g.last || g.fired) return;
    event.preventDefault();
    const point = pointToCanvas(event);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = g.cellSize * 1.1;
      ctx.beginPath();
      ctx.moveTo(g.last.x, g.last.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    markSegment(g.last.x, g.last.y, point.x, point.y);
    g.distance += Math.hypot(point.x - g.last.x, point.y - g.last.y);
    g.last = point;

    const wrapRect = wrapRef.current?.getBoundingClientRect();
    const diagonal = wrapRect ? Math.hypot(wrapRect.width, wrapRect.height) : 400;
    const cov = coverage();
    setProgress(cov);
    if (!g.fired && cov >= 0.26 && g.distance >= diagonal * 0.42) {
      g.fired = true;
      finishTear(g.first, point);
    }
  }

  function endStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    const g = gestureRef.current;
    if (!g) return;
    g.drawing = false;
    canvasRef.current?.releasePointerCapture(event.pointerId);
    document.body.classList.remove("tearing");
  }

  function finishTear(first: { x: number; y: number } | null, last: { x: number; y: number }) {
    const dx = last.x - (first?.x ?? last.x);
    const dy = last.y - (first?.y ?? last.y);
    document.body.classList.remove("tearing");
    if (reducedMotion) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      onUnlock("tear");
      return;
    }
    setBursting({ dx, dy });
    window.setTimeout(() => onUnlock("tear"), 480);
  }

  function revealFallback() {
    if (unlocked || gestureRef.current?.fired) return;
    if (gestureRef.current) gestureRef.current.fired = true;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    onUnlock("fallback");
  }

  const splitHorizontal = bursting ? Math.abs(bursting.dx) >= Math.abs(bursting.dy) : true;

  return (
    <div ref={wrapRef} className="tear-seal">
      <div className="tear-seal-content">{children}</div>
      {!unlocked && (
        <>
          <canvas
            ref={canvasRef}
            className={`tear-seal-canvas ${bursting ? (splitHorizontal ? "tear-seal-canvas--burst-h" : "tear-seal-canvas--burst-v") : ""}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            aria-hidden="true"
          />
          <div className={`tear-seal-instruction ${progress > 0.02 ? "tear-seal-instruction--fading" : ""}`} aria-hidden="true">
            <span>DRAW A CUT TO OPEN</span>
          </div>
          <button type="button" className="tear-seal-fallback" onClick={revealFallback}>
            Reveal card
          </button>
        </>
      )}
    </div>
  );
}
