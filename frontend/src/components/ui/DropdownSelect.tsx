import * as React from 'react';
import { cn } from '../../lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './Dropdown';

type IconComponent = React.ComponentType<{ className?: string }>;

export interface DropdownSelectOption {
  value: string;
  label: string;
  /** Optional per-option icon, shown on the option row and on the trigger when selected. */
  icon?: IconComponent;
  /** Optional right-aligned hint — e.g. how many items sit behind the option. */
  count?: number;
}

interface DropdownSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownSelectOption[];
  /** Accessible name for the trigger; the visible label is the selected option. */
  ariaLabel: string;
  /** Fallback icon for the trigger when the selected option has none of its own. */
  icon?: IconComponent;
  /** Shown when nothing matches the current value (or the value is empty). */
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  size?: 'sm' | 'md';
  align?: 'start' | 'end';
}

/**
 * The house filter dropdown: one pill that names the current choice, with the
 * options in a card and a check on the active row. This is the same control the
 * menu library uses for its category/view filters, shared so every page's
 * dropdowns and filter bars look and behave identically.
 */
export const DropdownSelect: React.FC<DropdownSelectProps> = ({
  value,
  onChange,
  options,
  ariaLabel,
  icon: TriggerIcon,
  placeholder,
  className,
  contentClassName,
  size = 'md',
  align = 'end',
}) => {
  const selected = options.find((o) => o.value === value);
  const ActiveIcon = selected?.icon ?? TriggerIcon;
  const label = selected?.label ?? placeholder ?? value;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={ariaLabel}
        className={cn(
          'shrink-0',
          size === 'md'
            ? 'h-11 w-full flex justify-between bg-background shadow-sm hover:border-foreground/20 data-[state=open]:bg-background'
            : 'h-9 text-xs',
          className,
        )}
      >
        {ActiveIcon ? <ActiveIcon className="w-4 h-4 text-muted-foreground" /> : null}
        <span className="truncate">{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={cn('w-[var(--radix-dropdown-menu-trigger-width)] min-w-[11rem]', contentClassName)}>
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuItem
              key={option.value}
              selected={option.value === value}
              onSelect={() => onChange(option.value)}
            >
              {Icon ? <Icon className="w-4 h-4 shrink-0" /> : null}
              <span className="truncate">{option.label}</span>
              {typeof option.count === 'number' ? (
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {option.count}
                </span>
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
