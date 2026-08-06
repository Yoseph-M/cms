import React, { useEffect, useRef, useState } from 'react';
import { useSocketStore } from '../../store/socketStore';
import { Activity } from 'lucide-react';

const WINDOW_SIZE = 30;

/**
 * Live order-volume sparkline driven by Socket.io order events.
 * Each new/updated order increments the current bucket; buckets roll every 2s.
 */
export const OrderVolumePulse: React.FC = () => {
  const { socket } = useSocketStore();
  const [points, setPoints] = useState<number[]>(() => Array(WINDOW_SIZE).fill(0));
  const bucketRef = useRef(0);

  useEffect(() => {
    if (!socket) return;

    const bump = () => {
      bucketRef.current += 1;
    };

    socket.on('order:new', bump);
    socket.on('order:updated', bump);
    socket.on('order:cancelled', bump);

    const interval = setInterval(() => {
      setPoints((prev) => {
        const next = [...prev.slice(1), bucketRef.current];
        bucketRef.current = 0;
        return next;
      });
    }, 2000);

    return () => {
      socket.off('order:new', bump);
      socket.off('order:updated', bump);
      socket.off('order:cancelled', bump);
      clearInterval(interval);
    };
  }, [socket]);

  const max = Math.max(1, ...points);
  const w = 400;
  const h = 56;
  const step = w / Math.max(points.length - 1, 1);
  const pathD = points
    .map((v, i) => {
      const x = i * step;
      const y = h - (v / max) * (h - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
  const areaD = `${pathD} L${w},${h} L0,${h} Z`;
  const liveTotal = points.reduce((s, v) => s + v, 0);

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-[hsl(var(--success))] opacity-60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(var(--success))]" />
          </span>
          <Activity className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Live Order Pulse
          </span>
        </div>
        <span className="text-xs font-mono text-muted-foreground tabular-nums">
          {liveTotal} events / 60s
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14" preserveAspectRatio="none">
        <defs>
          <linearGradient id="pulseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.35} />
            <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#pulseGrad)" />
        <path d={pathD} stroke="hsl(var(--success))" strokeWidth="2" fill="none" strokeLinejoin="round" />
      </svg>
    </div>
  );
};
