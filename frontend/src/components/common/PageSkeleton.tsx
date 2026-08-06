import React from 'react';

/** Lightweight route-level fallback while lazy chunks load. */
export const PageSkeleton: React.FC = () => (
  <div className="space-y-4 p-1 animate-pulse" aria-busy aria-label="Loading page">
    <div className="h-8 w-48 rounded-lg bg-secondary/60" />
    <div className="h-4 w-72 rounded bg-secondary/40" />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 rounded-xl bg-secondary/50" />
      ))}
    </div>
    <div className="h-64 rounded-xl bg-secondary/40 mt-4" />
  </div>
);
