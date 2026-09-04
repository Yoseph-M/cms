import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './Dropdown';

export type DateRangePreset = 'today' | '7d' | '30d' | 'mtd' | 'qtd' | 'ytd' | 'custom';

export interface DateRange {
  from: Date;
  to: Date;
  preset?: DateRangePreset;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

const PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'mtd', label: 'Month to date' },
  { id: 'qtd', label: 'Quarter to date' },
  { id: 'ytd', label: 'Year to date' },
];

const computeRange = (preset: DateRangePreset, customFrom?: Date, customTo?: Date): DateRange => {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);

  switch (preset) {
    case 'today':
      return { from, to, preset };
    case '7d':
      from.setDate(from.getDate() - 6);
      return { from, to, preset };
    case '30d':
      from.setDate(from.getDate() - 29);
      return { from, to, preset };
    case 'mtd':
      from.setDate(1);
      return { from, to, preset };
    case 'qtd': {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      from.setMonth(quarterStartMonth, 1);
      return { from, to, preset };
    }
    case 'ytd':
      from.setMonth(0, 1);
      return { from, to, preset };
    case 'custom':
      return { from: customFrom || from, to: customTo || to, preset };
  }
};

const formatRange = (range: DateRange) => {
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (range.from.toDateString() === range.to.toDateString()) return fmt(range.from);
  return `${fmt(range.from)} → ${fmt(range.to)}`;
};

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  value,
  onChange,
  className,
}) => {
  const currentPreset = value.preset ?? '30d';

  const handlePreset = (preset: DateRangePreset) => {
    onChange(computeRange(preset));
  };

  const selectedLabel = PRESETS.find((p) => p.id === currentPreset)?.label ?? formatRange(value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors',
            'hover:bg-secondary/60 focus:z-10 focus:outline-none focus:ring-2 focus:ring-ring',
            className,
          )}
        >
          <span className="tabular-nums">{selectedLabel}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[10rem]">
        {PRESETS.map((preset) => (
          <DropdownMenuItem
            key={preset.id}
            selected={preset.id === currentPreset}
            onClick={() => handlePreset(preset.id)}
          >
            {preset.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export { computeRange };
