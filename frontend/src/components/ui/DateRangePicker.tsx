import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

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
  { id: 'custom', label: 'Custom' },
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
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(value.from.toISOString().split('T')[0]);
  const [draftTo, setDraftTo] = useState(value.to.toISOString().split('T')[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => {
    setDraftFrom(value.from.toISOString().split('T')[0]);
    setDraftTo(value.to.toISOString().split('T')[0]);
  }, [value.from, value.to]);

  const handlePreset = (preset: DateRangePreset) => {
    if (preset === 'custom') return;
    onChange(computeRange(preset));
  };

  const handleCustomApply = () => {
    const from = new Date(draftFrom);
    const to = new Date(draftTo);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) return;
    to.setHours(23, 59, 59, 999);
    from.setHours(0, 0, 0, 0);
    onChange({ from, to, preset: 'custom' });
    setOpen(false);
  };

  const currentPreset = value.preset ?? 'custom';

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-2 h-9 px-3 rounded-md text-sm font-medium',
          'bg-secondary/40 border border-input text-foreground',
          'hover:border-border hover:bg-secondary/60 transition-colors'
        )}
      >
        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="tabular-nums">{formatRange(value)}</span>
        <ChevronDown
          className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl z-30 overflow-hidden"
          >
            <div className="p-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handlePreset(p.id)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm',
                    'hover:bg-secondary/60 transition-colors',
                    currentPreset === p.id && 'bg-primary/10 text-primary'
                  )}
                >
                  {p.label}
                  {currentPreset === p.id && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
            <div className="border-t border-border p-3 bg-secondary/30 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Custom range
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={draftFrom}
                  onChange={(e) => setDraftFrom(e.target.value)}
                  className="flex-1 h-8 px-2 text-xs rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-xs text-muted-foreground">→</span>
                <input
                  type="date"
                  value={draftTo}
                  onChange={(e) => setDraftTo(e.target.value)}
                  className="flex-1 h-8 px-2 text-xs rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <button
                onClick={handleCustomApply}
                className="w-full h-8 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                Apply
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export { computeRange };
