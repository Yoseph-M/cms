import React from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

export function LoadingState({
  message,
  className,
}: {
  message?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-10 text-muted-foreground w-full h-full min-h-[200px]',
        className
      )}
    >
      <div role="status" aria-live="polite" aria-label={t('a11y.loadingPage')} className="flex items-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <p className="text-sm font-medium">{message ?? t('loading')}</p>
      </div>
    </div>
  );
}
