import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface SectionCardProps {
  title: string;
  /** Optional dropdown filter rendered in the top-right */
  filter?: { label: string; options?: string[]; value?: string; onChange?: (v: string) => void };
  /** Render a custom right-hand control (overrides `filter`) */
  rightAccessory?: React.ReactNode;
  className?: string;
  /** Removes default padding from the content area */
  flush?: boolean;
  children: React.ReactNode;
}

/**
 * A white card with a header strip (title + optional dropdown) and a
 * content area. Used as the container for every section in the redesigned
 * owner dashboard so the visual rhythm stays consistent.
 */
export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  filter,
  rightAccessory,
  className,
  flush = false,
  children,
}) => {
  return (
    <section
      className={cn(
        'rounded-[20px] bg-white shadow-sm border border-[#e5e0d8] overflow-hidden',
        className,
      )}
    >
      <header className="px-6 pt-5 pb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-[17px] font-bold text-slate-800 leading-tight">
          {title}
        </h2>
        {rightAccessory ?? (filter ? <FilterDropdown {...filter} /> : null)}
      </header>

      <div className={cn(flush ? '' : 'px-6 pb-6')}>{children}</div>
    </section>
  );
};

const FilterDropdown: React.FC<{
  label: string;
  options?: string[];
  value?: string;
  onChange?: (v: string) => void;
}> = ({ label, options, value, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const displayLabel = value ?? label;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e5e0d8] text-[13px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
      >
        {displayLabel}
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {open && options && options.length > 0 && (
        <div className="absolute top-full right-0 mt-1 w-36 bg-white border border-[#e5e0d8] rounded-xl shadow-lg p-1 z-20">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                onChange?.(opt);
                setOpen(false);
              }}
              className={cn(
                'block w-full text-left px-3 py-1.5 rounded-lg text-[13px] transition-colors',
                displayLabel === opt
                  ? 'bg-[#fff5eb] text-orange-600 font-medium'
                  : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
