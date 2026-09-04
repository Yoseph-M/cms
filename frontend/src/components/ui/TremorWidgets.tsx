import React from 'react';
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
import { AlertCircle, RotateCcw, Download } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from '../common/EmptyState';
import { cn } from '../../lib/utils';

export interface TremorWidgetProps {
  title: string;
  onExportCSV?: () => void;
  onExportPDF?: () => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  empty?: boolean;
  emptyMsg?: string;
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** Tremor Card wrapper with loading, error, and empty states for analytics widgets. */
export const TremorWidget: React.FC<TremorWidgetProps> = ({
  title,
  onExportCSV,
  onExportPDF,
  loading,
  error,
  onRetry,
  empty,
  emptyMsg,
  emptyIcon,
  emptyTitle,
  headerExtra,
  children,
  className,
}) => (
  <Card className={cn('rounded-xl ring-1 ring-border/40 bg-card p-0 shadow-sm', className)}>
    <Flex
      justifyContent="between"
      alignItems="center"
      className="flex-wrap gap-2 border-b border-border/40 px-4 py-3"
    >
      <Title className="text-sm font-bold text-foreground">{title}</Title>
      <Flex alignItems="center" className="flex-wrap gap-2">
        {headerExtra}
        {onExportCSV && (
          <Button variant="outline" size="sm" onClick={onExportCSV}>
            <Download className="w-3 h-3 mr-1.5" />CSV
          </Button>
        )}
        {onExportPDF && (
          <Button variant="outline" size="sm" onClick={onExportPDF}>
            <Download className="w-3 h-3 mr-1.5" />PDF
          </Button>
        )}
      </Flex>
    </Flex>
    <div className="p-4">
      {loading ? (
        <div className="h-48 bg-secondary/40 rounded-lg animate-pulse" />
      ) : error ? (
        <Flex flexDirection="col" alignItems="center" justifyContent="center" className="h-40 gap-2 text-center">
          <AlertCircle className="w-6 h-6 text-destructive" />
          <Text className="text-sm text-destructive">{error}</Text>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw className="w-3 h-3 mr-1.5" />Retry
          </Button>
        </Flex>
      ) : empty ? (
        <EmptyState
          title={emptyTitle || 'No data for this period'}
          message={emptyMsg || 'Try widening the date range or check back once there is activity.'}
          icon={emptyIcon}
          className="min-h-[10rem] py-8"
        />
      ) : (
        children
      )}
    </div>
  </Card>
);

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
      <TabList variant="solid" className="h-7">
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
