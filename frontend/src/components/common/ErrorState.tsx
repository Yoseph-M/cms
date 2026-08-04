import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

export function ErrorState({
  message = 'Failed to load data.',
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-10 text-foreground bg-destructive/5 border border-destructive/20 rounded-xl w-full h-full min-h-[200px]',
        className
      )}
    >
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-destructive" />
      </div>
      <p className="font-semibold text-center mb-1">Something went wrong</p>
      <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
        {message}
      </p>
      {onRetry && (
        <Button variant="destructive" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
