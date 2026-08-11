import React from 'react';
import { cn } from '../../lib/utils';

export function PageHeading({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <h1 className={cn("font-display text-3xl font-bold text-foreground", className)}>
      {children}
    </h1>
  );
}

export function StatNumber({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <span className={cn("font-display text-4xl font-bold tabular-nums text-foreground", className)}>
      {children}
    </span>
  );
}
