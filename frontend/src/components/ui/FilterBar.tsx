import React from 'react';
import { useTranslation } from 'react-i18next';
import { DropdownSelect } from './DropdownSelect';

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterBarProps {
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Accessible name for the trigger; falls back to a generic label. */
  ariaLabel?: string;
  /** Optional trigger icon, matching the menu library's filter pills. */
  icon?: React.ComponentType<{ className?: string }>;
}

/**
 * Chart/section filter — a thin wrapper over {@link DropdownSelect} so every
 * filter bar in the app shares one look (the menu library's dropdown style).
 */
export const FilterBar: React.FC<FilterBarProps> = ({
  options,
  value,
  onChange,
  className,
  ariaLabel,
  icon,
}) => {
  const { t } = useTranslation();
  return (
    <DropdownSelect
      ariaLabel={ariaLabel ?? t('buttons.filter')}
      icon={icon}
      options={options.map((o) => ({ value: o.value, label: o.label }))}
      value={value}
      onChange={onChange}
      className={className}
    />
  );
};
