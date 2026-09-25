import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Title,
  Text,
  Flex,
  Metric,
  TabGroup,
  TabList,
  Tab,
  ProgressBar,
  Grid,
} from '@tremor/react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from '../common/EmptyState';
import { cn } from '../../lib/utils';

export interface TremorWidgetProps {
  title: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  empty?: boolean;
  emptyMsg?: string;
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  /** Control that belongs to the title — e.g. the metric a chart plots. */
  headerLeft?: React.ReactNode;
  /** Controls pinned to the far right of the header bar. */
  headerExtra?: React.ReactNode;
  /** A second bar UNDER the header, for a control that belongs to the chart
   *  itself rather than to the card — e.g. a Line/Bar switch. */
  headerToolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** Tremor Card wrapper with loading, error, and empty states for analytics widgets. */
export const TremorWidget: React.FC<TremorWidgetProps> = ({
  title,
  loading,
  error,
  onRetry,
  empty,
  emptyMsg,
  emptyIcon,
  emptyTitle,
  headerLeft,
  headerExtra,
  headerToolbar,
  children,
  className,
}) => {
  const { t } = useTranslation();
  return (
  <Card className={cn('rounded-xl ring-1 ring-border/40 bg-card p-0 shadow-sm', className)}>
    {/* The header is ALWAYS a two-column grid — title column, control column —
        with no responsive fallback. The auto column pins everything in
        `headerExtra` to the right end of the card and `justify-end` keeps it
        right-aligned even when the controls wrap. Both used to be `sm:`-only,
        so below the breakpoint the control column became a second grid row and
        its contents (the Daily takings button) sat flush left under the title —
        which is why it kept "appearing on the left" however it was reordered. */}
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/40 px-4 py-3">
      {/* The title keeps its own controls beside it. */}
      <div className="flex min-w-0 items-center gap-3">
        <Title className="text-sm font-bold text-foreground">{title}</Title>
        {headerLeft}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 text-right">
        {headerExtra}
      </div>
    </div>
    {headerToolbar ? (
      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-2">
        {headerToolbar}
      </div>
    ) : null}
    <div className="p-4">
      {loading ? (
        <div className="h-48 bg-secondary/40 rounded-lg animate-pulse" />
      ) : error ? (
        <Flex flexDirection="col" alignItems="center" justifyContent="center" className="h-40 gap-2 text-center">
          <AlertCircle className="w-6 h-6 text-destructive" />
          <Text className="text-sm text-destructive">{error}</Text>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw className="w-3 h-3 mr-1.5" />{t('buttons.retry')}
          </Button>
        </Flex>
      ) : empty ? (
        <EmptyState
          title={emptyTitle || t('tremor.noDataTitle')}
          message={emptyMsg || t('tremor.noDataMsg')}
          icon={emptyIcon}
          className="min-h-[10rem] py-8"
        />
      ) : (
        children
      )}
    </div>
  </Card>
  );
};

export interface ChartToggleProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

/** Tremor TabGroup used as a compact chart-type toggle. */
export const ChartToggle: React.FC<ChartToggleProps> = ({ options, value, onChange }) => {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <TabGroup
      index={index}
      onIndexChange={(i) => onChange(options[i]?.value ?? options[0].value)}
    >
      {/* `!overflow-visible` cancels Tremor's `overflow-x-clip`, which otherwise
          slices the focus ring off the selected tab. */}
      <TabList variant="solid" className="h-7 !overflow-visible">
        {options.map((o) => (
          <Tab key={o.value} className="text-xs px-2 py-0.5">
            {o.label}
          </Tab>
        ))}
      </TabList>
    </TabGroup>
  );
};

export interface KpiMetricCardProps {
  label: string;
  value: string;
  loading?: boolean;
  delta?: React.ReactNode;
  icon?: React.ReactNode;
}

/** Single KPI tile using Tremor Metric inside a Card. */
export const KpiMetricCard: React.FC<KpiMetricCardProps> = ({ label, value, loading, delta, icon }) => (
  <Card className="rounded-xl ring-1 ring-border/40 bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
    <Flex justifyContent="between" alignItems="center" className="mb-3">
      <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
      {icon}
    </Flex>
    {loading ? (
      <div className="h-7 w-20 rounded bg-secondary/50 animate-pulse" />
    ) : (
      <>
        <Metric className="font-mono text-foreground">{value}</Metric>
        {delta && <div className="mt-1">{delta}</div>}
      </>
    )}
  </Card>
);

export { Grid, ProgressBar, Flex, Text, Title, Metric, Card };
