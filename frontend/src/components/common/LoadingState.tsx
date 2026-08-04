import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export function LoadingState({
  message = 'Loading…',
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-10 text-muted-foreground w-full h-full min-h-[200px]',
        className
      )}
    >
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-md animate-pulse" />
        <div className="relative w-10 h-10 rounded-full bg-secondary/60 border border-border flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      </div>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
