import React from 'react';
import { Ghost } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Button, type ButtonProps } from '../ui/Button';

export function EmptyState({
  title,
  message,
  icon,
  className,
  action,
}: {
  title?: string;
  message?: string;
  icon?: React.ReactNode;
  className?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: ButtonProps['variant'];
    icon?: React.ReactNode;
  };
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-10 text-muted-foreground w-full h-full min-h-[200px]',
        className
      )}
    >
      <div className="w-14 h-14 rounded-2xl bg-secondary/40 border border-border flex items-center justify-center mb-4 text-muted-foreground/70">
        {icon ?? <Ghost className="w-7 h-7" />}
      </div>
      <h3 className="font-display font-semibold text-lg mb-1 text-foreground">
        {title ?? t('emptyState.title')}
      </h3>
      <p className="text-sm text-muted-foreground max-w-xs text-center">
        {message ?? t('emptyState.message')}
      </p>
      {action && (
        <Button
          onClick={action.onClick}
          variant={action.variant || 'default'}
          className="mt-5"
          size="sm"
        >
          {action.icon}
          {action.label}
        </Button>
      )}
    </div>
  );
}
