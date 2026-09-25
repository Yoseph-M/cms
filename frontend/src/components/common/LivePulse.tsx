import React from 'react';
import { Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const LivePulse: React.FC<{ activeOrdersCount: number }> = ({
  activeOrdersCount,
}) => {
  const { t } = useTranslation();
  const hasOrders = activeOrdersCount > 0;
  return (
    <div className="flex items-center gap-2.5">
      {hasOrders ? (
        <span className="relative inline-flex h-2.5 w-2.5">
          <span className="absolute inset-0 rounded-full bg-[hsl(var(--success))] opacity-60 animate-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[hsl(var(--success))]" />
        </span>
      ) : (
        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-muted-foreground/50" />
      )}
      <Activity
        className={`w-3.5 h-3.5 ${
          hasOrders ? 'text-[hsl(var(--success))]' : 'text-muted-foreground'
        }`}
      />
      <span className="font-mono text-sm font-medium tabular-nums text-foreground">
        {activeOrdersCount}
        <span className="text-muted-foreground ml-1.5 font-sans">
          {t('livePulse.inQueue', { count: activeOrdersCount })}
        </span>
      </span>
    </div>
  );
};
