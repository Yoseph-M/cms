import React from 'react';
import { Bell, Search, ChevronDown, Calendar } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useTranslation } from 'react-i18next';

export interface DashboardHeaderProps {
  title: string;
  dateRange: { from: string; to: string };
  onDateRangeChange: (r: { from: string; to: string }) => void;
  searchPlaceholder?: string;
  onSearch?: (q: string) => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  title,
  dateRange,
  onDateRangeChange,
  searchPlaceholder = 'Search',
  onSearch,
}) => {
  const { t } = useTranslation('owner');
  const [search, setSearch] = React.useState('');

  return (
    <header className="h-[88px] px-8 flex items-center justify-between border-b border-[#ece6dd] shrink-0 bg-[#fdfaf6]">
      {/* Title + date range */}
      <div className="flex items-center gap-6 min-w-0">
        <h1 className="font-display text-[26px] font-semibold text-slate-800 tracking-tight">
          {title}
        </h1>

        <DateRangeChip
          from={dateRange.from}
          to={dateRange.to}
          onChange={onDateRangeChange}
        />
      </div>

      {/* Search + bell + avatar */}
      <div className="flex items-center gap-4">
        <div className="relative hidden md:block">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              onSearch?.(e.target.value);
            }}
            placeholder={searchPlaceholder}
            className={cn(
              'h-11 pl-11 pr-4 w-64 lg:w-80 rounded-[24px] bg-white border border-[#e5e0d8]',
              'focus:bg-white focus:border-orange-300',
              'focus:shadow-[0_0_0_3px_rgba(249,115,22,0.1)]',
              'text-[15px] text-slate-800 placeholder:text-slate-400 outline-none transition-all shadow-sm',
            )}
          />
        </div>

        <button
          type="button"
          aria-label={t('dashboard.notifications', { defaultValue: 'Notifications' })}
          className="relative w-11 h-11 rounded-full bg-white border border-[#e5e0d8] hover:bg-slate-50 text-slate-600 flex items-center justify-center transition-colors shadow-sm"
        >
          <Bell className="w-5 h-5" />
        </button>

        <button
          type="button"
          aria-label="Profile"
          className="w-11 h-11 rounded-full overflow-hidden bg-slate-200 border border-[#e5e0d8] shadow-sm flex items-center justify-center"
        >
          {/* Mock user photo to match image */}
          <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=Felix`} alt="Avatar" className="w-full h-full object-cover" />
        </button>
      </div>
    </header>
  );
};

/* ─── Date range chip ─── */
const DateRangeChip: React.FC<{
  from: string;
  to: string;
  onChange: (r: { from: string; to: string }) => void;
  className?: string;
}> = ({ from, to, onChange, className }) => {
  const [open, setOpen] = React.useState(false);

  // Parse YYYY-MM-DD
  const formatShort = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'h-10 px-3.5 rounded-xl border border-[#e5e0d8] bg-transparent text-sm font-medium text-slate-600',
          'hover:bg-white hover:shadow-sm transition-all inline-flex items-center gap-2',
          open && 'bg-white shadow-sm border-slate-300'
        )}
      >
        <Calendar className="w-4 h-4 text-slate-400" />
        <span>{formatShort(from)}</span>
        <span className="text-slate-300">→</span>
        <span>{formatShort(to)}</span>
        <ChevronDown className="w-4 h-4 ml-1 text-slate-400" />
      </button>

      {/* Date picker dropdown (simplified for mockup, uses native inputs) */}
      {open && (
        <div className="absolute top-full left-0 mt-2 p-3 bg-white border border-[#e5e0d8] rounded-xl shadow-lg z-50 flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => onChange({ from: e.target.value, to })}
            className="text-sm bg-slate-50 border border-slate-200 rounded p-1 outline-none focus:border-orange-500"
          />
          <span className="text-slate-400 text-xs">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => onChange({ from, to: e.target.value })}
            className="text-sm bg-slate-50 border border-slate-200 rounded p-1 outline-none focus:border-orange-500"
          />
        </div>
      )}
    </div>
  );
};
